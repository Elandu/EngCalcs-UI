import type { FrameDistributedLoad, FrameModel, PyniteInputs } from "@/lib/pynite-model";

export const WIND_FRAME_LOADS_DEFINITION = "au.wind.frame_loads";
export const WIND_LOAD_OUTPUT_PATH = "/member_distributed_loads";
export const FRAME_LOAD_INPUT_PATH = "/model/member_distributed_loads";

export type FrameWindLink = {
  sourceCalculationId: string;
  sourceRunId: string;
  sourceRunSequence: number;
  sourceOutputPath: typeof WIND_LOAD_OUTPUT_PATH;
  targetInputPath: typeof FRAME_LOAD_INPUT_PATH;
  geometrySnapshot: string;
};

export type FrameWindSource = {
  definitionId?: string;
  id: string;
  calculationId: string;
  runSequence: number;
  result: unknown;
  provenance: unknown;
  stale?: boolean;
  staleReasons?: string[];
};

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function loadArray(value: unknown): FrameDistributedLoad[] | null {
  if (!Array.isArray(value)) return null;
  const allowedDirections = new Set(["Fx", "Fy", "Fz", "FX", "FY", "FZ"]);
  if (value.some((item) => {
    const load = record(item);
    return !load || typeof load.member_id !== "string" || !load.member_id ||
      typeof load.load_case !== "string" || !load.load_case ||
      typeof load.direction !== "string" || !allowedDirections.has(load.direction) ||
      !finiteNumber(load.start_kn_m) || !finiteNumber(load.end_kn_m) ||
      (load.start_m !== undefined && !finiteNumber(load.start_m)) ||
      (load.end_m !== undefined && !finiteNumber(load.end_m));
  })) return null;
  return value as FrameDistributedLoad[];
}

function resultPayload(value: unknown): unknown {
  const outer = record(value);
  return outer && record(outer.result) ? outer.result : value;
}

function outputAtPath(value: unknown, path: string): unknown {
  let current = resultPayload(value);
  for (const rawPart of path.slice(1).split("/")) {
    const part = rawPart.replaceAll("~1", "/").replaceAll("~0", "~");
    const parent = record(current);
    if (!parent || !Object.hasOwn(parent, part)) return undefined;
    current = parent[part];
  }
  return current;
}

export function windLoadsFromSource(result: unknown): FrameDistributedLoad[] {
  const loads = loadArray(outputAtPath(result, WIND_LOAD_OUTPUT_PATH));
  if (!loads || !loads.length) {
    throw new Error("This saved wind run has no valid member distributed loads.");
  }
  return loads;
}

export function windAxisReferences(result: unknown): string[] {
  const rows = outputAtPath(result, "/member_loads");
  if (!Array.isArray(rows)) return [];
  return [...new Set(rows.map((value) => record(value)?.axis_reference)
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim())))];
}

