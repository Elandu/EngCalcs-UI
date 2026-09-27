import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const OPENCALCS_API_URL =
  Deno.env.get("OPENCALCS_API_URL") ?? "https://opencalcs-api.onrender.com";

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
  const title = body?.title?.trim();
  const inputs = body?.inputs;

  if (!projectId || !calculationId || !title || !inputs || typeof inputs !== "object") {
    return json({ error: "projectId, calculationId, title and inputs are required" }, 400);
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
  if (!membership || !["owner", "admin", "engineer"].includes(membership.role)) {
    return json({ error: "Engineer access required" }, 403);
  }

  const base = OPENCALCS_API_URL.replace(/\/$/, "");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const [definitionResponse, runResponse] = await Promise.all([
    fetch(`${base}/api/v1/calculations/${encodeURIComponent(calculationId)}`, {
      headers,
    }),
    fetch(`${base}/api/v1/calculations/${encodeURIComponent(calculationId)}/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({ inputs }),
    }),
  ]);

  if (!definitionResponse.ok) {
    return json({ error: "Calculation definition not found" }, 404);
  }
  if (!runResponse.ok) {
    const errorPayload = await runResponse.json().catch(() => ({}));
    return json(
      { error: errorPayload.detail ?? "Calculation failed" },
      runResponse.status === 401 || runResponse.status === 403 ? runResponse.status : 422,
    );
  }

  const definition = await definitionResponse.json();
  const result = await runResponse.json();

  const { data: calculation, error: calculationError } = await admin
    .from("calculations")
    .insert({
      project_id: projectId,
      calculation_definition_id: calculationId,
      title,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (calculationError || !calculation) {
    return json({ error: calculationError?.message ?? "Unable to save calculation" }, 500);
  }

  const inputHash = await sha256(JSON.stringify(inputs));
  const { data: run, error: runError } = await admin
    .from("calculation_runs")
    .insert({
      calculation_id: calculation.id,
      engine_plugin_id: definition.plugin?.id ?? "unknown",
      engine_plugin_version: definition.plugin?.version ?? "unknown",
      calculation_definition_id: calculationId,
      calculation_definition_version: definition.version ?? "1",
      standard_reference_json: definition.standard ?? null,
      input_json: inputs,
      result_json: result,
      warnings_json: [],
      provenance_json: {
        source: "opencalcs-api",
        endpoint: base,
        auth: "supabase-user",
        runtime: definition.runtime ?? result._provenance?.runtime ?? null,
        engine: definition.plugin ?? result._provenance?.engine ?? null,
        calculation: result._provenance?.calculation ?? {
          id: calculationId,
          version: definition.version ?? "unknown",
        },
        standard: definition.standard ?? result._provenance?.standard ?? null,
      },
      input_hash: inputHash,
      created_by: user.id,
    })
    .select("id, created_at")
    .single();

  if (runError || !run) {
    await admin.from("calculations").delete().eq("id", calculation.id);
    return json({ error: runError?.message ?? "Unable to save calculation run" }, 500);
  }

  await admin.from("audit_events").insert({
    organisation_id: project.organisation_id,
    project_id: projectId,
    actor_user_id: user.id,
    event_type: "calculation.run",
    entity_type: "calculation_run",
    entity_id: run.id,
    metadata_json: { calculation_definition_id: calculationId },
  });

  return json({
    calculationId: calculation.id,
    runId: run.id,
    createdAt: run.created_at,
    definition,
    result,
  });
});
