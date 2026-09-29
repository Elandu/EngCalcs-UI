export const WIND_WORKFLOW_DEFINITION_ID: "au.wind.workflow.design_wind_speed";

export function resolveCalculationOutputSchema(
  definitionId: string,
  registeredSchema: unknown,
): unknown;

export function calculationOutputUnitAtPointer(
  definitionId: string,
  path: string,
  registeredSchema?: unknown,
): string | undefined;
