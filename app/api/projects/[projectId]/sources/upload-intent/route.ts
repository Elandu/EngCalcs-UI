import { NextResponse } from "next/server";

import { projectRoles } from "@/lib/engineering-provenance";
import { requireProjectAccess } from "@/lib/project-access";

export const dynamic = "force-dynamic";
const BUCKET = "engineering-project-sources";
const MAX_BYTES = 10 * 1024 * 1024;

function reply(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Creates an upload token for one randomly named PDF in the current project. */
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const access = await requireProjectAccess(projectId);
  if (!access.ok) return reply({ error: access.error }, access.status);
  if (!projectRoles.some((role) => role === access.role)) {
    return reply({ error: "Engineering upload access required." }, 403);
  }

  if (Number(request.headers.get("content-length") ?? "0") > 4096) {
    return reply({ error: "Upload metadata is too large." }, 413);
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reply({ error: "PDF file metadata is required." }, 400);
  }
  const details = body as Record<string, unknown>;
  if (details.contentType !== "application/pdf" ||
      typeof details.byteSize !== "number" || !Number.isInteger(details.byteSize) ||
      details.byteSize < 5 || details.byteSize > MAX_BYTES ||
      typeof details.fileName !== "string" ||
      !details.fileName.toLowerCase().endsWith(".pdf") ||
      details.fileName.trim().length < 5 || details.fileName.length > 180) {
    return reply({ error: "Only PDF files of up to 10 MiB are currently supported." }, 400);
  }

  const path = `${projectId}/${crypto.randomUUID()}.pdf`;
  const { data, error } = await access.client.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) {
    return reply({ error: "Unable to create a private upload token." }, 502);
  }
  return reply({
    projectId,
    bucket: BUCKET,
    path,
    uploadToken: data.token,
    // The token is short-lived, path-bound and can only upload one object.
    expiresInSeconds: 7200,
    expectedByteSize: details.byteSize,
    contentType: "application/pdf",
    nextStep: "Use uploadToSignedUrl(path, uploadToken, file), then register the PDF with upload-complete.",
  }, 201);
}
