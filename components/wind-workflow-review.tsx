"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type JsonObject = Record<string, unknown>;

type Review = {
  status: "pending" | "approved" | "changes_requested";
  review_note: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
};

type Run = {
  id: string;
  parent_run_id: string | null;
  run_sequence: number;
  created_at: string;
  input_json: JsonObject;
  result_json: JsonObject;
  warnings_json: unknown;
  provenance_json: JsonObject;
  review: Review | null;
};

type Stage = {
  calculationId: string;
  stageKey: "site" | "wind_region" | "terrain" | "shielding" | "topography" | "design";
  title: string;
  state: string;
  latestRun: Run;
  latestReview: Review | null;
  history: Run[];
};

type OverrideRecord = {
  id: string;
  variable: string;
  direction: string | null;
  override_value: number;
  reason: string;
  source_reference: string | null;
  is_active: boolean;
  superseded_at: string | null;
  created_at: string;
};

type ReportRecord = {
  id: string;
  title: string | null;
  revision: number;
  issued_at: string;
  report_hash: string | null;
};

const stageVariables: Partial<Record<Stage["stageKey"], string[]>> = {
  wind_region: ["VR", "Md"],
  terrain: ["Mzcat"],
  shielding: ["Ms"],
  topography: ["Mt"],
  design: ["Vsitb"],
};

