import Link from "next/link";

import { SAMPLE_FRAME_INPUTS } from "@/lib/pynite-model";

/**
 * A read-only product view built from the same sample model used by the live
 * frame workbench. No fabricated solver outputs or pretend saved runs.
 */
export function LandingProductPreview() {
  const { model, analysis_type } = SAMPLE_FRAME_INPUTS;
  const firstMember = model.members[0];
  const start = model.nodes.find((node) => node.id === firstMember.start_node);
  const end = model.nodes.find((node) => node.id === firstMember.end_node);
  const span = start && end
    ? Math.hypot(end.x_m - start.x_m, end.y_m - start.y_m, end.z_m - start.z_m)
    : 0;
  const uniformLoad = model.member_distributed_loads.find((load) => load.member_id === firstMember.id);

  return (
    <div className="landing-window landing-product" aria-label="Frame analysis sample model shown using real EngCalcs input data">
      <div className="landing-window-header">
        <span>ENGCALCS / FRAME ANALYSIS</span>
        <span>WORKBENCH PREVIEW</span>
      </div>
      <div className="landing-product-toolbar">
        <div>
          <span className="landing-label">STRUCTURAL ANALYSIS</span>
          <h2>Frame model</h2>
        </div>
        <div className="landing-product-tabs" aria-label="Previewed workbench section">
          <span className="is-active">Model</span>
          <span>Loads</span>
          <span>Results</span>
        </div>
      </div>
      <div className="landing-product-drawing">
        <div className="landing-product-canvas-top">
          <span>XY / ELEVATION</span>
          <span>MODEL: {firstMember.id}</span>
        </div>
        <svg className="landing-beam-svg" viewBox="0 0 620 285" role="img" aria-labelledby="beam-title beam-description">
          <title id="beam-title">Simply supported sample beam with distributed load</title>
          <desc id="beam-description">
            The EngCalcs sample model defines one six-metre beam between nodes N1 and N2,
            with a downward dead load of two kilonewtons per metre.
          </desc>
          <defs>
            <pattern id="landing-grid" width="23" height="23" patternUnits="userSpaceOnUse">
              <path d="M23 0H0V23" fill="none" stroke="#d9e1dc" strokeWidth=".8" />
            </pattern>
            <marker id="landing-load-tip" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0L8 4L0 8Z" fill="#ba7653" />
            </marker>
            <marker id="landing-dim-tip" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 4L8 0V8Z" fill="#6a7f70" />
            </marker>
          </defs>
          <rect x="0" y="0" width="620" height="285" fill="url(#landing-grid)" />
          <line x1="105" y1="151" x2="515" y2="151" stroke="#193c32" strokeWidth="8" strokeLinecap="square" />
          {Array.from({ length: 9 }, (_, i) => 112 + i * 49.3).map((x, index) => (
            <line key={index} x1={x} y1="65" x2={x} y2="138" stroke="#ba7653" strokeWidth="2.4" markerEnd="url(#landing-load-tip)" />
          ))}
          <line x1="112" y1="59" x2="507" y2="59" stroke="#ba7653" strokeWidth="1.5" />
          <text x="309" y="43" textAnchor="middle" fill="#91573e" fontSize="16" fontWeight="600">
            D = {uniformLoad ? Math.abs(uniformLoad.start_kn_m).toFixed(1) : "—"} kN/m
          </text>
          <circle cx="105" cy="151" r="6" fill="#f7f5ee" stroke="#193c32" strokeWidth="3" />
          <circle cx="515" cy="151" r="6" fill="#f7f5ee" stroke="#193c32" strokeWidth="3" />
          <path d="M105 157L87 182H123Z" fill="#d3dccc" stroke="#496e59" strokeWidth="2" />
          <path d="M515 157L497 182H533Z" fill="#d3dccc" stroke="#496e59" strokeWidth="2" />
          <path d="M84 187H126M494 187H536" stroke="#496e59" strokeWidth="2" />
          {[-16,-7,2,11].map((a) => <path key={a} d={`M${84+a+16} 187l-9 9M${494+a+16} 187l-9 9`} stroke="#a2b4a5" strokeWidth="1.4" />)}
          <text x="106" y="216" textAnchor="middle" fill="#355246" fontSize="14" fontWeight="600">{firstMember.start_node}</text>
          <text x="514" y="216" textAnchor="middle" fill="#355246" fontSize="14" fontWeight="600">{firstMember.end_node}</text>
          <line x1="105" x2="515" y1="234" y2="234" stroke="#6a7f70" strokeWidth="1.5" />
          <line x1="105" x2="105" y1="216" y2="247" stroke="#6a7f70" strokeWidth="1" />
          <line x1="515" x2="515" y1="216" y2="247" stroke="#6a7f70" strokeWidth="1" />
          <path d="M105 230v8m410-8v8" stroke="#6a7f70" strokeWidth="2" />
          <rect x="277" y="220" width="66" height="27" fill="#fafbf8" />
          <text x="310" y="239" textAnchor="middle" fill="#264f3d" fontSize="16" fontWeight="600">{span.toFixed(2)} m</text>
          <text x="310" y="276" textAnchor="middle" fontSize="11" fill="#6a7d70">SAMPLE INPUT GEOMETRY / NOT A SOLVED DESIGN</text>
        </svg>
      </div>
      <div className="landing-product-data">
        <div><span>Member</span><strong>{firstMember.id}</strong></div>
        <div><span>Load case</span><strong>{uniformLoad?.load_case ?? "—"}</strong></div>
        <div><span>Analysis</span><strong>{analysis_type === "linear" ? "Linear elastic" : analysis_type}</strong></div>
        <div><span>Span</span><strong>{span.toFixed(2)} m</strong></div>
      </div>
      <div className="landing-product-foot">
        <span>Generated from the frame workbench’s sample model. Input data only; no solver result shown.</span>
        <Link href="/dashboard/structural-fea">Open the workbench <span aria-hidden="true">↗</span></Link>
      </div>
    </div>
  );
}
