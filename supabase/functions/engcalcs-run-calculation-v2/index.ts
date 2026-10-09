import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import {
  isSupportedLinkValue,
  matchesSchema,
  pointerPathsOverlap,
  windSourceLinkError,
} from "./linked-validation.ts";
import { resolveCalculationOutputSchema } from "../../../lib/workflow-output-schema.mjs";

const ENGCALCS_API_URL = Deno.env.get("ENGCALCS_API_URL") ??
  Deno.env.get("OPENCALCS_API_URL") ??
  "https://opencalcs-api.onrender.com";

type JsonObject = Record<string, unknown>;
type LinkedInput = {
  sourceCalculationId: string;
  sourceRunId: string;
  sourceOutputPath: string;
  targetInputPath: string;
};

function adminClient() {
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const secretKey = secretKeys.default ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function pointerParts(path: unknown): string[] | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.length > 1024) {
    return null;
  }
  const rawParts = path.slice(1).split("/");
  if (rawParts.length > 32 || rawParts.some((part) => /~(?![01])/.test(part))) {
    return null;
  }
  return rawParts.map((part) =>
    part.replaceAll("~1", "/").replaceAll("~0", "~")
  );
}

function readPointer(root: unknown, path: string): unknown {
  const parts = pointerParts(path);
  if (!parts) return undefined;
  let current = root;
  for (const part of parts) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(part)) return undefined;
      const index = Number(part);
      if (index >= current.length) return undefined;
      current = current[index];
    } else if (isObject(current) && Object.hasOwn(current, part)) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function assignPointer(
  root: JsonObject,
  path: string,
  value: unknown,
): JsonObject {
  const parts = pointerParts(path);
  if (!parts?.length) {
    throw new Error("Target input path must be a JSON Pointer to a field.");
  }
  let current: JsonObject | unknown[] = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const nextPart = parts[index + 1];
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(part)) {
        throw new Error("Target array path is invalid.");
      }
      const row = Number(part);
      if (row >= current.length) {
        throw new Error("Target input row no longer exists.");
      }
      if (!isObject(current[row]) && !Array.isArray(current[row])) {
        current[row] = /^(0|[1-9]\d*)$/.test(nextPart) ? [] : {};
      }
      current = current[row] as JsonObject | unknown[];
    } else {
      if (
        !Object.hasOwn(current, part) ||
        (!isObject(current[part]) && !Array.isArray(current[part]))
      ) {
        current[part] = /^(0|[1-9]\d*)$/.test(nextPart) ? [] : {};
      }
      current = current[part] as JsonObject | unknown[];
    }
  }
  const last = parts.at(-1)!;
  if (Array.isArray(current)) {
    if (!/^(0|[1-9]\d*)$/.test(last)) {
      throw new Error("Target array path is invalid.");
    }
    const row = Number(last);
    if (row >= current.length) {
      throw new Error("Target input row no longer exists.");
    }
    current[row] = value;
  } else {
    current[last] = value;
  }
  return root;
}

function schemaAtPointer(root: unknown, path: string): JsonObject | null {
  const parts = pointerParts(path);
  if (!parts?.length || !isObject(root)) return null;
  let current = root;
  for (const part of parts) {
    if (current.type === "array") {
      if (!/^(0|[1-9]\d*)$/.test(part) || !isObject(current.items)) return null;
      current = current.items;
    } else {
      const properties = isObject(current.properties)
        ? current.properties
        : null;
      if (!properties || !isObject(properties[part])) return null;
      current = properties[part] as JsonObject;
    }
  }
  return current;
}

function schemaUnitAtPointer(root: unknown, path: string): string | undefined {
  const schema = schemaAtPointer(root, path);
  return typeof schema?.unit === "string" ? schema.unit : undefined;
}

function resultPayload(value: unknown): unknown {
  if (!isObject(value)) return value;
  return isObject(value.result) && Object.keys(value.result).length
    ? value.result
    : value;
}

function quantityValue(value: unknown): { value: unknown; unit?: string } {
  if (isObject(value) && Object.hasOwn(value, "value")) {
    const unit = typeof value.unit === "string"
      ? value.unit
      : typeof value.units === "string"
      ? value.units
      : undefined;
    if (unit) return { value: value.value, unit };
  }
  return { value };
}

