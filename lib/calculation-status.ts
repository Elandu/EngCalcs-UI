// Kept literal so this module has no runtime imports (it is tested directly under Node).
const AS4100_SECTION_ID = "structural.as4100.section_analysis";

export type CalculationStatus = "pass" | "fail" | "stale" | "info" | "none";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Status icon for a saved calculation in the project tree. Only engine-reported check
 * outcomes produce pass or fail; calculations without code checks show as informational.
 */
export function calculationStatus(definitionId: string, result: unknown, stale = false): CalculationStatus {
  if (result === undefined || result === null) return "none";
  if (stale) return "stale";
  if (definitionId === AS4100_SECTION_ID) {
    const outer = record(result);
    const payload = Object.keys(record(outer.result)).length ? record(outer.result) : outer;
    const checks = [record(payload.tension).section_capacity_satisfied, record(payload.compression).section_capacity_satisfied];
    if (checks.every((value) => typeof value === "boolean")) return checks.every(Boolean) ? "pass" : "fail";
  }
  return "info";
}
