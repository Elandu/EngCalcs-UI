/** Explicit server-side validation for evidence and proposal metadata. */
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const projectRoles = ["owner", "admin", "engineer"] as const;
export const reviewRoles = ["owner", "admin", "engineer", "reviewer"] as const;

export type SourceCreate = {
  kind: "drawing" | "schedule" | "site_observation" | "report" | "other";
  title: string;
  revisionLabel?: string;
  reference: string;
  contentSha256?: string;
};

export type ProposalCreate = {
  sourceId: string;
  targetCalculationId?: string;
  targetInputPath: string;
  proposedValue: unknown;
  sourceLocation: string;
  rationale: string;
};

export type DecisionCreate = {
  decision: "accepted" | "rejected";
  reviewNote: string;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function stringInRange(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

export function validSourceCreate(value: unknown): value is SourceCreate {
  const item = object(value);
  if (!item) return false;
  if (!["drawing", "schedule", "site_observation", "report", "other"].includes(String(item.kind))) {
    return false;
  }
  if (!stringInRange(item.title, 1, 200) || !stringInRange(item.reference, 1, 1024)) return false;
  if (item.revisionLabel !== undefined && (typeof item.revisionLabel !== "string" || item.revisionLabel.length > 80)) return false;
  if (item.contentSha256 !== undefined && (typeof item.contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.contentSha256))) return false;
  return true;
}

export function validJsonPointer(path: unknown): path is string {
  return typeof path === "string" && path.startsWith("/") && path.length >= 2 &&
    path.length <= 1024 && path.split("/").length <= 33 && !/~(?![01])/.test(path);
}

function jsonSafe(value: unknown, depth = 0): boolean {
  if (depth > 16) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 400 && value.every((v) => jsonSafe(v, depth + 1));
  const obj = object(value);
  if (!obj) return false;
  const entries = Object.entries(obj);
  return entries.length <= 200 && entries.every(([key, item]) => key.length <= 200 && jsonSafe(item, depth + 1));
}

export function validProposalCreate(value: unknown): value is ProposalCreate {
  const item = object(value);
  if (!item || !uuidPattern.test(String(item.sourceId))) return false;
  if (item.targetCalculationId !== undefined && !uuidPattern.test(String(item.targetCalculationId))) return false;
  if (!validJsonPointer(item.targetInputPath) ||
      !stringInRange(item.sourceLocation, 1, 512) ||
      !stringInRange(item.rationale, 1, 2000) ||
      !Object.hasOwn(item, "proposedValue") ||
      item.proposedValue === null || !jsonSafe(item.proposedValue)) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(item.proposedValue)).byteLength <= 16384;
  } catch {
    return false;
  }
}

export function validDecisionCreate(value: unknown): value is DecisionCreate {
  const item = object(value);
  return Boolean(item &&
    (item.decision === "accepted" || item.decision === "rejected") &&
    stringInRange(item.reviewNote, 1, 2000));
}