function normalizedUnit(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/g, "")
    : undefined;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
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
  const calculationId = body?.calculationId;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const rawInputs = body?.inputs;
  const rawLinks = body?.linkedInputs ?? [];
  if (
    !projectId || !calculationId || !title || title.length > 200 ||
    !isObject(rawInputs) || !Array.isArray(rawLinks) || rawLinks.length > 50
  ) {
    return json({
      error:
        "projectId, calculationId, title, inputs and at most 50 linked inputs are required",
    }, 400);
  }

  const linkedInputs = rawLinks as LinkedInput[];
  const targetPaths: string[] = [];
  for (const link of linkedInputs) {
    if (
      !isObject(link) ||
      !isUuid(link.sourceCalculationId) ||
      !isUuid(link.sourceRunId) ||
      !pointerParts(link.sourceOutputPath) ||
      !pointerParts(link.targetInputPath) ||
      targetPaths.some((path) => pointerPathsOverlap(path, link.targetInputPath))
    ) {
      return json({
        error:
          "Each linked input must use valid source IDs and non-overlapping JSON Pointer paths",
      }, 400);
    }
    targetPaths.push(link.targetInputPath);
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
  if (
    !membership || !["owner", "admin", "engineer"].includes(membership.role)
  ) {
    return json({ error: "Engineer access required" }, 403);
  }

  const base = ENGCALCS_API_URL.replace(/\/$/, "");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const definitionResponse = await fetch(
    `${base}/api/v1/calculations/${encodeURIComponent(calculationId)}`,
    { headers },
  );
  if (!definitionResponse.ok) {
    return json({ error: "Calculation definition not found" }, 404);
  }
  const definition = await definitionResponse.json();
  const inputSchema = definition.input_schema;
  if (!isObject(inputSchema)) {
    return json({
      error: "Calculation definition has no linkable input schema",
    }, 422);
  }

  const inputs: JsonObject = structuredClone(rawInputs);
  const appliedLinks: Array<JsonObject> = [];
  if (linkedInputs.length) {
    const sourceCalculationIds = [
      ...new Set(linkedInputs.map((link) => link.sourceCalculationId)),
    ];
    const sourceRunIds = [
      ...new Set(linkedInputs.map((link) => link.sourceRunId)),
    ];
    const [
      { data: sourceCalculations, error: sourceCalculationError },
      { data: sourceRuns, error: sourceRunError },
    ] = await Promise.all([
      admin.from("calculations")
        .select("id, project_id, calculation_definition_id")
        .in("id", sourceCalculationIds),
      admin.from("calculation_runs")
        .select("id, calculation_id, run_sequence, result_json, created_at")
        .in("id", sourceRunIds),
    ]);
    if (sourceCalculationError || sourceRunError) {
      return json({ error: "Unable to verify linked source runs" }, 500);
    }

    const calculationRows = (sourceCalculations ?? []) as Array<{
      id: string;
      project_id: string;
      calculation_definition_id: string;
    }>;
    const runRows = (sourceRuns ?? []) as Array<{
      id: string;
      calculation_id: string;
      run_sequence: number;
      result_json: unknown;
      created_at: string;
    }>;
    const calculationById = new Map<string, {
      id: string;
      project_id: string;
      calculation_definition_id: string;
    }>(calculationRows.map((row) => [row.id, row]));
    const runById = new Map<string, {
      id: string;
      calculation_id: string;
      run_sequence: number;
      result_json: unknown;
      created_at: string;
    }>(runRows.map((row) => [row.id, row]));
    const sourceDefinitionIds = [
      ...new Set(calculationRows.map((row) => row.calculation_definition_id)),
    ];
    const sourceDefinitions = await Promise.all(
      sourceDefinitionIds.map(async (definitionId) => {
        const response = await fetch(
          `${base}/api/v1/calculations/${encodeURIComponent(definitionId)}`,
          { headers },
        );
        if (!response.ok) return [definitionId, null] as const;
        return [definitionId, await response.json()] as const;
      }),
    );
    const definitionById = new Map(sourceDefinitions);
    for (const link of linkedInputs) {
      const sourceCalculation = calculationById.get(link.sourceCalculationId);
      const sourceRun = runById.get(link.sourceRunId);
      if (
        !sourceCalculation ||
        sourceCalculation.project_id !== projectId ||
        !sourceRun ||
        sourceRun.calculation_id !== link.sourceCalculationId
      ) {
        return json({
          error: "A linked source run is unavailable in this project",
        }, 404);
      }

      const output = quantityValue(
        readPointer(
          resultPayload(sourceRun.result_json),
          link.sourceOutputPath,
        ),
      );
      if (!isSupportedLinkValue(output.value)) {
        return json({
          error:
            `Linked source ${link.sourceOutputPath} is not a supported scalar, object, or array output`,
        }, 422);
      }
      const targetSchema = schemaAtPointer(inputSchema, link.targetInputPath);
      if (!targetSchema || !matchesSchema(output.value, targetSchema)) {
        return json({
          error:
            `Linked value does not satisfy target input ${link.targetInputPath}`,
        }, 422);
      }

      const sourceDefinition = definitionById.get(
        sourceCalculation.calculation_definition_id,
      );
      const sourceOutputSchema = resolveCalculationOutputSchema(
        sourceCalculation.calculation_definition_id,
        sourceDefinition?.output_schema,
      );
      const sourceUnitValue = output.unit ||
        schemaUnitAtPointer(
          sourceOutputSchema,
          link.sourceOutputPath,
        );
      const sourceUnit = normalizedUnit(sourceUnitValue);
      const targetUnit = normalizedUnit(targetSchema.unit);
      if (
        Boolean(sourceUnit) !== Boolean(targetUnit) ||
        (sourceUnit && targetUnit && sourceUnit !== targetUnit)
      ) {
        return json({
          error:
            `Linked units are missing or incompatible for ${link.targetInputPath}; convert values explicitly before linking`,
        }, 422);
      }

      try {
        assignPointer(inputs, link.targetInputPath, output.value);
      } catch (error) {
        return json({
          error: error instanceof Error
            ? error.message
            : "Unable to apply linked input",
        }, 422);
      }
      appliedLinks.push({
        source_calculation_id: link.sourceCalculationId,
        source_run_id: link.sourceRunId,
        source_run_sequence: sourceRun.run_sequence,
        source_output_path: link.sourceOutputPath,
        source_value: output.value,
        source_unit: sourceUnitValue ?? null,
        target_input_path: link.targetInputPath,
        target_unit: typeof targetSchema.unit === "string"
          ? targetSchema.unit
          : null,
      });
    }
  }

  const windLinkError = windSourceLinkError(calculationId, inputs, appliedLinks);
  if (windLinkError) return json({ error: windLinkError }, 422);

  const runResponse = await fetch(
    `${base}/api/v1/calculations/${encodeURIComponent(calculationId)}/run`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ inputs }),
    },
  );
  if (!runResponse.ok) {
    const errorPayload = await runResponse.json().catch(() => ({}));
    return json(
      { error: errorPayload.detail ?? "Calculation failed" },
      runResponse.status === 401 || runResponse.status === 403
        ? runResponse.status
        : 422,
    );
  }
  const result = await runResponse.json();

  // New linked runs share the revision transaction and project graph lock.
  const inputHash = await sha256(JSON.stringify(inputs));
  const { data: saved, error: saveError } = await admin.rpc("engcalcs_save_run", {
    p_project_id: projectId,
    p_actor_id: user.id,
    p_definition_id: calculationId,
    p_title: title,
    p_calculation_id: null,
    p_expected_run_id: null,
    p_run: {
      engine_plugin_id: definition.plugin?.id ?? "unknown",
      engine_plugin_version: definition.plugin?.version ?? "unknown",
      calculation_definition_version: definition.version ?? "1",
      standard_reference_json: definition.standard ?? null,
      input_json: inputs,
      result_json: result,
      warnings_json: result.warnings ?? [],
      input_hash: inputHash,
      provenance_json: {
        source: "engcalcs-api", endpoint: base, auth: "supabase-user",
        runtime: definition.runtime ?? result._provenance?.runtime ?? null,
        engine: definition.plugin ?? result._provenance?.engine ?? null,
        calculation: result._provenance?.calculation ?? { id: calculationId, version: definition.version ?? "unknown" },
        standard: definition.standard ?? result._provenance?.standard ?? null,
        linked_inputs: appliedLinks,
      },
    },
  });
  if (saveError || !saved) return json({ error: saveError?.message ?? "Unable to save run" },
    saveError?.code === "40001" ? 409 : saveError?.code === "42501" ? 403 : 422);
  return json({ ...saved, definition, result, appliedLinks });
});
