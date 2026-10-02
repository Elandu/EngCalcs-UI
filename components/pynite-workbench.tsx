"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./pynite-workbench.module.css";
import { FrameCanvas, OVERLAY_CHOICES, type CanvasOverlay } from "@/components/frame-canvas";
import { FRAME_ANALYSIS_ID } from "@/lib/calculation-catalogue";
import type { Vec3 } from "@/lib/frame-geometry";
import { useLivePreview } from "@/lib/use-live-preview";
import {
  FrameDistributedLoad,
  FrameModel,
  FrameNode,
  PyniteInputs,
  PyniteMemberResult,
  PyniteResult,
  PyniteStation,
  SAMPLE_FRAME_INPUTS,
  isPyniteInputs,
} from "@/lib/pynite-model";
import {
  applyWindSource,
  frameLinkIsValid,
  frameWindLinkFromProvenance,
  isFrameWindLink,
  linkedInputRequest,
  missingCombinationFactors,
  windAxisReferences,
  type FrameWindLink,
} from "@/lib/frame-wind-links";

type SavedRun = {
  id: string;
  calculationId: string;
  runSequence: number;
  title: string;
  input: unknown;
  result: unknown;
  provenance: unknown;
  stale: boolean;
  staleReasons: string[];
  superseded?: boolean;
  createdAt: string;
};

type SavedWindRun = Omit<SavedRun, "input">;

type Props = {
  projectId: string;
  projectName: string;
  canRun: boolean;
  savedRuns: SavedRun[];
  windRuns: SavedWindRun[];
};

type ViewTab = "model" | "loads" | "results";
type ViewportMode = "model" | "diagrams";
type ResultKind = keyof Pick<PyniteStation, "moment_y_knm" | "moment_z_knm" | "shear_y_kn" | "shear_z_kn" | "axial_kn" | "deflection_y_m" | "deflection_z_m">;

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

/** Enough of a model for the solver to attempt it; incomplete drafts are not sent for live preview. */
function previewableModel(model: FrameModel) {
  return model.members.length > 0 && model.supports.length > 0 && model.load_combinations.length > 0 &&
    model.nodes.every((node) => [node.x_m, node.y_m, node.z_m].every(Number.isFinite));
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

function MemberDiagram({ member, kind, label, unit, valueScale = 1 }: { member: PyniteMemberResult | null; kind: ResultKind; label: string; unit: string; valueScale?: number }) {
  const stations = member?.stations.filter((station) => Number.isFinite(station.x_m) && Number.isFinite(station[kind])) ?? [];
  if (!member || !stations.length) {
    return <div className={styles.emptyPlot}>No finite {label} station results for this member and combination.</div>;
  }
  const values = stations.map((station) => station[kind] * valueScale);
  const maxAbs = Math.max(...values.map(Math.abs));
  const scale = maxAbs || 1;
  const zeroY = 86;
  const startX = Math.min(...stations.map((station) => station.x_m));
  const endX = Math.max(...stations.map((station) => station.x_m));
  const stationSpan = endX - startX;
  const points = stations.map((station, index) => {
    const x = 42 + (stationSpan ? (station.x_m - startX) / stationSpan : index / Math.max(1, stations.length - 1)) * 716;
    const y = zeroY - (station[kind] * valueScale / scale) * 48;
    return `${x},${y}`;
  }).join(" ");
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <svg className={styles.diagram} viewBox="0 0 800 150" role="img" aria-label={`${label} for member ${member.member_id}, ${fmt(min)} to ${fmt(max)} ${unit}`}>
      <text x="42" y="14">{label} · {unit}</text>
      <line x1="42" y1={zeroY} x2="758" y2={zeroY} className={styles.diagramBaseline} />
      <polyline points={points} className={styles.diagramLine} />
      <text x="42" y="30">sampled max {fmt(max)}</text><text x="758" y="30" textAnchor="end">sampled min {fmt(min)}</text>
      <text x="42" y="140">{fmt(startX)} m</text><text x="758" y="140" textAnchor="end">{fmt(endX)} m</text>
    </svg>
  );
}

