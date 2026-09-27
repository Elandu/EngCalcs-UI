"use client";

import { ChangeEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState, WheelEvent } from "react";

import styles from "./pynite-workbench.module.css";
import {
  FrameDistributedLoad,
  FrameModel,
  FrameNode,
  PyniteInputs,
  PyniteMemberResult,
  PyniteResult,
  SAMPLE_FRAME_INPUTS,
  isPyniteInputs,
} from "@/lib/pynite-model";

type SavedRun = {
  id: string;
  calculationId: string;
  runSequence: number;
  title: string;
  input: unknown;
  result: unknown;
  createdAt: string;
};

type Props = {
  projectId: string;
  projectName: string;
  canRun: boolean;
  savedRuns: SavedRun[];
};

type ViewTab = "model" | "loads" | "results";
type ResultKind = "moment_z_knm" | "shear_y_kn" | "axial_kn" | "deflection_y_m";

function resultFromUnknown(value: unknown): PyniteResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Partial<PyniteResult>;
  return Array.isArray(result.node_results) && Array.isArray(result.member_results)
    ? (value as PyniteResult)
    : null;
}

function normalizePyniteInputs(inputs: PyniteInputs): PyniteInputs {
  return { ...inputs, analysis_type: inputs.analysis_type === "p_delta" ? "p_delta" : "linear" };
}

function nextId(prefix: string, values: string[]) {
  const used = new Set(values);
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function supportFor(model: FrameModel, nodeId: string) {
  return model.supports.find((support) => support.node_id === nodeId);
}

function currentMemberResult(result: PyniteResult | null, memberId: string, combo: string) {
  return result?.member_results.find(
    (item) => item.member_id === memberId && item.load_combination === combo,
  ) ?? null;
}

function currentNodeResults(result: PyniteResult | null, combo: string) {
  return result?.node_results.filter((item) => item.load_combination === combo) ?? [];
}

function extrema<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return rows.reduce((maximum, row) => {
    const value = row[key];
    return typeof value === "number" ? Math.max(maximum, Math.abs(value)) : maximum;
  }, 0);
}

