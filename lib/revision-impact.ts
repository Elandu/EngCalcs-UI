/**
 * Read-only impact assessment for saved engineering calculation revisions.
 *
 * This does not execute calculations or approve a design. It follows the
 * recorded project graph and reports what needs an engineer's attention.
 * A downstream output is NEVER assumed to have changed before it is rerun.
 */
export type ImpactCalculation = {
  id: string;
  title: string;
  calculation_definition_id: string;
  state: string;
};

export type ImpactRun = {
  id: string;
  calculation_id: string;
  run_sequence: number;
  result_json: unknown;
  provenance_json: unknown;
  created_at?: string;
};

export type ImpactLink = {
  source_calculation_id: string;
  source_output_path: string;
  target_calculation_id: string;
  target_input_path: string;
};

export type ComparedOutput = {
  path: string;
  status: "changed" | "unchanged" | "unverifiable";
  before: unknown;
  after: unknown;
};

export type AffectedCalculation = {
  calculation: ImpactCalculation;
  depth: number;
  via: string[];
  cause: "linked_output_changed" | "new_source_run" | "unverifiable" | "downstream_review";
  link: ImpactLink;
  savedSourceRunId: string | null;
  latestTargetRunId: string | null;
  savedSourceCurrent: boolean | null;
};

export type ImpactAssessment = {
  root: ImpactCalculation;
  previousRun: ImpactRun | null;
  currentRun: ImpactRun | null;
  outputComparisons: ComparedOutput[];
  affected: AffectedCalculation[];
  warnings: string[];
  isActualRevision: boolean;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Read RFC 6901 JSON pointers, including valid array indices. */
export function valueAtPointer(value: unknown, path: string): { found: boolean; value: unknown } {
  if (path === "") return { found: true, value };
  if (!path.startsWith("/")) return { found: false, value: undefined };
  let current: unknown = value;
  for (const encoded of path.slice(1).split("/")) {
    if (/~(?![01])/.test(encoded)) return { found: false, value: undefined };
    const key = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    const row = object(current);
    if (row && Object.hasOwn(row, key)) {
      current = row[key];
    } else if (Array.isArray(current) && /^(0|[1-9]\d*)$/.test(key) && Number(key) < current.length) {
      current = current[Number(key)];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: current };
}

function normalizedResult(value: unknown): unknown {
  const row = object(value);
  return row && object(row.result) ? row.result : value;
}

function equalJson(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true;
  if (depth > 40) return false; // Fail closed for unexpectedly nested data.
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((entry, index) => equalJson(entry, b[index], depth + 1));
  }
  const left = object(a), right = object(b);
  if (!left || !right) return false;
  const keysA = Object.keys(left), keysB = Object.keys(right);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => Object.hasOwn(right, key) && equalJson(left[key], right[key], depth + 1));
}

