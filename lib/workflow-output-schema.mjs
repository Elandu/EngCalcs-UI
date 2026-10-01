export const WIND_WORKFLOW_DEFINITION_ID = "au.wind.workflow.design_wind_speed";

const workflowOutputSchema = {
  type: "object",
  properties: {
    governing_vdes_mps: { type: "number", unit: "m/s" },
    governing_vsitb: { type: "number", unit: "m/s" },
    design_wind_speeds: {
      type: "array",
      items: {
        type: "object",
        properties: {
          vdes_theta_mps: { type: "number", unit: "m/s" },
          raw_vdes_theta_mps: { type: "number", unit: "m/s" },
          candidates: {
            type: "array",
            items: {
              type: "object",
              properties: { vsitb_mps: { type: "number", unit: "m/s" } },
            },
          },
        },
      },
    },
    directional_vsitb: {
      type: "array",
      items: {
        type: "object",
        properties: {
          final_vsitb: { type: "number", unit: "m/s" },
          recommended_vsitb: { type: "number", unit: "m/s" },
        },
      },
    },
  },
};

export function resolveCalculationOutputSchema(definitionId, registeredSchema) {
  if (registeredSchema !== null && registeredSchema !== undefined) {
    return registeredSchema;
  }
  return definitionId === WIND_WORKFLOW_DEFINITION_ID
    ? workflowOutputSchema
    : undefined;
}

function schemaAtPointer(root, path) {
  if (typeof path !== "string" || !path.startsWith("/")) return undefined;
  const parts = path.slice(1).split("/").map((part) =>
    part.replaceAll("~1", "/").replaceAll("~0", "~")
  );
  let schema = root;
  for (const part of parts) {
    if (schema?.type === "array") {
      if (!/^(0|[1-9]\d*)$/.test(part)) return undefined;
      schema = schema.items;
    } else {
      schema = schema?.properties?.[part];
    }
    if (!schema || typeof schema !== "object") return undefined;
  }
  return schema;
}

export function calculationOutputUnitAtPointer(definitionId, path, registeredSchema) {
  const schema = resolveCalculationOutputSchema(definitionId, registeredSchema);
  const property = schemaAtPointer(schema, path);
  return typeof property?.unit === "string" ? property.unit : undefined;
}
