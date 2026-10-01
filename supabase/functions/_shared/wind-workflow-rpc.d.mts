export type CalculationRunRef = { id: string };
export type CalculationRef = { id: string };
export function isUuid(value: unknown): value is string;
export function validateWindWorkflowEnvelope(value: unknown): string | null;
export function expectedRunIdsMatch(
  expected: unknown,
  calculations: CalculationRef[],
  latestByCalculation: Map<string, CalculationRunRef>,
): boolean;
export function isDefiniteRpcRejection(error: unknown): boolean;
export function rpcFailure(error: unknown): { error: string; status: number };
