export type CalculationRunnerFunction =
  | "opencalcs-run-calculation"
  | "opencalcs-run-calculation-v2";

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
): CalculationRunnerFunction {
  return hasLinkedInputs
    ? "opencalcs-run-calculation-v2"
    : "opencalcs-run-calculation";
}

export function calculationRunFailure(
  error: unknown,
  data: unknown,
  hasLinkedInputs: boolean,
): CalculationRunFailure | null {
  const errorMessage = record(error)?.message;
  const dataMessage = record(data)?.error;
  if (!error && !dataMessage) return null;

  const missingLinkedRunner = hasLinkedInputs && statusFromError(error) === 404;
  const message = missingLinkedRunner
    ? LINKED_RUNNER_MISSING_MESSAGE
    : typeof errorMessage === "string" && errorMessage
    ? errorMessage
    : typeof dataMessage === "string" && dataMessage
    ? dataMessage
    : "Calculation failed.";

  return {
    message,
    status: missingLinkedRunner ? 503 : 422,
  };
}
