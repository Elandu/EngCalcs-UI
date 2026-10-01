export function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasEightDirections(rows) {
  if (!Array.isArray(rows) || rows.length !== 8) return false;
  const directions = rows.map((row) => isRecord(row) ? row.direction : null);
  return directions.every((direction) =>
    ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].includes(direction)
  ) && new Set(directions).size === 8;
}

export function validateWindWorkflowEnvelope(value) {
  if (!isRecord(value) || typeof value.workflow_id !== "string" || !value.workflow_id.trim()) {
    return "Wind assessment returned an invalid workflow envelope.";
  }
  const stages = value.stages;
  if (!isRecord(stages)) return "Wind assessment returned no workflow stages.";

  const siteAnalysis = isRecord(stages.site) ? stages.site.site_analysis : null;
  if (!isRecord(siteAnalysis) || !isRecord(siteAnalysis.site) ||
    !Array.isArray(siteAnalysis.profiles) || !Array.isArray(siteAnalysis.features)) {
    return "Wind assessment did not return complete site analysis.";
  }

  const windInputs = stages.wind_inputs;
  if (!isRecord(windInputs) || !isRecord(windInputs.wind_region_assessment) ||
    !isRecord(windInputs.regional_wind_speed_assessment) ||
    !isRecord(windInputs.direction_multiplier_assessment)) {
    return "Wind assessment did not return the required wind input assessments.";
  }

  const terrain = isRecord(stages.terrain) ? stages.terrain.terrain_category_evidence : null;
  if (!isRecord(terrain) || !hasEightDirections(terrain.directions) ||
    !hasEightDirections(terrain.mzcat_assessment)) {
    return "Wind assessment did not return eight directional terrain and Mz,cat rows.";
  }

  const obstruction = isRecord(stages.obstructions) ? stages.obstructions.obstruction_summary : null;
  if (!isRecord(obstruction) || !Number.isFinite(obstruction.total_obstructions) ||
    !Number.isFinite(obstruction.shielding_sectors) || !Array.isArray(obstruction.warnings)) {
    return "Wind assessment did not return a complete obstruction summary.";
  }

  const workflow = isRecord(stages.workflow) ? stages.workflow.workflow : null;
  if (!isRecord(workflow) || !Array.isArray(workflow.variables) ||
    !hasEightDirections(workflow.directional_vsitb) ||
    !Array.isArray(workflow.design_wind_speeds)) {
    return "Wind assessment did not return complete directional workflow results.";
  }
  const variableRows = workflow.variables.filter(isRecord);
  const hasOneUndirected = (name) => {
    const rows = variableRows.filter((row) => row.variable === name);
    return rows.length === 1 && rows[0].direction == null;
  };
  const hasEightVariableDirections = (name) =>
    hasEightDirections(variableRows.filter((row) => row.variable === name));
  if (!hasOneUndirected("VR") || !hasOneUndirected("Mc") ||
    !["Md", "Mzcat", "Ms", "Mt", "Vsitb"].every(hasEightVariableDirections)) {
    return "Wind assessment returned an incomplete workflow variable set.";
  }
  return null;
}

export function expectedRunIdsMatch(expected, calculations, latestByCalculation) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) return false;
  const ids = expected;
  if (Object.keys(ids).length !== calculations.length) return false;
  return calculations.every((calculation) =>
    isUuid(ids[calculation.id]) &&
    latestByCalculation.get(calculation.id)?.id === ids[calculation.id]
  );
}

export function isDefiniteRpcRejection(error) {
  if (!error || typeof error !== "object") return false;
  const { code, status } = error;
  // SQLSTATE takes precedence even if a proxy labels an uncertain outcome 4xx.
  if (code === "40003" || (typeof code === "string" && code.startsWith("08"))) return false;
  if (code === "PGRST202" || code === "42883") return true;
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) && (
    code === "P0001" || ["22", "23", "25", "28", "2D", "3B", "40", "42"].includes(code.slice(0, 2))
  ) && code !== "40003") return true;
  return Number.isInteger(status) && status >= 400 && status < 500 &&
    status !== 408 && status !== 429;
}

export function rpcFailure(error) {
  const rpcError = error && typeof error === "object" ? error : {};
  const code = typeof rpcError.code === "string" ? rpcError.code : "";
  const status = Number(rpcError.status);
  const message = typeof rpcError.message === "string" && rpcError.message
    ? rpcError.message
    : "Wind workflow action failed.";

  if (status === 404 || code === "PGRST202" || code === "42883") {
    return { error: "Atomic Wind workflow support is not deployed yet.", status: 503 };
  }
  if (code === "40001" || code === "23505") return { error: message, status: 409 };
  if (code === "42501") return { error: message, status: 403 };
  return { error: message, status: 422 };
}
