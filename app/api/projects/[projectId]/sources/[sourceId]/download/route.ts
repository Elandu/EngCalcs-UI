import { NextResponse } from "next/server";

import { requireProjectAccess } from "@/lib/project-access";
import { uuidPattern } from "@/lib/engineering-provenance";

export const dynamic = "force-dynamic";

function reply(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; sourceId: string }> },
) {
  const { projectId, sourceId } = await context.params;
  if (!uuidPattern.test(sourceId)) return reply({ error: "Invalid source ID." }, 400);
  const access = await requireProjectAccess(projectId);
  if (!access.ok) return reply({ error: access.error }, access.status);

  const { data: source, error } = await access.client.from("engineering_sources")
    .select("id, project_id, title, source_kind, revision_label, content_sha256, storage_path")
    .eq("id", sourceId).eq("project_id", projectId).maybeSingle();
  if (error) return reply({ error: "Unable to load project source." }, 500);
  if (!source) return reply({ error: "Source not found." }, 404);
  if (!source.storage_path) return reply({ error: "This source is a reference only and has no uploaded PDF." }, 409);

  const safeFilename = source.title.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 90) || "engcalcs-source";
  const { data, error: signError } = await access.client.storage.from("engineering-project-sources")
    .createSignedUrl(source.storage_path, 60, { download: safeFilename + ".pdf" });
  if (signError || !data?.signedUrl) {
    return reply({ error: "Unable to generate private source download." }, 502);
  }
  return reply({
    sourceId,
    signedUrl: data.signedUrl,
    expiresInSeconds: 60,
    sha256: source.content_sha256,
    note: "Private URL grants temporary access to the source document. Do not share this URL.",
  });
}
