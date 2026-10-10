import { NextResponse } from "next/server";

import { projectRoles, validSourceCreate } from "@/lib/engineering-provenance";
import { requireProjectAccess } from "@/lib/project-access";

export const dynamic = "force-dynamic";

function reply(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Finalise only after a signed upload succeeded.
 * A JWT-verified Edge Function downloads and hashes the actual stored bytes
 * before registering an immutable engineering source.
 */
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
  if (Number(request.headers.get("content-length") ?? "0") > 16384) {
    return reply({ error: "PDF reference metadata is too large." }, 413);
  }
  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return reply({ error: "Source metadata is required." }, 400);
  }
  const body = raw as Record<string, unknown>;
  const uploadPath = body.path;
  if (!validSourceCreate(body) || typeof uploadPath !== "string" ||
      !uploadPath.startsWith(projectId + "/") ||
      !new RegExp("^" + projectId + "/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]pdf$").test(uploadPath)) {
    return reply({ error: "Invalid source PDF path or evidence reference." }, 400);
  }

  const { data, error } = await access.client.functions.invoke("engcalcs-verify-source-upload", {
    body: {
      projectId,
      path: uploadPath,
      kind: body.kind,
      title: body.title,
      revisionLabel: body.revisionLabel ?? "",
      reference: body.reference,
    },
  });
  if (error) {
    let status = 502;
    let detail = "Unable to verify the PDF upload.";
    if ("context" in error && error.context instanceof Response) {
      status = error.context.status;
      const response = await error.context.clone().json().catch(() => null);
      if (response && typeof response === "object" && typeof response.error === "string") {
        detail = response.error;
      }
    }
    return reply({ error: detail }, [400,401,403,404,409,413,422].includes(status) ? status : 502);
  }
  if (!data || typeof data !== "object" || !("source" in data)) {
    return reply({ error: "Source verification returned no registered file." }, 502);
  }
  return reply(data, 201);
}
