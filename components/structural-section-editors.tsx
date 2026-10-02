"use client";

import { PointerEvent, type ReactNode, useRef, useState } from "react";

import styles from "./structural-section-editors.module.css";
import {
  barAreaFromDiameter,
  barDiameterFromArea,
  cageBars,
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

/**
 * Calculation-sheet row: name, symbol, value and unit on one line, so inputs read like a
 * hand calculation. `compact` keeps the stacked style for inline toolbars.
 */
function NumberField({ label, symbol, unit, value, onChange, hint, min, max, step = "any", disabled, compact, invalid }: {
  label: string; symbol?: string; unit?: string; value: unknown; onChange: (next: string) => void; hint?: string;
  min?: number; max?: number; step?: string; disabled?: boolean; compact?: boolean; invalid?: boolean;
}) {
  if (!compact) {
    return (
      <label className={invalid ? `${styles.row} ${styles.rowInvalid}` : styles.row}>
        <span className={styles.rowLabel}>{label}{hint ? <small>{hint}</small> : null}</span>
        <span className={styles.rowSymbol}>{symbol}</span>
        <input type="number" inputMode="decimal" step={step} min={min} max={max} value={String(value ?? "")} disabled={disabled}
          aria-invalid={invalid || undefined} onChange={(event) => onChange(event.target.value)} />
        <span className={styles.rowUnit}>{unit}</span>
      </label>
    );
  }
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
/* Calculation-sheet summary primitives (shared by both section sheets) */
/* ------------------------------------------------------------------ */

export type SheetChip = { label: string; value: string; tone: "pass" | "fail" | "info" };

/** Header strip of check chips, read at a glance like a calculation sheet's status bar. */
export function CheckChips({ chips, stale }: { chips: SheetChip[]; stale?: boolean }) {
  return (
    <div className={`${styles.chipStrip} ${stale ? styles.staleOverlay : ""}`} role="list" aria-label="Check status">
      {chips.map((chip) => (
        <div className={styles.chipBox} role="listitem" key={chip.label}>
          <span>{chip.label}</span>
          <b className={chip.tone === "pass" ? styles.chipPass : chip.tone === "fail" ? styles.chipFail : styles.chipInfo}>{chip.value}</b>
        </div>
      ))}
    </div>
  );
}

function UtilChip({ utilisation }: { utilisation: number }) {
  const pass = utilisation <= 1;
  return <span className={pass ? styles.utilChipPass : styles.utilChipFail}>{fmt(utilisation * 100, 0)}%</span>;
}

function SummaryRow({ label, symbol, value, unit, utilisation }: {
  label: string; symbol: ReactNode; value: string; unit?: string; utilisation?: number;
}) {
  return (
    <div className={styles.summaryLine}>
      <span>{label}</span>
      <i>{symbol} =</i>
      <b>{value}{unit ? <small> {unit}</small> : null}</b>
      <span>{utilisation !== undefined && Number.isFinite(utilisation) ? <UtilChip utilisation={utilisation} /> : null}</span>
    </div>
  );
}

/** Headline result card, styled like the product preview: status pill, big value, trace rows. */
function ResultHero({ label, value, unit, status, tone, trace }: {
  label: ReactNode; value: string; unit?: string; status: string; tone: "pass" | "fail" | "info";
  trace: Array<[string, string]>;
}) {
  return (
    <section className={styles.heroCard}>
      <span className={tone === "pass" ? styles.heroPass : tone === "fail" ? styles.heroFail : styles.heroInfo}>{status}</span>
      <small>{label}</small>
      <div className={styles.heroValue}>{value}{unit ? <span> {unit}</span> : null}</div>
      {trace.map(([key, text]) => (
        <div className={styles.traceRow} key={key}><span>{key}</span><b>{text}</b></div>
      ))}
    </section>
  );
}

function SummaryCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.summaryCard}>
      <h4>{title}</h4>
      {children}
    </section>
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

type CageState = { cover: string; tie: string; bottomCount: string; bottomDia: string; topCount: string; topDia: string; sideCount: string; sideDia: string };

const DEFAULT_CAGE: CageState = { cover: "40", tie: "10", bottomCount: "3", bottomDia: "20", topCount: "2", topDia: "16", sideCount: "0", sideDia: "12" };

function cageFrom(cage: CageState, width: number, depth: number) {
  return cageBars({
    width, depth, coverMm: num(cage.cover), tieMm: num(cage.tie),
    bottom: { count: Number(cage.bottomCount || 0), diameterMm: num(cage.bottomDia) },
    top: { count: Number(cage.topCount || 0), diameterMm: num(cage.topDia) },
    sidePerFace: Number(cage.sideCount || 0), sideDiameterMm: num(cage.sideDia),
  });
}

/** Row with a bar count and a bar size, e.g. "Bottom bars  n = [3] × Ø[20] mm". */
function BarsRow({ label, count, diameter, onCount, onDiameter, disabled, sizes = BAR_SIZES }: {
  label: string; count: string; diameter: string; onCount: (value: string) => void; onDiameter: (value: string) => void; disabled?: boolean; sizes?: number[];
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowSymbol}>n</span>
      <span className={styles.barsPair}>
        <input type="number" min={0} step={1} value={count} disabled={disabled} aria-label={`${label} count`} onChange={(event) => onCount(event.target.value)} />
        <span aria-hidden="true">× Ø</span>
        <select value={diameter} disabled={disabled} aria-label={`${label} diameter`} onChange={(event) => onDiameter(event.target.value)}>
          {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </span>
      <span className={styles.rowUnit}>mm</span>
    </div>
  );
}

export function ConcreteSectionEditor({ values, onChange, result, resultCurrent, disabled, aside }: {
  values: Values;
  onChange: (next: Values) => void;
  result: ConcreteSectionResult | null;
  resultCurrent: boolean;
  disabled?: boolean;
  /** Results panel shown under the section preview, as in a calculation sheet's output column. */
  aside?: ReactNode;
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
  const [mode, setMode] = useState<"cage" | "custom">(() => bars.length ? "custom" : "cage");
  const [cage, setCage] = useState<CageState>(DEFAULT_CAGE);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; moved: boolean } | null>(null);

  const setSection = (patch: Values) => onChange({ ...values, section: { ...section, ...patch } });
  // Any direct bar edit leaves the parametric cage so it never overwrites manual changes.
  const setBars = (next: Values[]) => { setMode("custom"); setSection({ bars: next }); };

  function setGeometry(field: "width_mm" | "depth_mm", value: string) {
    if (mode !== "cage") return setSection({ [field]: value });
    const next = cageFrom(cage, field === "width_mm" ? num(value) : width, field === "depth_mm" ? num(value) : depth);
    setSection({ [field]: value, ...(next.error ? {} : { bars: next.bars }) });
  }

  function updateCage(patch: Partial<CageState>) {
    const nextCage = { ...cage, ...patch };
    setCage(nextCage);
    const next = cageFrom(nextCage, width, depth);
    if (!next.error) setSection({ bars: next.bars });
  }

  function switchToCage() {
    setMode("cage");
    const next = cageFrom(cage, width, depth);
    if (!next.error) setSection({ bars: next.bars });
  }
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
  const cageResult = mode === "cage" ? cageFrom(cage, width, depth) : null;

  return (
    <div className={styles.editor}>
      <div className={styles.appLayout}>
        <div className={styles.inputColumn}>
          <div className={styles.columnHead}>
            <span>Inputs</span>
            <button type="button" className={styles.ghostButton} disabled={disabled} onClick={() => { onChange(structuredClone(CONCRETE_SECTION_EXAMPLE)); setMode("custom"); setSelectedBar(null); }}>
              Load example
            </button>
          </div>

          <fieldset className={styles.group} disabled={disabled}>
            <legend><i>01</i>Section definition</legend>
            <div className={styles.shapeCards} role="radiogroup" aria-label="Section shape">
              <button type="button" role="radio" aria-checked="true" className={styles.shapeCardActive}><strong>Rectangle</strong><small>b × D</small></button>
              <button type="button" role="radio" aria-checked="false" disabled className={styles.shapeCard} title="Not supported by the engine yet"><strong>Tee</strong><small>coming later</small></button>
              <button type="button" role="radio" aria-checked="false" disabled className={styles.shapeCard} title="Not supported by the engine yet"><strong>Circle</strong><small>coming later</small></button>
            </div>
            <div className={styles.rows}>
              <NumberField label="Width" symbol="b" invalid={!(width > 0)} unit="mm" value={section.width_mm} min={0} onChange={(value) => setGeometry("width_mm", value)} />
              <NumberField label="Total depth" symbol="D" invalid={!(depth > 0)} unit="mm" value={section.depth_mm} min={0} onChange={(value) => setGeometry("depth_mm", value)} />
            </div>
          </fieldset>

          <fieldset className={styles.group} disabled={disabled}>
            <legend><i>02</i>Reinforcement · {bars.length} bars · As = {fmt(steelArea, 0)} mm²{validShape ? ` · ${fmt((100 * steelArea) / (width * depth), 2)}%` : ""}</legend>
            <div className={styles.modeSwitch} role="tablist" aria-label="Reinforcement input">
              <button type="button" role="tab" aria-selected={mode === "cage"} className={mode === "cage" ? styles.modeActive : styles.modeTab} onClick={switchToCage}>Cage</button>
              <button type="button" role="tab" aria-selected={mode === "custom"} className={mode === "custom" ? styles.modeActive : styles.modeTab} onClick={() => setMode("custom")}>Custom bars</button>
            </div>
            {mode === "cage" ? (
              <div className={styles.rows}>
                <NumberField label="Clear cover" symbol="c" unit="mm" value={cage.cover} min={0} onChange={(value) => updateCage({ cover: value })} hint="To the tie, all faces" />
                <label className={styles.row}>
                  <span className={styles.rowLabel}>Tie / stirrup size</span>
                  <span className={styles.rowSymbol}>Ø<sub>t</sub></span>
                  <select value={cage.tie} onChange={(event) => updateCage({ tie: event.target.value })}>
                    {[0, 6, 10, 12, 16].map((size) => <option key={size} value={size}>{size || "none"}</option>)}
                  </select>
                  <span className={styles.rowUnit}>mm</span>
                </label>
                <BarsRow label="Bottom bars" count={cage.bottomCount} diameter={cage.bottomDia} onCount={(value) => updateCage({ bottomCount: value })} onDiameter={(value) => updateCage({ bottomDia: value })} />
                <BarsRow label="Top bars" count={cage.topCount} diameter={cage.topDia} onCount={(value) => updateCage({ topCount: value })} onDiameter={(value) => updateCage({ topDia: value })} />
                <BarsRow label="Side bars per face" count={cage.sideCount} diameter={cage.sideDia} onCount={(value) => updateCage({ sideCount: value })} onDiameter={(value) => updateCage({ sideDia: value })} />
                {cageResult?.error ? <p className={styles.warning}>{cageResult.error}</p> : <p className={styles.note}>Bar centres sit at cover + tie + Ø/2. Spacing and detailing are not checked; switch to Custom bars to fine-tune.</p>}
              </div>
            ) : (
              <>
                {bars.length ? <button type="button" className={styles.textButton} onClick={() => { setBars([]); setSelectedBar(null); }}>Remove all bars</button> : null}
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
              </>
            )}
          </fieldset>

          <fieldset className={styles.group} disabled={disabled}>
            <legend><i>03</i>Materials</legend>
            <p className={styles.subhead}>Concrete</p>
            <div className={styles.rows}>
            <NumberField label="Compressive strength" symbol="f′c" unit="MPa" value={concrete.compressive_strength_mpa} onChange={(value) => setGroup("concrete", "compressive_strength_mpa", value)} />
            <NumberField label="Elastic modulus" symbol="Ec" unit="MPa" value={concrete.elastic_modulus_mpa} onChange={(value) => setGroup("concrete", "elastic_modulus_mpa", value)} />
            <NumberField label="Stress block intensity" symbol="α" value={concrete.stress_block_alpha} onChange={(value) => setGroup("concrete", "stress_block_alpha", value)} />
            <NumberField label="Stress block depth" symbol="γ" value={concrete.stress_block_gamma} onChange={(value) => setGroup("concrete", "stress_block_gamma", value)} />
            <NumberField label="Ultimate compressive strain" symbol="εcu" value={concrete.ultimate_compressive_strain} onChange={(value) => setGroup("concrete", "ultimate_compressive_strain", value)} />
            <NumberField label="Density" symbol="ρc" unit="kg/m³" value={concrete.density_kg_m3} onChange={(value) => setGroup("concrete", "density_kg_m3", value)} />
            </div>
            <p className={styles.subhead}>Reinforcement</p>
            <div className={styles.rows}>
            <NumberField label="Yield strength" symbol="fsy" unit="MPa" value={steel.yield_strength_mpa} onChange={(value) => setGroup("steel", "yield_strength_mpa", value)} />
            <NumberField label="Elastic modulus" symbol="Es" unit="MPa" value={steel.elastic_modulus_mpa} onChange={(value) => setGroup("steel", "elastic_modulus_mpa", value)} />
            <NumberField label="Fracture strain" symbol="εsu" value={steel.fracture_strain} onChange={(value) => setGroup("steel", "fracture_strain", value)} />
            <NumberField label="Density" symbol="ρs" unit="kg/m³" value={steel.density_kg_m3} onChange={(value) => setGroup("steel", "density_kg_m3", value)} />
            </div>
            <p className={styles.note}>Coefficients are supplied explicitly. No AS 3600 values are derived from f′c.</p>
          </fieldset>

          <fieldset className={styles.group} disabled={disabled}>
            <legend><i>04</i>Section response actions</legend>
            <NumberField label="Axial force" symbol="N" unit="kN" value={values.axial_force_kn} onChange={(value) => onChange({ ...values, axial_force_kn: value })} hint="Positive compression; negative tension." />
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

        <div className={styles.outputColumn}>
          <section className={styles.panel}>
            <header className={styles.panelHead}><small>Geometry</small><strong>Section preview</strong></header>
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
              <text x="200" y="164" textAnchor="middle" className={styles.emptyCanvasHint}>or load the illustrative example</text>
            </>}
          </svg>
          <figcaption className={styles.canvasLegend}>
            <label className={styles.placeField}>Click to place Ø
              <input type="number" min={0} step="any" value={placeDiameter} onChange={(event) => setPlaceDiameter(event.target.value)} aria-label="Diameter of bars placed by clicking" disabled={disabled} />
              mm · drag to move · Delete removes{mode === "cage" ? " · editing switches to custom bars" : ""}
            </label>
            {overlay ? <span><i className={styles.legendZone} /> compression zone {resultCurrent ? "" : "(previous inputs)"}</span> : null}
            {centroid ? <span><i className={styles.legendCentroid} /> elastic centroid</span> : null}
          </figcaption>
            </figure>
          </section>
          {aside}
        </div>
      </div>
    </div>
  );
}

