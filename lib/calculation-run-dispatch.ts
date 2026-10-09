export type CalculationRunnerFunction =
  | "engcalcs-run-calculation"
  | "engcalcs-run-calculation-v2"
  | "engcalcs-run-calculation-v3";

export type CalculationRunFailure = {
  message: string;
  status: number;
};

const LINKED_RUNNER_MISSING_MESSAGE =
  "Linked calculation support is not deployed yet. No linked run was saved.";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function statusFromError(error: unknown): number | undefined {
  const context = record(record(error)?.context);
  const status = Number(context?.status);
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : undefined;
}

export function calculationRunnerFunction(
  hasLinkedInputs: boolean,
  revision = false,
): CalculationRunnerFunction {
  if (revision) return "engcalcs-run-calculation-v3";
  return hasLinkedInputs
    ? "engcalcs-run-calculation-v2"
    : "engcalcs-run-calculation";
}

export function calculationRunFailure(
  error: unknown,
  data: unknown,
  hasLinkedInputs: boolean,
  revision = false,
): CalculationRunFailure | null {
  const errorMessage = record(error)?.message;
  const dataMessage = record(data)?.error;
  if (!error && !dataMessage) return null;

  const status = statusFromError(error);
  const missingRunner = (hasLinkedInputs || revision) && status === 404;
  const message = missingRunner
    ? revision ? "Calculation revision support is not deployed yet. No revision was saved." : LINKED_RUNNER_MISSING_MESSAGE
    : typeof dataMessage === "string" && dataMessage
    ? dataMessage
    : typeof errorMessage === "string" && errorMessage
    ? errorMessage
    : "Calculation failed.";

  return {
    message,
    status: missingRunner ? 503 : status ?? 422,
  };
}
