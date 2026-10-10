import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { assessRevisionImpact, type ImpactCalculation, type ImpactLink, type ImpactRun } from "@/lib/revision-impact";
import { revisionStatuses, type RevisionRun } from "@/lib/calculation-revisions";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIMIT_CALCULATIONS = 500;
const LIMIT_RUNS = 5000;
const PAGE_SIZE = 500;

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Authenticated, project-scoped and read-only engineering dependency assessment.
 * There is no automatic solve, mutation or review approval in this endpoint.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const sourceId = new URL(request.url).searchParams.get("sourceCalculationId");
  if (!UUID.test(projectId) || (sourceId !== null && !UUID.test(sourceId))) {
    return reply({ error: "Invalid project or source calculation ID." }, 400);
  }

  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || !userId) return reply({ error: "Unauthorized" }, 401);

  const { data: project, error: projectError } = await supabase.from("projects")
    .select("id, organisation_id").eq("id", projectId).maybeSingle();
  if (projectError) return reply({ error: "Unable to load project." }, 500);
  if (!project) return reply({ error: "Project not found." }, 404);

  const { data: membership, error: memberError } = await supabase
    .from("organisation_members").select("role")
    .eq("organisation_id", project.organisation_id)
    .eq("user_id", userId).maybeSingle();
  if (memberError || !membership) return reply({ error: "Project access denied." }, 403);

  const { data: calculations, error: calculationError } = await supabase.from("calculations")
    .select("id, title, calculation_definition_id, state")
    .eq("project_id", projectId).order("id").limit(LIMIT_CALCULATIONS + 1);
  if (calculationError) return reply({ error: "Unable to load project calculations." }, 500);
  if ((calculations ?? []).length > LIMIT_CALCULATIONS) {
    return reply({ error: "Project exceeds the current dependency review limit." }, 413);
  }
  const nodes: ImpactCalculation[] = calculations ?? [];
  if (!nodes.length) {
    return sourceId ? reply({ error: "Source calculation not found in project." }, 404)
      : reply({ projectId, sources: [], calculationCount: 0, linkCount: 0 });
  }

  const ids = new Set(nodes.map((node) => node.id));
  if (sourceId && !ids.has(sourceId)) return reply({ error: "Source calculation not found in project." }, 404);

  const links: ImpactLink[] = [];
  // Keep requests under PostgREST's URL limits while avoiding incomplete pagination.
  const nodeIds = nodes.map((node) => node.id);
  for (let i = 0; i < nodeIds.length; i += 50) {
    const idsChunk = nodeIds.slice(i, i + 50);
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase.from("calculation_links")
        .select("source_calculation_id, source_output_path, target_calculation_id, target_input_path")
        .in("source_calculation_id", idsChunk)
        .order("source_calculation_id")
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) return reply({ error: "Unable to load project dependency links." }, 500);
      links.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
      if (links.length >= 10000) return reply({ error: "Project dependency graph exceeds review limit." }, 413);
    }
  }

  const sources = nodes.filter((node) =>
    links.some((link) => link.source_calculation_id === node.id)
  ).map((node) => ({
    id: node.id,
    title: node.title,
    state: node.state,
    outgoingLinks: links.filter((link) => link.source_calculation_id === node.id).length,
  }));

  if (!sourceId) {
    return reply({ projectId, sources, calculationCount: nodes.length, linkCount: links.length });
  }

  const runs: Array<ImpactRun & RevisionRun> = [];
  for (let i = 0; i < nodeIds.length; i += 50) {
    const chunk = nodeIds.slice(i, i + 50);
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase.from("calculation_runs")
        .select("id, calculation_id, run_sequence, result_json, provenance_json, created_at")
        .in("calculation_id", chunk)
        .order("calculation_id").order("run_sequence", { ascending: false })
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) return reply({ error: "Unable to load saved calculation history." }, 500);
      runs.push(...(data ?? []));
      if (runs.length > LIMIT_RUNS) return reply({ error: "Calculation history exceeds review limit." }, 413);
      if (!data || data.length < PAGE_SIZE) break;
    }
  }

  const assessment = assessRevisionImpact(nodes, runs, links, sourceId);
  const freshness = revisionStatuses(runs);
  return reply({
    projectId,
    calculatedAt: new Date().toISOString(),
    assessment,
    sources,
    stale: [...freshness.entries()]
      .filter(([, value]) => value.stale)
      .map(([calculationId, value]) => ({ calculationId, reasons: value.reasons })),
    graph: { calculationCount: nodes.length, linkCount: links.length, savedRunCount: runs.length },
    note: "Dependency review only. No numerical engine was executed or calculation approved.",
  });
}
