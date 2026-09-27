import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const ALLOWED_SCOPES = new Set([
  "calculations:read",
  "calculations:run",
  "mcp:connect",
]);

function adminClient() {
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const secretKey =
    secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    secretKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const rawKey = req.headers.get("x-opencalcs-key")?.trim() ?? "";
  if (!rawKey.startsWith("oc_live_") || rawKey.length < 40) {
    return json({ valid: false, error: "Invalid API key" }, 401);
  }

  let requiredScopes: string[] = [];
  try {
    const body = await req.json();
    requiredScopes = Array.isArray(body?.required_scopes)
      ? body.required_scopes
      : [];
  } catch {
    requiredScopes = [];
  }

  if (requiredScopes.some((scope) => !ALLOWED_SCOPES.has(scope))) {
    return json({ valid: false, error: "Unsupported scope" }, 400);
  }

  const admin = adminClient();
  const keyHash = await sha256(rawKey);

  const { data: secretRow, error: secretError } = await admin
    .from("api_key_secrets")
    .select("api_key_id")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (secretError || !secretRow) {
    return json({ valid: false, error: "Invalid API key" }, 401);
  }

  const { data: keyRow, error: keyError } = await admin
    .from("api_keys")
    .select(
      "id, organisation_id, name, key_prefix, scopes, expires_at, revoked_at",
    )
    .eq("id", secretRow.api_key_id)
    .maybeSingle();

  if (keyError || !keyRow || keyRow.revoked_at) {
    return json({ valid: false, error: "API key unavailable" }, 401);
  }

  if (keyRow.expires_at && Date.parse(keyRow.expires_at) <= Date.now()) {
    return json({ valid: false, error: "API key expired" }, 401);
  }

  const missingScopes = requiredScopes.filter(
    (scope) => !keyRow.scopes.includes(scope),
  );
  if (missingScopes.length) {
    return json({
      valid: false,
      error: "Insufficient scope",
      missing_scopes: missingScopes,
    }, 403);
  }

  await admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  return json({
    valid: true,
    api_key_id: keyRow.id,
    organisation_id: keyRow.organisation_id,
    name: keyRow.name,
    key_prefix: keyRow.key_prefix,
    scopes: keyRow.scopes,
    expires_at: keyRow.expires_at,
  });
});
