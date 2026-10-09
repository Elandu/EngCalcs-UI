import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { expectedRunIdsMatch, isDefiniteRpcRejection, isUuid, rpcFailure } from "../_shared/wind-workflow-rpc.mjs";

const ENGCALCS_API_URL =
  Deno.env.get("ENGCALCS_API_URL") ??
  Deno.env.get("OPENCALCS_API_URL") ??
  "https://opencalcs-api.onrender.com";
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

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function requirePrivateBucket(admin: ReturnType<typeof adminClient>) {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) throw new Error(listError.message);

  const reportBucket = buckets?.find((bucket) => bucket.id === REPORT_BUCKET);
  if (!reportBucket) {
    throw new Error(`Required private storage bucket '${REPORT_BUCKET}' is not configured.`);
  }
  if (reportBucket.public) {
    throw new Error(`Storage bucket '${REPORT_BUCKET}' must be private before issuing reports.`);
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
  const expectedRunIds = body?.expectedRunIds;

  if (!isUuid(projectId) || !isUuid(workflowInstanceId) ||
    !expectedRunIds || typeof expectedRunIds !== "object" || Array.isArray(expectedRunIds) ||
    Object.keys(expectedRunIds).length !== 6 ||
    !Object.entries(expectedRunIds).every(([calculationId, runId]) => isUuid(calculationId) && isUuid(runId))) {
    return json({ error: "projectId, workflowInstanceId and the six displayed run IDs are required" }, 400);
  }

  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id, organisation_id, project_number, name, address, standards_region")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return json({ error: projectError.message }, 500);
  if (!project) return json({ error: "Project not found" }, 404);

  const { data: membership, error: membershipError } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", project.organisation_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) return json({ error: membershipError.message }, 500);
  if (!membership || !["owner", "admin", "reviewer"].includes(membership.role)) {
    return json({ error: "Reviewer, admin or owner access required to issue" }, 403);
  }

  const { data: calculations, error: calculationsError } = await admin
    .from("calculations")
    .select("id, stage_key, title, calculation_definition_id, sort_order, state")
    .eq("project_id", projectId)
    .eq("workflow_instance_id", workflowInstanceId)
    .order("sort_order", { ascending: true });

  if (calculationsError) return json({ error: calculationsError.message }, 500);
  if (!calculations || calculations.length !== 6) {
    return json({ error: "Wind workflow graph not found or incomplete" }, 404);
  }
  if (calculations.some((calculation) => calculation.state === "issued")) {
    return json({ error: "This Wind workflow has already been issued." }, 409);
  }
  const expectedStages = new Set(["site", "wind_region", "terrain", "shielding", "topography", "design"]);
  if (calculations.some((calculation) => !expectedStages.has(calculation.stage_key ?? "")) ||
    new Set(calculations.map((calculation) => calculation.stage_key)).size !== 6) {
    return json({ error: "Wind workflow graph is incomplete" }, 409);
  }

  const calculationIds = calculations.map((calculation) => calculation.id);
  const { data: runs, error: runsError } = await admin
    .from("calculation_runs")
    .select(
      "id, calculation_id, parent_run_id, run_sequence, engine_plugin_id, engine_plugin_version, calculation_definition_id, calculation_definition_version, standard_reference_json, input_json, result_json, warnings_json, provenance_json, input_hash, created_by, created_at",
    )
    .in("calculation_id", calculationIds)
    .order("run_sequence", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (runsError) return json({ error: runsError.message }, 500);
  if (!runs) return json({ error: "Unable to load run history" }, 500);

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
  if (!expectedRunIdsMatch(expectedRunIds, calculations, latestByCalculation)) {
    return json({ error: "Wind workflow changed. Reload before issuing." }, 409);
  }

  const { data: reviews, error: reviewsError } = await admin
    .from("calculation_run_reviews")
    .select("run_id, status, reviewer_id, review_note, reviewed_at, submitted_by, submitted_at")
    .in("run_id", latestRunIds);

  if (reviewsError) return json({ error: reviewsError.message }, 500);
  if (!reviews) return json({ error: "Unable to load reviews" }, 500);

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
    `${ENGCALCS_API_URL.replace(/\/$/, "")}/api/v1/reports/wind/calculation-pack`,
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

  const pdfBytes = await reportResponse.arrayBuffer();
  if (!pdfBytes.byteLength) return json({ error: "Generated PDF was empty" }, 502);

  const reportHash = await sha256Hex(pdfBytes);

  try {
    await requirePrivateBucket(admin);
  } catch (error) {
    return json({
      error: `Unable to prepare report storage: ${error instanceof Error ? error.message : "unknown error"}`,
    }, 500);
  }

  const projectSegment = project.project_number
    ? project.project_number.replace(/[^A-Za-z0-9._-]+/g, "-")
    : projectId;
  const storagePath =
    `${project.organisation_id}/${projectSegment}/${workflowInstanceId}/wind-calculation-pack-${crypto.randomUUID()}.pdf`;

  const { error: uploadError } = await admin.storage
    .from(REPORT_BUCKET)
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      cacheControl: "0",
      upsert: false,
    });

  if (uploadError) return json({ error: uploadError.message }, 500);

  const expectedReviews = [...reviews].sort((a, b) => a.run_id.localeCompare(b.run_id));
  const { data: issued, error: issueError } = await admin.rpc("engcalcs_wind_workflow_action", {
    p_project_id: projectId,
    p_actor_id: user.id,
    p_workflow_id: workflowInstanceId,
    p_action: "issue",
    p_expected_run_ids: expectedRunIds,
    p_payload: {
      expected_reviews: expectedReviews,
      report: {
        storage_path: storagePath,
        revision,
        report_hash: reportHash,
        issued_at: issuedAt,
        supersedes_report_id: priorReport?.id ?? null,
        metadata_json: {
          standard: designRun.standard_reference_json,
          latest_run_ids: latestRunIds,
          runtime: provenance.runtime ?? null,
          engine: provenance.engine ?? null,
          workflow_instance_id: workflowInstanceId,
        },
      },
    },
  });

  let report: { id: string; revision: number; issued_at: string; storage_path: string; report_hash: string } | null =
    !issueError && issued && typeof issued === "object" && "report" in issued
      ? (issued as { report: { id: string; revision: number; issued_at: string; storage_path: string; report_hash: string } }).report
      : null;
  if (issueError && isDefiniteRpcRejection(issueError)) {
    const { error: cleanupError } = await admin.storage.from(REPORT_BUCKET).remove([storagePath]);
    const failure = rpcFailure(issueError);
    return json({ ...failure, ...(cleanupError ? { cleanupError: cleanupError.message } : {}) }, failure.status);
  }
  if (!report) {
    // A transport timeout or malformed response may follow a successful commit.
    // Resolve by the unique uploaded path before deciding what outcome to report.
    const { data: recoveredReport, error: recoveryError } = await admin
      .from("reports")
      .select("id, revision, issued_at, storage_path, report_hash")
      .eq("storage_path", storagePath)
      .maybeSingle();
    if (recoveredReport) report = recoveredReport;
    else {
      return json({
        error: recoveryError
          ? "Issue outcome could not be confirmed. The uploaded PDF was retained for recovery."
          : issueError
            ? "Issue outcome is unknown. The uploaded PDF was retained for recovery."
            : "Issue returned no report record. The uploaded PDF was retained for recovery.",
      }, 503);
    }
  }

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
