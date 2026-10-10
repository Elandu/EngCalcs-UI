import { NextResponse } from "next/server";

import { reviewRoles, uuidPattern, validDecisionCreate } from "@/lib/engineering-provenance";
import { requireProjectAccess } from "@/lib/project-access";

export const dynamic = "force-dynamic";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Records one immutable human decision. This endpoint never changes a
 * calculation, links a source run, or executes an engineering solver.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; proposalId: string }> },
) {
  const { projectId, proposalId } = await context.params;
  if (!uuidPattern.test(proposalId)) return reply({ error: "Invalid proposal ID." }, 400);
  const auth = await requireProjectAccess(projectId);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  if (!reviewRoles.some((role) => role === auth.role)) {
    return reply({ error: "An engineering reviewer role is required." }, 403);
  }
  const bytes = Number(request.headers.get("content-length") ?? "0");
  if (bytes > 8192) return reply({ error: "Decision is too large." }, 413);
  const body: unknown = await request.json().catch(() => null);
  if (!validDecisionCreate(body)) return reply({ error: "Decision and an engineering review note are required." }, 400);
  const { data: proposal, error: proposalError } = await auth.client
    .from("engineering_input_proposals").select("id")
    .eq("project_id", projectId).eq("id", proposalId).maybeSingle();
  if (proposalError || !proposal) return reply({ error: "Proposal not found in this project." }, 404);

  const { data, error } = await auth.client.from("engineering_proposal_decisions").insert({
    project_id: projectId,
    proposal_id: proposalId,
    decision: body.decision,
    review_note: body.reviewNote.trim(),
    reviewed_by: auth.userId,
  }).select("id, proposal_id, decision, review_note, reviewed_by, reviewed_at").single();
  if (error?.code === "23505") {
    return reply({ error: "This proposal has already been reviewed. The original decision is preserved." }, 409);
  }
  if (error) return reply({ error: "Unable to record engineering review decision." }, 422);
  return reply({
    review: data,
    note: "Review decision recorded. Proposed input remains separate and was not applied to a calculation.",
  }, 201);
}
