import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

function adminClient() {
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const secretKey =
    secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!token) return json({ error: "Missing user token" }, 401);

  const admin = adminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: "Invalid user token" }, 401);

  const body = await req.json().catch(() => null);
  const projectId = body?.projectId;
  const workflowInstanceId = body?.workflowInstanceId;
  const action = body?.action;
  const note =
    typeof body?.note === "string" && body.note.trim()
      ? body.note.trim()
      : null;

  if (
    !projectId ||
    !workflowInstanceId ||
    !["submit", "approve", "request_changes"].includes(action)
  ) {
    return json({
      error: "projectId, workflowInstanceId and a valid action are required",
    }, 400);
  }

  const { data: project } = await admin
    .from("projects")
    .select("id, organisation_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return json({ error: "Project not found" }, 404);

  const { data: membership } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", project.organisation_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return json({ error: "Project membership required" }, 403);

  if (
    action === "submit" &&
    !["owner", "admin", "engineer"].includes(membership.role)
  ) {
    return json({ error: "Engineer access required to submit for review" }, 403);
  }

  if (
    action !== "submit" &&
    !["owner", "admin", "reviewer"].includes(membership.role)
  ) {
    return json({ error: "Reviewer, admin or owner access required" }, 403);
  }

  const { data: calculations, error: calculationError } = await admin
    .from("calculations")
    .select("id, stage_key, state")
    .eq("project_id", projectId)
    .eq("workflow_instance_id", workflowInstanceId)
    .order("sort_order", { ascending: true });

  if (calculationError || !calculations || calculations.length !== 6) {
    return json({ error: "Wind workflow graph not found or incomplete" }, 404);
  }

  const calculationIds = calculations.map((calculation) => calculation.id);
  const { data: runs, error: runError } = await admin
    .from("calculation_runs")
    .select("id, calculation_id, run_sequence, created_at")
    .in("calculation_id", calculationIds)
    .order("run_sequence", { ascending: false });

  if (runError || !runs) {
    return json({ error: runError?.message ?? "Unable to load run history" }, 500);
  }

  const latestByCalculation = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestByCalculation.has(run.calculation_id)) {
      latestByCalculation.set(run.calculation_id, run);
    }
  }

  if (latestByCalculation.size !== calculations.length) {
    return json({ error: "Every Wind stage must have at least one run" }, 409);
  }

  const latestRuns = calculations.map(
    (calculation) => latestByCalculation.get(calculation.id)!,
  );

  const latestRunIds = latestRuns.map((run) => run.id);
  const { data: latestReviews, error: latestReviewError } = await admin
    .from("calculation_run_reviews")
    .select("run_id, status, submitted_by, reviewer_id, review_note, reviewed_at")
    .in("run_id", latestRunIds);

  if (latestReviewError) {
    return json({ error: latestReviewError.message }, 500);
  }

  const reviewByRun = new Map(
    (latestReviews ?? []).map((review) => [review.run_id, review]),
  );

  if (action === "submit") {
    const now = new Date().toISOString();
    const runsToSubmit = latestRuns.filter(
      (run) => reviewByRun.get(run.id)?.status !== "approved",
    );

    if (!runsToSubmit.length) {
      return json({
        workflowInstanceId,
        status: "approved",
        runIds: latestRunIds,
        submittedRunIds: [],
      });
    }

    const rows = runsToSubmit.map((run) => ({
      run_id: run.id,
      status: "pending",
      submitted_by: user.id,
      submitted_at: now,
      reviewer_id: null,
      review_note: null,
      reviewed_at: null,
      updated_at: now,
    }));

    const { error: reviewError } = await admin
      .from("calculation_run_reviews")
      .upsert(rows, { onConflict: "run_id" });

    if (reviewError) return json({ error: reviewError.message }, 500);

    const submittedCalculationIds = runsToSubmit.map((run) => run.calculation_id);
    await admin
      .from("calculations")
      .update({ state: "review" })
      .in("id", submittedCalculationIds);

    await admin.from("audit_events").insert({
      organisation_id: project.organisation_id,
      project_id: projectId,
      actor_user_id: user.id,
      event_type: "wind_workflow.review_submitted",
      entity_type: "calculation",
      entity_id: calculations.find((row) => row.stage_key === "design")?.id ?? null,
      metadata_json: {
        workflow_instance_id: workflowInstanceId,
        run_ids: latestRunIds,
        submitted_run_ids: runsToSubmit.map((run) => run.id),
      },
    });

    return json({
      workflowInstanceId,
      status: "pending",
      runIds: latestRunIds,
      submittedRunIds: runsToSubmit.map((run) => run.id),
    });
  }

  const pendingRuns = latestRuns.filter(
    (run) => reviewByRun.get(run.id)?.status === "pending",
  );
  const invalidRuns = latestRuns.filter((run) => {
    const status = reviewByRun.get(run.id)?.status;
    return status !== "pending" && status !== "approved";
  });

  if (invalidRuns.length) {
    return json({
      error: "Every latest Wind stage must be submitted or already approved",
    }, 409);
  }

  if (!pendingRuns.length) {
    return json({
      workflowInstanceId,
      status: "approved",
      reviewerId: user.id,
      reviewedAt: new Date().toISOString(),
    });
  }

  const pendingRunIds = pendingRuns.map((run) => run.id);
  const nextStatus =
    action === "approve" ? "approved" : "changes_requested";
  const reviewedAt = new Date().toISOString();

  const { error: updateError } = await admin
    .from("calculation_run_reviews")
    .update({
      status: nextStatus,
      reviewer_id: user.id,
      review_note: note,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    })
    .in("run_id", pendingRunIds);

  if (updateError) return json({ error: updateError.message }, 500);

  await admin
    .from("calculations")
    .update({ state: action === "approve" ? "review" : "draft" })
    .in("id", pendingRuns.map((run) => run.calculation_id));

  await admin.from("audit_events").insert({
    organisation_id: project.organisation_id,
    project_id: projectId,
    actor_user_id: user.id,
    event_type:
      action === "approve"
        ? "wind_workflow.review_approved"
        : "wind_workflow.changes_requested",
    entity_type: "calculation",
    entity_id: calculations.find((row) => row.stage_key === "design")?.id ?? null,
    metadata_json: {
      workflow_instance_id: workflowInstanceId,
      run_ids: latestRunIds,
      reviewed_run_ids: pendingRunIds,
      note,
    },
  });

  return json({
    workflowInstanceId,
    status: nextStatus,
    reviewerId: user.id,
    reviewedAt,
  });
});