export function concreteChips(result: ConcreteSectionResult): SheetChip[] {
  const ultimate = result.ultimate;
  return [
    { label: "Mu nominal", value: `${fmt(num(ultimate.resultant_moment_knm))} kN·m`, tone: "info" },
    { label: "dn", value: `${fmt(num(ultimate.neutral_axis_depth_mm), 0)} mm`, tone: "info" },
    { label: "εs,max", value: fmt(num(ultimate.maximum_steel_strain), 4), tone: "info" },
    { label: "Code check", value: "Not included", tone: "info" },
  ];
}

export function ConcreteSectionResults({ result }: { result: ConcreteSectionResult }) {
  const gross = result.gross_properties;
  const ultimate = result.ultimate;
  return (
    <div className={styles.results}>
      <ResultHero
        label={<>M<sub>u</sub> — nominal moment capacity</>}
        value={fmt(num(ultimate.resultant_moment_knm))}
        unit="kN·m"
        status="NOMINAL"
        tone="info"
        trace={[
          ["Standard", "AS 3600 checks not included"],
          ["Scope", "Section mechanics"],
          ["Engine", `${result.solver?.name ?? "concreteproperties"}${result.solver?.version ? ` ${result.solver.version}` : ""}`],
        ]}
      />
      <SummaryCard title="Ultimate bending · nominal">
        <SummaryRow label="Moment capacity (resultant)" symbol={<>M<sub>u</sub></>} value={fmt(num(ultimate.resultant_moment_knm))} unit="kN·m" />
        <SummaryRow label="Moment about x" symbol={<>M<sub>x</sub></>} value={fmt(num(ultimate.moment_x_knm))} unit="kN·m" />
        <SummaryRow label="Moment about y" symbol={<>M<sub>y</sub></>} value={fmt(num(ultimate.moment_y_knm))} unit="kN·m" />
        <SummaryRow label="Neutral-axis depth" symbol={<>d<sub>n</sub></>} value={fmt(num(ultimate.neutral_axis_depth_mm))} unit="mm" />
        <SummaryRow label="Maximum steel strain" symbol={<>ε<sub>s,max</sub></>} value={fmt(num(ultimate.maximum_steel_strain), 4)} />
        <SummaryRow label="Axial force · equilibrium error" symbol="N" value={`${fmt(num(ultimate.axial_force_kn), 2)} · ${fmt(num(ultimate.axial_equilibrium_error_kn), 3)}`} unit="kN" />
      </SummaryCard>
      <SummaryCard title="Gross section">
        <SummaryRow label="Steel area" symbol={<>A<sub>s</sub></>} value={fmt(num(gross.steel_area_mm2), 0)} unit="mm²" />
        <SummaryRow label="Elastic centroid" symbol={<>x̄, ȳ</>} value={`${fmt(num(gross.elastic_centroid_x_mm))}, ${fmt(num(gross.elastic_centroid_y_mm))}`} unit="mm" />
        <SummaryRow label="Flexural rigidity" symbol={<>EI<sub>xx</sub>, EI<sub>yy</sub></>} value={`${fmt(num(gross.ei_xx_n_mm2) / 1e12, 2)}, ${fmt(num(gross.ei_yy_n_mm2) / 1e12, 2)}`} unit="×10¹² N·mm²" />
        <SummaryRow label="Mass" symbol="m" value={fmt(num(gross.mass_per_length_kg_m))} unit="kg/m" />
      </SummaryCard>
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

export function SteelAxialEditor({ values, onChange, disabled, aside }: { values: Values; onChange: (next: Values) => void; disabled?: boolean; aside?: ReactNode }) {
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
      <div className={styles.appLayout}>
      <div className={styles.inputColumn}>
      <div className={styles.columnHead}>
        <span>Inputs</span>
        <button type="button" className={styles.ghostButton} disabled={disabled} onClick={() => onChange({ ...STEEL_AXIAL_EXAMPLE })}>Load example</button>
      </div>
      <div className={styles.sheet}>
        <fieldset className={styles.group} disabled={disabled}>
          <legend><i>01</i>Section</legend>
          <NumberField label="Gross area" symbol="Ag" unit="mm²" value={values.gross_area_mm2} min={0} onChange={set("gross_area_mm2")} />
          <NumberField label="Net area" symbol="An" invalid={an > ag} unit="mm²" value={values.net_area_mm2} min={0} onChange={set("net_area_mm2")} hint={ag > 0 && an > 0 ? `An / Ag = ${fmt(an / ag, 3)}` : "Deduct holes and penetrations."} />
        </fieldset>
        <fieldset className={styles.group} disabled={disabled}>
          <legend><i>02</i>Material</legend>
          <NumberField label="Yield strength" symbol="fy" unit="MPa" value={values.yield_strength_mpa} min={0} onChange={set("yield_strength_mpa")} />
          <NumberField label="Tensile strength" symbol="fu" invalid={fu < fy} unit="MPa" value={values.ultimate_strength_mpa} min={0} onChange={set("ultimate_strength_mpa")} hint="Use values for the actual product and thickness; a grade label alone is insufficient." />
        </fieldset>
        <fieldset className={styles.group} disabled={disabled}>
          <legend><i>03</i>Assessed factors</legend>
          <NumberField label="Tension distribution factor" symbol="kt" value={values.tension_distribution_factor} min={0} max={1} onChange={set("tension_distribution_factor")} hint="Assessed for the end connection; no default is applied." />
          <NumberField label="Form factor" symbol="kf" value={values.compression_form_factor} min={0} max={1} onChange={set("compression_form_factor")} hint="Assessed for local buckling of the section; no default is applied." />
        </fieldset>
        <fieldset className={styles.group} disabled={disabled}>
          <legend><i>04</i>Design actions</legend>
          <NumberField label="Design tension" symbol="N*t" unit="kN" value={values.tension_action_kn} min={0} onChange={set("tension_action_kn")} />
          <NumberField label="Design compression" symbol="N*c" unit="kN" value={values.compression_action_kn} min={0} onChange={set("compression_action_kn")} hint="Factored magnitudes, entered as nonnegative values." />
        </fieldset>
      </div>
      {issues.map((issue) => <p className={styles.warning} key={issue}>{issue}</p>)}
      </div>
      <div className={styles.outputColumn}>{aside}</div>
      </div>
    </div>
  );
}

export function steelChips(result: SteelAxialResult): SheetChip[] {
  const governing = Math.max(result.tension.utilisation, result.compression.utilisation);
  const tone = (utilisation: number) => (utilisation <= 1 ? "pass" : "fail") as SheetChip["tone"];
  return [
    { label: "Tension", value: `${fmt(result.tension.utilisation * 100, 0)}%`, tone: tone(result.tension.utilisation) },
    { label: "Compression", value: `${fmt(result.compression.utilisation * 100, 0)}%`, tone: tone(result.compression.utilisation) },
    { label: "Governing", value: `${fmt(governing * 100, 0)}%`, tone: tone(governing) },
  ];
}

export function SteelAxialResults({ result }: { result: SteelAxialResult }) {
  const governing = Math.max(result.tension.utilisation, result.compression.utilisation);
  const governingCheck = result.tension.utilisation >= result.compression.utilisation ? "tension" : "compression";
  return (
    <div className={styles.results}>
      <ResultHero
        label={`Governing utilisation — ${governingCheck}`}
        value={fmt(governing * 100, 0)}
        unit="%"
        status={governing <= 1 ? "OK" : "EXCEEDED"}
        tone={governing <= 1 ? "pass" : "fail"}
        trace={[
          ["Standard", result.standard],
          ["Reference", governingCheck === "tension" ? "Clause 7.2" : "Clause 6.2.1"],
          ["Scope", "Section axial capacity"],
        ]}
      />
      <SummaryCard title="Tension · Cl. 7.2">
        <SummaryRow label="Design tension" symbol={<>N*<sub>t</sub></>} value={fmt(result.tension.action_kn)} unit="kN" />
        <SummaryRow label="Gross section yielding" symbol={<>N<sub>t,y</sub></>} value={fmt(result.tension_nominal_modes_kn.gross_yielding)} unit="kN" />
        <SummaryRow label="Net section fracture" symbol={<>N<sub>t,f</sub></>} value={fmt(result.tension_nominal_modes_kn.net_fracture)} unit="kN" />
        <SummaryRow label="Design tension capacity" symbol={<>φN<sub>t</sub></>} value={fmt(result.tension.design_capacity_kn)} unit="kN" utilisation={result.tension.utilisation} />
        <p className={styles.note}>Governed by {result.tension.governing_mode}.</p>
      </SummaryCard>
      <SummaryCard title="Compression · Cl. 6.2.1">
        <SummaryRow label="Design compression" symbol={<>N*<sub>c</sub></>} value={fmt(result.compression.action_kn)} unit="kN" />
        <SummaryRow label="Nominal section capacity" symbol={<>N<sub>s</sub></>} value={fmt(result.compression.nominal_capacity_kn)} unit="kN" />
        <SummaryRow label="Design section capacity" symbol={<>φN<sub>s</sub></>} value={fmt(result.compression.design_capacity_kn)} unit="kN" utilisation={result.compression.utilisation} />
      </SummaryCard>
      <p className={styles.note}>{result.standard} · {result.scope} · φ = {fmt(result.capacity_factor, 2)}</p>
      {result.warnings.length ? (
        <details className={styles.limits}>
          <summary>Scope and limitations · {result.warnings.length}</summary>
          <ul>{result.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}
