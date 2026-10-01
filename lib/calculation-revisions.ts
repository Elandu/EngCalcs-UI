export type RunLink = {
  source_calculation_id: string;
  source_run_id: string;
  source_output_path: string;
  target_input_path: string;
};

export type RevisionRun = {
  id: string;
  calculation_id: string;
  run_sequence: number;
  provenance_json: unknown;
};

export function runLinks(provenance: unknown): RunLink[] {
  if (!provenance || typeof provenance !== "object" || !("linked_inputs" in provenance)) return [];
  const links = provenance.linked_inputs;
  if (!Array.isArray(links)) return [];
  return links.filter((link): link is RunLink => Boolean(link) && typeof link === "object" &&
    [link.source_calculation_id, link.source_run_id, link.source_output_path, link.target_input_path]
      .every((value) => typeof value === "string"));
}

function hasMalformedLinkSnapshot(provenance: unknown): boolean {
  if (!provenance || typeof provenance !== "object" || !("linked_inputs" in provenance)) return false;
  const links = provenance.linked_inputs;
  if (!Array.isArray(links)) return true;
  return links.some((link) => !link || typeof link !== "object" ||
    ![link.source_calculation_id, link.source_run_id, link.source_output_path, link.target_input_path]
      .every((value) => typeof value === "string"));
}

export function latestRevisionRuns(runs: RevisionRun[]) {
  const latest = new Map<string, RevisionRun>();
  for (const run of runs) {
    const current = latest.get(run.calculation_id);
    if (!current || run.run_sequence > current.run_sequence) latest.set(run.calculation_id, run);
  }
  return latest;
}

export type RevisionStatus = { stale: boolean; reasons: string[] };

// Follow exact saved links, including transitive dependencies. A missing source is never current.
export function revisionStatuses(runs: RevisionRun[]): Map<string, RevisionStatus> {
  const latest = latestRevisionRuns(runs);
  const statuses = new Map<string, RevisionStatus>();
  const visit = (id: string, visiting: Set<string>): RevisionStatus => {
    if (statuses.has(id)) return statuses.get(id)!;
    if (visiting.has(id)) return { stale: true, reasons: ["Dependency cycle requires review"] };
    const run = latest.get(id);
    if (!run) return { stale: true, reasons: ["Source calculation has no accessible run"] };
    const next = new Set(visiting).add(id);
    const reasons: string[] = [];
    if (hasMalformedLinkSnapshot(run.provenance_json)) {
      reasons.push("Saved dependency provenance is incomplete");
    }
    for (const link of runLinks(run.provenance_json)) {
      const source = latest.get(link.source_calculation_id);
      if (!source) reasons.push("A linked source run is unavailable");
      else if (source.id !== link.source_run_id) reasons.push("A linked calculation has a newer run");
      else if (visit(source.calculation_id, next).stale) reasons.push("An upstream calculation needs recalculation");
    }
    const status = { stale: reasons.length > 0, reasons: [...new Set(reasons)] };
    statuses.set(id, status);
    return status;
  };
  for (const id of latest.keys()) visit(id, new Set());
  return statuses;
}

export function refreshedRunLinks(provenance: unknown, latestRuns: RevisionRun[]): RunLink[] {
  const latest = latestRevisionRuns(latestRuns);
  return runLinks(provenance).map((link) => {
    const source = latest.get(link.source_calculation_id);
    if (!source) throw new Error("A source calculation is unavailable; the saved link cannot be refreshed.");
    return { ...link, source_run_id: source.id };
  });
}
