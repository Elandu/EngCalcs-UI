import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const OPENCALCS_API_URL =
  Deno.env.get("OPENCALCS_API_URL") ?? "https://opencalcs-api.onrender.com";
const REPORT_BUCKET = "issued-calculation-packs";

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

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function ensurePrivateBucket(admin: ReturnType<typeof adminClient>) {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) throw new Error(listError.message);

  if (!buckets?.some((bucket) => bucket.id === REPORT_BUCKET)) {
    const { error: createError } = await admin.storage.createBucket(
      REPORT_BUCKET,
      {
        public: false,
        allowedMimeTypes: ["application/pdf"],
        fileSizeLimit: "20MB",
      },
    );
    if (createError) throw new Error(createError.message);
  }
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

  if (!projectId || !workflowInstanceId) {
    return json({ error: "projectId and workflowInstanceId are required" }, 400);
  }

  const { data: project } = await admin
    .from("projects")
    .select("id, organisation_id, project_number, name, address, standards_region")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return json({ error: "Project not found" }, 404);

  const { data: membership } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", project.organisation_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !["owner", "admin", "reviewer"].includes(membership.role)) {
    return json({ error: "Reviewer, admin or owner access required to issue" }, 403);
  }

  const { data: calculations, error: calculationsError } = await admin
    .from("calculations")
    .select("id, stage_key, title, calculation_definition_id, sort_order")
    .eq("project_id", projectId)
    .eq("workflow_instance_id", workflowInstanceId)
    .order("sort_order", { ascending: true });

  if (calculationsError || !calculations || calculations.length !== 6) {
    return json({ error: "Wind workflow graph not found or incomplete" }, 404);
  }

  const calculationIds = calculations.map((calculation) => calculation.id);
  const { data: runs, error: runsError } = await admin
    .from("calculation_runs")
    .select(
      "id, calculation_id, parent_run_id, run_sequence, engine_plugin_id, engine_plugin_version, calculation_definition_id, calculation_definition_version, standard_reference_json, input_json, result_json, warnings_json, provenance_json, input_hash, created_by, created_at",
    )
    .in("calculation_id", calculationIds)
    .order("run_sequence", { ascending: false });

  if (runsError || !runs) {
    return json({ error: runsError?.message ?? "Unable to load run history" }, 500);
  }

  const latestByCalculation = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestByCalculation.has(run.calculation_id)) {
      latestByCalculation.set(run.calculation_id, run);
    }
  }

  if (latestByCalculation.size !== calculations.length) {
    return json({ error: "Every Wind stage must have a run before issue" }, 409);
  }

  const latestRuns = calculations.map(
    (calculation) => latestByCalculation.get(calculation.id)!,
  );
  const latestRunIds = latestRuns.map((run) => run.id);

  const { data: reviews, error: reviewsError } = await admin
    .from("calculation_run_reviews")
    .select("run_id, status, reviewer_id, review_note, reviewed_at, submitted_by, submitted_at")
    .in("run_id", latestRunIds);

  if (reviewsError || !reviews) {
    return json({ error: reviewsError?.message ?? "Unable to load reviews" }, 500);
  }

  if (
    reviews.length !== latestRunIds.length ||
    reviews.some((review) => review.status !== "approved")
  ) {
    return json({
      error: "Every latest Wind stage must be approved before issue",
    }, 409);
  }

  const reviewByRun = new Map(reviews.map((review) => [review.run_id, review]));

  const { data: overrides, error: overridesError } = await admin
    .from("calculation_overrides")
    .select(
      "id, calculation_id, source_run_id, applied_run_id, variable, direction, original_value, override_value, reason, source_reference, created_by, created_at, is_active",
    )
    .eq("workflow_instance_id", workflowInstanceId)
    .order("created_at", { ascending: true });

  if (overridesError) {
    return json({ error: overridesError.message }, 500);
  }

  const designCalculation = calculations.find(
    (calculation) => calculation.stage_key === "design",
  );
  if (!designCalculation) {
    return json({ error: "Design stage not found" }, 500);
  }
  const designRun = latestByCalculation.get(designCalculation.id)!;

  const designInputs =
    designRun.input_json?.workflow_inputs ??
    designRun.input_json ??
    {};

  const firstRunWithProvenance = latestRuns.find(
    (run) => run.provenance_json && typeof run.provenance_json === "object",
  );
  const provenance = firstRunWithProvenance?.provenance_json ?? {};

  const { data: priorReports, error: priorReportError } = await admin
    .from("reports")
    .select("id, revision, status, issued_at, metadata_json")
    .eq("project_id", projectId)
    .eq("workflow_instance_id", workflowInstanceId)
    .eq("status", "issued")
    .order("revision", { ascending: false })
    .limit(1);

  if (priorReportError) return json({ error: priorReportError.message }, 500);

  const priorReport = priorReports?.[0] ?? null;
  const priorRunIds = Array.isArray(priorReport?.metadata_json?.latest_run_ids)
    ? [...priorReport.metadata_json.latest_run_ids].map(String).sort()
    : [];
  const currentRunIds = [...latestRunIds].map(String).sort();

  if (
    priorReport &&
    priorRunIds.length === currentRunIds.length &&
    priorRunIds.every((runId, index) => runId === currentRunIds[index])
  ) {
    return json({
      error: `The latest approved state is already issued as revision ${priorReport.revision}`,
      reportId: priorReport.id,
      revision: priorReport.revision,
    }, 409);
  }

  const revision = (priorReport?.revision ?? 0) + 1;
  const issuedAt = new Date().toISOString();

  const stagePayload = calculations.map((calculation) => {
    const run = latestByCalculation.get(calculation.id)!;
    const review = reviewByRun.get(run.id)!;
    return {
      stage_key: calculation.stage_key,
      title: calculation.title,
      calculation_definition_id: calculation.calculation_definition_id,
      run,
      review: {
        ...review,
        reviewer: review.reviewer_id,
      },
    };
  });

  const packPayload = {
    project,
    workflow_instance_id: workflowInstanceId,
    design_inputs: designInputs,
    stages: stagePayload,
    overrides: (overrides ?? []).filter((override) => override.is_active),
    runtime: provenance.runtime ?? null,
    engine: provenance.engine ?? {
      id: designRun.engine_plugin_id,
      version: designRun.engine_plugin_version,
    },
    issue: {
      revision,
      issued_at: issuedAt,
      issued_by: user.id,
    },
  };

  const reportResponse = await fetch(
    `${OPENCALCS_API_URL.replace(/\/$/, "")}/api/v1/reports/wind/calculation-pack`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: packPayload }),
    },
  );

  if (!reportResponse.ok) {
    const errorBody = await reportResponse.text();
    return json({
      error: `Calculation pack generation failed: ${errorBody.slice(0, 500)}`,
    }, 502);
  }

  const pdfBytes = new Uint8Array(await reportResponse.arrayBuffer());
  if (!pdfBytes.length) return json({ error: "Generated PDF was empty" }, 502);

  const reportHash = await sha256Hex(pdfBytes);

  try {
    await ensurePrivateBucket(admin);
  } catch (error) {
    return json({
      error: `Unable to prepare report storage: ${error instanceof Error ? error.message : "unknown error"}`,
    }, 500);
  }

  const projectSegment = project.project_number
    ? project.project_number.replace(/[^A-Za-z0-9._-]+/g, "-")
    : projectId;
  const storagePath =
    `${project.organisation_id}/${projectSegment}/${workflowInstanceId}/wind-calculation-pack-r${revision}.pdf`;

  const { error: uploadError } = await admin.storage
    .from(REPORT_BUCKET)
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      cacheControl: "0",
      upsert: false,
    });

  if (uploadError) return json({ error: uploadError.message }, 500);

  const { data: report, error: reportError } = await admin
    .from("reports")
    .insert({
      project_id: projectId,
      calculation_run_id: designRun.id,
      workflow_instance_id: workflowInstanceId,
      storage_path: storagePath,
      report_type: "wind_calculation_pack",
      title: "Wind Calculation Pack",
      revision,
      status: "issued",
      report_hash: reportHash,
      metadata_json: {
        standard: designRun.standard_reference_json,
        latest_run_ids: latestRunIds,
        runtime: provenance.runtime ?? null,
        engine: provenance.engine ?? null,
        workflow_instance_id: workflowInstanceId,
      },
      supersedes_report_id: priorReport?.id ?? null,
      issued_by: user.id,
      issued_at: issuedAt,
    })
    .select("id, revision, issued_at, storage_path, report_hash")
    .single();

  if (reportError || !report) {
    await admin.storage.from(REPORT_BUCKET).remove([storagePath]);
    return json({
      error: reportError?.message ?? "Unable to save report record",
    }, 500);
  }

  await admin
    .from("calculations")
    .update({ state: "issued" })
    .eq("workflow_instance_id", workflowInstanceId);

  await admin.from("audit_events").insert({
    organisation_id: project.organisation_id,
    project_id: projectId,
    actor_user_id: user.id,
    event_type: "wind_workflow.issued",
    entity_type: "report",
    entity_id: report.id,
    metadata_json: {
      workflow_instance_id: workflowInstanceId,
      report_id: report.id,
      revision,
      report_hash: reportHash,
      latest_run_ids: latestRunIds,
    },
  });

  const { data: signed, error: signedError } = await admin.storage
    .from(REPORT_BUCKET)
    .createSignedUrl(storagePath, 900, {
      download: `${projectSegment}-wind-calculation-pack-r${revision}.pdf`,
    });

  return json({
    report,
    downloadUrl: signedError ? null : signed?.signedUrl ?? null,
    downloadExpiresIn: signedError ? null : 900,
  }, 201);
});
