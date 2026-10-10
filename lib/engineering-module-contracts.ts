/**
 * Engineering dependency descriptors are advisory. The host decides which
 * schemas can be directly connected; the engineer still confirms project use.
 */
export type EngineeringConnection = {
  id: string;
  source_calculation_id: string;
  target_calculation_id: string;
  mode: "direct" | "reviewed_import" | "adapter_required";
  source_output_path: string | null;
  target_input_path: string | null;
  unit: string | null;
  installed: boolean;
  direct_link_ready: boolean;
  requires_engineer_review: boolean;
  requires_adapter: boolean;
  automated_transfer_allowed: boolean;
  reason: string;
  verification: string;
};

export function connectionsForCalculation(
  connections: readonly EngineeringConnection[],
  calculationId: string,
): EngineeringConnection[] {
  return connections
    .filter((link) => link.source_calculation_id === calculationId ||
      link.target_calculation_id === calculationId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function engineeringConnectionLabel(link: EngineeringConnection): string {
  if (!link.installed) return "Module unavailable";
  if (link.mode === "adapter_required") return "Engineering adapter required";
  if (link.mode === "reviewed_import") return "Reviewed import";
  if (link.direct_link_ready && link.automated_transfer_allowed) {
    return "Schema-compatible link";
  }
  return "Direct link not validated";
}