function fmt(value: number, digits = 3) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function FrameCanvas({
  model,
  selectedNode,
  selectedMember,
  result,
  activeCombo,
  showLoads,
  onSelectNode,
  onSelectMember,
}: {
  model: FrameModel;
  selectedNode: string;
  selectedMember: string;
  result: PyniteResult | null;
  activeCombo: string;
  showLoads: boolean;
  onSelectNode: (id: string) => void;
  onSelectMember: (id: string) => void;
}) {
  const [yaw, setYaw] = useState(-38);
  const [pitch, setPitch] = useState(25);
  const [zoom, setZoom] = useState(1);
  const pointer = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const width = 900;
  const height = 590;

  const scene = useMemo(() => {
    const yawRad = (yaw * Math.PI) / 180;
    const pitchFactor = Math.sin((pitch * Math.PI) / 180);
    const verticalFactor = Math.cos((pitch * Math.PI) / 180);
    const projected = model.nodes.map((node) => {
      const x = node.x_m * Math.cos(yawRad) - node.z_m * Math.sin(yawRad);
      const depth = node.x_m * Math.sin(yawRad) + node.z_m * Math.cos(yawRad);
      return {
        node,
        x,
        y: depth * pitchFactor - node.y_m * verticalFactor,
      };
    });
    if (!projected.length) return { points: new Map<string, { x: number; y: number }>(), scale: 1 };
    const minX = Math.min(...projected.map((point) => point.x));
    const maxX = Math.max(...projected.map((point) => point.x));
    const minY = Math.min(...projected.map((point) => point.y));
    const maxY = Math.max(...projected.map((point) => point.y));
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const scale = Math.min((width - 150) / spanX, (height - 130) / spanY) * zoom;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const points = new Map(
      projected.map(({ node, x, y }) => [node.id, {
        x: width / 2 + (x - centerX) * scale,
        y: height / 2 - (y - centerY) * scale,
      }]),
    );
    return { points, scale };
  }, [height, model.nodes, pitch, width, yaw, zoom]);

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    pointer.current = { x: event.clientX, y: event.clientY, yaw, pitch };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!pointer.current) return;
    const deltaX = event.clientX - pointer.current.x;
    const deltaY = event.clientY - pointer.current.y;
    setYaw(pointer.current.yaw + deltaX * 0.45);
    setPitch(Math.max(-70, Math.min(70, pointer.current.pitch - deltaY * 0.35)));
  }

  function onPointerUp() {
    pointer.current = null;
  }

  function onWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setZoom((current) => Math.max(0.45, Math.min(2.8, current * (event.deltaY > 0 ? 0.9 : 1.1))));
  }

  const loadsByMember = showLoads
    ? new Map<string, FrameDistributedLoad[]>(
        model.member_distributed_loads.reduce((entries, load) => {
          const current = entries.get(load.member_id) ?? [];
          entries.set(load.member_id, [...current, load]);
          return entries;
        }, new Map<string, FrameDistributedLoad[]>()),
      )
    : new Map<string, FrameDistributedLoad[]>();

  return (
    <div className={styles.canvasFrame}>
      <div className={styles.canvasTools}>
        <span className={styles.canvasHint}>Drag to orbit · scroll to zoom</span>
        <button type="button" onClick={() => { setYaw(-38); setPitch(25); setZoom(1); }}>Fit view</button>
      </div>
      <svg
        className={styles.canvas}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Interactive 3D structural frame model"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <defs>
          <pattern id="fea-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#1b332f" strokeWidth="1" />
          </pattern>
          <marker id="fea-load-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#f3a27a" />
          </marker>
        </defs>
        <rect width={width} height={height} fill="url(#fea-grid)" />
        <path d="M36 36 H864 V554 H36 Z" fill="none" stroke="#203a35" strokeWidth="1" />
        <g className={styles.axisMark}>
          <path d="M70 500 H126" stroke="#93bb9f" strokeWidth="2" />
          <path d="M70 500 V444" stroke="#e8b971" strokeWidth="2" />
          <path d="M70 500 L45 519" stroke="#79a7d9" strokeWidth="2" />
          <text x="132" y="504">X</text><text x="66" y="434">Y</text><text x="33" y="530">Z</text>
        </g>
        {model.members.map((member) => {
          const start = scene.points.get(member.start_node);
          const end = scene.points.get(member.end_node);
          if (!start || !end) return null;
          const selected = selectedMember === member.id;
          const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
          const memberLoads = loadsByMember.get(member.id) ?? [];
          return (
            <g key={member.id}>
              <line
                x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                className={selected ? styles.memberSelected : styles.member}
                onClick={() => onSelectMember(member.id)}
              />
              <line
                x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                className={styles.memberHitArea}
                onClick={() => onSelectMember(member.id)}
              />
              <text x={midpoint.x + 8} y={midpoint.y - 9} className={styles.memberLabel}>{member.id}</text>
              {memberLoads.map((load, index) => {
                const directionY = load.start_kn_m < 0 ? 45 : -45;
                return (
                  <g key={`${member.id}-${load.load_case}-${index}`}>
                    <line
                      x1={midpoint.x + index * 12}
                      y1={midpoint.y - directionY}
                      x2={midpoint.x + index * 12}
                      y2={midpoint.y - 7}
                      stroke="#f3a27a"
                      strokeWidth="1.5"
                      markerEnd="url(#fea-load-arrow)"
                    />
                    <text x={midpoint.x + 7} y={midpoint.y - directionY - 5} className={styles.loadLabel}>
                      {load.start_kn_m} kN/m
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
        {model.nodes.map((node) => {
          const point = scene.points.get(node.id);
          if (!point) return null;
          const restrained = supportFor(model, node.id);
          return (
            <g key={node.id} onClick={() => onSelectNode(node.id)}>
              {restrained ? (
                <path d={`M${point.x - 11} ${point.y + 19} L${point.x + 11} ${point.y + 19} L${point.x} ${point.y + 3} Z`} className={styles.supportMarker} />
              ) : null}
              <circle
                cx={point.x} cy={point.y} r={selectedNode === node.id ? 7 : 5}
                className={selectedNode === node.id ? styles.nodeSelected : styles.node}
              />
              <text x={point.x + 10} y={point.y + 4} className={styles.nodeLabel}>{node.id}</text>
            </g>
          );
        })}
        {!model.members.length ? (
          <text x={width / 2} y={height / 2} textAnchor="middle" className={styles.canvasEmpty}>
            Add nodes and connect them to start your frame model
          </text>
        ) : null}
        {result ? (
          <text x={width - 52} y={height - 25} textAnchor="end" className={styles.resultStamp}>
            SOLVED · {activeCombo}
          </text>
        ) : null}
      </svg>
      <div className={styles.canvasFooter}>
        <span>{model.nodes.length} nodes</span>
        <span>{model.members.length} members</span>
        <span>{model.supports.length} supports</span>
        <span>{showLoads ? `${model.node_loads.length + model.member_distributed_loads.length} loads shown` : "Loads hidden"}</span>
      </div>
    </div>
  );
}

function MemberDiagram({ member, kind }: { member: PyniteMemberResult | null; kind: ResultKind }) {
  if (!member?.stations.length) {
    return <div className={styles.emptyPlot}>Run analysis to see member diagrams.</div>;
  }
  const values = member.stations.map((station) => station[kind]);
  const maximum = Math.max(...values.map(Math.abs), 1e-9);
  const points = values.map((value, index) => {
    const x = 22 + (index / Math.max(1, values.length - 1)) * 356;
    const y = 62 - (value / maximum) * 42;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg className={styles.diagram} viewBox="0 0 400 88" role="img" aria-label={`${kind.replaceAll("_", " ")} member diagram`}>
      <line x1="20" y1="62" x2="380" y2="62" className={styles.diagramBaseline} />
      <polyline points={points} className={styles.diagramLine} />
      <text x="20" y="82">0 m</text><text x="380" y="82" textAnchor="end">{fmt(member.length_m)} m</text>
      <text x="20" y="13">{fmt(Math.max(...values))}</text>
      <text x="380" y="13" textAnchor="end">{fmt(Math.min(...values))}</text>
    </svg>
  );
}

export function PyniteWorkbench({ projectId, projectName, canRun, savedRuns }: Props) {
  const [title, setTitle] = useState("Simply supported beam");
  const [inputs, setInputs] = useState<PyniteInputs>(SAMPLE_FRAME_INPUTS);
  const [result, setResult] = useState<PyniteResult | null>(null);
  const [tab, setTab] = useState<ViewTab>("model");
  const [selectedNode, setSelectedNode] = useState("N1");
  const [selectedMember, setSelectedMember] = useState("M1");
  const [startNode, setStartNode] = useState("N1");
  const [endNode, setEndNode] = useState("N2");
  const [selectedLoadCase, setSelectedLoadCase] = useState("D");
  const [activeCombo, setActiveCombo] = useState("Service");
  const [resultKind, setResultKind] = useState<ResultKind>("moment_z_knm");
  const [analysisType, setAnalysisType] = useState<PyniteInputs["analysis_type"]>("linear");
  const [distributedDirection, setDistributedDirection] = useState<FrameDistributedLoad["direction"]>("FY");
  const [nodeLoadDirection, setNodeLoadDirection] = useState<"FX" | "FY" | "FZ" | "MX" | "MY" | "MZ">("FY");
  const [nodeX, setNodeX] = useState("9");
  const [nodeY, setNodeY] = useState("0");
  const [nodeZ, setNodeZ] = useState("0");
  const [lineStart, setLineStart] = useState("-2");
  const [lineEnd, setLineEnd] = useState("-2");
  const [nodeLoadValue, setNodeLoadValue] = useState("-10");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showLoads, setShowLoads] = useState(true);
  const [history, setHistory] = useState(savedRuns);
  const [hydrated, setHydrated] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const model = inputs.model;
  const selectedNodeRow = model.nodes.find((node) => node.id === selectedNode) ?? model.nodes[0];
  const selectedMemberRow = model.members.find((member) => member.id === selectedMember) ?? model.members[0];
  const selectedSupport = selectedNodeRow ? supportFor(model, selectedNodeRow.id) : undefined;
  const firstMaterial = model.materials[0];
  const firstSection = model.sections[0];
  const selectedMaterialRow = model.materials.find((material) => material.id === selectedMemberRow?.material) ?? firstMaterial;
  const selectedSectionRow = model.sections.find((section) => section.id === selectedMemberRow?.section) ?? firstSection;
  const activeNodeResults = currentNodeResults(result, activeCombo);
  const activeMemberResult = currentMemberResult(result, selectedMember, activeCombo);
  const resultRuns = history;

  const focusModel = useCallback((nextInputs: PyniteInputs, preferredCombo?: string) => {
    const nextModel = nextInputs.model;
    setSelectedNode(nextModel.nodes[0]?.id ?? "");
    setSelectedMember(nextModel.members[0]?.id ?? "");
    setStartNode(nextModel.nodes[0]?.id ?? "");
    setEndNode(nextModel.nodes[1]?.id ?? nextModel.nodes[0]?.id ?? "");
    setSelectedLoadCase(nextModel.load_cases[0]?.id ?? "");
    setActiveCombo(
      preferredCombo && nextModel.load_combinations.some((combo) => combo.id === preferredCombo)
        ? preferredCombo
        : nextModel.load_combinations[0]?.id ?? "",
    );
  }, []);

  const resultMetrics = useMemo(() => ({
    displacementMm: extrema(activeNodeResults, "dy_m") * 1000,
    reactionKn: Math.max(...activeNodeResults.map((row) => Math.hypot(row.reaction_fx_kn, row.reaction_fy_kn, row.reaction_fz_kn)), 0),
    momentKnm: extrema(activeMemberResult?.stations ?? [], "moment_z_knm"),
  }), [activeMemberResult, activeNodeResults]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(`opencalcs:pynite:${projectId}`);
        if (raw) {
          const draft = JSON.parse(raw) as { title?: unknown; inputs?: unknown };
          if (typeof draft.title === "string" && isPyniteInputs(draft.inputs)) {
            const restoredInputs = normalizePyniteInputs(draft.inputs);
            setTitle(draft.title);
            setInputs(restoredInputs);
            setAnalysisType(restoredInputs.analysis_type);
            focusModel(restoredInputs);
          }
        }
      } catch {
        setMessage("The browser could not restore the last local draft.");
      } finally {
        if (active) setHydrated(true);
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [focusModel, projectId]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        `opencalcs:pynite:${projectId}`,
        JSON.stringify({ title, inputs: { ...inputs, analysis_type: analysisType } }),
      );
    } catch {
      window.setTimeout(() => {
        setMessage("The browser could not save the local draft. Export a model file to keep this work.");
      }, 0);
    }
  }, [analysisType, hydrated, inputs, projectId, title]);

  function updateModel(update: (current: FrameModel) => FrameModel) {
    setInputs((current) => ({ ...current, model: update(current.model) }));
    setResult(null);
  }

  function addNode() {
    const id = nextId("N", model.nodes.map((node) => node.id));
    const newNode = { id, x_m: Number(nodeX), y_m: Number(nodeY), z_m: Number(nodeZ) };
    if (![newNode.x_m, newNode.y_m, newNode.z_m].every(Number.isFinite)) {
      setMessage("Node coordinates must be finite numbers.");
      return;
    }
    updateModel((current) => ({ ...current, nodes: [...current.nodes, newNode] }));
    setSelectedNode(id);
    setMessage(`Added node ${id}.`);
  }

  function addMember() {
    if (!startNode || !endNode || startNode === endNode) {
      setMessage("Choose two different end nodes for the member.");
      return;
    }
    const id = nextId("M", model.members.map((member) => member.id));
    const member = {
      id,
      start_node: startNode,
      end_node: endNode,
      material: firstMaterial?.id ?? "Steel",
      section: firstSection?.id ?? "DemoSection",
    };
    updateModel((current) => ({ ...current, members: [...current.members, member] }));
    setSelectedMember(id);
    setMessage(`Connected ${startNode} to ${endNode} as ${id}.`);
  }

  function removeSelectedMember() {
    if (!selectedMemberRow || model.members.length <= 1) return;
    const removedId = selectedMemberRow.id;
    const fallback = model.members.find((member) => member.id !== removedId);
    updateModel((current) => ({
      ...current,
      members: current.members.filter((member) => member.id !== removedId),
      member_distributed_loads: current.member_distributed_loads.filter((load) => load.member_id !== removedId),
    }));
    setSelectedMember(fallback?.id ?? "");
    setMessage(`Removed ${removedId} and its distributed loads.`);
  }

  function removeSelectedNode() {
    if (!selectedNodeRow || model.nodes.length <= 2) return;
    const removedId = selectedNodeRow.id;
    const removedMemberIds = new Set(
      model.members
        .filter((member) => member.start_node === removedId || member.end_node === removedId)
        .map((member) => member.id),
    );
    const remainingMembers = model.members.filter((member) => !removedMemberIds.has(member.id));
    if (remainingMembers.length === 0) {
      setMessage("Keep at least one member in the frame before removing this node.");
      return;
    }
    const remainingNodes = model.nodes.filter((node) => node.id !== removedId);
    updateModel((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== removedId),
      members: current.members.filter((member) => !removedMemberIds.has(member.id)),
      supports: current.supports.filter((support) => support.node_id !== removedId),
      node_loads: current.node_loads.filter((load) => load.node_id !== removedId),
      member_distributed_loads: current.member_distributed_loads.filter((load) => !removedMemberIds.has(load.member_id)),
    }));
    setSelectedNode(remainingNodes[0]?.id ?? "");
    setSelectedMember(remainingMembers[0]?.id ?? "");
    setStartNode(remainingNodes[0]?.id ?? "");
    setEndNode(remainingNodes[1]?.id ?? remainingNodes[0]?.id ?? "");
    setMessage(`Removed ${removedId}, its connected members, restraints, and loads.`);
  }

  function updateNode(id: string, field: keyof FrameNode, value: string) {
    const numericValue = Number(value);
    updateModel((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === id ? { ...node, [field]: numericValue } : node),
    }));
  }

  function toggleSupportDof(dof: "dx" | "dy" | "dz" | "rx" | "ry" | "rz", checked: boolean) {
    if (!selectedNodeRow) return;
    updateModel((current) => {
      const support = current.supports.find((item) => item.node_id === selectedNodeRow.id);
      const nextSupport = support
        ? { ...support, [dof]: checked }
        : { node_id: selectedNodeRow.id, dx: false, dy: false, dz: false, rx: false, ry: false, rz: false, [dof]: checked };
      const supports = support
        ? current.supports.map((item) => item.node_id === selectedNodeRow.id ? nextSupport : item)
        : [...current.supports, nextSupport];
      return { ...current, supports };
    });
  }

  function removeSupport() {
    if (!selectedNodeRow) return;
    updateModel((current) => ({
      ...current,
      supports: current.supports.filter((support) => support.node_id !== selectedNodeRow.id),
    }));
  }

  function addLoadCase() {
    const id = nextId("L", model.load_cases.map((loadCase) => loadCase.id));
    updateModel((current) => ({
      ...current,
      load_cases: [...current.load_cases, { id, name: `Load case ${current.load_cases.length + 1}` }],
      load_combinations: current.load_combinations.map((combo, index) => index === 0
        ? { ...combo, factors: { ...combo.factors, [id]: 0 } }
        : combo),
    }));
    setSelectedLoadCase(id);
  }

  function addCombination() {
    const id = nextId("Combo ", model.load_combinations.map((combo) => combo.id));
    updateModel((current) => ({
      ...current,
      load_combinations: [
        ...current.load_combinations,
        { id, factors: Object.fromEntries(current.load_cases.map((loadCase) => [loadCase.id, 0])) },
      ],
    }));
    setActiveCombo(id);
  }

  function addDistributedLoad() {
    if (!selectedMemberRow) {
      setMessage("Add a member before assigning a distributed load.");
      return;
    }
    const start = Number(lineStart);
    const end = Number(lineEnd);
    if (![start, end].every(Number.isFinite)) {
      setMessage("Distributed load magnitudes must be finite numbers.");
      return;
    }
    updateModel((current) => ({
      ...current,
      member_distributed_loads: [
        ...current.member_distributed_loads,
        {
          member_id: selectedMemberRow.id,
          load_case: selectedLoadCase,
          direction: distributedDirection,
          start_kn_m: start,
          end_kn_m: end,
        },
      ],
    }));
    setMessage(`Added a ${distributedDirection} distributed load to ${selectedMemberRow.id}.`);
    setTab("loads");
  }

  function addNodeLoad() {
    if (!selectedNodeRow) {
      setMessage("Add a node before assigning a nodal load.");
      return;
    }
    const value = Number(nodeLoadValue);
    if (!Number.isFinite(value)) {
      setMessage("Nodal load must be a finite number.");
      return;
    }
    updateModel((current) => ({
      ...current,
      node_loads: [
        ...current.node_loads,
        { node_id: selectedNodeRow.id, load_case: selectedLoadCase, direction: nodeLoadDirection, value },
      ],
    }));
    setMessage(`Added a ${nodeLoadDirection} point load to ${selectedNodeRow.id}.`);
  }

  function updateMaterial(id: string, field: "elastic_modulus_kpa" | "poisson_ratio" | "density_tonnes_m3", value: string) {
    const numericValue = Number(value);
    updateModel((current) => ({
      ...current,
      materials: current.materials.map((material) => material.id === id
        ? { ...material, [field]: numericValue }
        : material),
    }));
  }

  function updateSection(id: string, field: keyof Omit<FrameModel["sections"][number], "id">, value: string) {
    const numericValue = Number(value);
    updateModel((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === id
        ? { ...section, [field]: numericValue }
        : section),
    }));
  }

  function addMaterial() {
    const id = nextId("Steel", model.materials.map((material) => material.id));
    updateModel((current) => ({
      ...current,
      materials: [...current.materials, {
        id,
        elastic_modulus_kpa: 200_000_000,
        poisson_ratio: 0.3,
        density_tonnes_m3: 7.85,
      }],
      members: selectedMemberRow
        ? current.members.map((member) => member.id === selectedMemberRow.id ? { ...member, material: id } : member)
        : current.members,
    }));
    setMessage(`Added material ${id} and assigned it to the selected member.`);
  }

  function addSection() {
    const id = nextId("Section", model.sections.map((section) => section.id));
    updateModel((current) => ({
      ...current,
      sections: [...current.sections, { id, area_m2: 0.003, iy_m4: 0.00001, iz_m4: 0.0001, j_m4: 0.00001 }],
      members: selectedMemberRow
        ? current.members.map((member) => member.id === selectedMemberRow.id ? { ...member, section: id } : member)
        : current.members,
    }));
    setMessage(`Added section ${id} and assigned it to the selected member.`);
  }

  function updateMemberProperty(field: "material" | "section", value: string) {
    if (!selectedMemberRow) return;
    updateModel((current) => ({
      ...current,
      members: current.members.map((member) => member.id === selectedMemberRow.id
        ? { ...member, [field]: value }
        : member),
    }));
  }

  function updateLoadFactor(comboId: string, caseId: string, value: string) {
    const factor = Number(value);
    if (!Number.isFinite(factor)) return;
    updateModel((current) => ({
      ...current,
      load_combinations: current.load_combinations.map((combo) => combo.id === comboId
        ? { ...combo, factors: { ...combo.factors, [caseId]: factor } }
        : combo),
    }));
  }

  function setAnalysis(value: PyniteInputs["analysis_type"]) {
    setAnalysisType(value);
    setInputs((current) => ({ ...current, analysis_type: value }));
    setResult(null);
  }

  async function runAnalysis() {
    if (!canRun) {
      setMessage("An owner, admin, or engineer role is required to run and save analysis.");
      return;
    }
    if (!title.trim()) {
      setMessage("Give this model a name before running analysis.");
      return;
    }
    setBusy(true);
    setMessage("");
    const runInputs = { ...inputs, analysis_type: analysisType };
    try {
      const response = await fetch(
        `/api/calculations/${encodeURIComponent("structural.pynite.frame_analysis")}/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, title: title.trim(), inputs: runInputs }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "PyNite analysis failed.");
      const nextResult = resultFromUnknown(payload.result);
      if (!nextResult) throw new Error("The solver returned an unrecognised result shape.");
      setResult(nextResult);
      setActiveCombo(nextResult.load_combinations[0] ?? "");
      setHistory((current) => [
        {
          id: payload.runId,
          calculationId: payload.calculationId,
          runSequence: 1,
          title: title.trim(),
          input: runInputs,
          result: nextResult,
          createdAt: payload.createdAt ?? new Date().toISOString(),
        },
        ...current,
      ].slice(0, 50));
      setMessage("PyNite analysis completed and the run was saved to this project.");
      setTab("results");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PyNite analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  function openSavedRun(runId: string) {
    if (!runId) return;
    const run = resultRuns.find((item) => item.id === runId);
    if (!run || !isPyniteInputs(run.input)) {
      setMessage("This saved run does not contain a compatible PyNite frame model.");
      return;
    }
    const savedInputs = normalizePyniteInputs(run.input);
    setTitle(run.title);
    setInputs(savedInputs);
    setAnalysisType(savedInputs.analysis_type);
    const savedResult = resultFromUnknown(run.result);
    setResult(savedResult);
    focusModel(savedInputs, savedResult?.load_combinations[0]);
    setMessage(`Loaded saved project run ${run.runSequence}.`);
  }

  function exportModel() {
    const file = new Blob(
      [JSON.stringify({ format: "opencalcs-pynite-model", version: 1, title, inputs: { ...inputs, analysis_type: analysisType } }, null, 2)],
      { type: "application/json" },
    );
    const href = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${title.trim().replace(/[^a-z0-9-_]+/gi, "-") || "structural-model"}.json`;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function importModel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { title?: unknown; inputs?: unknown };
      const importedInputs = "inputs" in parsed ? parsed.inputs : parsed;
      if (!isPyniteInputs(importedInputs)) {
        throw new Error("The file does not contain a supported OpenCalcs PyNite frame model.");
      }
      const normalizedInputs = normalizePyniteInputs(importedInputs);
      setInputs(normalizedInputs);
      setAnalysisType(normalizedInputs.analysis_type);
      if (typeof parsed.title === "string") setTitle(parsed.title);
      setResult(null);
      focusModel(normalizedInputs);
      setMessage(`Imported ${file.name}. Run analysis to save this model to the project.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import the model file.");
    } finally {
      event.target.value = "";
    }
  }

  function loadSample() {
    const sample = structuredClone(SAMPLE_FRAME_INPUTS);
    setInputs(sample);
    setTitle("Simply supported beam");
    setAnalysisType("linear");
    focusModel(sample, "Service");
    setResult(null);
    setMessage("Loaded the six-metre demo beam. This example uses illustrative section properties.");
  }

  const chartChoices: Array<{ value: ResultKind; label: string }> = [
    { value: "moment_z_knm", label: "Major moment · Mz (kN·m)" },
    { value: "shear_y_kn", label: "Major shear · Vy (kN)" },
    { value: "axial_kn", label: "Axial force (kN)" },
    { value: "deflection_y_m", label: "Local deflection · dy (m)" },
  ];

  return (
    <section className={styles.workspace} aria-label="PyNite structural analysis workspace">
      <header className={styles.topbar}>
        <div className={styles.projectIdentity}>
          <span className={styles.brandMark}>OC</span>
          <div><span>OpenCalcs · Structural FEA</span><strong>{projectName}</strong></div>
        </div>
        <label className={styles.modelName}>
          <span className={styles.srOnly}>Model name</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
        </label>
        <div className={styles.topbarActions}>
          <select aria-label="Load a saved project run" value="" onChange={(event) => openSavedRun(event.target.value)}>
            <option value="">Open saved run · {history.length}</option>
            {history.map((run) => (
              <option key={run.id} value={run.id}>
                {run.title} · {new Date(run.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
          <button type="button" onClick={exportModel}>Export</button>
          <button type="button" onClick={() => fileInput.current?.click()}>Import</button>
          <input ref={fileInput} className={styles.fileInput} type="file" accept="application/json,.json" onChange={importModel} />
          <button type="button" className={styles.runButton} disabled={!canRun || busy} onClick={runAnalysis}>
            {busy ? "Solving…" : "Run analysis"}
          </button>
        </div>
      </header>

      <div className={styles.mainGrid}>
        <aside className={styles.toolsPanel}>
          <div className={styles.panelHeading}>
            <div><span className={styles.eyebrow}>Model</span><h2>Tools</h2></div>
            <span className={styles.countPill}>{model.nodes.length}N · {model.members.length}M</span>
          </div>
          <div className={styles.tabs} role="tablist" aria-label="Model workspace panels">
            {(["model", "loads", "results"] as ViewTab[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                className={tab === item ? styles.tabActive : styles.tab}
                onClick={() => setTab(item)}
              >
                {item === "model" ? "Model" : item === "loads" ? "Loads" : "Results"}
              </button>
            ))}
          </div>

          {tab === "model" ? (
            <div className={styles.panelScroll}>
              <section className={styles.toolSection}>
                <div className={styles.sectionTitle}><h3>Nodes</h3><span>{model.nodes.length}</span></div>
                <div className={styles.nodeTable}>
                  {model.nodes.map((node) => (
                    <button
                      type="button"
                      key={node.id}
                      onClick={() => setSelectedNode(node.id)}
                      className={selectedNode === node.id ? styles.rowSelected : styles.nodeRow}
                    >
                      <strong>{node.id}</strong>
                      <span>{fmt(node.x_m)}, {fmt(node.y_m)}, {fmt(node.z_m)} m</span>
                      {supportFor(model, node.id) ? <i aria-label="Supported">S</i> : null}
                    </button>
                  ))}
                </div>
                <div className={styles.coordinateGrid}>
                  <label>X m<input type="number" step="0.5" value={nodeX} onChange={(event) => setNodeX(event.target.value)} /></label>
                  <label>Y m<input type="number" step="0.5" value={nodeY} onChange={(event) => setNodeY(event.target.value)} /></label>
                  <label>Z m<input type="number" step="0.5" value={nodeZ} onChange={(event) => setNodeZ(event.target.value)} /></label>
                </div>
                <button type="button" className={styles.secondaryButton} onClick={addNode}>＋ Add node</button>
              </section>

              <section className={styles.toolSection}>
                <div className={styles.sectionTitle}><h3>Members</h3><span>{model.members.length}</span></div>
                <div className={styles.nodeTable}>
                  {model.members.map((member) => (
                    <button
                      type="button"
                      key={member.id}
                      onClick={() => setSelectedMember(member.id)}
                      className={selectedMember === member.id ? styles.rowSelected : styles.nodeRow}
                    >
                      <strong>{member.id}</strong><span>{member.start_node} → {member.end_node}</span>
                    </button>
                  ))}
                </div>
                <div className={styles.twoColumnFields}>
                  <label>Start node<select value={startNode} onChange={(event) => setStartNode(event.target.value)}>{model.nodes.map((node) => <option key={node.id}>{node.id}</option>)}</select></label>
                  <label>End node<select value={endNode} onChange={(event) => setEndNode(event.target.value)}>{model.nodes.map((node) => <option key={node.id}>{node.id}</option>)}</select></label>
                </div>
                <button type="button" className={styles.secondaryButton} onClick={addMember} disabled={model.nodes.length < 2}>＋ Connect nodes</button>
              </section>

              {selectedNodeRow ? (
                <section className={styles.toolSection}>
                  <div className={styles.sectionTitle}>
                    <h3>Selected node · {selectedNodeRow.id}</h3>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={removeSelectedNode}
                      disabled={model.nodes.length <= 2 || model.members.every((member) => member.start_node === selectedNodeRow.id || member.end_node === selectedNodeRow.id)}
                    >Remove</button>
                  </div>
                  <div className={styles.coordinateGrid}>
                    <label>X m<input type="number" value={selectedNodeRow.x_m} onChange={(event) => updateNode(selectedNodeRow.id, "x_m", event.target.value)} /></label>
                    <label>Y m<input type="number" value={selectedNodeRow.y_m} onChange={(event) => updateNode(selectedNodeRow.id, "y_m", event.target.value)} /></label>
                    <label>Z m<input type="number" value={selectedNodeRow.z_m} onChange={(event) => updateNode(selectedNodeRow.id, "z_m", event.target.value)} /></label>
                  </div>
                  <div className={styles.sectionTitle}><h3>Restraints</h3><button type="button" className={styles.textButton} onClick={removeSupport}>Clear</button></div>
                  <div className={styles.dofGrid}>
                    {(["dx", "dy", "dz", "rx", "ry", "rz"] as const).map((dof) => (
                      <label key={dof}><input type="checkbox" checked={selectedSupport?.[dof] ?? false} onChange={(event) => toggleSupportDof(dof, event.target.checked)} />{dof.toUpperCase()}</label>
                    ))}
                  </div>
                </section>
              ) : null}

              {selectedMemberRow ? (
                <section className={styles.toolSection}>
                  <div className={styles.sectionTitle}>
                    <h3>Member properties</h3>
                    <button type="button" className={styles.dangerButton} onClick={removeSelectedMember} disabled={model.members.length <= 1}>Remove</button>
                  </div>
                  <label className={styles.field}>Material<select value={selectedMemberRow.material} onChange={(event) => updateMemberProperty("material", event.target.value)}>{model.materials.map((material) => <option key={material.id} value={material.id}>{material.id}</option>)}</select></label>
                  {selectedMaterialRow ? <>
                    <div className={styles.sectionTitle}><h3>Material · {selectedMaterialRow.id}</h3><button type="button" className={styles.textButton} onClick={addMaterial}>＋ New</button></div>
                    <div className={styles.propertyGrid}>
                    <label>E · kPa<input type="number" step="any" value={selectedMaterialRow.elastic_modulus_kpa} onChange={(event) => updateMaterial(selectedMaterialRow.id, "elastic_modulus_kpa", event.target.value)} /></label>
                    <label>ν<input type="number" step="0.01" value={selectedMaterialRow.poisson_ratio} onChange={(event) => updateMaterial(selectedMaterialRow.id, "poisson_ratio", event.target.value)} /></label>
                    <label>Density · t/m³<input type="number" step="any" value={selectedMaterialRow.density_tonnes_m3} onChange={(event) => updateMaterial(selectedMaterialRow.id, "density_tonnes_m3", event.target.value)} /></label>
                    </div>
                  </> : null}
                  <label className={styles.field}>Section<select value={selectedMemberRow.section} onChange={(event) => updateMemberProperty("section", event.target.value)}>{model.sections.map((section) => <option key={section.id} value={section.id}>{section.id}</option>)}</select></label>
                  {selectedSectionRow ? <>
                    <div className={styles.sectionTitle}><h3>Section · {selectedSectionRow.id}</h3><button type="button" className={styles.textButton} onClick={addSection}>＋ New</button></div>
                    <div className={styles.propertyGrid}>
                    <label>A · m²<input type="number" step="any" value={selectedSectionRow.area_m2} onChange={(event) => updateSection(selectedSectionRow.id, "area_m2", event.target.value)} /></label>
                    <label>Iy · m⁴<input type="number" step="any" value={selectedSectionRow.iy_m4} onChange={(event) => updateSection(selectedSectionRow.id, "iy_m4", event.target.value)} /></label>
                    <label>Iz · m⁴<input type="number" step="any" value={selectedSectionRow.iz_m4} onChange={(event) => updateSection(selectedSectionRow.id, "iz_m4", event.target.value)} /></label>
                    <label>J · m⁴<input type="number" step="any" value={selectedSectionRow.j_m4} onChange={(event) => updateSection(selectedSectionRow.id, "j_m4", event.target.value)} /></label>
                    </div>
                  </> : null}
                </section>
              ) : null}
              <button type="button" className={styles.sampleButton} onClick={loadSample}>Load demo model</button>
            </div>
          ) : null}

          {tab === "loads" ? (
            <div className={styles.panelScroll}>
              <section className={styles.toolSection}>
                <div className={styles.sectionTitle}><h3>Load cases</h3><button type="button" className={styles.textButton} onClick={addLoadCase}>＋ Add</button></div>
                {model.load_cases.map((loadCase) => (
                  <button
                    type="button"
                    key={loadCase.id}
                    className={selectedLoadCase === loadCase.id ? styles.loadCaseSelected : styles.loadCase}
                    onClick={() => setSelectedLoadCase(loadCase.id)}
                  >
                    <strong>{loadCase.id}</strong><span>{loadCase.name}</span>
                  </button>
                ))}
              </section>

              <section className={styles.toolSection}>
                <div className={styles.sectionTitle}><h3>Member distributed load</h3></div>
                <label className={styles.field}>Member<select value={selectedMemberRow?.id ?? ""} onChange={(event) => setSelectedMember(event.target.value)}>{model.members.map((member) => <option key={member.id} value={member.id}>{member.id}</option>)}</select></label>
                <label className={styles.field}>Direction<select value={distributedDirection} onChange={(event) => setDistributedDirection(event.target.value as FrameDistributedLoad["direction"])}><option value="FY">Global Y · FY</option><option value="FZ">Global Z · FZ</option><option value="Fx">Local x · Fx</option><option value="Fy">Local y · Fy</option><option value="Fz">Local z · Fz</option></select></label>
                <div className={styles.twoColumnFields}>
                  <label>Start · kN/m<input type="number" step="any" value={lineStart} onChange={(event) => setLineStart(event.target.value)} /></label>
                  <label>End · kN/m<input type="number" step="any" value={lineEnd} onChange={(event) => setLineEnd(event.target.value)} /></label>
                </div>
                <button type="button" className={styles.secondaryButton} onClick={addDistributedLoad} disabled={!model.members.length}>＋ Apply to selected member</button>
                {model.member_distributed_loads.map((load, index) => (
                  <div className={styles.loadRecord} key={`${load.member_id}-${load.load_case}-${index}`}>
                    <strong>{load.member_id} · {load.load_case}</strong>
                    <span>{load.direction} · {fmt(load.start_kn_m)} to {fmt(load.end_kn_m)} kN/m</span>
                    <button type="button" aria-label={`Remove distributed load ${index + 1}`} onClick={() => updateModel((current) => ({ ...current, member_distributed_loads: current.member_distributed_loads.filter((_, loadIndex) => loadIndex !== index) }))}>×</button>
                  </div>
                ))}
              </section>

              <section className={styles.toolSection}>
                <div className={styles.sectionTitle}><h3>Nodal point load</h3></div>
                <label className={styles.field}>Node<select value={selectedNodeRow?.id ?? ""} onChange={(event) => setSelectedNode(event.target.value)}>{model.nodes.map((node) => <option key={node.id} value={node.id}>{node.id}</option>)}</select></label>
                <label className={styles.field}>Direction<select value={nodeLoadDirection} onChange={(event) => setNodeLoadDirection(event.target.value as typeof nodeLoadDirection)}><option value="FX">Global X · FX</option><option value="FY">Global Y · FY</option><option value="FZ">Global Z · FZ</option><option value="MX">Global X · MX</option><option value="MY">Global Y · MY</option><option value="MZ">Global Z · MZ</option></select></label>
                <label className={styles.field}>{nodeLoadDirection.startsWith("M") ? "Moment · kN·m" : "Force · kN"}<input type="number" step="any" value={nodeLoadValue} onChange={(event) => setNodeLoadValue(event.target.value)} /></label>
                <button type="button" className={styles.secondaryButton} onClick={addNodeLoad}>＋ Apply to selected node</button>
                {model.node_loads.map((load, index) => (
                  <div className={styles.loadRecord} key={`${load.node_id}-${load.load_case}-${index}`}>
                    <strong>{load.node_id} · {load.load_case}</strong><span>{load.direction} · {fmt(load.value)} {load.direction.startsWith("M") ? "kN·m" : "kN"}</span>
                    <button type="button" aria-label={`Remove nodal load ${index + 1}`} onClick={() => updateModel((current) => ({ ...current, node_loads: current.node_loads.filter((_, loadIndex) => loadIndex !== index) }))}>×</button>
                  </div>
                ))}
              </section>

              <section className={styles.toolSection}>
                <div className={styles.sectionTitle}><h3>Load combinations</h3><button type="button" className={styles.textButton} onClick={addCombination}>＋ Add</button></div>
                {model.load_combinations.map((combo) => (
                  <div className={styles.comboCard} key={combo.id}>
                    <label className={styles.comboName}><span>Combination</span><input value={combo.id} readOnly /></label>
                    {model.load_cases.map((loadCase) => (
                      <label className={styles.factorRow} key={`${combo.id}-${loadCase.id}`}>
                        <span>{loadCase.id} · {loadCase.name}</span>
                        <input type="number" step="0.1" value={combo.factors[loadCase.id] ?? 0} onChange={(event) => updateLoadFactor(combo.id, loadCase.id, event.target.value)} />
                      </label>
                    ))}
                  </div>
                ))}
                <p className={styles.helpText}>Combination factors are user inputs. OpenCalcs does not infer a design standard or prescribe factors.</p>
              </section>
            </div>
          ) : null}

          {tab === "results" ? (
            <div className={styles.panelScroll}>
              <section className={styles.toolSection}>
                <div className={styles.sectionTitle}><h3>Analysis method</h3></div>
                <label className={styles.field}>Solver<select value={analysisType} onChange={(event) => setAnalysis(event.target.value as PyniteInputs["analysis_type"])}><option value="linear">Linear elastic</option><option value="p_delta">P-Delta · second order</option></select></label>
                <button type="button" className={styles.runButtonWide} disabled={!canRun || busy} onClick={runAnalysis}>{busy ? "Solving model…" : "Run and save analysis"}</button>
                {!canRun ? <p className={styles.helpText}>Your project role can view the model, but only owners, admins, and engineers can run analysis.</p> : null}
              </section>
              {result ? (
                <>
                  <section className={styles.toolSection}>
                    <div className={styles.sectionTitle}><h3>Result set</h3><span className={styles.solvedPill}>SOLVED</span></div>
                    <label className={styles.field}>Combination<select value={activeCombo} onChange={(event) => setActiveCombo(event.target.value)}>{result.load_combinations.map((combo) => <option key={combo}>{combo}</option>)}</select></label>
                    <div className={styles.resultMetricGrid}>
                      <div><span>Max |dy|</span><strong>{fmt(resultMetrics.displacementMm)} <small>mm</small></strong></div>
                      <div><span>Max reaction</span><strong>{fmt(resultMetrics.reactionKn)} <small>kN</small></strong></div>
                      <div><span>Max |Mz| · selected member</span><strong>{fmt(resultMetrics.momentKnm)} <small>kN·m</small></strong></div>
                    </div>
                  </section>
                  <section className={styles.toolSection}>
                    <div className={styles.sectionTitle}><h3>Selected member · {selectedMemberRow?.id ?? "—"}</h3></div>
                    <label className={styles.field}>Diagram<select value={resultKind} onChange={(event) => setResultKind(event.target.value as ResultKind)}>{chartChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
                    <MemberDiagram member={activeMemberResult} kind={resultKind} />
                  </section>
                  <section className={styles.toolSection}>
                    <div className={styles.sectionTitle}><h3>Node response</h3></div>
                    <div className={styles.resultTable}>
                      <div className={styles.resultTableHead}><span>Node</span><span>dy · mm</span><span>Ry · kN</span></div>
                      {activeNodeResults.map((row) => (
                        <button type="button" key={row.node_id} onClick={() => setSelectedNode(row.node_id)} className={styles.resultTableRow}>
                          <strong>{row.node_id}</strong><span>{fmt(row.dy_m * 1000)}</span><span>{fmt(row.reaction_fy_kn)}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                  {result.warnings.length ? (
                    <section className={styles.warningBox}><strong>Solver notes</strong>{result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</section>
                  ) : null}
                  <section className={styles.limitationsBox}>
                    <strong>Use and limitations</strong>
                    {result.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}
                  </section>
                </>
              ) : (
                <div className={styles.emptyPanel}>
                  <span className={styles.emptyIcon}>↗</span>
                  <strong>No analysis results yet</strong>
                  <p>Check geometry, restraints, material and section properties, then run the PyNite solver.</p>
                </div>
              )}
            </div>
          ) : null}
        </aside>

        <section className={styles.viewportPanel} aria-label="Structural model view">
          <div className={styles.viewportHeader}>
            <div><span className={styles.eyebrow}>3D model</span><strong>{title || "Untitled model"}</strong></div>
            <div className={styles.viewportActions}>
              <label className={styles.toggle}><input type="checkbox" checked={showLoads} onChange={(event) => setShowLoads(event.target.checked)} /><span>Loads</span></label>
              <span className={styles.unitsBadge}>kN · m</span>
            </div>
          </div>
          <FrameCanvas
            model={model}
            selectedNode={selectedNodeRow?.id ?? ""}
            selectedMember={selectedMemberRow?.id ?? ""}
            result={result}
            activeCombo={activeCombo}
            showLoads={showLoads}
            onSelectNode={setSelectedNode}
            onSelectMember={(id) => { setSelectedMember(id); setTab("model"); }}
          />
          <div className={styles.bottomStatus}>
            <span><i className={styles.statusDot} />{result ? `${result.solver.name} ${result.solver.version}` : "PyNite solver ready"}</span>
            <span>{analysisType === "p_delta" ? "P-Delta analysis" : "Linear elastic analysis"}</span>
            <span>Auto-saved draft in this browser</span>
          </div>
        </section>

        <aside className={styles.inspectorPanel}>
          <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Inspector</span><h2>Properties</h2></div></div>
          {selectedMemberRow ? (
            <>
              <section className={styles.inspectorSection}>
                <span className={styles.inspectorTag}>FRAME MEMBER</span>
                <h3>{selectedMemberRow.id}</h3>
                <p>{selectedMemberRow.start_node} to {selectedMemberRow.end_node}</p>
                <dl className={styles.propertyList}>
                  <div><dt>Material</dt><dd>{selectedMemberRow.material}</dd></div>
                  <div><dt>Section</dt><dd>{selectedMemberRow.section}</dd></div>
                  <div><dt>Length</dt><dd>{(() => {
                    const start = model.nodes.find((node) => node.id === selectedMemberRow.start_node);
                    const end = model.nodes.find((node) => node.id === selectedMemberRow.end_node);
                    return start && end ? `${fmt(Math.hypot(end.x_m - start.x_m, end.y_m - start.y_m, end.z_m - start.z_m))} m` : "—";
                  })()}</dd></div>
                </dl>
              </section>
              <section className={styles.inspectorSection}>
                <div className={styles.sectionTitle}><h3>Assigned loads</h3><button type="button" className={styles.textButton} onClick={() => setTab("loads")}>Edit</button></div>
                {model.member_distributed_loads.filter((load) => load.member_id === selectedMemberRow.id).map((load, index) => (
                  <div className={styles.inspectorLoad} key={`${load.load_case}-${index}`}><strong>{load.load_case}</strong><span>{load.direction} {fmt(load.start_kn_m)} → {fmt(load.end_kn_m)} kN/m</span></div>
                ))}
                {!model.member_distributed_loads.some((load) => load.member_id === selectedMemberRow.id) ? <p className={styles.emptyText}>No member loads assigned.</p> : null}
              </section>
              {activeMemberResult ? (
                <section className={styles.inspectorSection}>
                  <div className={styles.sectionTitle}><h3>Governing sample</h3></div>
                  <dl className={styles.propertyList}>
                    <div><dt>Max |Mz|</dt><dd>{fmt(extrema(activeMemberResult.stations, "moment_z_knm"))} kN·m</dd></div>
                    <div><dt>Max |Vy|</dt><dd>{fmt(extrema(activeMemberResult.stations, "shear_y_kn"))} kN</dd></div>
                    <div><dt>Max |N|</dt><dd>{fmt(extrema(activeMemberResult.stations, "axial_kn"))} kN</dd></div>
                  </dl>
                  <small className={styles.muted}>Sampled at {activeMemberResult.stations.length} member stations.</small>
                </section>
              ) : null}
            </>
          ) : (
            <div className={styles.emptyPanel}><strong>Select a member</strong><p>Member properties and loads will appear here.</p></div>
          )}
          <div className={styles.inspectorFooter}>
            <span>Engineering review required</span>
            <p>PyNite provides elastic analysis results. OpenCalcs does not infer code compliance from this model.</p>
          </div>
        </aside>
      </div>
      <div className={styles.messageBar} aria-live="polite" role={message ? "status" : undefined}>{message}</div>
    </section>
  );
}
