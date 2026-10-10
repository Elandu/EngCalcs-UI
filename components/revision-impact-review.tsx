"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { assessRevisionImpact, type ImpactCalculation, type ImpactLink, type ImpactRun } from "@/lib/revision-impact";
import "./revision-impact-review.css";

type Props = {
  projectId: string;
  calculations: ImpactCalculation[];
  runs: ImpactRun[];
  links: ImpactLink[];
};

const causeLabels = {
  linked_output_changed: "Linked output changed",
  new_source_run: "New source run · value unchanged",
  unverifiable: "Source requires verification",
  downstream_review: "Downstream review required",
} as const;

function showValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "Unavailable";
  const json = JSON.stringify(value);
  return json.length > 250 ? json.slice(0, 247) + "..." : json;
}

function sourceStatus(status: boolean | null) {
  return status === null ? "No saved source snapshot" :
    status ? "Saved source run is current" : "Saved source run is superseded";
}

export function RevisionImpactReview({ projectId, calculations, runs, links }: Props) {
  const sourceChoices = useMemo(() => {
    const outgoing = new Set(links.map((link) => link.source_calculation_id));
    return calculations.filter((item) => outgoing.has(item.id))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [calculations, links]);
  const [selectedSource, setSelectedSource] = useState("");
  const selectedId = sourceChoices.some((node) => node.id === selectedSource)
    ? selectedSource : sourceChoices[0]?.id;
  const assessment = useMemo(
    () => selectedId ? assessRevisionImpact(calculations, runs, links, selectedId) : null,
    [selectedId, calculations, runs, links],
  );
  const changed = assessment?.outputComparisons.filter((value) => value.status === "changed").length ?? 0;
  const warningCount = assessment?.outputComparisons.filter((value) => value.status === "unverifiable").length ?? 0;

  return (
    <section className="project-list-card revision-impact" id="revision-impact" aria-labelledby="impact-title">
      <header className="revision-impact-heading">
        <div>
          <p className="eyebrow">Engineering change control</p>
          <h2 id="impact-title">Revision impact</h2>
          <p>Compare actual saved calculation runs and trace which downstream calculations need engineering review.</p>
        </div>
        <span className="revision-impact-tag">Read-only assessment</span>
      </header>
      {!assessment ? (
        <div className="revision-impact-empty">
          <strong>No connected calculation runs yet</strong>
          <p>Save a calculation with a linked upstream input to establish a traceable engineering dependency. Once the source is revised, its downstream impact can be reviewed here.</p>
          <Link href={`/dashboard/calculations?project=${encodeURIComponent(projectId)}`}>Open calculation library →</Link>
        </div>
      ) : (
        <>
          <div className="revision-impact-selector">
            <label htmlFor="revision-source">Upstream calculation</label>
            <select id="revision-source" value={selectedId} onChange={(event) => setSelectedSource(event.target.value)}>
              {sourceChoices.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <span>
              {assessment.previousRun
                ? `Run ${assessment.previousRun.run_sequence} → Run ${assessment.currentRun?.run_sequence ?? "—"}`
                : `Run ${assessment.currentRun?.run_sequence ?? "—"} · no prior comparison`}
            </span>
          </div>
          <div className="revision-impact-summary">
            <div><span>Linked outputs changed</span><strong>{changed}</strong><small>Compared from saved source results</small></div>
            <div><span>Calculations to review</span><strong>{assessment.affected.length}</strong><small>Direct and downstream dependencies</small></div>
            <div><span>Unverifiable paths</span><strong>{warningCount}</strong><small>Require source confirmation</small></div>
          </div>
          {!assessment.isActualRevision ? (
            <p className="revision-impact-note" role="status">No earlier saved source run is available to establish a change. Connected calculations may still need review, but no change in their engineering results is inferred.</p>
          ) : null}

          <div className="revision-impact-columns">
            <div className="revision-impact-panel">
              <div className="revision-impact-panel-heading">
                <h3>Source output comparison</h3>
                <span>Saved run data</span>
              </div>
              {assessment.outputComparisons.length ? (
                <div className="revision-impact-values">
                  {assessment.outputComparisons.map((comparison) => (
                    <div className="revision-impact-value" key={comparison.path}>
                      <div className="revision-impact-value-head">
                        <code>{comparison.path}</code>
                        <span className={`impact-state impact-state-${comparison.status}`}>
                          {comparison.status === "changed" ? "Changed" : comparison.status === "unchanged" ? "Unchanged" : "Not verified"}
                        </span>
                      </div>
                      <div className="revision-impact-before-after">
                        <div><small>Earlier run</small><strong>{showValue(comparison.before)}</strong></div>
                        <span aria-hidden="true">→</span>
                        <div><small>Latest run</small><strong>{showValue(comparison.after)}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="revision-impact-muted">There are no saved downstream output links to compare.</p>}
              {assessment.warnings.length ? (
                <div className="revision-impact-warnings">
                  <strong>Review limitations</strong>
                  <ul>{assessment.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                </div>
              ) : null}
            </div>

            <div className="revision-impact-panel">
              <div className="revision-impact-panel-heading">
                <h3>Downstream review queue</h3>
                <span>{assessment.affected.length} affected</span>
              </div>
              {assessment.affected.length ? (
                <ol className="revision-impact-queue">
                  {assessment.affected.map((item) => (
                    <li key={item.calculation.id}>
                      <div className="revision-impact-queue-top">
                        <span className="revision-impact-depth">Level {item.depth}</span>
                        <span className={`impact-state ${item.savedSourceCurrent === false ? "impact-state-changed" : "impact-state-unverifiable"}`}>
                          {causeLabels[item.cause]}
                        </span>
                      </div>
                      <h4>{item.calculation.title}</h4>
                      <p><code>{item.link.source_output_path}</code> feeds <code>{item.link.target_input_path}</code></p>
                      <p className="revision-impact-run-note">{sourceStatus(item.savedSourceCurrent)} · {item.latestTargetRunId ? `target run ${item.latestTargetRunId.slice(0, 8)}` : "no saved target run"}</p>
                      <p className="revision-impact-run-note">Do not assume the downstream numerical result has changed. Review its adopted inputs and rerun the relevant engine.</p>
                      <Link href={`/dashboard/projects/${encodeURIComponent(projectId)}?calculation=${encodeURIComponent(item.calculation.calculation_definition_id)}&revise=${encodeURIComponent(item.calculation.id)}#workspace`}>
                        Review calculation →
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : <p className="revision-impact-muted">No downstream calculations are linked to this source.</p>}
            </div>
          </div>
          <footer className="revision-impact-footer">
            <strong>Engineer action required</strong>
            <p>This assessment is a trace of saved run provenance, not a new calculation, a compliance determination, or approval. Check source documents, load cases, assumptions and revised results before relying on an issued design. Existing approved calculations are never updated silently.</p>
          </footer>
        </>
      )}
    </section>
  );
}
