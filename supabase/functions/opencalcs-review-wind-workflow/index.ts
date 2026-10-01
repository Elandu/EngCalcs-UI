import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { isUuid, rpcFailure } from "../_shared/wind-workflow-rpc.mjs";

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
  const expectedRunIds = body?.expectedRunIds;
  const note =
    typeof body?.note === "string" && body.note.trim()
      ? body.note.trim()
      : null;

  if (
    !isUuid(projectId) ||
    !isUuid(workflowInstanceId) ||
    !expectedRunIds || typeof expectedRunIds !== "object" || Array.isArray(expectedRunIds) ||
    Object.keys(expectedRunIds).length !== 6 ||
    !Object.entries(expectedRunIds).every(([calculationId, runId]) => isUuid(calculationId) && isUuid(runId)) ||
    !["submit", "approve", "request_changes"].includes(action)
  ) {
    return json({
      error: "projectId, workflowInstanceId and a valid action are required",
    }, 400);
  }

  const { data, error } = await admin.rpc("opencalcs_wind_workflow_action", {
    p_project_id: projectId,
    p_actor_id: user.id,
    p_workflow_id: workflowInstanceId,
    p_action: action,
    p_expected_run_ids: expectedRunIds,
    p_payload: { note },
  });
  if (error || !data) {
    const failure = rpcFailure(error);
    return json(failure, failure.status);
  }
  return json(data);
});
