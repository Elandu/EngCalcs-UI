import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { PyniteWorkbench } from "@/components/pynite-workbench";
import { revisionStatuses, type RevisionRun } from "@/lib/calculation-revisions";
import { WIND_FRAME_LOADS_DEFINITION } from "@/lib/frame-wind-links";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ projectId: string }> };

export default async function StructuralProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organisation_members")
    .select("organisation_id, role")
    .order("created_at", { ascending: true });
  if (membershipError) {
    throw new Error(`Unable to load workspace membership: ${membershipError.message}`);
  }
  const organisationIds = [...new Set((memberships ?? []).map((item) => item.organisation_id))];
  if (!organisationIds.length) notFound();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, organisation_id")
    .eq("id", projectId)
    .in("organisation_id", organisationIds)
    .maybeSingle();
  if (projectError) {
    throw new Error(`Unable to load project: ${projectError.message}`);
  }
  if (!project) notFound();

  const membership = (memberships ?? []).find(
    (item) => item.organisation_id === project.organisation_id,
  );
  if (!membership) notFound();

  const canRun = ["owner", "admin", "engineer"].includes(membership.role);

  const allCalculations: Array<{ id: string; title: string; calculation_definition_id: string }> = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("calculations")
      .select("id, title, calculation_definition_id").eq("project_id", project.id)
      .order("id").range(offset, offset + 499);
    if (error) throw new Error(`Unable to load project calculations: ${error.message}`);
    allCalculations.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  const calculations = allCalculations.filter((calculation) =>
    ["structural.pynite.frame_analysis", WIND_FRAME_LOADS_DEFINITION].includes(calculation.calculation_definition_id),
  );

  const calculationIds = (calculations ?? []).map((calculation) => calculation.id);
  const windCalculationIds = (calculations ?? [])
    .filter((calculation) => calculation.calculation_definition_id === WIND_FRAME_LOADS_DEFINITION)
    .map((calculation) => calculation.id);
  const frameCalculationIds = (calculations ?? [])
    .filter((calculation) => calculation.calculation_definition_id === "structural.pynite.frame_analysis")
    .map((calculation) => calculation.id);
  const runRows: Array<{ id: string; calculation_id: string; run_sequence: number; input_json: unknown; result_json: unknown; provenance_json: unknown; created_at: string }> = [];
  for (let calcOffset = 0; calcOffset < calculationIds.length; calcOffset += 200) {
    const calculationBatch = calculationIds.slice(calcOffset, calcOffset + 200);
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("calculation_runs")
        .select("id, calculation_id, run_sequence, input_json, result_json, provenance_json, created_at")
        .in("calculation_id", calculationBatch).order("run_sequence", { ascending: false })
        .order("created_at", { ascending: false }).range(offset, offset + 499);
      if (error) throw new Error(`Unable to load structural and wind run history: ${error.message}`);
      runRows.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }

  const revisionRuns: RevisionRun[] = [];
  const allCalculationIds = allCalculations.map((calculation) => calculation.id);
  for (let offset = 0; offset < allCalculationIds.length; offset += 200) {
    const batch = allCalculationIds.slice(offset, offset + 200);
    for (let runOffset = 0; ; runOffset += 500) {
      const { data, error } = await supabase.from("calculation_runs")
        .select("id, calculation_id, run_sequence, provenance_json")
        .in("calculation_id", batch).order("id").range(runOffset, runOffset + 499);
      if (error) throw new Error(`Unable to load project run freshness: ${error.message}`);
      revisionRuns.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }
  const freshness = revisionStatuses(revisionRuns);
  const latestRevisionByCalculation = new Map<string, RevisionRun>();
  for (const run of revisionRuns) {
    const current = latestRevisionByCalculation.get(run.calculation_id);
    if (!current || run.run_sequence > current.run_sequence) latestRevisionByCalculation.set(run.calculation_id, run);
  }
  function exactRunIsStale(run: RevisionRun): boolean {
    const provenance = run.provenance_json && typeof run.provenance_json === "object" && !Array.isArray(run.provenance_json)
      ? run.provenance_json as Record<string, unknown>
      : null;
    const links = provenance?.linked_inputs;
    if (links === undefined) return false;
    if (!Array.isArray(links)) return true;
    return links.some((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return true;
      const link = value as Record<string, unknown>;
      if (typeof link.source_calculation_id !== "string" || typeof link.source_run_id !== "string") return true;
      const latest = latestRevisionByCalculation.get(link.source_calculation_id);
      return !latest || latest.id !== link.source_run_id || Boolean(freshness.get(link.source_calculation_id)?.stale);
    });
  }

  const titleByCalculation = new Map(
    (calculations ?? []).map((calculation) => [calculation.id, calculation.title]),
  );
  const savedRuns = runRows.filter((run) => frameCalculationIds.includes(run.calculation_id)).slice(0, 100).map((run) => ({
    id: run.id,
    calculationId: run.calculation_id,
    runSequence: run.run_sequence,
    title: titleByCalculation.get(run.calculation_id) ?? "Structural model",
    input: run.input_json,
    result: run.result_json,
    provenance: run.provenance_json,
    stale: exactRunIsStale(run),
    superseded: latestRevisionByCalculation.get(run.calculation_id)?.id !== run.id,
    staleReasons: exactRunIsStale(run) ? freshness.get(run.calculation_id)?.reasons ?? ["A linked source has a newer run."] : [],
    createdAt: run.created_at,
  }));
  const windRuns = runRows.filter((run) => windCalculationIds.includes(run.calculation_id)).map((run) => ({
    id: run.id,
    calculationId: run.calculation_id,
    definitionId: WIND_FRAME_LOADS_DEFINITION,
    runSequence: run.run_sequence,
    title: titleByCalculation.get(run.calculation_id) ?? "Wind frame loads",
    result: run.result_json,
    provenance: run.provenance_json,
    stale: exactRunIsStale(run) || latestRevisionByCalculation.get(run.calculation_id)?.id !== run.id,
    staleReasons: exactRunIsStale(run) ? freshness.get(run.calculation_id)?.reasons ?? ["A linked source has a newer run."] : [],
    createdAt: run.created_at,
  }));

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Brand />
        <Link href="/dashboard/structural-fea">Back to structural projects</Link>
      </header>
      <section className="dashboard-workspace">
        <PyniteWorkbench
          projectId={project.id}
          projectName={project.name}
          canRun={canRun}
          savedRuns={savedRuns}
          windRuns={windRuns}
        />
      </section>
    </main>
  );
}
