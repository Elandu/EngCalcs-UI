import { NextResponse } from "next/server";

import { requireProjectAccess } from "@/lib/project-access";
import { projectRoles, validSourceCreate } from "@/lib/engineering-provenance";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const auth = await requireProjectAccess(projectId);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  const rawOffset = new URL(request.url).searchParams.get("offset") ?? "0";
  if (!/^(0|[1-9]\d{0,4})$/.test(rawOffset) || Number(rawOffset) > 10000) {
    return reply({ error: "Invalid result offset." }, 400);
  }
  const offset = Number(rawOffset);
  const { data, error, count } = await auth.client.from("engineering_sources")
    .select("id, source_kind, title, revision_label, source_reference, content_sha256, storage_path, storage_byte_size, storage_mime_type, created_by, created_at", { count: "exact" })
    .eq("project_id", projectId).order("created_at", { ascending: false })
    .order("id", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
  if (error) return reply({ error: "Unable to load project sources." }, 500);
  return reply({
    projectId,
    sources: (data ?? []).map(({ storage_path, ...source }) => ({
      ...source,
      hasUploadedFile: Boolean(storage_path),
    })),
    total: count ?? 0,
    offset,
    limit: PAGE_SIZE,
  });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const auth = await requireProjectAccess(projectId);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  if (!projectRoles.some((role) => role === auth.role)) return reply({ error: "Engineer access required." }, 403);
  const bytes = Number(request.headers.get("content-length") ?? "0");
  if (bytes > 16384) return reply({ error: "Source metadata is too large." }, 413);
  const body: unknown = await request.json().catch(() => null);
  if (!validSourceCreate(body)) return reply({ error: "Invalid source metadata or revision reference." }, 400);
  const { data, error } = await auth.client.from("engineering_sources").insert({
    project_id: projectId,
    source_kind: body.kind,
    title: body.title.trim(),
    revision_label: body.revisionLabel?.trim() ?? "",
    source_reference: body.reference.trim(),
    content_sha256: body.contentSha256 ?? null,
    created_by: auth.userId,
  }).select("id, source_kind, title, revision_label, source_reference, content_sha256, created_at").single();
  if (error) return reply({ error: "Unable to save engineering source metadata." }, 422);
  return reply({ source: data, note: "Source metadata only. No document extraction was performed." }, 201);
}
