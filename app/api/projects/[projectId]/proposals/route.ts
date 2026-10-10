import { NextResponse } from "next/server";

import type { Json } from "@/lib/database.types";
import { projectRoles, validProposalCreate } from "@/lib/engineering-provenance";
import { requireProjectAccess } from "@/lib/project-access";

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
  const { data, error, count } = await auth.client.from("engineering_input_proposals")
    .select("id, source_id, target_calculation_id, target_input_path, proposed_value_json, source_location, rationale, proposal_origin, model_identifier, created_by, created_at", { count: "exact" })
    .eq("project_id", projectId).order("created_at", { ascending: false })
    .order("id", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
  if (error) return reply({ error: "Unable to load input proposals." }, 500);
  const proposals = data ?? [];
  const ids = proposals.map((proposal) => proposal.id);
  const { data: decisions, error: decisionError } = ids.length
    ? await auth.client.from("engineering_proposal_decisions")
        .select("id, proposal_id, decision, review_note, reviewed_by, reviewed_at")
        .eq("project_id", projectId).in("proposal_id", ids)
    : { data: [], error: null };
  if (decisionError) return reply({ error: "Unable to load proposal decisions." }, 500);
  const byProposalId = new Map((decisions ?? []).map((decision) => [decision.proposal_id, decision]));
  return reply({
    projectId,
    proposals: proposals.map((proposal) => ({
      ...proposal,
      review: byProposalId.get(proposal.id) ?? null,
      reviewStatus: byProposalId.get(proposal.id)?.decision ?? "pending",
    })),
    offset,
    limit: PAGE_SIZE,
    total: count ?? 0,
  });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const auth = await requireProjectAccess(projectId);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  if (!projectRoles.some((role) => role === auth.role)) return reply({ error: "Engineer access required." }, 403);
  const bytes = Number(request.headers.get("content-length") ?? "0");
  if (bytes > 32768) return reply({ error: "Proposal is too large." }, 413);
  const body: unknown = await request.json().catch(() => null);
  if (!validProposalCreate(body)) return reply({ error: "Invalid input proposal, citation or JSON value." }, 400);

  // Verify tenant ownership even though composite foreign keys and RLS also enforce it.
  const { data: source, error: sourceError } = await auth.client.from("engineering_sources")
    .select("id").eq("id", body.sourceId).eq("project_id", projectId).maybeSingle();
  if (sourceError || !source) return reply({ error: "Referenced source is unavailable in this project." }, 404);
  if (body.targetCalculationId) {
    const { data: calculation, error: calcError } = await auth.client.from("calculations")
      .select("id, state").eq("id", body.targetCalculationId).eq("project_id", projectId).maybeSingle();
    if (calcError || !calculation) return reply({ error: "Target calculation is unavailable in this project." }, 404);
    if (calculation.state === "issued") return reply({ error: "Issued calculation records cannot be amended by proposals." }, 409);
  }

  const { data, error } = await auth.client.from("engineering_input_proposals").insert({
    project_id: projectId,
    source_id: body.sourceId,
    target_calculation_id: body.targetCalculationId ?? null,
    target_input_path: body.targetInputPath,
    proposed_value_json: body.proposedValue as Json,
    source_location: body.sourceLocation.trim(),
    rationale: body.rationale.trim(),
    proposal_origin: "manual",
    model_identifier: null,
    created_by: auth.userId,
  }).select("id, source_id, target_calculation_id, target_input_path, source_location, proposal_origin, created_at").single();
  if (error) return reply({ error: "Unable to save the input proposal." }, 422);
  return reply({ proposal: data, reviewStatus: "pending",
    note: "The proposed value has NOT been applied to any engineering calculation." }, 201);
}