function latestRuns(runs: readonly ImpactRun[]): Map<string, ImpactRun[]> {
  const byCalculation = new Map<string, ImpactRun[]>();
  for (const run of runs) {
    const items = byCalculation.get(run.calculation_id) ?? [];
    items.push(run);
    byCalculation.set(run.calculation_id, items);
  }
  for (const items of byCalculation.values()) {
    items.sort((a, b) => b.run_sequence - a.run_sequence ||
      (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.id.localeCompare(a.id));
  }
  return byCalculation;
}

function savedRunForLink(provenance: unknown, link: ImpactLink): string | null {
  const references = object(provenance)?.linked_inputs;
  if (!Array.isArray(references)) return null;
  for (const entry of references) {
    const row = object(entry);
    if (row?.source_calculation_id === link.source_calculation_id &&
      row.source_output_path === link.source_output_path &&
      row.target_input_path === link.target_input_path) {
      return typeof row.source_run_id === "string" ? row.source_run_id : null;
    }
  }
  return null;
}

/**
 * Compare two real saved source runs, then traverse project-only graph links.
 * Values on the first edge can be compared. Effects further downstream are
 * strictly identified as "requires review", not fabricated solver results.
 */
export function assessRevisionImpact(
  calculations: readonly ImpactCalculation[],
  runs: readonly ImpactRun[],
  links: readonly ImpactLink[],
  sourceCalculationId: string,
): ImpactAssessment {
  const nodes = new Map(calculations.map((node) => [node.id, node]));
  const root = nodes.get(sourceCalculationId);
  if (!root) throw new Error("The selected calculation is not in this project.");

  const runsByCalculation = latestRuns(runs.filter((run) => nodes.has(run.calculation_id)));
  const [currentRun, previousRun] = runsByCalculation.get(root.id) ?? [];
  const warnings: string[] = [];
  if (!currentRun) warnings.push("No saved source run exists. A revision cannot be verified.");
  if (currentRun && !previousRun) warnings.push("This calculation has one saved run; there is no earlier run to compare.");

  const validLinks = links.filter((link) => {
    if (nodes.has(link.source_calculation_id) && nodes.has(link.target_calculation_id) &&
      link.source_calculation_id !== link.target_calculation_id) return true;
    warnings.push("A dependency link references a missing project calculation or itself.");
    return false;
  });
  const outgoing = new Map<string, ImpactLink[]>();
  for (const link of validLinks) {
    const outgoingLinks = outgoing.get(link.source_calculation_id) ?? [];
    outgoingLinks.push(link);
    outgoing.set(link.source_calculation_id, outgoingLinks);
  }
  for (const row of outgoing.values()) {
    row.sort((a, b) => a.target_calculation_id.localeCompare(b.target_calculation_id) ||
      a.source_output_path.localeCompare(b.source_output_path) || a.target_input_path.localeCompare(b.target_input_path));
  }

  const outgoingPaths = [...new Set((outgoing.get(root.id) ?? []).map((link) => link.source_output_path))].sort();
  const outputComparisons = outgoingPaths.map((path): ComparedOutput => {
    if (!previousRun || !currentRun) return { path, status: "unverifiable", before: null, after: null };
    const before = valueAtPointer(normalizedResult(previousRun.result_json), path);
    const after = valueAtPointer(normalizedResult(currentRun.result_json), path);
    return {
      path,
      status: !before.found || !after.found ? "unverifiable" :
        equalJson(before.value, after.value) ? "unchanged" : "changed",
      before: before.found ? before.value : null,
      after: after.found ? after.value : null,
    };
  });
  const comparisons = new Map(outputComparisons.map((result) => [result.path, result]));
  if (!outgoingPaths.length) warnings.push("No downstream calculations are linked to this source.");
  if (outputComparisons.some((row) => row.status === "unverifiable")) {
    warnings.push("A linked output path is absent from one or both run results. Review the source manually.");
  }

  const affected: AffectedCalculation[] = [];
  const visited = new Set<string>([root.id]);
  const queue: Array<{ node: string; depth: number; via: string[]; link: ImpactLink }> =
    (outgoing.get(root.id) ?? []).map((link) => ({
      node: link.target_calculation_id, depth: 1, via: [root.id, link.target_calculation_id], link,
    }));
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.node)) {
      if (current.via.slice(0, -1).includes(current.node)) {
        warnings.push("Dependency cycle detected; review the calculation links manually.");
      }
      continue;
    }
    const node = nodes.get(current.node);
    if (!node) continue;
    visited.add(node.id);

    const targetRun = runsByCalculation.get(node.id)?.[0] ?? null;
    const parentRun = runsByCalculation.get(current.link.source_calculation_id)?.[0] ?? null;
    const snapshottedRun = savedRunForLink(targetRun?.provenance_json, current.link);
    const status = comparisons.get(current.link.source_output_path)?.status ?? "unverifiable";

    affected.push({
      calculation: node,
      depth: current.depth,
      via: current.via,
      link: current.link,
      cause: current.depth > 1 ? "downstream_review" :
        status === "changed" ? "linked_output_changed" :
        status === "unchanged" ? "new_source_run" : "unverifiable",
      savedSourceRunId: snapshottedRun,
      latestTargetRunId: targetRun?.id ?? null,
      savedSourceCurrent: snapshottedRun && parentRun ? snapshottedRun === parentRun.id : null,
    });

    for (const link of outgoing.get(node.id) ?? []) {
      const newVia = [...current.via, link.target_calculation_id];
      if (newVia.includes(root.id) || current.via.includes(link.target_calculation_id)) {
        warnings.push("Dependency cycle detected; review the calculation links manually.");
      } else if (!visited.has(link.target_calculation_id)) {
        queue.push({ node: link.target_calculation_id, depth: current.depth + 1, via: newVia, link });
      }
    }
  }
  affected.sort((a, b) => a.depth - b.depth || a.calculation.title.localeCompare(b.calculation.title));
  return {
    root,
    previousRun: previousRun ?? null,
    currentRun: currentRun ?? null,
    outputComparisons,
    affected,
    warnings: [...new Set(warnings)],
    isActualRevision: Boolean(previousRun && currentRun && previousRun.id !== currentRun.id),
  };
}
