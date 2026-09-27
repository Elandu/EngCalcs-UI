import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

type ManageRequest =
  | {
      action: "create";
      organisation_id: string;
      name: string;
      scopes?: string[];
      expires_at?: string | null;
    }
  | {
      action: "revoke";
      api_key_id: string;
    };

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

function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (value) => value.toString(16).padStart(2, "0")).join("");
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

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token) {
    return json({ error: "Missing user token" }, 401);
  }

  const admin = adminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;

  if (userError || !user) {
    return json({ error: "Invalid user token" }, 401);
  }

  let body: ManageRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (body.action === "create") {
    const name = body.name?.trim();
    if (!body.organisation_id || !name) {
      return json({ error: "organisation_id and name are required" }, 400);
    }

    const scopes = body.scopes?.length
      ? [...new Set(body.scopes)]
      : ["calculations:read", "calculations:run", "mcp:connect"];

    if (scopes.some((scope) => !ALLOWED_SCOPES.has(scope))) {
      return json({ error: "Unsupported scope requested" }, 400);
    }

    const { data: membership, error: membershipError } = await admin
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", body.organisation_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      membershipError ||
      !membership ||
      !["owner", "admin"].includes(membership.role)
    ) {
      return json({ error: "Owner or admin role required" }, 403);
    }

    if (body.expires_at && Number.isNaN(Date.parse(body.expires_at))) {
      return json({ error: "expires_at must be an ISO-8601 timestamp" }, 400);
    }

    const prefixRandom = randomHex(6);
    const secret = randomHex(24);
    const prefix = `oc_live_${prefixRandom}`;
    const rawKey = `${prefix}_${secret}`;
    const keyHash = await sha256(rawKey);

    const { data: keyRow, error: keyError } = await admin
      .from("api_keys")
      .insert({
        organisation_id: body.organisation_id,
        name,
        key_prefix: prefix,
        scopes,
        created_by: user.id,
        expires_at: body.expires_at ?? null,
      })
      .select("id, organisation_id, name, key_prefix, scopes, expires_at, created_at")
      .single();

    if (keyError || !keyRow) {
      return json({ error: keyError?.message ?? "Unable to create API key" }, 500);
    }

    const { error: secretError } = await admin
      .from("api_key_secrets")
      .insert({
        api_key_id: keyRow.id,
        key_hash: keyHash,
      });

    if (secretError) {
      await admin.from("api_keys").delete().eq("id", keyRow.id);
      return json({ error: "Unable to store API key secret" }, 500);
    }

    return json({
      ...keyRow,
      key: rawKey,
      warning: "This key is shown once. Store it securely.",
    }, 201);
  }

  if (body.action === "revoke") {
    if (!body.api_key_id) {
      return json({ error: "api_key_id is required" }, 400);
    }

    const { data: keyRow, error: keyError } = await admin
      .from("api_keys")
      .select("id, organisation_id, revoked_at")
      .eq("id", body.api_key_id)
      .maybeSingle();

    if (keyError || !keyRow) {
      return json({ error: "API key not found" }, 404);
    }

    const { data: membership } = await admin
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", keyRow.organisation_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return json({ error: "Owner or admin role required" }, 403);
    }

    if (keyRow.revoked_at) {
      return json({ ok: true, revoked_at: keyRow.revoked_at });
    }

    const revokedAt = new Date().toISOString();
    const { error: revokeError } = await admin
      .from("api_keys")
      .update({ revoked_at: revokedAt })
      .eq("id", keyRow.id);

    if (revokeError) {
      return json({ error: revokeError.message }, 500);
    }

    return json({ ok: true, revoked_at: revokedAt });
  }

  return json({ error: "Unsupported action" }, 400);
});