export function PyniteWorkbench({ projectId, projectName, canRun, savedRuns, windRuns }: Props) {
  const [title, setTitle] = useState("Simply supported beam");
  const [inputs, setInputs] = useState<PyniteInputs>(SAMPLE_FRAME_INPUTS);
  const [result, setResult] = useState<PyniteResult | null>(null);
  const analysisRevision = useRef(0);
  const [tab, setTab] = useState<ViewTab>("model");
  const [selectedNode, setSelectedNode] = useState("N1");
  const [selectedMember, setSelectedMember] = useState("M1");
  const [startNode, setStartNode] = useState("N1");
  const [endNode, setEndNode] = useState("N2");
  const [selectedLoadCase, setSelectedLoadCase] = useState("D");
  const [activeCombo, setActiveCombo] = useState("Service");
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
  const [windSourceLink, setWindSourceLink] = useState<FrameWindLink | null>(null);
  const [windRunSelection, setWindRunSelection] = useState("");
  const [axisReviewConfirmed, setAxisReviewConfirmed] = useState(false);
  const [activeSavedRun, setActiveSavedRun] = useState<{ id: string; calculationId: string; runSequence: number; stale: boolean; staleReasons: string[]; superseded?: boolean } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [liveSolve, setLiveSolve] = useState(true);
  const [overlay, setOverlay] = useState<CanvasOverlay>("deformed");
  const [magnifier, setMagnifier] = useState(1);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("model");
  const fileInput = useRef<HTMLInputElement>(null);
  const model = inputs.model;
  const selectedNodeRow = model.nodes.find((node) => node.id === selectedNode) ?? model.nodes[0];
  const selectedMemberRow = model.members.find((member) => member.id === selectedMember) ?? model.members[0];
  const selectedSupport = selectedNodeRow ? supportFor(model, selectedNodeRow.id) : undefined;
  const firstMaterial = model.materials[0];
  const firstSection = model.sections[0];
  const selectedMaterialRow = model.materials.find((material) => material.id === selectedMemberRow?.material) ?? firstMaterial;
  const selectedSectionRow = model.sections.find((section) => section.id === selectedMemberRow?.section) ?? firstSection;
  const liveInputs = useMemo(
    () => previewableModel(inputs.model) ? { ...inputs, analysis_type: analysisType } : null,
    [analysisType, inputs],
  );
  const preview = useLivePreview(FRAME_ANALYSIS_ID, liveInputs, { enabled: liveSolve && hydrated, delayMs: 550, parse: resultFromUnknown });
  // A saved run result is shown until the model changes; after that the live preview takes over.
  const shownResult = result ?? preview.result;
  const shownResultCurrent = result ? true : preview.current;
  const activeComboShown = shownResult && !shownResult.load_combinations.includes(activeCombo)
    ? shownResult.load_combinations[0] ?? activeCombo
    : activeCombo;
  const activeNodeResults = currentNodeResults(shownResult, activeComboShown);
  const activeMemberResult = currentMemberResult(shownResult, selectedMember, activeComboShown);
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
    displacementMm: extrema(activeMemberResult?.stations ?? [], "deflection_y_m") * 1000,
    reactionKn: Math.max(...activeNodeResults.map((row) => Math.hypot(row.reaction_fx_kn, row.reaction_fy_kn, row.reaction_fz_kn)), 0),
    momentKnm: extrema(activeMemberResult?.stations ?? [], "moment_z_knm"),
  }), [activeMemberResult, activeNodeResults]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(`opencalcs:pynite:${projectId}`);
        if (raw) {
          const draft = JSON.parse(raw) as { title?: unknown; inputs?: unknown; windSourceLink?: unknown; activeSavedRun?: unknown };
          if (typeof draft.title === "string" && isPyniteInputs(draft.inputs)) {
            const restoredInputs = normalizePyniteInputs(draft.inputs);
            setTitle(draft.title);
            setInputs(restoredInputs);
            setAnalysisType(restoredInputs.analysis_type);
            const restoredLink = isFrameWindLink(draft.windSourceLink)
              ? draft.windSourceLink
              : null;
            setWindSourceLink(restoredLink);
            const savedDraftRun = draft.activeSavedRun && typeof draft.activeSavedRun === "object"
              ? draft.activeSavedRun as Record<string, unknown>
              : null;
            const restoredRun = savedDraftRun && typeof savedDraftRun.id === "string" &&
                typeof savedDraftRun.calculationId === "string" && Number.isSafeInteger(savedDraftRun.runSequence) &&
                typeof savedDraftRun.stale === "boolean" && Array.isArray(savedDraftRun.staleReasons) &&
                savedDraftRun.staleReasons.every((reason) => typeof reason === "string") &&
                (savedDraftRun.superseded === undefined || typeof savedDraftRun.superseded === "boolean")
              ? savedDraftRun as NonNullable<typeof activeSavedRun>
              : null;
            setActiveSavedRun(restoredRun);
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
        JSON.stringify({ title, inputs: { ...inputs, analysis_type: analysisType }, windSourceLink, activeSavedRun }),
      );
    } catch {
      window.setTimeout(() => {
        setMessage("The browser could not save the local draft. Export a model file to keep this work.");
      }, 0);
    }
  }, [activeSavedRun, analysisType, hydrated, inputs, projectId, title, windSourceLink]);

  const exactWindSource = windSourceLink
    ? windRuns.find((run) => run.id === windSourceLink.sourceRunId && run.calculationId === windSourceLink.sourceCalculationId)
    : undefined;
  const selectedWindSource = windRuns.find((run) => run.id === windRunSelection);
  const selectedWindAxes = selectedWindSource ? windAxisReferences(selectedWindSource.result) : [];
  const windLinkErrors = windSourceLink ? frameLinkIsValid(windSourceLink, { ...inputs, analysis_type: analysisType }, exactWindSource) : [];
  if (windSourceLink && exactWindSource?.stale) {
    windLinkErrors.push("The selected wind run has stale upstream inputs. Recalculate the wind frame-load calculation and deliberately apply its new run.");
  }
  if (activeSavedRun?.superseded) {
    windLinkErrors.push("This saved frame run has a newer revision. Open the latest saved run before creating another revision.");
  } else if (windSourceLink && activeSavedRun?.stale) {
    windLinkErrors.push("This saved frame revision uses an older source run. Apply a fresh wind run or explicitly unlink to keep a manual snapshot.");
  }
  const unassignedWindCases = windSourceLink ? missingCombinationFactors({ ...inputs, analysis_type: analysisType }) : [];
  const frameRunBlocked = windLinkErrors.length > 0 || unassignedWindCases.length > 0 || Boolean(activeSavedRun?.stale && windSourceLink);

  function applySelectedWindRun(runId: string) {
    const source = windRuns.find((run) => run.id === runId);
    if (!source) return;
    if (!axisReviewConfirmed) {
      setMessage("Review the source axis references and confirm before applying these member loads.");
      return;
    }
    if (source.stale) {
      setMessage("This wind run has stale upstream inputs. Recalculate wind and select its new saved run.");
      return;
    }
    try {
      const applied = applyWindSource({ ...inputs, analysis_type: analysisType }, source);
      analysisRevision.current += 1;
      setInputs(applied.inputs);
      setWindSourceLink(applied.link);
      setActiveSavedRun((current) => current ? { ...current, stale: false, staleReasons: [] } : current);
      setWindRunSelection(source.id);
      setAxisReviewConfirmed(false);
      setResult(null);
      focusModel(applied.inputs);
      setMessage(`Replaced the distributed-load list with wind run ${source.runSequence}. New wind load cases were added with zero combination factors; review and assign combination factors before solving.`);
      setTab("loads");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to apply this wind run.");
    }
  }

  function unlinkWindLoads() {
    if (!windSourceLink) return;
    analysisRevision.current += 1;
    setWindSourceLink(null);
    setActiveSavedRun((current) => current ? { ...current, stale: false, staleReasons: [] } : current);
    setAxisReviewConfirmed(false);
    setMessage("Wind provenance detached. The displayed distributed loads remain as a manual snapshot.");
  }

  function updateModel(update: (current: FrameModel) => FrameModel) {
    analysisRevision.current += 1;
    setAxisReviewConfirmed(false);
    setInputs((current) => {
      const nextModel = update(current.model);
      if (windSourceLink && JSON.stringify(nextModel.member_distributed_loads) !== JSON.stringify(current.model.member_distributed_loads)) {
        setMessage("These distributed loads are linked to a saved wind run. Unlink the wind source before editing or removing them.");
        return current;
      }
      return { ...current, model: nextModel };
    });
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

  function moveNode(id: string, position: Vec3) {
    updateModel((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === id ? { ...node, x_m: position[0], y_m: position[1], z_m: position[2] } : node),
    }));
  }

  function addNodeAt(position: Vec3) {
    const existing = model.nodes.find((node) => node.x_m === position[0] && node.y_m === position[1] && node.z_m === position[2]);
    if (existing) {
      setSelectedNode(existing.id);
      setMessage(`${existing.id} is already at that point.`);
      return;
    }
    const id = nextId("N", model.nodes.map((node) => node.id));
    updateModel((current) => ({ ...current, nodes: [...current.nodes, { id, x_m: position[0], y_m: position[1], z_m: position[2] }] }));
    setSelectedNode(id);
    setMessage(`Added ${id} at (${fmt(position[0])}, ${fmt(position[1])}, ${fmt(position[2])}) m.`);
  }

  function connectNodes(start: string, end: string) {
    if (model.members.some((member) => (member.start_node === start && member.end_node === end) || (member.start_node === end && member.end_node === start))) {
      setMessage(`${start} and ${end} are already connected.`);
      return;
    }
    const id = nextId("M", model.members.map((member) => member.id));
    const section = model.sections.find((item) => item.id === selectedMemberRow?.section) ?? firstSection;
    const material = model.materials.find((item) => item.id === selectedMemberRow?.material) ?? firstMaterial;
    updateModel((current) => ({
      ...current,
      members: [...current.members, { id, start_node: start, end_node: end, material: material?.id ?? "Steel", section: section?.id ?? "DemoSection" }],
    }));
    setSelectedMember(id);
    setMessage(`Connected ${start} to ${end} as ${id} using ${section?.id ?? "the first section"}.`);
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
    if (windSourceLink) {
      setMessage("Unlink the wind source before adding a manual distributed load.");
      return;
    }
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
    analysisRevision.current += 1;
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
    if (frameRunBlocked) {
      setMessage(windLinkErrors[0] ?? `Assign a reviewed nonzero combination factor for wind case${unassignedWindCases.length === 1 ? "" : "s"}: ${unassignedWindCases.join(", ")}.`);
      setTab("loads");
      return;
    }
    setBusy(true);
    setMessage("");
    const revisionAtStart = analysisRevision.current;
    const runTitle = title.trim();
    const runInputs = { ...inputs, analysis_type: analysisType };
    try {
      const response = await fetch(
        `/api/calculations/${encodeURIComponent("structural.pynite.frame_analysis")}/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            title: runTitle,
            inputs: runInputs,
            ...(windSourceLink ? { linkedInputs: [linkedInputRequest(windSourceLink)] } : {}),
            ...(activeSavedRun ? { revisionCalculationId: activeSavedRun.calculationId, expectedRunId: activeSavedRun.id } : {}),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "PyNite analysis failed.");
      const nextResult = resultFromUnknown(payload.result);
      if (!nextResult) throw new Error("The solver returned an unrecognised result shape.");
      const savedRunId = typeof payload.runId === "string" ? payload.runId : null;
      const savedCalculationId = typeof payload.calculationId === "string" ? payload.calculationId : null;
      if (!savedRunId || !savedCalculationId) throw new Error("The solver response did not include saved run identifiers, so this run cannot be revised safely.");
      const savedRunSequence = typeof payload.runSequence === "number" ? payload.runSequence : (activeSavedRun?.runSequence ?? 0) + 1;
      const appliedLinks = Array.isArray(payload.appliedLinks) ? payload.appliedLinks : [];
      setHistory((current) => [
        {
          id: savedRunId,
          calculationId: savedCalculationId,
          title: runTitle,
          input: runInputs,
          result: nextResult,
          provenance: { linked_inputs: appliedLinks },
          stale: false,
          staleReasons: [],
          createdAt: payload.createdAt ?? new Date().toISOString(),
          runSequence: savedRunSequence,
        },
        ...current,
      ].slice(0, 50));
      if (revisionAtStart !== analysisRevision.current) {
        setMessage("The earlier model was saved in run history. Your model changed during analysis, so its results have not been applied to the current view. Run the updated model again.");
        return;
      }
      setActiveSavedRun({ id: savedRunId, calculationId: savedCalculationId, runSequence: savedRunSequence, stale: false, staleReasons: [] });
      setResult(nextResult);
      setActiveCombo(nextResult.load_combinations[0] ?? "");
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
    let restoredWindLink: FrameWindLink | null;
    try {
      restoredWindLink = frameWindLinkFromProvenance(run.provenance, savedInputs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Saved frame provenance cannot be revised safely.");
      return;
    }
    analysisRevision.current += 1;
    setTitle(run.title);
    setInputs(savedInputs);
    setAnalysisType(savedInputs.analysis_type);
    setActiveSavedRun({ id: run.id, calculationId: run.calculationId, runSequence: run.runSequence, stale: run.stale, staleReasons: run.staleReasons, superseded: run.superseded });
    setWindSourceLink(restoredWindLink);
    setWindRunSelection(restoredWindLink?.sourceRunId ?? "");
    setAxisReviewConfirmed(false);
    const savedResult = resultFromUnknown(run.result);
    setResult(savedResult);
    focusModel(savedInputs, savedResult?.load_combinations[0]);
    setTab("results");
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
      analysisRevision.current += 1;
      const normalizedInputs = normalizePyniteInputs(importedInputs);
      setActiveSavedRun(null);
      setWindSourceLink(null);
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
    analysisRevision.current += 1;
    const sample = structuredClone(SAMPLE_FRAME_INPUTS);
    setInputs(sample);
    setTitle("Simply supported beam");
    setAnalysisType("linear");
    setActiveSavedRun(null);
    setWindSourceLink(null);
    focusModel(sample, "Service");
    setResult(null);
    setMessage("Loaded the six-metre demo beam. This example uses illustrative section properties.");
  }

  const diagramChoices: Array<{ value: ResultKind; label: string; unit: string }> = [
    { value: "moment_z_knm", label: "BMD · Mz local axis", unit: "kN·m" },
    { value: "moment_y_knm", label: "BMD · My local axis", unit: "kN·m" },
    { value: "shear_y_kn", label: "SFD · Vy local axis", unit: "kN" },
    { value: "shear_z_kn", label: "SFD · Vz local axis", unit: "kN" },
    { value: "axial_kn", label: "Axial force N", unit: "kN" },
    { value: "deflection_y_m", label: "Deflection dy · local axis", unit: "mm" },
    { value: "deflection_z_m", label: "Deflection dz · local axis", unit: "mm" },
  ];

  return (
    <section className={styles.workspace} aria-label="Frame analysis workspace">
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
                    {run.title} · run {run.runSequence} · {new Date(run.createdAt).toLocaleDateString()}{run.superseded ? " · superseded" : ""}
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
                <div className={styles.sectionTitle}><h3>Wind pressure to frame loads</h3></div>
                <p className={styles.helpText}>Choose an exact saved AS/NZS 1170.2 frame-load run. Applying it replaces the full distributed-load list and keeps its run ID linked for revisions.</p>
                <label className={styles.field}>Saved wind run<select aria-label="Select saved wind frame-load run" value={windRunSelection} onChange={(event) => { setWindRunSelection(event.target.value); setAxisReviewConfirmed(false); }}>
                  <option value="">Select an exact saved run…</option>
                  {windRuns.map((run) => <option key={run.id} value={run.id}>
                    {run.title} · run {run.runSequence} · {new Date(run.createdAt).toLocaleDateString()}{run.stale ? " · stale" : ""}
                  </option>)}
                </select></label>
                {selectedWindSource ? <>
                  <p className={styles.helpText}>Reviewed source axis references: {selectedWindAxes.length ? selectedWindAxes.join("; ") : "missing; this source cannot be applied"}. Verify each reference against member local axes, end-node orientation, and member rotation.</p>
                  <label className={styles.helpText}><input type="checkbox" checked={axisReviewConfirmed} onChange={(event) => setAxisReviewConfirmed(event.target.checked)} /> I reviewed these load directions and member axes against the frame model.</label>
                <button type="button" className={styles.secondaryButton} disabled={!axisReviewConfirmed || selectedWindSource.stale} onClick={() => applySelectedWindRun(selectedWindSource.id)}>Apply selected exact run</button>
                </> : null}
                {windSourceLink ? <>
                  <p className={windLinkErrors.length ? styles.helpText : styles.resultContext}>
                    {exactWindSource?.title ?? "Saved wind run"} · run {windSourceLink.sourceRunSequence || "?"} · {windSourceLink.sourceRunId.slice(0, 8)}
                    {exactWindSource?.stale ? " · upstream is stale" : " · exact source run retained"}
                  </p>
                  {windLinkErrors.map((error) => <p className={styles.helpText} key={error}>{error}</p>)}
                  {unassignedWindCases.length ? <p className={styles.helpText}>Review nonzero combination factors for: {unassignedWindCases.join(", ")}.</p> : null}
                  <button type="button" className={styles.secondaryButton} onClick={unlinkWindLoads}>Unlink and keep this load snapshot</button>
                </> : <p className={styles.helpText}>No wind source is linked. Manual distributed loads can be edited.</p>}
                {windRuns.length === 0 ? <p className={styles.helpText}>No saved AS/NZS 1170.2 member-load runs are available in this project.</p> : null}
              </section>
              {activeSavedRun?.stale ? <section className={styles.warningBox}><strong>This frame run is stale</strong><p>{activeSavedRun.staleReasons.join("; ") || "A linked source has a newer saved run."} Saving creates a new revision only after the selected source is reviewed.</p></section> : null}
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
                <button type="button" className={styles.secondaryButton} onClick={addDistributedLoad} disabled={!model.members.length || Boolean(windSourceLink)}>＋ Apply to selected member</button>
                {model.member_distributed_loads.map((load, index) => (
                  <div className={styles.loadRecord} key={`${load.member_id}-${load.load_case}-${index}`}>
                    <strong>{load.member_id} · {load.load_case}</strong>
                    <span>{load.direction} · {fmt(load.start_kn_m)} to {fmt(load.end_kn_m)} kN/m</span>
                    <button type="button" aria-label={`Remove distributed load ${index + 1}`} disabled={Boolean(windSourceLink)} onClick={() => updateModel((current) => ({ ...current, member_distributed_loads: current.member_distributed_loads.filter((_, loadIndex) => loadIndex !== index) }))}>×</button>
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
                <button type="button" className={styles.runButtonWide} disabled={!canRun || busy || frameRunBlocked} onClick={runAnalysis}>{busy ? "Solving model…" : activeSavedRun ? "Save new frame revision" : "Run and save analysis"}</button>
                {frameRunBlocked ? <p className={styles.helpText}>{windLinkErrors[0] ?? `Review a nonzero factor for wind load cases: ${unassignedWindCases.join(", ")}.`}</p> : null}
                {!canRun ? <p className={styles.helpText}>Your project role can view the model, but only owners, admins, and engineers can run analysis.</p> : null}
                <label className={styles.liveToggle}><input type="checkbox" checked={liveSolve} onChange={(event) => setLiveSolve(event.target.checked)} /> Live solve while editing (not saved)</label>
                {liveSolve && preview.status === "error" && !result ? <p className={styles.helpText}>{preview.error}</p> : null}
                {liveSolve && !liveInputs ? <p className={styles.helpText}>Live solve starts once the model has a member, a support and a load combination.</p> : null}
              </section>
              {shownResult ? (
                <>
                  <section className={styles.toolSection}>
                    <div className={styles.sectionTitle}><h3>Result set</h3><span className={result ? styles.solvedPill : shownResultCurrent ? styles.livePill : styles.livePillStale}>{result ? "SAVED RUN" : shownResultCurrent ? "LIVE · UNSAVED" : "UPDATING"} · {shownResult.solver.name}</span></div>
                    <p className={styles.resultContext}>{title} · {selectedMemberRow?.id ?? "No member selected"} · {activeComboShown}</p>
                    <label className={styles.field}>Combination<select value={activeComboShown} onChange={(event) => setActiveCombo(event.target.value)}>{shownResult.load_combinations.map((combo) => <option key={combo}>{combo}</option>)}</select></label>
                    <div className={styles.resultMetricGrid}>
                      <div><span>Max sampled |dy| · selected member</span><strong>{fmt(resultMetrics.displacementMm)} <small>mm</small></strong></div>
                      <div><span>Max reaction</span><strong>{fmt(resultMetrics.reactionKn)} <small>kN</small></strong></div>
                      <div><span>Max sampled |Mz| · selected member</span><strong>{fmt(resultMetrics.momentKnm)} <small>kN·m</small></strong></div>
                    </div>
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
                  {shownResult.warnings.length ? (
                    <section className={styles.warningBox}><strong>Solver notes</strong>{shownResult.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</section>
                  ) : null}
                  <section className={styles.limitationsBox}>
                    <strong>Use and limitations</strong>
                    {shownResult.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}
                  </section>
                </>
              ) : (
                <div className={styles.emptyPanel}>
                  <span className={styles.emptyIcon}>↗</span>
                  <strong>No analysis results yet</strong>
                  <p>{liveSolve ? "Results appear here as soon as the model can be solved." : "Check geometry, restraints, material and section properties, then run the PyNite solver."}</p>
                </div>
              )}
            </div>
          ) : null}
        </aside>

        <section className={styles.viewportPanel} aria-label="Structural model view">
          <div className={styles.viewportHeader}>
            <div><span className={styles.eyebrow}>{viewportMode === "diagrams" ? "Member diagrams" : shownResult ? "Model and results" : "Frame model"}</span><strong>{title || "Untitled model"}</strong></div>
            <div className={styles.viewportActions}>
              <div className={styles.segmented} role="group" aria-label="Viewport">
                <button type="button" aria-pressed={viewportMode === "model"} className={viewportMode === "model" ? styles.segmentActive : styles.segment} onClick={() => setViewportMode("model")}>Model</button>
                <button type="button" aria-pressed={viewportMode === "diagrams"} className={viewportMode === "diagrams" ? styles.segmentActive : styles.segment} onClick={() => setViewportMode("diagrams")}>Member diagrams</button>
              </div>
              {viewportMode === "model" ? <div className={styles.overlayControls}>
                <select aria-label="Result overlay" value={overlay} onChange={(event) => setOverlay(event.target.value as CanvasOverlay)} disabled={!shownResult}>
                  {OVERLAY_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}{choice.unit ? ` · ${choice.unit}` : ""}</option>)}
                </select>
                {overlay !== "none" && shownResult ? <select aria-label="Overlay scale" value={magnifier} onChange={(event) => setMagnifier(Number(event.target.value))}>
                  {[0.25, 0.5, 1, 2, 4].map((value) => <option key={value} value={value}>Scale ×{value}</option>)}
                </select> : null}
                {shownResult ? <select aria-label="Overlay load combination" value={activeComboShown} onChange={(event) => setActiveCombo(event.target.value)}>
                  {shownResult.load_combinations.map((combo) => <option key={combo}>{combo}</option>)}
                </select> : null}
                <label className={styles.toggle}><input type="checkbox" checked={showLoads} onChange={(event) => setShowLoads(event.target.checked)} /><span>Loads</span></label>
              </div> : null}
              <span className={result ? styles.solvedPill : !liveSolve ? styles.unitsBadge : preview.status === "error" ? styles.livePillError : shownResultCurrent ? styles.livePill : styles.livePillStale}>
                {result ? "Saved run" : !liveSolve ? "Live off" : preview.status === "error" ? "Not solved" : shownResultCurrent ? "Live" : liveInputs ? "Solving…" : "Incomplete"}
              </span>
            </div>
          </div>
          {viewportMode === "diagrams" ? (
            <div className={styles.resultsCanvas}>
              {shownResult ? <>
                <div className={styles.resultsControls}>
                  <label>Member<select aria-label="Result member" value={selectedMemberRow?.id ?? ""} onChange={(event) => setSelectedMember(event.target.value)}>{model.members.map((member) => <option key={member.id} value={member.id}>{member.id}</option>)}</select></label>
                  <label>Load combination<select aria-label="Result load combination" value={activeComboShown} onChange={(event) => setActiveCombo(event.target.value)}>{shownResult.load_combinations.map((combo) => <option key={combo}>{combo}</option>)}</select></label>
                  <span>{activeMemberResult?.member_id ?? "No result for selection"} · {activeComboShown}{result ? "" : " · live, unsaved"}</span>
                </div>
                <div className={`${styles.diagramGrid} ${shownResultCurrent ? "" : styles.overlayStale}`}>
                  <p className={styles.resultSamplingNote}>Plots show local member axes with positive values upward. Curves and extrema use {activeMemberResult?.stations.length ?? 0} equally spaced solver stations; extrema between stations may be higher.</p>
                  {diagramChoices.map((choice) => <article className={styles.diagramCard} key={choice.value}>
                    <MemberDiagram member={activeMemberResult} kind={choice.value} label={choice.label} unit={choice.unit} valueScale={choice.value.endsWith("_m") ? 1000 : 1} />
                  </article>)}
                </div>
              </> : <div className={styles.emptyPanel}><strong>No current result set</strong><p>{liveSolve ? "Complete the model to solve it live, or run and save the analysis." : "Run analysis to see member diagrams. Editing the model clears the previous result set."}</p></div>}
            </div>
          ) : <FrameCanvas
            model={model}
            selectedNode={selectedNodeRow?.id ?? ""}
            selectedMember={selectedMemberRow?.id ?? ""}
            result={shownResult}
            resultCurrent={shownResultCurrent}
            activeCombo={activeComboShown}
            showLoads={showLoads}
            overlay={shownResult ? overlay : "none"}
            magnifier={magnifier}
            editable
            onSelectNode={setSelectedNode}
            onSelectMember={(id) => { setSelectedMember(id); if (tab !== "results") setTab("model"); }}
            onMoveNode={moveNode}
            onAddNode={addNodeAt}
            onConnect={connectNodes}
          />}
          <div className={styles.bottomStatus}>
            <span><i className={shownResult ? styles.statusDot : styles.statusDotIdle} />{shownResult ? `${shownResult.solver.name} ${shownResult.solver.version}${result ? " · saved run" : " · live preview"}` : "PyNite solver ready"}</span>
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
