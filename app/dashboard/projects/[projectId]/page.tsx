import { notFound, redirect } from "next/navigation";

import { CalculationLauncher } from "@/components/calculation-launcher";
import { WindSiteWorkflow } from "@/components/wind-site-workflow";
import { WindCalculationWorkspace } from "@/components/wind-calculation-workspace";
import { WindWorkflowReview } from "@/components/wind-workflow-review";
import { WorkspaceHeader } from "@/components/workspace-header";
import { createClient } from "@/lib/supabase/server";
import { authPageHref } from "@/lib/safe-auth-redirect";
import Link from "next/link";

import {
  AS3600_SECTION_ID,
  AS4100_SECTION_ID,
  calculationGuide,
  calculationWorkspaceHref,
  FRAME_ANALYSIS_ID,
  isWindWorkspaceCalculation,
  WIND_ASSESSMENT_ID,
} from "@/lib/calculation-catalogue";
import { revisionStatuses, type RevisionRun } from "@/lib/calculation-revisions";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resultEntries(value: unknown) {
  const envelope = record(value);
  const nested = record(envelope.result);
  const output = Object.keys(nested).length ? nested : envelope;
  return Object.entries(output)
    .filter(([key]) => key !== "_provenance")
    .slice(0, 6);
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function linkedInputSnapshot(
  provenanceJson: unknown,
  link: {
    source_calculation_id: string;
    source_output_path: string;
    target_input_path: string;
  },
) {
  const linkedInputs = record(provenanceJson).linked_inputs;
  if (!Array.isArray(linkedInputs)) return null;

  return linkedInputs.map(record).find((item) =>
    item.source_calculation_id === link.source_calculation_id &&
    item.source_output_path === link.source_output_path &&
    item.target_input_path === link.target_input_path
  ) ?? null;
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const initialCalculationId = Array.isArray(query.calculation)
    ? query.calculation[0]
    : query.calculation;
  // Calculations with dedicated editors open as the page's main workspace; the frame
  // workbench has its own page.
  const focusedGuide = initialCalculationId && initialCalculationId !== FRAME_ANALYSIS_ID
    ? calculationGuide(initialCalculationId)
    : undefined;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) {
    const projectPath = `/dashboard/projects/${encodeURIComponent(projectId)}`;
    const next = initialCalculationId
      ? calculationWorkspaceHref(initialCalculationId, projectId)
      : projectPath;
    redirect(authPageHref("login", next));
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, organisation_id, project_number, name, address, status, standards_region, updated_at",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(`Unable to load project: ${projectError.message}`);
  }

  if (!project) {
    notFound();
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", project.organisation_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error(
      membershipError?.message || "Unable to resolve project membership.",
    );
  }

  const { data: calculations, error: calculationError } = await supabase
    .from("calculations")
    .select(
      "id, title, calculation_definition_id, workflow_instance_id, stage_key, state, sort_order, updated_at",
    )
    .eq("project_id", project.id)
    .order("updated_at", { ascending: false });

  if (calculationError) {
    throw new Error(`Unable to load calculations: ${calculationError.message}`);
  }

  const calculationRows = calculations ?? [];
  const calculationIds = calculationRows.map((calculation) => calculation.id);
  const revisionRuns: RevisionRun[] = [];
  if (calculationIds.length) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("calculation_runs")
        .select("id, calculation_id, run_sequence, provenance_json")
        .in("calculation_id", calculationIds).order("id").range(offset, offset + 499);
      if (error) throw new Error(`Unable to load revision state: ${error.message}`);
      revisionRuns.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }
  const freshness = revisionStatuses(revisionRuns);

  const { data: links, error: linkError } = calculationIds.length
    ? await supabase
        .from("calculation_links")
        .select(
          "id, source_calculation_id, source_output_path, target_calculation_id, target_input_path",
        )
        .in("source_calculation_id", calculationIds)
    : { data: [], error: null };

  if (linkError) {
    throw new Error(`Unable to load calculation graph: ${linkError.message}`);
  }

  const calculationTitles = new Map(
    calculationRows.map((calculation) => [calculation.id, calculation.title]),
  );

  const standaloneCalculations = calculationRows.filter(
    (calculation) => !calculation.stage_key && !calculation.workflow_instance_id,
  );
  const standaloneCalculationIds = standaloneCalculations.map(
    (calculation) => calculation.id,
  );
  const standaloneRunRows: Array<{
    id: string;
    calculation_id: string;
    run_sequence: number;
    input_json: unknown;
    result_json: unknown;
    provenance_json: unknown;
    created_at: string;
  }> = [];
  if (standaloneCalculationIds.length) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from("calculation_runs")
        .select(
          "id, calculation_id, run_sequence, input_json, result_json, provenance_json, created_at",
        )
        .in("calculation_id", standaloneCalculationIds)
        .order("run_sequence", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + 499);
      if (error) {
        throw new Error(`Unable to load calculation results: ${error.message}`);
      }
      standaloneRunRows.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }

  type StandaloneRun = {
    id: string;
    calculation_id: string;
    run_sequence: number;
    input_json: unknown;
    result_json: unknown;
    provenance_json: unknown;
    created_at: string;
  };
  const latestStandaloneRuns = new Map<string, StandaloneRun>();
  for (const run of standaloneRunRows as StandaloneRun[]) {
    if (!latestStandaloneRuns.has(run.calculation_id)) {
      latestStandaloneRuns.set(run.calculation_id, run);
    }
  }

  const workflowIds = calculationRows
    .map((calculation) => calculation.workflow_instance_id)
    .filter((value): value is string => Boolean(value));

  const latestWorkflowId = workflowIds[0] ?? null;
  const currentCalculations = latestWorkflowId
    ? calculationRows
        .filter(
          (calculation) =>
            calculation.workflow_instance_id === latestWorkflowId &&
            calculation.stage_key,
        )
        .sort((left, right) => left.sort_order - right.sort_order)
    : [];

  let workflowStages:
    | Array<{
        calculationId: string;
        stageKey:
          | "site"
          | "wind_region"
          | "terrain"
          | "shielding"
          | "topography"
          | "design";
        title: string;
        state: string;
        latestRun: {
          id: string;
          parent_run_id: string | null;
          run_sequence: number;
          created_at: string;
          input_json: Record<string, unknown>;
          result_json: Record<string, unknown>;
          warnings_json: unknown;
          provenance_json: Record<string, unknown>;
          review: {
            status: "pending" | "approved" | "changes_requested";
            review_note: string | null;
            reviewer_id: string | null;
            reviewed_at: string | null;
            submitted_at: string | null;
          } | null;
        };
        latestReview: {
          status: "pending" | "approved" | "changes_requested";
          review_note: string | null;
          reviewer_id: string | null;
          reviewed_at: string | null;
          submitted_at: string | null;
        } | null;
        history: Array<{
          id: string;
          parent_run_id: string | null;
          run_sequence: number;
          created_at: string;
          input_json: Record<string, unknown>;
          result_json: Record<string, unknown>;
          warnings_json: unknown;
          provenance_json: Record<string, unknown>;
          review: {
            status: "pending" | "approved" | "changes_requested";
            review_note: string | null;
            reviewer_id: string | null;
            reviewed_at: string | null;
            submitted_at: string | null;
          } | null;
        }>;
      }>
    | null = null;

  let baseInputs: Record<string, unknown> = {};
  let activeOverrides: Array<{
    id: string;
    variable: string;
    direction: string | null;
    override_value: number;
    reason: string;
    source_reference: string | null;
    is_active: boolean;
    superseded_at: string | null;
    created_at: string;
  }> = [];
  let overrideHistory = [...activeOverrides];
  let reports: Array<{
    id: string;
    title: string | null;
    revision: number;
    issued_at: string;
    report_hash: string | null;
  }> = [];

  if (latestWorkflowId && currentCalculations.length) {
    const currentCalculationIds = currentCalculations.map(
      (calculation) => calculation.id,
    );

    const { data: runs, error: runError } = await supabase
      .from("calculation_runs")
      .select(
        "id, calculation_id, parent_run_id, run_sequence, input_json, result_json, warnings_json, provenance_json, created_at",
      )
      .in("calculation_id", currentCalculationIds)
      .order("run_sequence", { ascending: false });

    if (runError) {
      throw new Error(`Unable to load run history: ${runError.message}`);
    }

    const runRows = runs ?? [];
    const runIds = runRows.map((run) => run.id);

    const { data: reviews, error: reviewError } = runIds.length
      ? await supabase
          .from("calculation_run_reviews")
          .select(
            "run_id, status, review_note, reviewer_id, reviewed_at, submitted_at",
          )
          .in("run_id", runIds)
      : { data: [], error: null };

    if (reviewError) {
      throw new Error(`Unable to load review history: ${reviewError.message}`);
    }

    const reviewByRun = new Map(
      (reviews ?? []).map((review) => [review.run_id, review]),
    );

    const resolvedStages = currentCalculations
      .map((calculation) => {
        const history = runRows
          .filter((run) => run.calculation_id === calculation.id)
          .sort((left, right) => right.run_sequence - left.run_sequence)
          .map((run) => {
            const review = reviewByRun.get(run.id);
            return {
              id: run.id,
              parent_run_id: run.parent_run_id,
              run_sequence: run.run_sequence,
              created_at: run.created_at,
              input_json: record(run.input_json),
              result_json: record(run.result_json),
              warnings_json: run.warnings_json,
              provenance_json: record(run.provenance_json),
              review: review
                ? {
                    status: review.status as
                      | "pending"
                      | "approved"
                      | "changes_requested",
                    review_note: review.review_note,
                    reviewer_id: review.reviewer_id,
                    reviewed_at: review.reviewed_at,
                    submitted_at: review.submitted_at,
                  }
                : null,
            };
          });

        const latestRun = history[0];
        if (!latestRun || !calculation.stage_key) return null;

        return {
          calculationId: calculation.id,
          stageKey: calculation.stage_key as
            | "site"
            | "wind_region"
            | "terrain"
            | "shielding"
            | "topography"
            | "design",
          title: calculation.title,
          state: calculation.state,
          latestRun,
          latestReview: latestRun.review,
          history,
        };
      })
      .filter((stage) => stage !== null);

    workflowStages = resolvedStages;

    const designStage = resolvedStages.find(
      (stage) => stage.stageKey === "design",
    );
    baseInputs = record(designStage?.latestRun.input_json.workflow_inputs);

    const { data: overrideRows, error: overrideError } = await supabase
      .from("calculation_overrides")
      .select(
        "id, variable, direction, override_value, reason, source_reference, is_active, superseded_at, created_at",
      )
      .eq("workflow_instance_id", latestWorkflowId)
      .order("created_at", { ascending: false });

    if (overrideError) {
      throw new Error(`Unable to load override history: ${overrideError.message}`);
    }

    overrideHistory = (overrideRows ?? []).map((override) => ({
      ...override,
      override_value: Number(override.override_value),
    }));
    activeOverrides = overrideHistory.filter((override) => override.is_active);

    const { data: reportRows, error: reportError } = await supabase
      .from("reports")
      .select("id, title, revision, issued_at, report_hash")
      .eq("project_id", project.id)
      .eq("workflow_instance_id", latestWorkflowId)
      .eq("status", "issued")
      .order("revision", { ascending: false });

    if (reportError) {
      throw new Error(`Unable to load issued reports: ${reportError.message}`);
    }

    reports = reportRows ?? [];
  }

  const calculationById = new Map(
    calculationRows.map((calculation) => [calculation.id, calculation]),
  );
  const standaloneLinkRuns = (standaloneRunRows as StandaloneRun[]).flatMap((run) => {
    const calculation = calculationById.get(run.calculation_id);
    if (!calculation) return [];
    return [{
      calculationId: calculation.id,
      calculationDefinitionId: calculation.calculation_definition_id,
      title: calculation.title,
      runId: run.id,
      runSequence: run.run_sequence,
      createdAt: run.created_at,
      result: run.result_json,
      provenance: run.provenance_json,
      input: run.input_json,
      revisable: calculation.state !== "issued",
    }];
  });
  const workflowLinkRuns = (workflowStages ?? []).flatMap((stage) => {
    const calculation = calculationById.get(stage.calculationId);
    if (!calculation) return [];
    return stage.history.map((run) => ({
      calculationId: calculation.id,
      calculationDefinitionId: calculation.calculation_definition_id,
      title: calculation.title,
      runId: run.id,
      runSequence: run.run_sequence,
      createdAt: run.created_at,
      result: run.result_json,
      provenance: run.provenance_json,
    }));
  });
  const linkSourceRuns = [...standaloneLinkRuns, ...workflowLinkRuns].sort(
    (left, right) => right.createdAt.localeCompare(left.createdAt),
  );

  return (
    <main className="dashboard-shell">
      <WorkspaceHeader
        area="projects"
        canManageApiKeys={membership.role === "owner" || membership.role === "admin"}
        currentProject={{
          id: project.id,
          name: project.name,
          projectNumber: project.project_number,
        }}
      />

      <section className="dashboard-workspace">
        <div className="dashboard-title-row">
          <div>
            <p className="eyebrow">
              {project.project_number || "Project"} · {project.standards_region}
            </p>
            <h1>{project.name}</h1>
            <p>{project.address || "No site address set"}</p>
          </div>
          <Link className="button button-primary" href={calculationWorkspaceHref(WIND_ASSESSMENT_ID, project.id)}>
            New Wind assessment
          </Link>
        </div>

        <div className="project-meta-strip">
          <span>Status <b>{project.status}</b></span>
          <span>Calculation nodes <b>{calculationRows.length}</b></span>
          <span>Links <b>{links?.length ?? 0}</b></span>
          <span>Role <b>{membership.role}</b></span>
          <span>Standards region <b>{project.standards_region}</b></span>
        </div>

        <nav className="project-tools" aria-label="Project calculation tools">
          {[
            [WIND_ASSESSMENT_ID, "Wind assessment", "AS/NZS 1170.2 site wind and frame loads"],
            [FRAME_ANALYSIS_ID, "Frame analysis", "Draw a frame and solve it live"],
            [AS3600_SECTION_ID, "Concrete section", "Bars, neutral axis and moment capacity"],
            [AS4100_SECTION_ID, "Steel section · axial", "Tension and compression utilisation"],
          ].map(([id, title, detail]) => (
            <Link key={id} href={calculationWorkspaceHref(id, project.id)} className={focusedGuide && initialCalculationId === id ? "project-tool is-active" : "project-tool"}
              aria-current={initialCalculationId === id ? "page" : undefined}>
              <strong>{title}</strong>
              <span>{detail}</span>
            </Link>
          ))}
          <Link href={`/dashboard/calculations?project=${encodeURIComponent(project.id)}`} className="project-tool project-tool-more">
            <strong>All calculations</strong>
            <span>Browse the library</span>
          </Link>
        </nav>

        {focusedGuide && initialCalculationId ? (
          <section className="project-focused-calculation" id="workspace" aria-label={focusedGuide.title}>
            <CalculationLauncher
              key={initialCalculationId}
              projectId={project.id}
              focusedCalculationId={initialCalculationId}
              heading={focusedGuide.title}
              sourceRuns={linkSourceRuns}
            />
          </section>
        ) : null}

        {latestWorkflowId && workflowStages?.length === 6 ? (
          <WindWorkflowReview
            projectId={project.id}
            workflowInstanceId={latestWorkflowId}
            role={membership.role}
            stages={workflowStages}
            activeOverrides={activeOverrides}
            overrideHistory={overrideHistory}
            reports={reports}
            baseInputs={baseInputs}
          />
        ) : null}

        <details
          className={latestWorkflowId ? "new-assessment-disclosure" : ""}
          open={isWindWorkspaceCalculation(initialCalculationId) || (!latestWorkflowId && !initialCalculationId)}
        >
          {latestWorkflowId || initialCalculationId ? <summary>{latestWorkflowId ? "Start another Wind assessment" : "Start a Wind assessment"}</summary> : null}
          <WindCalculationWorkspace key={initialCalculationId ?? "wind"} projectId={project.id}
            initialCalculationId={initialCalculationId} sourceRuns={linkSourceRuns}>
          <WindSiteWorkflow
            projectId={project.id}
            projectNumber={project.project_number}
            defaultAddress={project.address}
          />
          </WindCalculationWorkspace>
        </details>

        <details
          className="project-calculation-disclosure"
          id="calculations"
          open={Boolean(initialCalculationId) && !isWindWorkspaceCalculation(initialCalculationId) && !focusedGuide}
        >
          <summary>Advanced · individual calculation components and links</summary>
          <CalculationLauncher
            projectId={project.id}
            initialCalculationId={focusedGuide ? undefined : initialCalculationId}
            sourceRuns={linkSourceRuns}
          />
        </details>

        {standaloneCalculations.length ? (
          <section className="project-list-card calculation-run-list" aria-labelledby="calculation-results-title">
            <div className="project-list-header">
              <div>
                <h2 id="calculation-results-title">Calculation results</h2>
                <p>Latest saved outputs with their input and provenance records.</p>
              </div>
            </div>
            <div className="calculation-result-grid">
              {standaloneCalculations.map((calculation) => {
                const latestRun = latestStandaloneRuns.get(calculation.id);
                return (
                  <article className="calculation-result-card" key={calculation.id}>
                    <header>
                      <div>
                        <small>{calculation.calculation_definition_id} · Run {latestRun?.run_sequence ?? "—"}</small>
                        <h3>{calculation.title}</h3>
                      </div>
                      <time dateTime={latestRun?.created_at}>
                        {latestRun ? new Date(latestRun.created_at).toLocaleDateString("en-AU") : "No run"}
                      </time>
                    </header>
                    {latestRun ? (
                      <>
                        {freshness.get(calculation.id)?.stale ? <p className="revision-stale" role="status">
                          Needs recalculation · {freshness.get(calculation.id)?.reasons.join(". ")}. The saved result still refers to its original source runs.
                        </p> : <p className="revision-current">Saved source revisions are current</p>}
                        <dl className="calculation-result-values">
                          {resultEntries(latestRun.result_json).map(([key, value]) => (
                            <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{displayValue(value)}</dd></div>
                          ))}
                        </dl>
                        <details className="calculation-run-record">
                          <summary>View full run record</summary>
                          <div>
                            <h4>Inputs</h4>
                            <pre>{JSON.stringify(latestRun.input_json, null, 2)}</pre>
                            <h4>Result and provenance</h4>
                            <pre>{JSON.stringify({ result: latestRun.result_json, provenance: latestRun.provenance_json }, null, 2)}</pre>
                          </div>
                        </details>
                      </>
                    ) : <p className="calculation-links-empty">No saved run is available for this calculation.</p>}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="project-list-card">
          <div className="project-list-header">
            <div>
              <h2>Calculation graph</h2>
              <p>
                Saved calculation nodes linked by their engineering input/output
                dependencies.
              </p>
            </div>
          </div>

          {calculationRows.length ? (
            <div className="project-list">
              {calculationRows
                .slice()
                .sort((left, right) => {
                  const workflowOrder = String(
                    right.workflow_instance_id ?? "",
                  ).localeCompare(String(left.workflow_instance_id ?? ""));
                  return workflowOrder || left.sort_order - right.sort_order;
                })
                .map((calculation) => (
                  <article className="project-row" key={calculation.id}>
                    <div>
                      <small>{calculation.calculation_definition_id}</small>
                      <h3>{calculation.title}</h3>
                      <p>
                        {calculation.stage_key
                          ? `Stage ${calculation.sort_order + 1} · ${calculation.stage_key.replaceAll("_", " ")}`
                          : calculation.calculation_definition_id}
                      </p>
                    </div>
                    <div className="project-row-meta">
                      <span>{calculation.state}</span>
                      <code>
                        {calculation.workflow_instance_id?.slice(0, 8) || "standalone"}
                      </code>
                    </div>
                  </article>
                ))}
            </div>
          ) : (
            <div className="project-list-empty">
              <h3>No calculations yet</h3>
              <p>Start the Wind site assessment to create the first linked workflow.</p>
            </div>
          )}

          <section className="calculation-links" aria-labelledby="calculation-links-title">
            <div className="calculation-links-heading">
              <div>
                <h3 id="calculation-links-title">Data links</h3>
                <p>Trace each value from its source output to the input that uses it.</p>
              </div>
              <span>{links?.length ?? 0} links</span>
            </div>
            {links?.length ? (
              <ul>
                {links.map((link) => {
                  const targetRun = latestStandaloneRuns.get(link.target_calculation_id);
                  const snapshot = linkedInputSnapshot(targetRun?.provenance_json, link);
                  const sourceRunId = typeof snapshot?.source_run_id === "string"
                    ? snapshot.source_run_id
                    : null;
                  const sourceRunSequence = typeof snapshot?.source_run_sequence === "number"
                    ? snapshot.source_run_sequence
                    : null;
                  const sourceValue = snapshot?.source_value;
                  const sourceUnit = typeof snapshot?.source_unit === "string"
                    ? snapshot.source_unit
                    : "";

                  return (
                    <li key={link.id}>
                      <div className="calculation-link-endpoint">
                        <strong>
                          {calculationTitles.get(link.source_calculation_id) ||
                            `Calculation ${link.source_calculation_id.slice(0, 8)}`}
                        </strong>
                        <code>Output · {link.source_output_path}</code>
                        {snapshot ? (
                          <small>
                            Source run {sourceRunSequence ?? "—"}
                            {sourceRunId ? ` · ${sourceRunId.slice(0, 8)}` : ""}
                            {` · captured ${displayValue(sourceValue)}${sourceUnit ? ` ${sourceUnit}` : ""}`}
                          </small>
                        ) : null}
                      </div>
                      <span className="calculation-link-arrow" aria-hidden="true">→</span>
                      <div className="calculation-link-endpoint">
                        <strong>
                          {calculationTitles.get(link.target_calculation_id) ||
                            `Calculation ${link.target_calculation_id.slice(0, 8)}`}
                        </strong>
                        <code>Input · {link.target_input_path}</code>
                        {targetRun ? (
                          <small>
                            Target run {targetRun.run_sequence} · {targetRun.id.slice(0, 8)}
                          </small>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="calculation-links-empty">
                No data links saved yet. When values are linked, their source and destination will
                appear here.
              </p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
