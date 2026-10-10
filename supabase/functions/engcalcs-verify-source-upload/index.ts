import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const BUCKET = "engineering-project-sources";
const MAX_BYTES = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UploadBody = {
  projectId: string;
  path: string;
  kind: string;
  title: string;
  revisionLabel?: string;
  reference: string;
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

function adminClient() {
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const serviceKey = keys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function validBody(value: unknown): value is UploadBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const b = value as Record<string, unknown>;
  if (typeof b.projectId !== "string" || !UUID.test(b.projectId) ||
      typeof b.path !== "string" || b.path !== b.path.toLowerCase() ||
      !b.path.startsWith(b.projectId + "/")) return false;
  const fileName = b.path.slice(b.projectId.length + 1);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]pdf$/.test(fileName)) return false;
  if (!["drawing", "schedule", "site_observation", "report", "other"].includes(String(b.kind))) return false;
  if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 200 ||
      typeof b.reference !== "string" || !b.reference.trim() || b.reference.length > 1024) return false;
  if (b.revisionLabel !== undefined && (typeof b.revisionLabel !== "string" || b.revisionLabel.length > 80)) return false;
  return true;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * On explicit user completion, verify actual private Storage bytes, then bind
 * a source reference to its checksum. No AI service receives file contents.
 */
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (Number(request.headers.get("content-length") ?? "0") > 16384) {
    return json({ error: "Upload completion metadata is too large." }, 413);
  }
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "Authentication required." }, 401);

  const admin = adminClient();
  const { data: credentials, error: userError } = await admin.auth.getUser(token);
  const user = credentials.user;
  if (userError || !user) return json({ error: "Invalid authentication." }, 401);

  const data: unknown = await request.json().catch(() => null);
  if (!validBody(data)) return json({ error: "Invalid source reference or storage object path." }, 400);

  const { data: project, error: projectError } = await admin.from("projects")
    .select("id, organisation_id").eq("id", data.projectId).maybeSingle();
  if (projectError) return json({ error: "Unable to verify project." }, 500);
  if (!project) return json({ error: "Project not found." }, 404);

  const { data: member, error: memberError } = await admin.from("organisation_members")
    .select("role").eq("organisation_id", project.organisation_id)
    .eq("user_id", user.id).maybeSingle();
  if (memberError || !member || !["owner", "admin", "engineer"].includes(member.role)) {
    return json({ error: "Engineering upload access required." }, 403);
  }

  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(data.path);
  if (downloadError || !blob) return json({ error: "Source PDF upload was not found." }, 404);
  if (blob.size < 5 || blob.size > MAX_BYTES) return json({ error: "PDF must not exceed 10 MiB." }, 422);
  const bytes = await blob.arrayBuffer();
  const magic = new TextDecoder().decode(bytes.slice(0, 5));
  if (magic !== "%PDF-") return json({ error: "Uploaded file does not have a valid PDF header." }, 422);
  const digest = await sha256(bytes);

  const { data: source, error: insertError } = await admin.from("engineering_sources").insert({
    project_id: data.projectId,
    source_kind: data.kind,
    title: data.title.trim(),
    revision_label: data.revisionLabel?.trim() ?? "",
    source_reference: data.reference.trim(),
    content_sha256: digest,
    storage_path: data.path,
    storage_byte_size: bytes.byteLength,
    storage_mime_type: "application/pdf",
    created_by: user.id,
  }).select("id, project_id, source_kind, title, revision_label, source_reference, content_sha256, storage_path, storage_byte_size, storage_mime_type, created_at").single();

  if (insertError?.code === "23505") return json({ error: "This document is already registered." }, 409);
  if (insertError || !source) return json({ error: "Unable to register the verified PDF reference." }, 422);

  // Logging is supplementary; the source row itself retains immutable actor,
  // checksum, source location and creation time.
  const { error: auditError } = await admin.from("audit_events").insert({
    organisation_id: project.organisation_id,
    project_id: data.projectId,
    actor_user_id: user.id,
    event_type: "source.pdf_registered",
    entity_type: "engineering_source",
    entity_id: source.id,
    metadata_json: { sha256: digest, bytes: bytes.byteLength, kind: data.kind, storage_path: data.path },
  });
  if (auditError) console.warn("Source file audit event not recorded", { sourceId: source.id, code: auditError.code });

  return json({
    source,
    verified: { sha256: digest, byteSize: bytes.byteLength, mimeType: "application/pdf" },
    note: "Source PDF was verified and retained in private storage. No AI extraction or calculation was performed.",
  }, 201);
});
