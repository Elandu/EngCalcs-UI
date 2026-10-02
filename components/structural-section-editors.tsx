"use client";

import { PointerEvent, type ReactNode, useRef, useState } from "react";

import styles from "./structural-section-editors.module.css";
import {
  barAreaFromDiameter,
  barDiameterFromArea,
  layerBars,
  neutralAxisGeometry,
  nextBarId,
} from "@/lib/concrete-section";

type Values = Record<string, unknown>;

function record(value: unknown): Values {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Values : {};
}

function num(value: unknown) {
  return typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
}

function fmt(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toLocaleString("en-AU", { maximumFractionDigits: digits }) : "—";
}

function NumberField({ label, unit, value, onChange, hint, min, max, step = "any", disabled }: {
  label: string; unit?: string; value: unknown; onChange: (next: string) => void; hint?: string;
  min?: number; max?: number; step?: string; disabled?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span>{label}{unit ? <em>{unit}</em> : null}</span>
      <input type="number" inputMode="decimal" step={step} min={min} max={max} value={String(value ?? "")} disabled={disabled}
        onChange={(event) => onChange(event.target.value)} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* AS 3600 · reinforced concrete section                              */
/* ------------------------------------------------------------------ */

export type ConcreteSectionResult = {
  gross_properties: Record<string, number>;
  ultimate: Record<string, number>;
  warnings: string[];
  limitations: string[];
  solver?: { name?: string; version?: string };
};

export function parseConcreteSectionResult(value: unknown): ConcreteSectionResult | null {
  const result = record(value);
  const nested = record(result.result);
  const payload = Object.keys(nested).length ? nested : result;
  if (!Object.keys(record(payload.gross_properties)).length || !Object.keys(record(payload.ultimate)).length) return null;
  return {
    gross_properties: record(payload.gross_properties) as Record<string, number>,
    ultimate: record(payload.ultimate) as Record<string, number>,
    warnings: Array.isArray(payload.warnings) ? payload.warnings.filter((item): item is string => typeof item === "string") : [],
    limitations: Array.isArray(payload.limitations) ? payload.limitations.filter((item): item is string => typeof item === "string") : [],
    solver: record(payload.solver) as ConcreteSectionResult["solver"],
  };
}

/** Explicit illustrative inputs from the plugin's published example; not design defaults. */
export const CONCRETE_SECTION_EXAMPLE: Values = {
  section: {
    width_mm: 300,
    depth_mm: 500,
    bars: [
      { id: "B1", area_mm2: 500, x_mm: 60, y_mm: 50 },
      { id: "B2", area_mm2: 500, x_mm: 150, y_mm: 50 },
      { id: "B3", area_mm2: 500, x_mm: 240, y_mm: 50 },
    ],
  },
  concrete: {
    elastic_modulus_mpa: 30000,
    compressive_strength_mpa: 32,
    density_kg_m3: 2400,
    stress_block_alpha: 0.8,
    stress_block_gamma: 0.8,
    ultimate_compressive_strain: 0.003,
  },
  steel: { elastic_modulus_mpa: 200000, yield_strength_mpa: 500, density_kg_m3: 7850, fracture_strain: 0.05 },
  axial_force_kn: 0,
  bending_angle_deg: 0,
};

const SNAP_MM = 5;
/** Common reinforcing bar diameters, offered as shortcuts; any diameter can still be typed. */
const BAR_SIZES = [10, 12, 16, 20, 24, 28, 32, 36];

function BarSizeChips({ value, onPick, disabled }: { value: string; onPick: (size: string) => void; disabled?: boolean }) {
  return (
    <div className={styles.chips} role="group" aria-label="Common bar diameters">
      {BAR_SIZES.map((size) => (
        <button type="button" key={size} disabled={disabled} className={Number(value) === size ? styles.chipActive : styles.chip} onClick={() => onPick(String(size))}>Ø{size}</button>
      ))}
    </div>
  );
}

export function ConcreteSectionEditor({ values, onChange, result, resultCurrent, disabled }: {
  values: Values;
  onChange: (next: Values) => void;
  result: ConcreteSectionResult | null;
  resultCurrent: boolean;
  disabled?: boolean;
}) {
  const section = record(values.section);
  const concrete = record(values.concrete);
  const steel = record(values.steel);
  const bars = (Array.isArray(section.bars) ? section.bars : []).map(record);
  const width = num(section.width_mm);
  const depth = num(section.depth_mm);
  const angle = num(values.bending_angle_deg);
  const validShape = width > 0 && depth > 0;

  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const [placeDiameter, setPlaceDiameter] = useState("20");
  const [layer, setLayer] = useState({ count: "3", diameter: "20", edge: "50", face: "bottom" as "top" | "bottom" });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; moved: boolean } | null>(null);

  const setSection = (patch: Values) => onChange({ ...values, section: { ...section, ...patch } });
  const setBars = (next: Values[]) => setSection({ bars: next });
  const setGroup = (key: "concrete" | "steel", field: string, value: string) =>
    onChange({ ...values, [key]: { ...record(values[key]), [field]: value } });

  function svgPoint(event: PointerEvent<SVGElement>) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const clamp = (value: number, limit: number) => Math.min(limit, Math.max(0, Math.round(value / SNAP_MM) * SNAP_MM));
    return { x: clamp(point.x, width), y: clamp(depth - point.y, depth) };
  }

  function addBarAt(x: number, y: number) {
    const diameter = num(placeDiameter);
    if (!(diameter > 0)) return;
    const id = nextBarId(bars.map((bar) => String(bar.id ?? "")));
    setBars([...bars, { id, area_mm2: barAreaFromDiameter(diameter), x_mm: x, y_mm: y }]);
    setSelectedBar(bars.length);
  }

  function onCanvasPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (disabled || !validShape || event.button !== 0) return;
    const target = event.target as SVGElement;
    const barIndex = target.dataset.bar;
    if (barIndex !== undefined) {
      drag.current = { index: Number(barIndex), moved: false };
      setSelectedBar(Number(barIndex));
      event.currentTarget.setPointerCapture(event.pointerId);
    } else if (target.dataset.concrete !== undefined) {
      const point = svgPoint(event);
      if (point) addBarAt(point.x, point.y);
    } else {
      setSelectedBar(null);
    }
  }

  function onCanvasPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const point = svgPoint(event);
    if (!point) return;
    drag.current.moved = true;
    const { index } = drag.current;
    setBars(bars.map((bar, row) => row === index ? { ...bar, x_mm: point.x, y_mm: point.y } : bar));
  }

  function addLayer() {
    const next = layerBars({
      width, depth, count: Number(layer.count), diameterMm: num(layer.diameter), edgeMm: num(layer.edge), face: layer.face,
      existingIds: bars.map((bar) => String(bar.id ?? "")),
    });
    if (next.length) setBars([...bars, ...next]);
  }

  const pad = validShape ? Math.max(width, depth) * 0.14 : 50;
  const viewBox = validShape ? `${-pad} ${-pad} ${width + 2 * pad} ${depth + 2 * pad}` : "0 0 400 300";
  const unit = validShape ? Math.max(width, depth) / 100 : 1;
  const overlay = result && validShape ? neutralAxisGeometry(width, depth, num(result.ultimate.bending_angle_deg), num(result.ultimate.neutral_axis_depth_mm)) : null;
  const centroid = result ? { x: num(result.gross_properties.elastic_centroid_x_mm), y: num(result.gross_properties.elastic_centroid_y_mm) } : null;
  const steelArea = bars.reduce((sum, bar) => sum + (num(bar.area_mm2) || 0), 0);
  const outsideBars = bars.filter((bar) => {
    const radius = barDiameterFromArea(num(bar.area_mm2)) / 2;
    return !(num(bar.x_mm) - radius >= 0 && num(bar.x_mm) + radius <= width && num(bar.y_mm) - radius >= 0 && num(bar.y_mm) + radius <= depth);
  });
  const duplicateIds = bars.map((bar) => String(bar.id ?? "")).filter((id, index, all) => all.indexOf(id) !== index);
  const selected = selectedBar !== null ? bars[selectedBar] : undefined;

  return (
    <div className={styles.editor}>
      <div className={styles.editorHeading}>
        <div>
          <p className={styles.kicker}>Section model</p>
          <h3>Rectangular reinforced concrete section</h3>
          <ol className={styles.steps}>
            <li>Set width and depth</li>
            <li>Add bar layers or click to place bars</li>
            <li>Enter material coefficients</li>
            <li>Read the result on the right, then save</li>
          </ol>
        </div>
        <button type="button" className={styles.ghostButton} disabled={disabled} onClick={() => { onChange(structuredClone(CONCRETE_SECTION_EXAMPLE)); setSelectedBar(null); }}>
          Load illustrative example
        </button>
      </div>

      <div className={styles.sectionLayout}>
        <figure className={styles.canvasCard}>
          <svg
            ref={svgRef}
            className={styles.sectionCanvas}
            viewBox={viewBox}
            role="img"
            aria-label={validShape ? `Section ${fmt(width, 0)} by ${fmt(depth, 0)} mm with ${bars.length} bars` : "Enter a positive width and depth to draw the section"}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
            tabIndex={0}
            onKeyDown={(event) => {
              if ((event.key === "Delete" || event.key === "Backspace") && selectedBar !== null && !disabled) {
                event.preventDefault();
                setBars(bars.filter((_, index) => index !== selectedBar));
                setSelectedBar(null);
              } else if (event.key === "Escape") {
                setSelectedBar(null);
              }
            }}
          >
            {validShape ? <>
              <defs>
                <pattern id="concrete-hatch" width={unit * 4} height={unit * 4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2={unit * 4} className={styles.hatch} strokeWidth={unit * 0.3} />
                </pattern>
              </defs>
              <rect x={0} y={0} width={width} height={depth} className={styles.concrete} strokeWidth={unit * 0.5} data-concrete="" />
              <rect x={0} y={0} width={width} height={depth} fill="url(#concrete-hatch)" pointerEvents="none" />
              {overlay ? <g className={resultCurrent ? undefined : styles.staleOverlay} pointerEvents="none">
                <polygon points={overlay.zone.map((point) => `${point.x},${depth - point.y}`).join(" ")} className={styles.compressionZone} />
                {overlay.axis ? <line x1={overlay.axis[0].x} y1={depth - overlay.axis[0].y} x2={overlay.axis[1].x} y2={depth - overlay.axis[1].y} className={styles.neutralAxis} strokeWidth={unit * 0.6} strokeDasharray={`${unit * 3} ${unit * 1.5}`} /> : null}
              </g> : null}
              {centroid && Number.isFinite(centroid.x) && Number.isFinite(centroid.y) ? (
                <g className={resultCurrent ? styles.centroid : `${styles.centroid} ${styles.staleOverlay}`} pointerEvents="none" strokeWidth={unit * 0.45}>
                  <circle cx={centroid.x} cy={depth - centroid.y} r={unit * 2.2} />
                  <line x1={centroid.x - unit * 4} y1={depth - centroid.y} x2={centroid.x + unit * 4} y2={depth - centroid.y} />
                  <line x1={centroid.x} y1={depth - centroid.y - unit * 4} x2={centroid.x} y2={depth - centroid.y + unit * 4} />
                </g>
              ) : null}
              {bars.map((bar, index) => {
                const radius = Math.max(barDiameterFromArea(num(bar.area_mm2)) / 2, unit);
                const x = num(bar.x_mm);
                const y = num(bar.y_mm);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                return (
                  <g key={index}>
                    <circle cx={x} cy={depth - y} r={radius} data-bar={index}
                      className={selectedBar === index ? styles.barSelected : outsideBars.includes(bar) ? styles.barInvalid : styles.bar}
                      strokeWidth={unit * 0.5} />
                    <text x={x + radius + unit} y={depth - y - radius} className={styles.barLabel} fontSize={unit * 4.2}>{String(bar.id ?? "")}</text>
                  </g>
                );
              })}
              <g className={styles.dimension} fontSize={unit * 4.4} strokeWidth={unit * 0.3}>
                <line x1={0} y1={depth + pad * 0.45} x2={width} y2={depth + pad * 0.45} />
                <text x={width / 2} y={depth + pad * 0.8} textAnchor="middle">{fmt(width, 0)} mm</text>
                <line x1={-pad * 0.45} y1={0} x2={-pad * 0.45} y2={depth} />
                <text x={-pad * 0.6} y={depth / 2} textAnchor="middle" transform={`rotate(-90 ${-pad * 0.6} ${depth / 2})`}>{fmt(depth, 0)} mm</text>
                <text x={-pad * 0.9} y={depth + pad * 0.9} className={styles.origin}>origin (0, 0)</text>
              </g>
            </> : <>
              <text x="200" y="140" textAnchor="middle" className={styles.emptyCanvas}>Enter a width and depth to draw the section</text>
              <text x="200" y="164" textAnchor="middle" className={styles.emptyCanvasHint}>or use “Load illustrative example” above</text>
            </>}
          </svg>
          <figcaption className={styles.canvasLegend}>
            <label className={styles.placeField}>Click to place Ø
              <input type="number" min={0} step="any" value={placeDiameter} onChange={(event) => setPlaceDiameter(event.target.value)} aria-label="Diameter of bars placed by clicking" disabled={disabled} />
              mm bars · drag to move · Delete removes the selected bar
            </label>
            {overlay ? <span><i className={styles.legendZone} /> compression zone {resultCurrent ? "" : "(previous inputs)"}</span> : null}
            {centroid ? <span><i className={styles.legendCentroid} /> elastic centroid</span> : null}
          </figcaption>
        </figure>

        <div className={styles.sideFields}>
          <fieldset className={styles.group} disabled={disabled}>
            <legend>Geometry</legend>
            <div className={styles.grid2}>
              <NumberField label="Width b" unit="mm" value={section.width_mm} min={0} onChange={(value) => setSection({ width_mm: value })} />
              <NumberField label="Depth D" unit="mm" value={section.depth_mm} min={0} onChange={(value) => setSection({ depth_mm: value })} />
            </div>
          </fieldset>
          <fieldset className={styles.group} disabled={disabled}>
            <legend>Actions</legend>
            <NumberField label="Axial force N" unit="kN" value={values.axial_force_kn} onChange={(value) => onChange({ ...values, axial_force_kn: value })} hint="Positive compression; negative tension." />
            <label className={styles.field}>
              <span>Neutral-axis angle<em>deg</em></span>
              <div className={styles.angleRow}>
                <input type="range" min={-180} max={180} step={5} value={Number.isFinite(angle) ? angle : 0} onChange={(event) => onChange({ ...values, bending_angle_deg: Number(event.target.value) })} aria-label="Neutral-axis angle slider" />
                <input type="number" min={-180} max={180} step="any" value={String(values.bending_angle_deg ?? "")} onChange={(event) => onChange({ ...values, bending_angle_deg: event.target.value })} aria-label="Neutral-axis angle" />
              </div>
              <div className={styles.chips}>
                {[[0, "Top"], [180, "Bottom"], [90, "Left"], [-90, "Right"]].map(([value, label]) => (
                  <button type="button" key={value} className={angle === value ? styles.chipActive : styles.chip} onClick={() => onChange({ ...values, bending_angle_deg: value })}>{label} in compression</button>
                ))}
              </div>
            </label>
          </fieldset>
        </div>
      </div>

      <fieldset className={styles.group} disabled={disabled}>
        <legend>Reinforcement · {bars.length} bars · As = {fmt(steelArea, 0)} mm²{validShape ? ` · ${fmt((100 * steelArea) / (width * depth), 2)}% of gross` : ""}</legend>
        {bars.length ? <button type="button" className={styles.textButton} onClick={() => { setBars([]); setSelectedBar(null); }}>Remove all bars</button> : null}
        <div className={styles.layerTools}>
          <NumberField label="Bars" value={layer.count} step="1" min={1} onChange={(value) => setLayer({ ...layer, count: value })} />
          <NumberField label="Bar Ø" unit="mm" value={layer.diameter} min={0} onChange={(value) => { setLayer({ ...layer, diameter: value }); setPlaceDiameter(value); }} />
          <NumberField label="Face to bar centre" unit="mm" value={layer.edge} min={0} onChange={(value) => setLayer({ ...layer, edge: value })} />
          <label className={styles.field}><span>Face</span>
            <select value={layer.face} onChange={(event) => setLayer({ ...layer, face: event.target.value as "top" | "bottom" })}><option value="bottom">Bottom</option><option value="top">Top</option></select>
          </label>
          <button type="button" className={styles.secondaryButton} onClick={addLayer} disabled={!validShape}>Add layer</button>
        </div>
        <BarSizeChips value={layer.diameter} disabled={disabled} onPick={(size) => { setLayer({ ...layer, diameter: size }); setPlaceDiameter(size); }} />
        <p className={styles.note}>Ø is converted to area as πØ²/4. Bars are placed at the entered centre distance from both side faces and the chosen face; check cover separately.</p>
        <div className={styles.barTable} role="table" aria-label="Reinforcing bars">
          <div className={styles.barHead} role="row"><span>ID</span><span>Area mm²</span><span>x mm</span><span>y mm</span><span>Ø eq.</span><span /></div>
          {bars.map((bar, index) => (
            <div key={index} role="row" className={selectedBar === index ? styles.barRowSelected : styles.barRow} onFocus={() => setSelectedBar(index)}>
              <input aria-label={`Bar ${index + 1} ID`} value={String(bar.id ?? "")} maxLength={40} onChange={(event) => setBars(bars.map((row, i) => i === index ? { ...row, id: event.target.value } : row))} />
              {(["area_mm2", "x_mm", "y_mm"] as const).map((key) => (
                <input key={key} aria-label={`Bar ${index + 1} ${key}`} type="number" step="any" value={String(bar[key] ?? "")} onChange={(event) => setBars(bars.map((row, i) => i === index ? { ...row, [key]: event.target.value } : row))} />
              ))}
              <span>{fmt(barDiameterFromArea(num(bar.area_mm2)), 1)}</span>
              <button type="button" aria-label={`Remove bar ${String(bar.id ?? index + 1)}`} onClick={() => { setBars(bars.filter((_, i) => i !== index)); setSelectedBar(null); }}>×</button>
            </div>
          ))}
          {!bars.length ? <p className={styles.note}>At least one bar is required. Add a layer or click the section.</p> : null}
        </div>
        {selected ? <p className={styles.note}>Selected {String(selected.id)} · Ø{fmt(barDiameterFromArea(num(selected.area_mm2)), 1)} at ({fmt(num(selected.x_mm), 0)}, {fmt(num(selected.y_mm), 0)}) mm</p> : null}
        {outsideBars.length ? <p className={styles.warning}>Bars outside the concrete outline: {outsideBars.map((bar) => String(bar.id)).join(", ")}.</p> : null}
        {duplicateIds.length ? <p className={styles.warning}>Bar IDs must be unique: {[...new Set(duplicateIds)].join(", ")}.</p> : null}
      </fieldset>

      <div className={styles.grid2}>
        <fieldset className={styles.group} disabled={disabled}>
          <legend>Concrete model</legend>
          <div className={styles.grid2}>
            <NumberField label="f′c" unit="MPa" value={concrete.compressive_strength_mpa} onChange={(value) => setGroup("concrete", "compressive_strength_mpa", value)} />
            <NumberField label="Ec" unit="MPa" value={concrete.elastic_modulus_mpa} onChange={(value) => setGroup("concrete", "elastic_modulus_mpa", value)} />
            <NumberField label="Stress block α" value={concrete.stress_block_alpha} onChange={(value) => setGroup("concrete", "stress_block_alpha", value)} />
            <NumberField label="Stress block γ" value={concrete.stress_block_gamma} onChange={(value) => setGroup("concrete", "stress_block_gamma", value)} />
            <NumberField label="Ultimate strain εcu" value={concrete.ultimate_compressive_strain} onChange={(value) => setGroup("concrete", "ultimate_compressive_strain", value)} />
            <NumberField label="Density" unit="kg/m³" value={concrete.density_kg_m3} onChange={(value) => setGroup("concrete", "density_kg_m3", value)} />
          </div>
          <p className={styles.note}>Coefficients are supplied explicitly. No AS 3600 values are derived from f′c.</p>
        </fieldset>
        <fieldset className={styles.group} disabled={disabled}>
          <legend>Reinforcement steel model</legend>
          <div className={styles.grid2}>
            <NumberField label="fsy" unit="MPa" value={steel.yield_strength_mpa} onChange={(value) => setGroup("steel", "yield_strength_mpa", value)} />
            <NumberField label="Es" unit="MPa" value={steel.elastic_modulus_mpa} onChange={(value) => setGroup("steel", "elastic_modulus_mpa", value)} />
            <NumberField label="Fracture strain" value={steel.fracture_strain} onChange={(value) => setGroup("steel", "fracture_strain", value)} />
            <NumberField label="Density" unit="kg/m³" value={steel.density_kg_m3} onChange={(value) => setGroup("steel", "density_kg_m3", value)} />
          </div>
        </fieldset>
      </div>
    </div>
  );
}