const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = "—") {
  return typeof value === "string" && value ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function workflowVariable(
  result: JsonObject,
  variable: string,
  direction?: string,
) {
  for (const item of array(result.variables)) {
    const row = object(item);
    if (row.variable !== variable) continue;
    if (direction && row.direction !== direction) continue;
    const value =
      numberValue(row.final_value) ?? numberValue(row.recommended_value);
    if (value !== null) return value;
  }
  return null;
}

function directionalWorkflowVariables(result: JsonObject, variable: string) {
  return array(result.variables)
    .map((item) => {
      const row = object(item);
      if (row.variable !== variable) return null;
      const direction = stringValue(row.direction, "");
      const value =
        numberValue(row.final_value) ?? numberValue(row.recommended_value);
      return direction && value !== null
        ? `${direction} ${value.toFixed(3)}`
        : null;
    })
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

function stageSummary(stage: Stage): Array<[string, string]> {
  const result = object(stage.latestRun.result_json);

  if (stage.stageKey === "site") {
    const site = object(result.site);
    const latitude = numberValue(site.latitude);
    const longitude = numberValue(site.longitude);
    const elevation = numberValue(site.elevation_m);
    return [
      ["Address", stringValue(site.address ?? site.display_name)],
      [
        "Coordinates",
        latitude !== null && longitude !== null
          ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
          : "—",
      ],
      ["Site RL", elevation !== null ? `${elevation.toFixed(1)} m` : "—"],
    ];
  }

  if (stage.stageKey === "wind_region") {
    const region = object(result.wind_region_assessment);
    const regional = object(result.regional_wind_speed_assessment);
    const calculatedVr =
      numberValue(regional.regional_wind_speed_mps) ??
      numberValue(regional.vr_mps);
    const adoptedVr = workflowVariable(result, "VR");
    const adoptedMd = directionalWorkflowVariables(result, "Md");
    return [
      ["Wind region", stringValue(region.wind_region)],
      ["Confidence", stringValue(region.confidence)],
      [
        "Calculated / adopted VR",
        `${calculatedVr !== null ? calculatedVr.toFixed(1) : "—"} / ${adoptedVr !== null ? adoptedVr.toFixed(1) : "—"} m/s`,
      ],
      ["Adopted directional Md", adoptedMd || "—"],
    ];
  }

  if (stage.stageKey === "terrain") {
    const mzcat = array(result.mzcat_assessment);
    const directionsAssessed = array(result.directions);
    const calculatedValues = mzcat
      .map((item) => {
        const row = object(item);
        const direction = stringValue(row.direction ?? row.wind_direction, "");
        const value =
          numberValue(row.final_value) ??
          numberValue(row.recommended_value) ??
          numberValue(row.mzcat) ??
          numberValue(row.value);
        return direction && value !== null
          ? `${direction} ${value.toFixed(3)}`
          : null;
      })
      .filter((value): value is string => Boolean(value))
      .join(" · ");
    const adoptedValues = directionalWorkflowVariables(result, "Mzcat");
    return [
      ["Directions assessed", String(directionsAssessed.length || mzcat.length || 0)],
      ["Calculated Mz,cat", calculatedValues || "Review evidence"],
      ["Adopted Mz,cat", adoptedValues || calculatedValues || "Review evidence"],
      ["Warnings", String(array(result.warnings).length)],
    ];
  }

  if (stage.stageKey === "shielding" || stage.stageKey === "topography") {
    const variables = array(result.variables);
    const values = variables
      .map((item) => {
        const row = object(item);
        const direction = stringValue(row.direction, "");
        const value =
          numberValue(row.final_value) ?? numberValue(row.recommended_value);
        return direction && value !== null ? `${direction} ${value.toFixed(3)}` : null;
      })
      .filter(Boolean)
      .join(" · ");

    return [
      [
        stage.stageKey === "shielding" ? "Directional Ms" : "Directional Mt",
        values || "Review evidence",
      ],
      ["Warnings", String(array(result.warnings).length)],
    ];
  }

  const vdes = numberValue(result.governing_vdes_mps);
  const vsit = numberValue(result.governing_vsitb);
  return [
    ["Governing direction", stringValue(result.governing_direction)],
    ["Governing Vsit,b", vsit !== null ? `${vsit.toFixed(1)} m/s` : "—"],
    ["Governing Vdes,θ", vdes !== null ? `${vdes.toFixed(1)} m/s` : "—"],
  ];
}

type CalculationBasisEntry = {
  label: string;
  formula: string | null;
  inputs: string[];
  details: string[];
  calculation: string | null;
  reference: string | null;
};

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textList(value: unknown): string[] {
  return array(value)
    .map(optionalText)
    .filter((item): item is string => Boolean(item));
}

function stageCalculationBasis(stage: Stage) {
  const result = object(stage.latestRun.result_json);
  const entries = array(result.variables)
    .map((value): CalculationBasisEntry | null => {
      const row = object(value);
      const variable = optionalText(row.variable);
      const label = optionalText(row.label) ?? variable ?? "Calculated value";
      const direction = optionalText(row.direction);
      const entry = {
        label: direction ? `${label} · ${direction}` : label,
        formula: optionalText(row.formula_basis),
        inputs: textList(row.calculation_inputs),
        details: textList(row.detail_items),
        calculation: optionalText(row.calculation_result),
        reference: optionalText(row.source_reference),
      };
      return entry.formula || entry.inputs.length || entry.details.length || entry.calculation || entry.reference
        ? entry
        : null;
    })
    .filter((entry): entry is CalculationBasisEntry => Boolean(entry));
  const formula =
    optionalText(result.design_wind_speed_basis) ?? optionalText(result.formula_basis);
  const variableReferences = new Set(
    entries.map((entry) => entry.reference).filter((item): item is string => Boolean(item)),
  );
  const references = textList(result.evidence_references)
    .filter((reference, index, all) => all.indexOf(reference) === index)
    .filter((reference) => !variableReferences.has(reference));

  return { entries, formula, references };
}

function reviewLabel(review: Review | null) {
  if (!review) return "Draft";
  if (review.status === "approved") return "Approved";
  if (review.status === "changes_requested") return "Changes requested";
  return "Pending review";
}

function shortId(value: string | null) {
  return value ? value.slice(0, 8) : "—";
}

export function WindWorkflowReview({
  projectId,
  workflowInstanceId,
  role,
  stages,
  activeOverrides,
  overrideHistory,
  reports,
  baseInputs,
}: {
  projectId: string;
  workflowInstanceId: string;
  role: string;
  stages: Stage[];
  activeOverrides: OverrideRecord[];
  overrideHistory: OverrideRecord[];
  reports: ReportRecord[];
  baseInputs: JsonObject;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [overrideStage, setOverrideStage] = useState<Stage["stageKey"] | null>(null);
  const [overrideVariable, setOverrideVariable] = useState("");
  const [overrideDirection, setOverrideDirection] = useState("N");
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSource, setOverrideSource] = useState("");

  const canEngineer = ["owner", "admin", "engineer"].includes(role);
  const canReview = ["owner", "admin", "reviewer"].includes(role);
  const allApproved = stages.every(
    (stage) => stage.latestReview?.status === "approved",
  );
  const anyPending = stages.some(
    (stage) => stage.latestReview?.status === "pending",
  );
  const needsSubmission = stages.some(
    (stage) => stage.latestReview?.status !== "approved",
  );

  const latestIssueRunIds = useMemo(
    () => stages.map((stage) => stage.latestRun.id).sort(),
    [stages],
  );

  async function invoke(
    functionName: string,
    body: JsonObject,
    successMessage: string,
  ) {
    setBusy(functionName);
    setMessage("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke(functionName, { body });

      if (error || data?.error) {
        setMessage(error?.message || data?.error || "Action failed.");
        return null;
      }

      setMessage(successMessage);
      router.refresh();
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function reviewAction(action: "submit" | "approve" | "request_changes") {
    await invoke(
      "opencalcs-review-wind-workflow",
      {
        projectId,
        workflowInstanceId,
        action,
        note: reviewNote.trim() || null,
      },
      action === "submit"
        ? "Latest changed runs submitted for review."
        : action === "approve"
          ? "Pending runs approved."
          : "Changes requested.",
    );
    setReviewNote("");
  }

  function beginOverride(stage: Stage) {
    const available = stageVariables[stage.stageKey] ?? [];
    setOverrideStage(stage.stageKey);
    setOverrideVariable(available[0] ?? "");
    setOverrideDirection("N");
    setOverrideValue("");
    setOverrideReason("");
    setOverrideSource("");
    setMessage("");
  }

  async function applyOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overrideStage || !overrideVariable) return;

    const value = Number(overrideValue);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Override value must be greater than zero.");
      return;
    }
    if (!overrideReason.trim()) {
      setMessage("An engineering reason is required for every override.");
      return;
    }

    const override: JsonObject = {
      variable: overrideVariable,
      override_value: value,
      reason: overrideReason.trim(),
      source_reference: overrideSource.trim() || null,
    };
    if (overrideVariable !== "VR") {
      override.direction = overrideDirection;
    }

    const data = await invoke(
      "opencalcs-run-wind-workflow",
      {
        projectId,
        workflowInstanceId,
        inputs: baseInputs,
        overrides: [override],
      },
      "Override applied and affected downstream stages rerun.",
    );

    if (data) {
      setOverrideStage(null);
      setOverrideValue("");
      setOverrideReason("");
      setOverrideSource("");
    }
  }

  async function issue() {
    const data = await invoke(
      "opencalcs-issue-wind-workflow",
      { projectId, workflowInstanceId },
      "Issued calculation pack created.",
    );
    if (data?.downloadUrl) {
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function downloadReport(reportId: string) {
    const data = await invoke(
      "opencalcs-download-report",
      { reportId },
      "Download link created.",
    );
    if (data?.downloadUrl) {
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <section className="workflow-review-shell">
      <div className="workflow-review-header">
        <div>
          <p className="eyebrow">Current Wind workflow</p>
          <h2>Review, revise and issue</h2>
          <p>
            Each stage retains immutable run history. Overrides create new downstream runs
            without rewriting previously reviewed engineering records.
          </p>
        </div>
        <div className="workflow-review-status">
          <span className={allApproved ? "review-chip approved" : "review-chip"}>
            {allApproved ? "Ready to issue" : anyPending ? "Under review" : "Draft"}
          </span>
          <code>{workflowInstanceId.slice(0, 8)}</code>
        </div>
      </div>

      <div className="workflow-stage-review-list">
        {stages.map((stage) => {
          const basis = stageCalculationBasis(stage);
          return (
            <article className="workflow-stage-review" key={stage.calculationId}>
              <div className="workflow-stage-review-heading">
                <div>
                  <small>{stage.stageKey.replaceAll("_", " ")}</small>
                  <h3>{stage.title}</h3>
                </div>
                <div className="stage-review-meta">
                  <span className={`review-chip ${stage.latestReview?.status ?? ""}`}>
                    {reviewLabel(stage.latestReview)}
                  </span>
                  <span>Run {stage.latestRun.run_sequence}</span>
                </div>
              </div>

              <div className="stage-summary-grid">
                {stageSummary(stage).map(([label, value]) => (
                  <div key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              {basis.entries.length || basis.formula || basis.references.length ? (
                <details className="stage-calculation-basis">
                  <summary>Calculation basis and references</summary>
                  <div className="stage-calculation-basis-content">
                    {basis.formula ? (
                      <div className="stage-basis-formula">
                        <strong>Design wind speed basis</strong>
                        <p>{basis.formula}</p>
                      </div>
                    ) : null}
                    {basis.entries.map((entry, index) => (
                      <article key={`${entry.label}-${index}`}>
                        <h4>{entry.label}</h4>
                        {entry.formula ? (
                          <p><strong>Formula</strong> <code>{entry.formula}</code></p>
                        ) : null}
                        {entry.inputs.length ? (
                          <p><strong>Calculation inputs</strong> {entry.inputs.join(" · ")}</p>
                        ) : null}
                        {entry.calculation ? (
                          <p><strong>Calculated result</strong> {entry.calculation}</p>
                        ) : null}
                        {entry.details.length ? (
                          <ul>{entry.details.map((detail, detailIndex) => (
                            <li key={`${detail}-${detailIndex}`}>{detail}</li>
                          ))}</ul>
                        ) : null}
                        {entry.reference ? (
                          <p className="stage-basis-reference">
                            <strong>Source reference</strong> {entry.reference}
                          </p>
                        ) : null}
                      </article>
                    ))}
                    {basis.references.length ? (
                      <div className="stage-basis-references">
                        <strong>Evidence references</strong>
                        <ul>{basis.references.map((reference) => (
                          <li key={reference}>{reference}</li>
                        ))}</ul>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}

            {stage.latestReview?.review_note ? (
              <div className="review-note">
                <strong>Reviewer note</strong>
                <span>{stage.latestReview.review_note}</span>
              </div>
            ) : null}

            <div className="stage-actions">
              {canEngineer && (stageVariables[stage.stageKey]?.length ?? 0) > 0 ? (
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => beginOverride(stage)}
                >
                  Override adopted value
                </button>
              ) : null}

              <details className="run-history">
                <summary>Run history ({stage.history.length})</summary>
                <div className="run-history-list">
                  {stage.history.map((run) => (
                    <div key={run.id}>
                      <span>Run {run.run_sequence}</span>
                      <span>{new Date(run.created_at).toLocaleString()}</span>
                      <span>{reviewLabel(run.review)}</span>
                      <code>{shortId(run.id)}</code>
                    </div>
                  ))}
                </div>
              </details>
            </div>

            {overrideStage === stage.stageKey ? (
              <form className="override-form" onSubmit={applyOverride}>
                <div className="input-grid">
                  <label>
                    Variable
                    <select
                      value={overrideVariable}
                      onChange={(event) => setOverrideVariable(event.target.value)}
                    >
                      {(stageVariables[stage.stageKey] ?? []).map((variable) => (
                        <option key={variable} value={variable}>
                          {variable}
                        </option>
                      ))}
                    </select>
                  </label>

                  {overrideVariable !== "VR" ? (
                    <label>
                      Direction
                      <select
                        value={overrideDirection}
                        onChange={(event) => setOverrideDirection(event.target.value)}
                      >
                        {directions.map((direction) => (
                          <option key={direction}>{direction}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <label>
                    Adopted value
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      value={overrideValue}
                      onChange={(event) => setOverrideValue(event.target.value)}
                      required
                    />
                  </label>

                  <label className="input-span-2">
                    Engineering reason
                    <textarea
                      rows={3}
                      value={overrideReason}
                      onChange={(event) => setOverrideReason(event.target.value)}
                      placeholder="Why the calculated/recommended value is not adopted"
                      maxLength={2000}
                      required
                    />
                  </label>

                  <label className="input-span-2">
                    Source / reference
                    <input
                      value={overrideSource}
                      onChange={(event) => setOverrideSource(event.target.value)}
                      placeholder="Site inspection, survey, drawing, calculation note..."
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setOverrideStage(null)}
                  >
                    Cancel
                  </button>
                  <button className="button button-primary" disabled={Boolean(busy)}>
                    {busy ? "Recalculating…" : "Apply & rerun downstream"}
                  </button>
                </div>
              </form>
            ) : null}
          </article>
          );
        })}
      </div>

      <div className="workflow-decision-panel">
        <div>
          <p className="eyebrow">Workflow decision</p>
          <h3>
            {allApproved
              ? "Latest engineering state approved"
              : anyPending
                ? "Latest changed runs are awaiting review"
                : "Latest state requires submission"}
          </h3>
          <p>
            Issuance is enabled only when the latest run for every Wind stage is approved.
          </p>
        </div>

        <div className="review-actions">
          {canEngineer && needsSubmission && !anyPending ? (
            <button
              className="button button-primary"
              type="button"
              disabled={Boolean(busy)}
              onClick={() => reviewAction("submit")}
            >
              Submit latest changes for review
            </button>
          ) : null}

          {canReview && anyPending ? (
            <>
              <textarea
                rows={3}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Reviewer note (optional for approval, recommended for changes)"
              />
              <div className="review-button-row">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => reviewAction("request_changes")}
                >
                  Request changes
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => reviewAction("approve")}
                >
                  Approve pending runs
                </button>
              </div>
            </>
          ) : null}

          {canReview && allApproved ? (
            <button
              className="button button-primary"
              type="button"
              disabled={Boolean(busy)}
              onClick={issue}
            >
              Issue calculation pack PDF
            </button>
          ) : null}
        </div>
      </div>

      {activeOverrides.length || overrideHistory.length ? (
        <div className="workflow-ledger">
          <div>
            <p className="eyebrow">Engineering judgement</p>
            <h3>Override ledger</h3>
          </div>
          <div className="override-ledger-list">
            {overrideHistory.map((override) => (
              <article key={override.id}>
                <div>
                  <strong>
                    {override.variable}
                    {override.direction ? ` · ${override.direction}` : ""}
                  </strong>
                  <span>{Number(override.override_value).toFixed(3)}</span>
                </div>
                <p>{override.reason}</p>
                <small>
                  {override.is_active ? "Active" : "Superseded"} ·{" "}
                  {new Date(override.created_at).toLocaleString()}
                  {override.source_reference ? ` · ${override.source_reference}` : ""}
                </small>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="workflow-ledger">
        <div>
          <p className="eyebrow">Issued records</p>
          <h3>Calculation packs</h3>
        </div>
        {reports.length ? (
          <div className="report-list">
            {reports.map((report) => (
              <article key={report.id}>
                <div>
                  <strong>{report.title || "Wind Calculation Pack"}</strong>
                  <span>Revision {report.revision}</span>
                  <small>{new Date(report.issued_at).toLocaleString()}</small>
                </div>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => downloadReport(report.id)}
                >
                  Download PDF
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-ledger">No issued calculation packs yet.</p>
        )}
      </div>

      <div className="workflow-review-footer">
        <span>
          Latest run set: {latestIssueRunIds.map((id) => id.slice(0, 6)).join(" · ")}
        </span>
        {message ? <p className="form-message">{message}</p> : null}
      </div>
    </section>
  );
}
