import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { expectedRunIdsMatch, isUuid, rpcFailure, validateWindWorkflowEnvelope } from "../_shared/wind-workflow-rpc.mjs";

const OPENCALCS_API_URL =
  Deno.env.get("OPENCALCS_API_URL") ?? "https://opencalcs-api.onrender.com";

const STAGES = [
  { key: "site", definition: "au.wind.workflow.site", title: "Site & location" },
  { key: "wind_region", definition: "au.wind.workflow.wind_region", title: "Wind region & regional speed" },
  { key: "terrain", definition: "au.wind.workflow.terrain", title: "Terrain & Mz,cat" },
  { key: "shielding", definition: "au.wind.workflow.shielding", title: "Shielding" },
  { key: "topography", definition: "au.wind.workflow.topography", title: "Topography" },
  { key: "design", definition: "au.wind.workflow.design_wind_speed", title: "Design wind speed" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

type WorkflowOverride = {
  variable: "VR" | "Md" | "Mzcat" | "Ms" | "Mt" | "Vsitb";
  direction?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | null;
  override_value: number;
  reason: string;
  label?: string | null;
  source_reference?: string | null;
  original_value?: number | null;
};

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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function variableRows(workflow: Record<string, unknown>, variable: string) {
  const rows = Array.isArray(workflow.variables) ? workflow.variables : [];
  return rows.filter((row) =>
    row && typeof row === "object" &&
    (row as Record<string, unknown>).variable === variable
  );
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
  const rawInputs = body?.inputs;
  const requestedWorkflowId =
    typeof body?.workflowInstanceId === "string" ? body.workflowInstanceId : null;
  const expectedRunIds = body?.expectedRunIds ?? {};
  if (requestedWorkflowId && !isUuid(requestedWorkflowId)) {
    return json({ error: "Invalid workflowInstanceId." }, 400);
  }
  if (!requestedWorkflowId && (!expectedRunIds || typeof expectedRunIds !== "object" || Array.isArray(expectedRunIds) || Object.keys(expectedRunIds).length !== 0)) {
    return json({ error: "A new workflow requires an empty expectedRunIds object." }, 400);
  }
  const overrides: WorkflowOverride[] = Array.isArray(body?.overrides)
    ? body.overrides
    : [];

  if (!isUuid(projectId) || !rawInputs || typeof rawInputs !== "object" || Array.isArray(rawInputs)) {
    return json({ error: "projectId and inputs are required" }, 400);
  }
  if (!Array.isArray(body?.overrides) && body?.overrides !== undefined) {
    return json({ error: "overrides must be an array" }, 400);
  }
  if (!requestedWorkflowId && overrides.length) {
    return json({ error: "Overrides can only be applied to an existing Wind workflow." }, 409);
  }

  for (const override of overrides) {
    if (
      !override ||
      !["VR", "Md", "Mzcat", "Ms", "Mt", "Vsitb"].includes(override.variable) ||
      !Number.isFinite(override.override_value) ||
      override.override_value <= 0 ||
      typeof override.reason !== "string" ||
      !override.reason.trim()
    ) {
      return json({ error: "Invalid workflow override" }, 400);
    }
    if (override.variable === "VR" && override.direction) {
      return json({ error: "VR overrides must not include a direction" }, 400);
    }
    if (override.variable !== "VR" && !override.direction) {
      return json({ error: `${override.variable} overrides require a direction` }, 400);
    }
  }

  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id, organisation_id, project_number, name, address")
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
  if (!membership || !["owner", "admin", "engineer"].includes(membership.role)) {
    return json({ error: "Engineer access required" }, 403);
  }

  let calculations: Array<{
    id: string;
    calculation_definition_id: string;
    stage_key: string | null;
    state: string;
  }> = [];
  if (requestedWorkflowId) {
    const { data, error } = await admin
      .from("calculations")
      .select("id, calculation_definition_id, stage_key, state")
      .eq("project_id", projectId)
      .eq("workflow_instance_id", requestedWorkflowId)
      .order("sort_order", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    if (!data || data.length !== STAGES.length) {
      return json({ error: "Existing Wind workflow graph was not found or is incomplete" }, 404);
    }
    calculations = data;
    if (calculations.some((row) => row.state === "issued")) {
      return json({ error: "Issued Wind workflows cannot be revised." }, 409);
    }
  }

  if (requestedWorkflowId) {
    for (const stage of STAGES) {
      const rows = calculations.filter((calculation) => calculation.stage_key === stage.key);
      if (rows.length !== 1 || rows[0].calculation_definition_id !== stage.definition) {
        return json({ error: `Wind workflow stage ${stage.key} is missing or incompatible.` }, 409);
      }
    }
  }

  const calculationIds = calculations.map((calculation) => calculation.id);
  const { data: existingRuns, error: existingRunsError } = requestedWorkflowId
    ? await admin
      .from("calculation_runs")
      .select("id, calculation_id, run_sequence, created_at")
      .in("calculation_id", calculationIds)
      .order("run_sequence", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
    : { data: [], error: null };
  if (existingRunsError) return json({ error: existingRunsError.message }, 500);

  const latestRunByCalculation = new Map<string, {
    id: string;
    calculation_id: string;
    run_sequence: number;
  }>();
  for (const run of existingRuns ?? []) {
    if (!latestRunByCalculation.has(run.calculation_id)) latestRunByCalculation.set(run.calculation_id, run);
  }
  if (requestedWorkflowId && (
    latestRunByCalculation.size !== STAGES.length ||
    !expectedRunIdsMatch(expectedRunIds, calculations, latestRunByCalculation)
  )) {
    return json({ error: "Wind workflow changed. Reload before saving." }, 409);
  }

  const { data: activeOverrideRows, error: overrideReadError } = requestedWorkflowId
    ? await admin
      .from("calculation_overrides")
      .select("id, variable, direction, override_value, reason, source_reference, original_value")
      .eq("workflow_instance_id", requestedWorkflowId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (overrideReadError) return json({ error: overrideReadError.message }, 500);

  const effectiveOverrideMap = new Map<string, WorkflowOverride>();
  for (const row of activeOverrideRows ?? []) {
    const key = `${row.variable}:${row.direction ?? ""}`;
    effectiveOverrideMap.set(key, {
      variable: row.variable,
      direction: row.direction,
      override_value: Number(row.override_value),
      reason: row.reason,
      source_reference: row.source_reference,
      original_value: row.original_value === null ? null : Number(row.original_value),
    });
  }
  for (const override of overrides) {
    const key = `${override.variable}:${override.direction ?? ""}`;
    effectiveOverrideMap.set(key, override);
  }
  const effectiveOverrides = [...effectiveOverrideMap.values()];

  const inputs = {
    ...rawInputs,
    workflow_overrides: effectiveOverrides.map((override) => ({
      variable: override.variable,
      direction: override.direction ?? null,
      override_value: override.override_value,
      reason: override.reason.trim(),
      label: override.label ?? null,
    })),
  };

  const base = OPENCALCS_API_URL.replace(/\/$/, "");
  const workflowResponse = await fetch(`${base}/api/v1/workflows/wind/site`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(inputs),
  });

  if (!workflowResponse.ok) {
    const errorPayload = await workflowResponse.json().catch(() => ({}));
    return json(
      { error: errorPayload.detail ?? "Wind assessment failed" },
      workflowResponse.status === 401 || workflowResponse.status === 403
        ? workflowResponse.status
        : 422,
    );
  }

  const envelope = await workflowResponse.json().catch(() => null);
  const envelopeError = validateWindWorkflowEnvelope(envelope);
  if (envelopeError) return json({ error: envelopeError }, 502);
  const stages = envelope.stages ?? {};
  const workflow = envelope.stages.workflow.workflow;
  const siteAnalysis = stages.site?.site_analysis ?? {};
  const windInputs = stages.wind_inputs ?? {};
  const terrainEvidence = stages.terrain?.terrain_category_evidence ?? {};
  const obstructionSummary = stages.obstructions?.obstruction_summary ?? {};

  const stageResults = new Map<StageKey, unknown>([
    ["site", siteAnalysis],
    ["wind_region", {
      ...windInputs,
      variables: [
        ...variableRows(workflow, "VR"),
        ...variableRows(workflow, "Md"),
      ],
    }],
    ["terrain", {
      ...terrainEvidence,
      variables: variableRows(workflow, "Mzcat"),
    }],
    ["shielding", {
      obstruction_summary: obstructionSummary,
      variables: variableRows(workflow, "Ms"),
    }],
    ["topography", {
      features: siteAnalysis.features ?? [],
      variables: variableRows(workflow, "Mt"),
    }],
    ["design", {
      directional_vsitb: workflow.directional_vsitb ?? [],
      design_wind_speeds: workflow.design_wind_speeds ?? [],
      governing_directions: workflow.governing_directions ?? [],
      governing_direction: workflow.governing_direction ?? null,
      governing_vsitb: workflow.governing_vsitb ?? null,
      governing_vdes_faces: workflow.governing_vdes_faces ?? [],
      governing_vdes_mps: workflow.governing_vdes_mps ?? null,
      variables: workflow.variables ?? [],
      warnings: workflow.warnings ?? [],
    }],
  ]);

  const standard = envelope.standard ?? {
    name: "AS/NZS 1170.2",
    edition: "2021",
  };
  const inputHash = await sha256(JSON.stringify(inputs));

  const stagePayload = STAGES.map((stage) => {
    const result = stageResults.get(stage.key) ?? {};
    const resultObject =
      result && typeof result === "object"
        ? result as Record<string, unknown>
        : {};

    return {
      stage_key: stage.key,
      title: stage.title,
      definition: stage.definition,
      run: {
        engine_plugin_id: envelope.plugin?.id ?? "au.openwind",
        engine_plugin_version: envelope.plugin?.version ?? "unknown",
        calculation_definition_version: "1",
        standard_reference_json: standard,
        input_json: {
          ...(requestedWorkflowId ? { workflow_instance_id: requestedWorkflowId } : {}),
          workflow_id: envelope.workflow_id,
          stage: stage.key,
          workflow_inputs: inputs,
        },
        result_json: result,
        warnings_json: Array.isArray(resultObject.warnings)
          ? resultObject.warnings
          : [],
        provenance_json: {
          source: "opencalcs-api",
          endpoint: base,
          runtime: envelope.runtime ?? null,
          engine: envelope.plugin ?? null,
          standard,
          ...(requestedWorkflowId ? { workflow_instance_id: requestedWorkflowId } : {}),
          workflow_id: envelope.workflow_id,
          stage: stage.key,
        },
        input_hash: inputHash,
      },
    };
  });

  const { data: saved, error: saveError } = await admin.rpc("opencalcs_wind_workflow_action", {
    p_project_id: projectId,
    p_actor_id: user.id,
    p_workflow_id: requestedWorkflowId,
    p_action: "save",
    p_expected_run_ids: expectedRunIds ?? {},
    p_payload: {
      stages: stagePayload,
      overrides,
      workflow_id: envelope.workflow_id,
      ...(!project.address && typeof inputs.address === "string"
        ? { project_address: inputs.address }
        : {}),
    },
  });
  if (saveError || !saved) {
    const failure = rpcFailure(saveError);
    return json(failure, failure.status);
  }

  const result = saved as {
    workflowInstanceId: string;
    calculationIds: Record<StageKey, string>;
    runs: Array<{ id: string; calculation_id: string; parent_run_id: string | null; run_sequence: number; created_at: string }>;
    affectedStages: StageKey[];
  };

  return json({
    workflowInstanceId: result.workflowInstanceId,
    workflowId: envelope.workflow_id,
    calculationIds: result.calculationIds,
    affectedStages: result.affectedStages,
    runs: result.runs,
    stages: envelope.stages,
    result: workflow,
    runtime: envelope.runtime,
    plugin: envelope.plugin,
    standard,
  });
});