export function ConcreteSectionResults({ result }: { result: ConcreteSectionResult }) {
  const gross = result.gross_properties;
  const ultimate = result.ultimate;
  return (
    <div className={styles.results}>
      <div className={styles.metricHero}>
        <span>Nominal moment capacity · resultant</span>
        <strong>{fmt(num(ultimate.resultant_moment_knm))} <small>kN·m</small></strong>
        <em>at N = {fmt(num(ultimate.axial_force_kn), 2)} kN · angle {fmt(num(ultimate.bending_angle_deg), 1)}°</em>
      </div>
      <dl className={styles.metricList}>
        <div><dt>Mx</dt><dd>{fmt(num(ultimate.moment_x_knm))} kN·m</dd></div>
        <div><dt>My</dt><dd>{fmt(num(ultimate.moment_y_knm))} kN·m</dd></div>
        <div><dt>Neutral-axis depth</dt><dd>{fmt(num(ultimate.neutral_axis_depth_mm))} mm</dd></div>
        <div><dt>Max steel strain</dt><dd>{fmt(num(ultimate.maximum_steel_strain), 4)}</dd></div>
        <div><dt>Axial equilibrium error</dt><dd>{fmt(num(ultimate.axial_equilibrium_error_kn), 3)} kN</dd></div>
        <div><dt>Steel area</dt><dd>{fmt(num(gross.steel_area_mm2), 0)} mm²</dd></div>
        <div><dt>Elastic centroid</dt><dd>({fmt(num(gross.elastic_centroid_x_mm))}, {fmt(num(gross.elastic_centroid_y_mm))}) mm</dd></div>
        <div><dt>EIxx · EIyy</dt><dd>{fmt(num(gross.ei_xx_n_mm2) / 1e12, 2)} · {fmt(num(gross.ei_yy_n_mm2) / 1e12, 2)} ×10¹² N·mm²</dd></div>
        <div><dt>Mass</dt><dd>{fmt(num(gross.mass_per_length_kg_m))} kg/m</dd></div>
      </dl>
      {[...result.warnings, ...result.limitations].length ? (
        <details className={styles.limits}>
          <summary>Scope and limitations · {result.warnings.length + result.limitations.length}</summary>
          <ul>{[...result.warnings, ...result.limitations].map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AS 4100 · steel axial section capacity                             */
/* ------------------------------------------------------------------ */

type AxialCheck = {
  nominal_capacity_kn: number;
  design_capacity_kn: number;
  action_kn: number;
  utilisation: number;
  section_capacity_satisfied: boolean;
  governing_mode: string;
};

export type SteelAxialResult = {
  standard: string;
  scope: string;
  capacity_factor: number;
  tension: AxialCheck;
  compression: AxialCheck;
  tension_nominal_modes_kn: { gross_yielding: number; net_fracture: number };
  warnings: string[];
};

function isCheck(value: unknown): value is AxialCheck {
  const check = record(value);
  return ["nominal_capacity_kn", "design_capacity_kn", "action_kn", "utilisation"].every((key) => typeof check[key] === "number") &&
    typeof check.section_capacity_satisfied === "boolean";
}

export function parseSteelAxialResult(value: unknown): SteelAxialResult | null {
  const result = record(value);
  const nested = record(result.result);
  const payload = Object.keys(nested).length ? nested : result;
  if (!isCheck(payload.tension) || !isCheck(payload.compression)) return null;
  const modes = record(payload.tension_nominal_modes_kn);
  return {
    standard: typeof payload.standard === "string" ? payload.standard : "AS 4100",
    scope: typeof payload.scope === "string" ? payload.scope : "",
    capacity_factor: num(payload.capacity_factor),
    tension: payload.tension,
    compression: payload.compression,
    tension_nominal_modes_kn: { gross_yielding: num(modes.gross_yielding), net_fracture: num(modes.net_fracture) },
    warnings: Array.isArray(payload.warnings) ? payload.warnings.filter((item): item is string => typeof item === "string") : [],
  };
}

/** Explicit illustrative inputs from the plugin's published example; not design defaults. */
export const STEEL_AXIAL_EXAMPLE: Values = {
  gross_area_mm2: 2000,
  net_area_mm2: 1500,
  yield_strength_mpa: 250,
  ultimate_strength_mpa: 400,
  tension_distribution_factor: 0.8,
  compression_form_factor: 0.8,
  tension_action_kn: 200,
  compression_action_kn: 135,
};

export function SteelAxialEditor({ values, onChange, disabled }: { values: Values; onChange: (next: Values) => void; disabled?: boolean }) {
  const set = (key: string) => (value: string) => onChange({ ...values, [key]: value });
  const ag = num(values.gross_area_mm2);
  const an = num(values.net_area_mm2);
  const fy = num(values.yield_strength_mpa);
  const fu = num(values.ultimate_strength_mpa);
  const issues = [
    an > ag ? "Net area must not exceed gross area." : "",
    fu < fy ? "Ultimate strength must not be below yield strength." : "",
  ].filter(Boolean);
  return (
    <div className={styles.editor}>
      <div className={styles.editorHeading}>
        <div>
          <p className={styles.kicker}>Section axial capacity</p>
          <h3>Steel tension and compression section checks</h3>
        </div>
        <button type="button" className={styles.ghostButton} disabled={disabled} onClick={() => onChange({ ...STEEL_AXIAL_EXAMPLE })}>Load illustrative example</button>
      </div>
      <div className={styles.grid2}>
        <fieldset className={styles.group} disabled={disabled}>
          <legend>Section</legend>
          <NumberField label="Gross area Ag" unit="mm²" value={values.gross_area_mm2} min={0} onChange={set("gross_area_mm2")} />
          <NumberField label="Net area An" unit="mm²" value={values.net_area_mm2} min={0} onChange={set("net_area_mm2")} hint={ag > 0 && an > 0 ? `An / Ag = ${fmt(an / ag, 3)}` : "Deduct holes and penetrations."} />
        </fieldset>
        <fieldset className={styles.group} disabled={disabled}>
          <legend>Material</legend>
          <NumberField label="Yield strength fy" unit="MPa" value={values.yield_strength_mpa} min={0} onChange={set("yield_strength_mpa")} />
          <NumberField label="Tensile strength fu" unit="MPa" value={values.ultimate_strength_mpa} min={0} onChange={set("ultimate_strength_mpa")} hint="Use values for the actual product and thickness; a grade label alone is insufficient." />
        </fieldset>
        <fieldset className={styles.group} disabled={disabled}>
          <legend>Assessed factors</legend>
          <NumberField label="Distribution factor kt" value={values.tension_distribution_factor} min={0} max={1} onChange={set("tension_distribution_factor")} hint="Assessed for the end connection; no default is applied." />
          <NumberField label="Form factor kf" value={values.compression_form_factor} min={0} max={1} onChange={set("compression_form_factor")} hint="Assessed for local buckling of the section; no default is applied." />
        </fieldset>
        <fieldset className={styles.group} disabled={disabled}>
          <legend>Design actions</legend>
          <NumberField label="Tension N*t" unit="kN" value={values.tension_action_kn} min={0} onChange={set("tension_action_kn")} />
          <NumberField label="Compression N*c" unit="kN" value={values.compression_action_kn} min={0} onChange={set("compression_action_kn")} hint="Factored magnitudes, entered as nonnegative values." />
        </fieldset>
      </div>
      {issues.map((issue) => <p className={styles.warning} key={issue}>{issue}</p>)}
      <p className={styles.note}>Section capacity only. Member buckling, bending, shear, combined actions and connections are outside this calculation.</p>
    </div>
  );
}

function UtilisationCard({ title, check, extra }: { title: string; check: AxialCheck; extra?: ReactNode }) {
  const pass = check.section_capacity_satisfied;
  const width = Math.min(Math.max(check.utilisation, 0), 1.25) / 1.25 * 100;
  return (
    <article className={pass ? styles.checkCard : `${styles.checkCard} ${styles.checkFail}`}>
      <header>
        <strong>{title}</strong>
        <span className={pass ? styles.passPill : styles.failPill}>{pass ? "Satisfied" : "Exceeded"}</span>
      </header>
      <div className={styles.utilTrack} role="meter" aria-valuemin={0} aria-valuemax={1.25} aria-valuenow={check.utilisation} aria-label={`${title} utilisation`}>
        <div className={styles.utilFill} style={{ width: `${width}%` }} />
        <i className={styles.utilLimit} style={{ left: `${100 / 1.25}%` }} />
      </div>
      <p className={styles.utilValue}>{fmt(check.utilisation, 3)} <small>utilisation</small></p>
      <dl className={styles.metricList}>
        <div><dt>Action</dt><dd>{fmt(check.action_kn)} kN</dd></div>
        <div><dt>Design capacity φN</dt><dd>{fmt(check.design_capacity_kn)} kN</dd></div>
        <div><dt>Nominal capacity</dt><dd>{fmt(check.nominal_capacity_kn)} kN</dd></div>
        <div><dt>Governing mode</dt><dd>{check.governing_mode}</dd></div>
      </dl>
      {extra}
    </article>
  );
}

export function SteelAxialResults({ result }: { result: SteelAxialResult }) {
  return (
    <div className={styles.results}>
      <p className={styles.note}>{result.standard} · {result.scope} · φ = {fmt(result.capacity_factor, 2)}</p>
      <UtilisationCard title="Tension" check={result.tension} extra={
        <p className={styles.note}>Gross yielding {fmt(result.tension_nominal_modes_kn.gross_yielding)} kN · net fracture {fmt(result.tension_nominal_modes_kn.net_fracture)} kN</p>
      } />
      <UtilisationCard title="Compression · section" check={result.compression} />
      {result.warnings.length ? (
        <details className={styles.limits}>
          <summary>Scope and limitations · {result.warnings.length}</summary>
          <ul>{result.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}
