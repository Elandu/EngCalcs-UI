import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

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

function stageForVariable(variable: WorkflowOverride["variable"]): StageKey {
  if (variable === "VR" || variable === "Md") return "wind_region";
  if (variable === "Mzcat") return "terrain";
  if (variable === "Ms") return "shielding";
  if (variable === "Mt") return "topography";
  return "design";
}

function affectedStages(
  existingWorkflow: boolean,
  overrides: WorkflowOverride[],
): Set<StageKey> {
  if (!existingWorkflow || !overrides.length) {
    return new Set(STAGES.map((stage) => stage.key));
  }

  const affected = new Set<StageKey>(["design"]);
  for (const override of overrides) {
    affected.add(stageForVariable(override.variable));
  }
  return affected;
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
  const overrides: WorkflowOverride[] = Array.isArray(body?.overrides)
    ? body.overrides
    : [];

  if (!projectId || !rawInputs || typeof rawInputs !== "object") {
    return json({ error: "projectId and inputs are required" }, 400);
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

  const { data: project } = await admin
    .from("projects")
    .select("id, organisation_id, project_number, name, address")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return json({ error: "Project not found" }, 404);

  const { data: membership } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", project.organisation_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || !["owner", "admin", "engineer"].includes(membership.role)) {
    return json({ error: "Engineer access required" }, 403);
  }

  const activeOverrideRows = requestedWorkflowId
    ? (
        await admin
          .from("calculation_overrides")
          .select(
            "id, variable, direction, override_value, reason, source_reference, original_value",
          )
          .eq("workflow_instance_id", requestedWorkflowId)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
      ).data ?? []
    : [];

  const effectiveOverrideMap = new Map<string, WorkflowOverride>();
  for (const row of activeOverrideRows) {
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

  const workflowInstanceId = requestedWorkflowId ?? crypto.randomUUID();
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

    if (error || !data || data.length !== STAGES.length) {
      return json({ error: "Existing Wind workflow graph was not found or is incomplete" }, 404);
    }
    calculations = data;
  } else {
    const rows = STAGES.map((stage, index) => ({
      project_id: projectId,
      workflow_instance_id: workflowInstanceId,
      stage_key: stage.key,
      calculation_definition_id: stage.definition,
      title: stage.title,
      sort_order: index,
      state: "draft",
      created_by: user.id,
    }));

    const { data, error } = await admin
      .from("calculations")
      .insert(rows)
      .select("id, calculation_definition_id, stage_key, state");

    if (error || !data || data.length !== STAGES.length) {
      return json({ error: error?.message ?? "Unable to create Wind workflow graph" }, 500);
    }
    calculations = data;
  }

  const calcByStage = new Map<StageKey, (typeof calculations)[number]>();
  for (const stage of STAGES) {
    const row = calculations.find((calculation) => calculation.stage_key === stage.key);
    if (!row) return json({ error: `Missing workflow stage: ${stage.key}` }, 500);
    calcByStage.set(stage.key, row);
  }

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
    if (!requestedWorkflowId) {
      await admin
        .from("calculations")
        .delete()
        .eq("workflow_instance_id", workflowInstanceId);
    }
    const errorPayload = await workflowResponse.json().catch(() => ({}));
    return json(
      { error: errorPayload.detail ?? "Wind assessment failed" },
      workflowResponse.status === 401 || workflowResponse.status === 403
        ? workflowResponse.status
        : 422,
    );
  }

  const envelope = await workflowResponse.json();
  const stages = envelope.stages ?? {};
  const workflow = envelope.result ?? {};
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

  const affected = affectedStages(Boolean(requestedWorkflowId), overrides);
  const affectedCalculationIds = [...affected].map(
    (stage) => calcByStage.get(stage)!.id,
  );

  const { data: existingRuns, error: existingRunsError } = affectedCalculationIds.length
    ? await admin
        .from("calculation_runs")
        .select("id, calculation_id, run_sequence, created_at")
        .in("calculation_id", affectedCalculationIds)
        .order("run_sequence", { ascending: false })
    : { data: [], error: null };

  if (existingRunsError) {
    return json({ error: existingRunsError.message }, 500);
  }

  const latestRunByCalculation = new Map<string, {
    id: string;
    calculation_id: string;
    run_sequence: number;
  }>();
  for (const run of existingRuns ?? []) {
    if (!latestRunByCalculation.has(run.calculation_id)) {
      latestRunByCalculation.set(run.calculation_id, run);
    }
  }

  const standard = envelope.standard ?? {
    name: "AS/NZS 1170.2",
    edition: "2021",
  };
  const inputHash = await sha256(JSON.stringify(inputs));

  const runRows = [...affected].map((stage) => {
    const calculation = calcByStage.get(stage)!;
    const previousRun = latestRunByCalculation.get(calculation.id);
    const result = stageResults.get(stage) ?? {};
    const resultObject =
      result && typeof result === "object"
        ? result as Record<string, unknown>
        : {};

    return {
      calculation_id: calculation.id,
      parent_run_id: previousRun?.id ?? null,
      run_sequence: (previousRun?.run_sequence ?? 0) + 1,
      engine_plugin_id: envelope.plugin?.id ?? "au.openwind",
      engine_plugin_version: envelope.plugin?.version ?? "unknown",
      calculation_definition_id: calculation.calculation_definition_id,
      calculation_definition_version: "1",
      standard_reference_json: standard,
      input_json: {
        workflow_instance_id: workflowInstanceId,
        workflow_id: envelope.workflow_id,
        stage,
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
        workflow_instance_id: workflowInstanceId,
        workflow_id: envelope.workflow_id,
        stage,
      },
      input_hash: inputHash,
      created_by: user.id,
    };
  });

  const { data: runs, error: runsError } = await admin
    .from("calculation_runs")
    .insert(runRows)
    .select("id, calculation_id, parent_run_id, run_sequence, created_at");

  if (runsError || !runs || runs.length !== runRows.length) {
    if (!requestedWorkflowId) {
      await admin
        .from("calculations")
        .delete()
        .eq("workflow_instance_id", workflowInstanceId);
    }
    return json({ error: runsError?.message ?? "Unable to save Wind run history" }, 500);
  }

  const newRunByCalculation = new Map(
    runs.map((run) => [run.calculation_id, run]),
  );

  if (!requestedWorkflowId) {
    const edgeSpecs = [
      ["site", "site", "wind_region", "site"],
      ["site", "site", "terrain", "site"],
      ["terrain", "terrain_evidence", "shielding", "terrain_evidence"],
      ["site", "profiles/features", "topography", "terrain_profiles"],
      ["wind_region", "wind_inputs", "design", "wind_inputs"],
      ["terrain", "mzcat", "design", "mzcat"],
      ["shielding", "ms", "design", "ms"],
      ["topography", "mt", "design", "mt"],
    ] as const;

    const { error: linkError } = await admin
      .from("calculation_links")
      .insert(edgeSpecs.map(
        ([sourceKey, sourcePath, targetKey, targetPath]) => ({
          source_calculation_id: calcByStage.get(sourceKey)!.id,
          source_output_path: sourcePath,
          target_calculation_id: calcByStage.get(targetKey)!.id,
          target_input_path: targetPath,
          created_by: user.id,
        }),
      ));

    if (linkError) {
      await admin
        .from("calculations")
        .delete()
        .eq("workflow_instance_id", workflowInstanceId);
      return json({ error: linkError.message }, 500);
    }
  }

  if (overrides.length) {
    const insertedOverrides: Array<{
      id: string;
      variable: string;
      direction: string | null;
    }> = [];

    for (const override of overrides) {
      const stage = stageForVariable(override.variable);
      const calculation = calcByStage.get(stage)!;
      const previousRun = latestRunByCalculation.get(calculation.id);
      const appliedRun = newRunByCalculation.get(calculation.id);

      if (!previousRun) {
        return json({
          error: `Cannot override ${override.variable} before an initial workflow run exists`,
        }, 409);
      }

      const { data: inserted, error: insertOverrideError } = await admin
        .from("calculation_overrides")
        .insert({
          workflow_instance_id: workflowInstanceId,
          calculation_id: calculation.id,
          source_run_id: previousRun.id,
          applied_run_id: appliedRun?.id ?? null,
          variable: override.variable,
          direction: override.direction ?? null,
          original_value: override.original_value ?? null,
          override_value: override.override_value,
          reason: override.reason.trim(),
          source_reference: override.source_reference ?? null,
          created_by: user.id,
          is_active: true,
        })
        .select("id, variable, direction")
        .single();

      if (insertOverrideError || !inserted) {
        return json({
          error: insertOverrideError?.message ?? "Unable to save override",
        }, 500);
      }

      insertedOverrides.push(inserted);

      const matchingPrior = activeOverrideRows.filter(
        (row) =>
          row.variable === override.variable &&
          (row.direction ?? null) === (override.direction ?? null),
      );

      if (matchingPrior.length) {
        const { error: supersedeError } = await admin
          .from("calculation_overrides")
          .update({
            is_active: false,
            superseded_at: new Date().toISOString(),
            superseded_by_id: inserted.id,
          })
          .in("id", matchingPrior.map((row) => row.id));

        if (supersedeError) {
          return json({ error: supersedeError.message }, 500);
        }
      }
    }
  }

  await admin
    .from("calculations")
    .update({ state: "draft" })
    .eq("workflow_instance_id", workflowInstanceId)
    .in("stage_key", [...affected]);

  if (!project.address && typeof inputs.address === "string") {
    await admin
      .from("projects")
      .update({ address: inputs.address })
      .eq("id", projectId);
  }

  await admin.from("audit_events").insert({
    organisation_id: project.organisation_id,
    project_id: projectId,
    actor_user_id: user.id,
    event_type: requestedWorkflowId
      ? "wind_workflow.rerun"
      : "wind_workflow.run",
    entity_type: "calculation",
    entity_id: calcByStage.get("design")!.id,
    metadata_json: {
      workflow_instance_id: workflowInstanceId,
      workflow_id: envelope.workflow_id,
      affected_stages: [...affected],
      override_count: overrides.length,
      active_override_count: effectiveOverrides.length,
      run_ids: runs.map((run) => run.id),
    },
  });

  return json({
    workflowInstanceId,
    workflowId: envelope.workflow_id,
    calculationIds: Object.fromEntries(
      STAGES.map((stage) => [stage.key, calcByStage.get(stage.key)!.id]),
    ),
    affectedStages: [...affected],
    runs,
    stages: envelope.stages,
    result: workflow,
    runtime: envelope.runtime,
    plugin: envelope.plugin,
    standard,
  });
});
