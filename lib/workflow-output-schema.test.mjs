import assert from "node:assert/strict";
import test from "node:test";

import {
  calculationOutputUnitAtPointer,
  resolveCalculationOutputSchema,
  WIND_WORKFLOW_DEFINITION_ID,
} from "./workflow-output-schema.mjs";

test("known workflow speed outputs have canonical m/s units", () => {
  for (const path of [
    "/governing_vdes_mps",
    "/governing_vsitb",
    "/design_wind_speeds/0/vdes_theta_mps",
    "/design_wind_speeds/12/raw_vdes_theta_mps",
    "/design_wind_speeds/0/candidates/2/vsitb_mps",
    "/directional_vsitb/0/final_vsitb",
    "/directional_vsitb/3/recommended_vsitb",
  ]) {
    assert.equal(
      calculationOutputUnitAtPointer(WIND_WORKFLOW_DEFINITION_ID, path),
      "m/s",
      path,
    );
  }
});

test("unknown definitions and non-speed paths have no inferred unit", () => {
  assert.equal(calculationOutputUnitAtPointer("au.wind.unknown", "/governing_vdes_mps"), undefined);
  assert.equal(calculationOutputUnitAtPointer(WIND_WORKFLOW_DEFINITION_ID, "/other_vdes_mps"), undefined);
  assert.equal(calculationOutputUnitAtPointer(WIND_WORKFLOW_DEFINITION_ID, "/design_wind_speeds/not-an-index/vdes_theta_mps"), undefined);
  assert.equal(calculationOutputUnitAtPointer(WIND_WORKFLOW_DEFINITION_ID, "/directional_vsitb/0/vr"), undefined);
});

test("registered schemas take precedence over the fallback, including conflicts", () => {
  const conflictingSchema = {
    type: "object",
    properties: { governing_vdes_mps: { type: "number", unit: "km/h" } },
  };
  assert.equal(
    resolveCalculationOutputSchema(WIND_WORKFLOW_DEFINITION_ID, conflictingSchema),
    conflictingSchema,
  );
  assert.equal(
    calculationOutputUnitAtPointer(WIND_WORKFLOW_DEFINITION_ID, "/governing_vdes_mps", conflictingSchema),
    "km/h",
  );
});