function memberSnapshot(model: FrameModel, memberIds: string[]): string {
  const memberSet = new Set(memberIds);
  const nodes = new Map(model.nodes.map((node) => [node.id, node]));
  const snapshot = model.members.filter((member) => memberSet.has(member.id)).map((member) => {
    const start = nodes.get(member.start_node);
    const end = nodes.get(member.end_node);
    return {
      id: member.id,
      start_node: member.start_node,
      end_node: member.end_node,
      rotation_degrees: member.rotation_degrees ?? 0,
      start: start && [start.x_m, start.y_m, start.z_m],
      end: end && [end.x_m, end.y_m, end.z_m],
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(snapshot);
}

export function validateWindLoadsForFrame(
  loads: FrameDistributedLoad[],
  model: FrameModel,
  richLoads?: unknown,
  metadata?: { standard?: unknown; load_unit?: unknown; length_unit?: unknown },
): string[] {
  const errors: string[] = [];
  const members = new Map(model.members.map((member) => [member.id, member]));
  const nodes = new Map(model.nodes.map((node) => [node.id, node]));
  const loadCases = new Set(model.load_cases.map((loadCase) => loadCase.id));
  const rich = Array.isArray(richLoads) ? richLoads.map(record) : null;
  if (!rich || rich.length !== loads.length || rich.some((row) => !row)) {
    errors.push("Wind run is missing complete member axis and pressure provenance.");
  }
  if (metadata && (metadata.standard !== "AS/NZS 1170.2:2021" || metadata.load_unit !== "kN/m" || metadata.length_unit !== "m")) {
    errors.push("Wind run standard or load units do not match AS/NZS 1170.2:2021 and the frame kN/m contract.");
  }

  loads.forEach((load, index) => {
    const member = members.get(load.member_id);
    if (!member) {
      errors.push(`Wind load ${index + 1} references missing frame member ${load.member_id}.`);
      return;
    }
    const startNode = nodes.get(member.start_node);
    const endNode = nodes.get(member.end_node);
    if (!startNode || !endNode) {
      errors.push(`Frame member ${member.id} has missing endpoint geometry.`);
      return;
    }
    const length = Math.hypot(
      endNode.x_m - startNode.x_m,
      endNode.y_m - startNode.y_m,
      endNode.z_m - startNode.z_m,
    );
    const start = load.start_m ?? 0;
    const end = load.end_m ?? length;
    if (!(length > 0) || start < 0 || end <= start || end > length + 1e-8) {
      errors.push(`Wind load ${index + 1} spans outside member ${member.id} length (${length.toFixed(3)} m).`);
    }
    if (!loadCases.has(load.load_case)) {
      errors.push(`Add wind load case ${load.load_case} to the frame model before applying this source.`);
    }
    const axisRow = rich?.[index];
    if (!axisRow || typeof axisRow.axis_reference !== "string" || !axisRow.axis_reference.trim() ||
        axisRow.member_id !== load.member_id || axisRow.load_case !== load.load_case ||
        axisRow.direction !== load.direction || typeof axisRow.source_run_id !== "string" || !axisRow.source_run_id ||
        axisRow.standard !== "AS/NZS 1170.2:2021" || axisRow.load_unit !== "kN/m" || axisRow.length_unit !== "m" ||
        !["ultimate", "serviceability"].includes(String(axisRow.limit_state))) {
      errors.push(`Wind load ${index + 1} is missing a matching reviewed member-axis reference.`);
    }
  });
  return [...new Set(errors)];
}

export function applyWindSource(
  inputs: PyniteInputs,
  source: FrameWindSource,
): { inputs: PyniteInputs; link: FrameWindLink } {
  if (source.definitionId && source.definitionId !== WIND_FRAME_LOADS_DEFINITION) {
    throw new Error("Select a saved AS/NZS 1170.2 wind frame-load run.");
  }
  if (source.stale) {
    throw new Error("This wind frame-load run has stale upstream inputs; recalculate wind before applying it.");
  }
  const loads = windLoadsFromSource(source.result);
  const nextInputs = structuredClone(inputs);
  const currentCases = new Set(nextInputs.model.load_cases.map((loadCase) => loadCase.id));
  const missingCases = [...new Set(loads.map((load) => load.load_case))].filter((id) => !currentCases.has(id));
  nextInputs.model.load_cases.push(...missingCases.map((id) => ({ id, name: id })));
  for (const id of missingCases) {
    nextInputs.model.load_combinations = nextInputs.model.load_combinations.map((combo) => ({
      ...combo,
      factors: { ...combo.factors, [id]: 0 },
    }));
  }
  const richLoads = outputAtPath(source.result, "/member_loads");
  const metadata = record(resultPayload(source.result));
  const errors = validateWindLoadsForFrame(loads, nextInputs.model, richLoads, metadata ?? undefined);
  if (errors.length) throw new Error(errors.join(" "));
  nextInputs.model.member_distributed_loads = structuredClone(loads);
  return {
    inputs: nextInputs,
    link: {
      sourceCalculationId: source.calculationId,
      sourceRunId: source.id,
      sourceRunSequence: source.runSequence,
      sourceOutputPath: WIND_LOAD_OUTPUT_PATH,
      targetInputPath: FRAME_LOAD_INPUT_PATH,
      geometrySnapshot: memberSnapshot(nextInputs.model, loads.map((load) => load.member_id)),
    },
  };
}

export function windLinkGeometryIsCurrent(link: FrameWindLink, model: FrameModel): boolean {
  const memberIds = model.member_distributed_loads.map((load) => load.member_id);
  return link.geometrySnapshot === memberSnapshot(model, memberIds);
}

export function linkedInputRequest(link: FrameWindLink) {
  return {
    sourceCalculationId: link.sourceCalculationId,
    sourceRunId: link.sourceRunId,
    sourceOutputPath: link.sourceOutputPath,
    targetInputPath: link.targetInputPath,
  };
}

export function isFrameWindLink(value: unknown): value is FrameWindLink {
  const link = record(value);
  return Boolean(link &&
    typeof link.sourceCalculationId === "string" &&
    typeof link.sourceRunId === "string" &&
    finiteNumber(link.sourceRunSequence) &&
    link.sourceOutputPath === WIND_LOAD_OUTPUT_PATH &&
    link.targetInputPath === FRAME_LOAD_INPUT_PATH &&
    typeof link.geometrySnapshot === "string");
}

export function frameWindLinkFromProvenance(
  provenance: unknown,
  inputs: PyniteInputs,
): FrameWindLink | null {
  const stored = record(provenance)?.linked_inputs;
  if (stored === undefined) return null;
  if (!Array.isArray(stored)) throw new Error("Saved frame provenance is malformed. It cannot be revised safely.");
  if (stored.length === 0) return null;
  if (stored.length !== 1) throw new Error("This frame run has multiple linked inputs that the workbench cannot preserve. It cannot be revised here.");
  const link = record(stored[0]);
  if (!link || link.target_input_path !== FRAME_LOAD_INPUT_PATH ||
      link.source_output_path !== WIND_LOAD_OUTPUT_PATH ||
      typeof link.source_calculation_id !== "string" || !link.source_calculation_id ||
      typeof link.source_run_id !== "string" || !link.source_run_id) {
    throw new Error("Saved frame provenance contains an unsupported or malformed linked input. It cannot be revised safely.");
  }
  const loads = inputs.model.member_distributed_loads;
  return {
    sourceCalculationId: link.source_calculation_id as string,
    sourceRunId: link.source_run_id as string,
    sourceRunSequence: typeof link.source_run_sequence === "number" ? link.source_run_sequence : 0,
    sourceOutputPath: WIND_LOAD_OUTPUT_PATH,
    targetInputPath: FRAME_LOAD_INPUT_PATH,
    geometrySnapshot: memberSnapshot(inputs.model, loads.map((load) => load.member_id)),
  };
}

export function frameLinkIsValid(link: FrameWindLink, inputs: PyniteInputs, source?: FrameWindSource): string[] {
  if (!windLinkGeometryIsCurrent(link, inputs.model)) {
    return ["Frame geometry or member orientation changed after wind loads were applied. Reapply the reviewed wind run or unlink to a manual snapshot before solving."];
  }
  if (!source || source.id !== link.sourceRunId || source.calculationId !== link.sourceCalculationId) {
    return ["The exact linked wind source run is unavailable. Reload project history or unlink to a manual snapshot."];
  }
  try {
    const loads = windLoadsFromSource(source.result);
    if (JSON.stringify(loads) !== JSON.stringify(inputs.model.member_distributed_loads)) {
      return ["Wind-linked member loads were edited after import. Reapply the reviewed run or unlink to a manual snapshot."];
    }
    const metadata = record(resultPayload(source.result));
    return validateWindLoadsForFrame(loads, inputs.model, outputAtPath(source.result, "/member_loads"), metadata ?? undefined);
  } catch (error) {
    return [error instanceof Error ? error.message : "The linked wind run is invalid."];
  }
}

export function missingCombinationFactors(inputs: PyniteInputs): string[] {
  return inputs.model.load_cases.filter((loadCase) =>
    inputs.model.member_distributed_loads.some((load) => load.load_case === loadCase.id) &&
    !inputs.model.load_combinations.some((combo) => Number.isFinite(combo.factors[loadCase.id]) && combo.factors[loadCase.id] !== 0),
  ).map((loadCase) => loadCase.id);
}
