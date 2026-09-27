import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { PyniteWorkbench } from "@/components/pynite-workbench";
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

  const { data: calculations, error: calculationError } = await supabase
    .from("calculations")
    .select("id, title")
    .eq("project_id", project.id)
    .eq("calculation_definition_id", "structural.pynite.frame_analysis")
    .order("created_at", { ascending: false })
    .limit(50);
  if (calculationError) {
    throw new Error(`Unable to load saved structural models: ${calculationError.message}`);
  }

  const calculationIds = (calculations ?? []).map((calculation) => calculation.id);
  const { data: runRows, error: runError } = calculationIds.length
    ? await supabase
        .from("calculation_runs")
        .select("id, calculation_id, run_sequence, input_json, result_json, created_at")
        .in("calculation_id", calculationIds)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [], error: null };
  if (runError) {
    throw new Error(`Unable to load structural analysis runs: ${runError.message}`);
  }

  const titleByCalculation = new Map(
    (calculations ?? []).map((calculation) => [calculation.id, calculation.title]),
  );
  const savedRuns = (runRows ?? []).map((run) => ({
    id: run.id,
    calculationId: run.calculation_id,
    runSequence: run.run_sequence,
    title: titleByCalculation.get(run.calculation_id) ?? "Structural model",
    input: run.input_json,
    result: run.result_json,
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
        />
      </section>
    </main>
  );
}
