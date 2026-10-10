"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { assessRevisionImpact, type ImpactCalculation, type ImpactLink, type ImpactRun } from "@/lib/revision-impact";
import frameLoadFixture from "@/lib/fixtures/openwind-frame-loads.json";

const baseLoad = frameLoadFixture.member_distributed_loads[0];
const panel = frameLoadFixture.member_loads[0];
const originalPressure = panel.net_pressure_toward_inside_kpa;
const tributaryWidth = panel.tributary_width_m;

const calculations: ImpactCalculation[] = [
  { id: "wind", title: "Wind frame loads", calculation_definition_id: "au.wind.frame_loads", state: "draft" },
  { id: "frame", title: "Frame analysis", calculation_definition_id: "structural.pynite.frame_analysis", state: "draft" },
  { id: "steel", title: "Steel section check", calculation_definition_id: "structural.as4100.section_analysis", state: "draft" },
];
const links: ImpactLink[] = [
  { source_calculation_id: "wind", target_calculation_id: "frame", source_output_path: "/member_distributed_loads", target_input_path: "/model/member_distributed_loads" },
  { source_calculation_id: "frame", target_calculation_id: "steel", source_output_path: "/member_results", target_input_path: "/design_actions" },
];
const originalRun: ImpactRun = {
  id: "sample-wind-run-001",
  calculation_id: "wind",
  run_sequence: 1,
  result_json: { result: { member_distributed_loads: [baseLoad] } },
  provenance_json: { linked_inputs: [] },
};
const savedFrameRun: ImpactRun = {
  id: "sample-frame-run-001",
  calculation_id: "frame",
  run_sequence: 1,
  result_json: { result: { member_results: [] } },
  provenance_json: {
    linked_inputs: [{
      source_calculation_id: "wind", source_run_id: originalRun.id,
      source_output_path: "/member_distributed_loads", target_input_path: "/model/member_distributed_loads",
    }],
  },
};
const savedSteelRun: ImpactRun = {
  id: "sample-steel-run-001",
  calculation_id: "steel",
  run_sequence: 1,
  result_json: { result: {} },
  provenance_json: {
    linked_inputs: [{
      source_calculation_id: "frame", source_run_id: savedFrameRun.id,
      source_output_path: "/member_results", target_input_path: "/design_actions",
    }],
  },
};

const scenarios = [
  { value: 0.66, label: "Same pressure" },
  { value: 0.72, label: "Revised pressure" },
  { value: 0.90, label: "Larger revision" },
];

export function RevisionDemo() {
  const [pressure, setPressure] = useState(0.72);
  const amendedLoad = pressure * tributaryWidth;
  const impact = useMemo(() => {
    const revisedRun: ImpactRun = {
      id: "sample-wind-run-002",
      calculation_id: "wind",
      run_sequence: 2,
      provenance_json: { linked_inputs: [] },
      result_json: {
        result: {
          member_distributed_loads: [{ ...baseLoad, start_kn_m: amendedLoad, end_kn_m: amendedLoad }],
        },
      },
    };
    return assessRevisionImpact(calculations, [originalRun, revisedRun, savedFrameRun, savedSteelRun], links, "wind");
  }, [amendedLoad]);
  const changed = impact.outputComparisons.some((x) => x.status === "changed");
  return (
    <div className="revision-demo">
      <div className="revision-demo-start">
        <div className="revision-demo-intro">
          <p className="landing-label">01 / SELECT A REVISED INPUT</p>
          <h2>Revised wind pressure</h2>
          <p>The existing engineering fixture includes a reviewed wall pressure and tributary width. Select an illustrative revised pressure to see which saved calculations are affected.</p>
          <div className="revision-demo-options" role="group" aria-label="Revised net wind pressure">
            {scenarios.map((option) => (
              <button key={option.value} type="button" onClick={() => setPressure(option.value)}
                className={pressure === option.value ? "revision-demo-option active" : "revision-demo-option"}
                aria-pressed={pressure === option.value}>
                <strong>{option.value.toFixed(2)} kPa</strong>
                <small>{option.label}</small>
              </button>
            ))}
          </div>
          <div className="revision-demo-evidence">
            <strong>Sample evidence</strong>
            <p>Wall elevation A · tributary width {tributaryWidth.toFixed(1)} m · load to member {baseLoad.member_id}</p>
            <small>Source: existing OpenWind frame-load test fixture. Revised pressure is an illustrative assumption, not the result of a new AS/NZS 1170.2 assessment.</small>
          </div>
        </div>
        <div className="revision-demo-values" aria-label="Wind-to-frame calculation">
          <div><span>Previously adopted pressure</span><strong>{originalPressure.toFixed(2)} <small>kPa</small></strong></div>
          <div><span>Revised assumed pressure</span><strong>{pressure.toFixed(2)} <small>kPa</small></strong></div>
          <div><span>Tributary width</span><strong>{tributaryWidth.toFixed(1)} <small>m</small></strong></div>
          <div className="revision-demo-result"><span>Illustrative line load · q × b</span><strong>{amendedLoad.toFixed(2)} <small>kN/m</small></strong>
            <p>Original: {(originalPressure * tributaryWidth).toFixed(2)} kN/m</p>
          </div>
        </div>
      </div>

      <div className="revision-demo-stages">
        <div className="revision-demo-label">
          <p className="landing-label">02 / SAVED CALCULATION PROVENANCE</p>
          <h2>See what the revision affects</h2>
          <p>Every connection below is evaluated against its saved source-run snapshot. No frame solver or steel member design is executed here.</p>
        </div>
        <div className="revision-demo-trail">
          <article className="revision-demo-node">
            <span className="revision-demo-node-number">01 / SOURCE</span>
            <h3>Wind frame loads</h3>
            <p>Earlier run R01 → illustrative R02</p>
            <div className="revision-demo-node-meta">
              <strong>{(originalPressure * tributaryWidth).toFixed(2)} → {amendedLoad.toFixed(2)} kN/m</strong>
              <span className={changed ? "revision-demo-state changed" : "revision-demo-state"}>{changed ? "Output changed" : "New run; output unchanged"}</span>
            </div>
          </article>
          <div className="revision-demo-arrow" aria-hidden="true">↓ linked output</div>
          <article className="revision-demo-node flagged">
            <span className="revision-demo-node-number">02 / ENGINEERING ANALYSIS</span>
            <h3>Frame analysis</h3>
            <p>The saved frame run still references wind run R01. R02 has not been applied or solved.</p>
            <div className="revision-demo-node-meta"><span className="revision-demo-state changed">Review required</span></div>
          </article>
          <div className="revision-demo-arrow" aria-hidden="true">↓ dependent actions</div>
          <article className="revision-demo-node flagged">
            <span className="revision-demo-node-number">03 / MEMBER DESIGN</span>
            <h3>Steel section check</h3>
            <p>Frame reactions and member actions must be recomputed before any downstream steel check can be reviewed.</p>
            <div className="revision-demo-node-meta"><span className="revision-demo-state changed">Review required</span></div>
          </article>
        </div>
      </div>
      <div className="revision-demo-footer">
        <div>
          <p className="landing-label">ENGINEER-CONTROLLED WORKFLOW</p>
          <h3>{impact.affected.length} connected calculations require attention</h3>
          <p>Actual projects use saved calculation-run records and recorded dependencies. This public example is entirely illustrative; no client documents are uploaded, no AI extraction is performed, and no downstream design result or approval is generated.</p>
        </div>
        <Link className="landing-button" href="/signup">Open EngCalcs workspace <span aria-hidden="true">↗</span></Link>
      </div>
    </div>
  );
}
