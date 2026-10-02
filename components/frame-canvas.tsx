"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState, WheelEvent } from "react";

import styles from "./pynite-workbench.module.css";
import type { FrameModel, PyniteNodeResult, PyniteResult } from "@/lib/pynite-model";
import {
  add,
  autoMagnification,
  cameraBasis,
  deformedMemberPoints,
  memberEnds,
  memberLocalAxes,
  modelExtent,
  nodePosition,
  projectPoint,
  scale,
  snap,
  unprojectToPlane,
  VIEW_PRESETS,
  type Camera,
  type Vec3,
  type ViewPreset,
} from "@/lib/frame-geometry";

export type DiagramKind = "moment_z_knm" | "moment_y_knm" | "shear_y_kn" | "shear_z_kn" | "axial_kn";
export type CanvasOverlay = "none" | "deformed" | DiagramKind;
export type CanvasTool = "select" | "node" | "member";

export const OVERLAY_CHOICES: Array<{ value: CanvasOverlay; label: string; unit?: string }> = [
  { value: "none", label: "Model only" },
  { value: "deformed", label: "Deformed shape" },
  { value: "moment_z_knm", label: "Moment Mz", unit: "kN·m" },
  { value: "moment_y_knm", label: "Moment My", unit: "kN·m" },
  { value: "shear_y_kn", label: "Shear Vy", unit: "kN" },
  { value: "shear_z_kn", label: "Shear Vz", unit: "kN" },
  { value: "axial_kn", label: "Axial N", unit: "kN" },
];

/** Bending about local z acts in the local x–y plane, so it is drawn along local y (and so on). */
const DIAGRAM_AXIS: Record<DiagramKind, "y" | "z"> = {
  moment_z_knm: "y",
  shear_y_kn: "y",
  moment_y_knm: "z",
  shear_z_kn: "z",
  axial_kn: "y",
};

const WIDTH = 900;
const HEIGHT = 590;
const GLOBAL_AXES: Record<"X" | "Y" | "Z", Vec3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

type Fit = { cx: number; cy: number; s: number };
type Drag =
  | { kind: "orbit"; x: number; y: number; camera: Camera }
  | { kind: "pan"; x: number; y: number; pan: { x: number; y: number } }
  | { kind: "node"; id: string; moved: boolean };

function fmt(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
}

function screenDirection(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length > 1e-6 ? { x: dx / length, y: dy / length } : null;
}

