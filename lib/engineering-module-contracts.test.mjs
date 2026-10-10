import assert from "node:assert/strict";
import test from "node:test";

import { connectionsForCalculation, engineeringConnectionLabel } from "./engineering-module-contracts.ts";

const makeLink = (id, source, target, mode, ready = false) => ({
  id,
  source_calculation_id: source,
  target_calculation_id: target,
  mode,
  source_output_path: mode === "direct" ? "/results/catchment_area_m2" : null,
  target_input_path: mode === "direct" ? "/catchment_area_m2" : null,
  unit: mode === "direct" ? "m2" : null,
  installed: true,
  direct_link_ready: ready,
  automated_transfer_allowed: ready,
  requires_engineer_review: true,
  requires_adapter: mode === "adapter_required",
  reason: "Engineer must review the proposed engineering dependency.",
  verification: "Schema verified",
});

test("filter shows only dependencies in either direction without changing source metadata", () => {
  const roofLink = makeLink("a", "stormwater.as3500.roof_catchment", "stormwater.as3500.roof_flow", "direct", true);
  const frameLink = makeLink("z", "structural.pynite.frame_analysis", "structural.as4100.section_analysis", "adapter_required");
  const untouched = JSON.stringify([frameLink, roofLink]);
  const filtered = connectionsForCalculation([frameLink, roofLink], "stormwater.as3500.roof_flow");
  assert.deepEqual(filtered.map((row) => row.id), ["a"]);
  assert.deepEqual(connectionsForCalculation([frameLink, roofLink], "structural.pynite.frame_analysis").map((row) => row.id), ["z"]);
  assert.deepEqual(connectionsForCalculation([frameLink, roofLink], "does.not.exist"), []);
  assert.equal(JSON.stringify([frameLink, roofLink]), untouched);
});

test("link labels do not imply that adapter- or engineer-review operations are automatic", () => {
  assert.equal(engineeringConnectionLabel(makeLink("x", "a", "b", "adapter_required")), "Engineering adapter required");
  assert.equal(engineeringConnectionLabel(makeLink("x", "a", "b", "reviewed_import")), "Reviewed import");
  assert.equal(engineeringConnectionLabel(makeLink("x", "a", "b", "direct", true)), "Schema-compatible link");
  assert.equal(engineeringConnectionLabel(makeLink("x", "a", "b", "direct", false)), "Direct link not validated");
  assert.equal(engineeringConnectionLabel({ ...makeLink("x", "a", "b", "direct", true), installed: false }), "Module unavailable");
});