export function FrameCanvas({
  model,
  selectedNode,
  selectedMember,
  result,
  resultCurrent,
  activeCombo,
  showLoads,
  overlay,
  magnifier,
  editable,
  onSelectNode,
  onSelectMember,
  onMoveNode,
  onAddNode,
  onConnect,
}: {
  model: FrameModel;
  selectedNode: string;
  selectedMember: string;
  result: PyniteResult | null;
  resultCurrent: boolean;
  activeCombo: string;
  showLoads: boolean;
  overlay: CanvasOverlay;
  magnifier: number;
  editable: boolean;
  onSelectNode: (id: string) => void;
  onSelectMember: (id: string) => void;
  onMoveNode: (id: string, position: Vec3) => void;
  onAddNode: (position: Vec3) => void;
  onConnect: (startNode: string, endNode: string) => void;
}) {
  const [view, setView] = useState<ViewPreset>("iso");
  const [camera, setCamera] = useState<Camera>(VIEW_PRESETS.iso);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<CanvasTool>("select");
  const [gridStep, setGridStep] = useState(0.5);
  const [plane, setPlane] = useState("0");
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [frozenFit, setFrozenFit] = useState<Fit | null>(null);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const isEditableView = view !== "iso" && VIEW_PRESETS[view].editable;
  const canEdit = editable && isEditableView;
  const activeTool: CanvasTool = canEdit ? tool : "select";
  const basis = cameraBasis(camera);

  useEffect(() => {
    if (!pendingStart) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") setPendingStart(null); };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [pendingStart]);

  const computedFit = useMemo((): Fit => {
    const projected = model.nodes.map((node) => projectPoint(nodePosition(node), camera));
    if (!projected.length) return { cx: 0, cy: 0, s: 60 * zoom };
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1);
    const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 1);
    return {
      cx: (Math.max(...xs) + Math.min(...xs)) / 2,
      cy: (Math.max(...ys) + Math.min(...ys)) / 2,
      s: Math.min((WIDTH - 170) / spanX, (HEIGHT - 150) / spanY) * zoom,
    };
  }, [camera, model.nodes, zoom]);
  const fit = frozenFit ?? computedFit;

  const toScreen = (point: Vec3) => {
    const projected = projectPoint(point, camera);
    return { x: WIDTH / 2 + (projected.x - fit.cx) * fit.s + pan.x, y: HEIGHT / 2 - (projected.y - fit.cy) * fit.s + pan.y };
  };
  const fromScreen = (x: number, y: number) => ({
    x: (x - WIDTH / 2 - pan.x) / fit.s + fit.cx,
    y: -(y - HEIGHT / 2 - pan.y) / fit.s + fit.cy,
  });

  function chooseView(next: ViewPreset) {
    setView(next);
    setCamera(VIEW_PRESETS[next]);
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setPendingStart(null);
    const node = model.nodes.find((item) => item.id === selectedNode);
    if (node && next !== "iso") {
      const toward = cameraBasis(VIEW_PRESETS[next]).toward;
      setPlane(String(Number((nodePosition(node)[0] * toward[0] + nodePosition(node)[1] * toward[1] + nodePosition(node)[2] * toward[2]).toFixed(6))));
    }
  }

  function svgPoint(event: PointerEvent<SVGSVGElement>) {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  /** Global point under the cursor on the working plane, snapped in the two in-plane axes. */
  function planePoint(screen: { x: number; y: number }, depth: number, keep?: Vec3): Vec3 | null {
    const point = unprojectToPlane(fromScreen(screen.x, screen.y), camera, depth);
    if (!point) return null;
    return point.map((value, axis) => Math.abs(basis.toward[axis]) > 0.5 ? (keep ? keep[axis] : value) : snap(value, gridStep)) as Vec3;
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as SVGElement;
    const nodeId = target.closest<SVGElement>("[data-node]")?.dataset.node;
    const memberId = target.closest<SVGElement>("[data-member]")?.dataset.member;
    const screen = svgPoint(event);
    if (!screen) return;

    if (nodeId && event.button === 0) {
      onSelectNode(nodeId);
      if (activeTool === "member") {
        if (pendingStart && pendingStart !== nodeId) {
          onConnect(pendingStart, nodeId);
          setPendingStart(nodeId);
        } else {
          setPendingStart(nodeId);
        }
        return;
      }
      if (activeTool === "select" && canEdit) {
        drag.current = { kind: "node", id: nodeId, moved: false };
        setFrozenFit(computedFit);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (memberId && event.button === 0 && activeTool !== "member") {
      onSelectMember(memberId);
      return;
    }
    if (activeTool === "node" && event.button === 0) {
      const depth = Number(plane);
      const point = Number.isFinite(depth) ? planePoint(screen, depth) : null;
      if (point) onAddNode(point);
      return;
    }
    if (activeTool === "member" && event.button === 0) {
      setPendingStart(null);
      return;
    }
    drag.current = isEditableView || event.button === 1 || event.shiftKey
      ? { kind: "pan", x: event.clientX, y: event.clientY, pan }
      : { kind: "orbit", x: event.clientX, y: event.clientY, camera };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (activeTool === "member" && pendingStart) setCursor(svgPoint(event));
    if (!current) return;
    if (current.kind === "orbit") {
      setView("iso");
      setCamera({
        yawDeg: current.camera.yawDeg + (event.clientX - current.x) * 0.45,
        pitchDeg: Math.max(-89, Math.min(89, current.camera.pitchDeg + (event.clientY - current.y) * 0.35)),
      });
    } else if (current.kind === "pan") {
      const ratio = svgRef.current ? WIDTH / svgRef.current.getBoundingClientRect().width : 1;
      setPan({ x: current.pan.x + (event.clientX - current.x) * ratio, y: current.pan.y + (event.clientY - current.y) * ratio });
    } else {
      const node = model.nodes.find((item) => item.id === current.id);
      const screen = svgPoint(event);
      if (!node || !screen) return;
      const original = nodePosition(node);
      const depth = original[0] * basis.toward[0] + original[1] * basis.toward[1] + original[2] * basis.toward[2];
      const next = planePoint(screen, depth, original);
      if (next && next.some((value, axis) => value !== original[axis])) {
        current.moved = true;
        onMoveNode(current.id, next);
      }
    }
  }

  function endDrag() {
    drag.current = null;
    setFrozenFit(null);
  }

  function onWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setZoom((current) => Math.max(0.3, Math.min(6, current * (event.deltaY > 0 ? 0.9 : 1.1))));
  }

  // ---------- result overlays ----------
  const comboMembers = useMemo(
    () => result?.member_results.filter((item) => item.load_combination === activeCombo) ?? [],
    [activeCombo, result],
  );
  const comboNodes = useMemo(
    () => result?.node_results.filter((item) => item.load_combination === activeCombo) ?? [],
    [activeCombo, result],
  );
  const extent = modelExtent(model);
  const magnification = useMemo(
    () => autoMagnification(model, comboMembers) * magnifier,
    [comboMembers, magnifier, model],
  );
  const diagramScale = useMemo(() => {
    if (overlay === "none" || overlay === "deformed") return 0;
    const maxAbs = comboMembers.reduce((maximum, member) => member.stations.reduce(
      (inner, station) => Number.isFinite(station[overlay]) ? Math.max(inner, Math.abs(station[overlay])) : inner,
      maximum,
    ), 0);
    return maxAbs > 1e-12 ? (extent * 0.14 * magnifier) / maxAbs : 0;
  }, [comboMembers, extent, magnifier, overlay]);

  const maxLineLoad = Math.max(1e-9, ...model.member_distributed_loads.map((load) => Math.max(Math.abs(load.start_kn_m), Math.abs(load.end_kn_m))));
  const reactionsShown = result && comboNodes.length && overlay !== "none";
  const maxReaction = Math.max(1e-9, ...comboNodes.map((node) => Math.max(Math.abs(node.reaction_fx_kn), Math.abs(node.reaction_fy_kn), Math.abs(node.reaction_fz_kn))));

  function forceArrow(key: string, tip: Vec3, direction: Vec3, length: number, className: string, label?: string) {
    const head = toScreen(tip);
    const towardTip = screenDirection(toScreen(add(tip, scale(direction, -extent * 0.01))), head);
    if (!towardTip) {
      return (
        <g key={key} className={className}>
          <circle cx={head.x} cy={head.y} r={6} fill="none" strokeWidth={1.6} />
          <circle cx={head.x} cy={head.y} r={1.6} />
          {label ? <text x={head.x + 9} y={head.y - 7}>{label}</text> : null}
        </g>
      );
    }
    const tail = { x: head.x - towardTip.x * length, y: head.y - towardTip.y * length };
    return (
      <g key={key} className={className}>
        <line x1={tail.x} y1={tail.y} x2={head.x} y2={head.y} strokeWidth={1.6} markerEnd={`url(#arrow-${className === styles.reactionArrow ? "reaction" : "load"})`} />
        {label ? <text x={tail.x + (tail.x >= head.x ? 4 : -4)} y={tail.y - 4} textAnchor={tail.x >= head.x ? "start" : "end"}>{label}</text> : null}
      </g>
    );
  }

  const triad = (["X", "Y", "Z"] as const).map((axis) => {
    const projected = projectPoint(GLOBAL_AXES[axis], camera);
    return { axis, x: 70 + projected.x * 42, y: 520 - projected.y * 42, visible: Math.hypot(projected.x, projected.y) > 0.15 };
  });
  const pendingNode = pendingStart ? model.nodes.find((node) => node.id === pendingStart) : undefined;

  return (
    <div className={styles.canvasFrame}>
      <div className={styles.canvasTools}>
        <div className={styles.segmented} role="group" aria-label="View">
          {(Object.keys(VIEW_PRESETS) as ViewPreset[]).map((key) => (
            <button type="button" key={key} aria-pressed={view === key} className={view === key ? styles.segmentActive : styles.segment} onClick={() => chooseView(key)}>
              {VIEW_PRESETS[key].label}
            </button>
          ))}
        </div>
        <div className={styles.segmented} role="group" aria-label="Editing tool">
          {([["select", "Select / move"], ["node", "Add node"], ["member", "Draw member"]] as const).map(([key, label]) => (
            <button type="button" key={key} aria-pressed={activeTool === key} disabled={!canEdit && key !== "select"}
              className={activeTool === key ? styles.segmentActive : styles.segment}
              title={canEdit ? undefined : "Switch to an elevation, plan or side view to edit geometry"}
              onClick={() => { setTool(key); setPendingStart(null); }}>
              {label}
            </button>
          ))}
        </div>
        {canEdit ? (
          <div className={styles.canvasInputs}>
            <label>Grid<select value={gridStep} onChange={(event) => setGridStep(Number(event.target.value))}>
              {[0.05, 0.1, 0.25, 0.5, 1].map((step) => <option key={step} value={step}>{step} m</option>)}
            </select></label>
            <label>{view === "front" ? "Z" : view === "plan" ? "Y" : "X"} plane<input type="number" step="any" value={plane} onChange={(event) => setPlane(event.target.value)} /></label>
          </div>
        ) : null}
        <button type="button" className={styles.fitButton} onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }}>Fit</button>
      </div>
      <svg
        ref={svgRef}
        className={`${styles.canvas} ${activeTool !== "select" ? styles.canvasCrosshair : ""}`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Frame model view. Choose an elevation, plan or side view to add, move and connect nodes."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setCursor(null)}
        onWheel={onWheel}
      >
        <defs>
          <pattern id="fea-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#1b332f" strokeWidth="1" />
          </pattern>
          <marker id="arrow-load" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#f3b18f" />
          </marker>
          <marker id="arrow-reaction" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#78c2ff" />
          </marker>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#fea-grid)" />

        {/* Members, with the original geometry dimmed when a result overlay is drawn. */}
        {model.members.map((member) => {
          const ends = memberEnds(model, member);
          if (!ends) return null;
          const start = toScreen(ends.start);
          const end = toScreen(ends.end);
          const selected = selectedMember === member.id;
          return (
            <g key={member.id} data-member={member.id}>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                className={`${selected ? styles.memberSelected : styles.member} ${overlay !== "none" && result ? styles.memberUnderlay : ""}`} />
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={styles.memberHitArea} />
              <text x={(start.x + end.x) / 2 + 8} y={(start.y + end.y) / 2 - 9} className={styles.memberLabel}>{member.id}</text>
            </g>
          );
        })}

        {result ? (
          <g className={resultCurrent ? undefined : styles.overlayStale} pointerEvents="none">
            {overlay === "deformed" ? comboMembers.map((memberResult) => {
              const member = model.members.find((item) => item.id === memberResult.member_id);
              const points = member ? deformedMemberPoints(model, member, memberResult, magnification) : [];
              return points.length ? (
                <polyline key={memberResult.member_id} className={styles.deformed}
                  points={points.map((point) => { const screen = toScreen(point); return `${screen.x},${screen.y}`; }).join(" ")} />
              ) : null;
            }) : null}
            {overlay !== "none" && overlay !== "deformed" && diagramScale ? comboMembers.map((memberResult) => {
              const member = model.members.find((item) => item.id === memberResult.member_id);
              const ends = member ? memberEnds(model, member) : null;
              const axes = ends && member ? memberLocalAxes(ends.start, ends.end, member.rotation_degrees ?? 0) : null;
              if (!ends || !axes) return null;
              const direction = axes[DIAGRAM_AXIS[overlay]];
              const stations = memberResult.stations.filter((station) => Number.isFinite(station[overlay]) && Number.isFinite(station.x_m));
              if (!stations.length) return null;
              const base = (x: number) => add(ends.start, scale(axes.x, x));
              const curve = stations.map((station) => toScreen(add(base(station.x_m), scale(direction, station[overlay] * diagramScale))));
              const first = toScreen(base(stations[0].x_m));
              const last = toScreen(base(stations[stations.length - 1].x_m));
              const peak = stations.reduce((best, station) => Math.abs(station[overlay]) > Math.abs(best[overlay]) ? station : best, stations[0]);
              const peakPoint = toScreen(add(base(peak.x_m), scale(direction, peak[overlay] * diagramScale)));
              return (
                <g key={memberResult.member_id}>
                  <polygon className={styles.diagramFill} points={[first, ...curve, last].map((point) => `${point.x},${point.y}`).join(" ")} />
                  <polyline className={styles.diagramStroke} points={curve.map((point) => `${point.x},${point.y}`).join(" ")} />
                  {Math.abs(peak[overlay]) > 1e-9 ? <text x={peakPoint.x + 5} y={peakPoint.y - 5} className={styles.diagramLabel}>{fmt(peak[overlay])}</text> : null}
                </g>
              );
            }) : null}
            {reactionsShown ? comboNodes.flatMap((row: PyniteNodeResult) => {
              const node = model.nodes.find((item) => item.id === row.node_id);
              if (!node || !model.supports.some((support) => support.node_id === row.node_id)) return [];
              return ([["X", row.reaction_fx_kn], ["Y", row.reaction_fy_kn], ["Z", row.reaction_fz_kn]] as const)
                .filter(([, value]) => Math.abs(value) > maxReaction * 1e-4)
                .map(([axis, value]) => forceArrow(
                  `reaction-${row.node_id}-${axis}`,
                  nodePosition(node),
                  scale(GLOBAL_AXES[axis], Math.sign(value)),
                  22 + 26 * Math.abs(value) / maxReaction,
                  styles.reactionArrow,
                  `R${axis.toLowerCase()} ${fmt(value)}`,
                ));
            }) : null}
          </g>
        ) : null}

        {showLoads ? (
          <g pointerEvents="none">
            {model.member_distributed_loads.map((load, index) => {
              const member = model.members.find((item) => item.id === load.member_id);
              const ends = member ? memberEnds(model, member) : null;
              const axes = ends && member ? memberLocalAxes(ends.start, ends.end, member.rotation_degrees ?? 0) : null;
              if (!ends || !axes) return null;
              const local = load.direction.length === 2 && load.direction[1] === load.direction[1].toLowerCase();
              const axisKey = load.direction[1].toUpperCase() as "X" | "Y" | "Z";
              const unit = local ? axes[axisKey.toLowerCase() as "x" | "y" | "z"] : GLOBAL_AXES[axisKey];
              const from = Math.max(0, load.start_m ?? 0);
              const to = Math.min(axes.length, load.end_m ?? axes.length);
              const samples = 5;
              return (
                <g key={`dl-${index}`}>
                  {Array.from({ length: samples }, (_, sample) => {
                    const t = sample / (samples - 1);
                    const value = load.start_kn_m + (load.end_kn_m - load.start_kn_m) * t;
                    if (Math.abs(value) < 1e-12) return null;
                    const tip = add(ends.start, scale(axes.x, from + (to - from) * t));
                    return forceArrow(`dl-${index}-${sample}`, tip, scale(unit, Math.sign(value)), 10 + 26 * Math.abs(value) / maxLineLoad, styles.loadArrow,
                      sample === Math.floor(samples / 2) ? `${load.load_case} ${load.direction} ${fmt(load.start_kn_m)}${load.end_kn_m !== load.start_kn_m ? `→${fmt(load.end_kn_m)}` : ""} kN/m` : undefined);
                  })}
                </g>
              );
            })}
            {model.node_loads.map((load, index) => {
              const node = model.nodes.find((item) => item.id === load.node_id);
              if (!node || Math.abs(load.value) < 1e-12) return null;
              if (load.direction.startsWith("M")) {
                const point = toScreen(nodePosition(node));
                return (
                  <g key={`nl-${index}`} className={styles.loadArrow}>
                    <path d={`M ${point.x + 14} ${point.y} A 14 14 0 1 ${load.value > 0 ? 0 : 1} ${point.x} ${point.y - 14}`} fill="none" strokeWidth={1.6} markerEnd="url(#arrow-load)" />
                    <text x={point.x + 16} y={point.y - 14}>{load.load_case} {load.direction} {fmt(load.value)} kN·m</text>
                  </g>
                );
              }
              const axis = load.direction[1] as "X" | "Y" | "Z";
              return forceArrow(`nl-${index}`, nodePosition(node), scale(GLOBAL_AXES[axis], Math.sign(load.value)), 44, styles.loadArrow, `${load.load_case} ${load.direction} ${fmt(load.value)} kN`);
            })}
          </g>
        ) : null}

        {pendingNode && cursor ? (() => {
          const start = toScreen(nodePosition(pendingNode));
          return <line x1={start.x} y1={start.y} x2={cursor.x} y2={cursor.y} className={styles.rubberBand} pointerEvents="none" />;
        })() : null}

        {model.nodes.map((node) => {
          const point = toScreen(nodePosition(node));
          const support = model.supports.find((item) => item.node_id === node.id);
          const fixed = support && support.dx && support.dy && support.dz && support.rx && support.ry && support.rz;
          const selected = selectedNode === node.id || pendingStart === node.id;
          return (
            <g key={node.id} data-node={node.id} className={canEdit && activeTool === "select" ? styles.nodeDraggable : undefined}>
              {support ? fixed
                ? <rect x={point.x - 10} y={point.y + 4} width={20} height={9} className={styles.supportMarker} />
                : <path d={`M${point.x - 11} ${point.y + 19} L${point.x + 11} ${point.y + 19} L${point.x} ${point.y + 3} Z`} className={styles.supportMarker} />
                : null}
              <circle cx={point.x} cy={point.y} r={14} className={styles.nodeHitArea} />
              <circle cx={point.x} cy={point.y} r={selected ? 7 : 5} className={selected ? styles.nodeSelected : styles.node} />
              <text x={point.x + 10} y={point.y + 4} className={styles.nodeLabel}>{node.id}</text>
            </g>
          );
        })}

        <g className={styles.axisMark} pointerEvents="none">
          {triad.map(({ axis, x, y, visible }) => visible ? (
            <g key={axis}>
              <line x1={70} y1={520} x2={x} y2={y} stroke={axis === "X" ? "#93bb9f" : axis === "Y" ? "#e8b971" : "#79a7d9"} strokeWidth={2} />
              <text x={x + (x - 70) * 0.25} y={y + (y - 520) * 0.25 + 3} textAnchor="middle">{axis}</text>
            </g>
          ) : <text key={axis} x={70} y={548 + (axis === "Z" ? 0 : 12)} textAnchor="middle">{axis} ⊙</text>)}
        </g>

        {!model.members.length ? (
          <text x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle" className={styles.canvasEmpty}>
            Switch to an elevation view, then add nodes and draw members
          </text>
        ) : null}
        {result ? (
          <text x={WIDTH - 40} y={HEIGHT - 22} textAnchor="end" className={styles.resultStamp}>
            {resultCurrent ? "SOLVED" : "UPDATING"} · {activeCombo}{overlay === "deformed" ? ` · ×${fmt(magnification, 0)}` : ""}
          </text>
        ) : null}
      </svg>
      <div className={styles.canvasFooter}>
        <span>{model.nodes.length} nodes</span>
        <span>{model.members.length} members</span>
        <span>{model.supports.length} supports</span>
        <span>{activeTool === "node" ? "Click to place a node on the working plane" : activeTool === "member" ? (pendingStart ? `From ${pendingStart}: click the end node · Esc to stop` : "Click a start node") : isEditableView ? "Drag nodes to move · drag background to pan · scroll to zoom" : "Drag to orbit · Shift-drag to pan · scroll to zoom"}</span>
      </div>
    </div>
  );
}
