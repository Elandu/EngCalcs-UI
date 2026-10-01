import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  applyWindSource,
  frameLinkIsValid,
  frameWindLinkFromProvenance,
  linkedInputRequest,
  missingCombinationFactors,
  validateWindLoadsForFrame,
  windLinkGeometryIsCurrent,
} from "./frame-wind-links.ts";
import { SAMPLE_FRAME_INPUTS } from "./pynite-model.ts";

test("accepts the actual OpenWind pressure-to-frame result contract", async () => {
  const result = JSON.parse(await readFile(new URL("./fixtures/openwind-frame-loads.json", import.meta.url), "utf8"));
  const applied = applyWindSource(SAMPLE_FRAME_INPUTS, { ...source, result });
  assert.equal(applied.inputs.model.member_distributed_loads[0].start_kn_m, 1.32);
  assert.deepEqual(frameLinkIsValid(applied.link, applied.inputs, { ...source, result }), []);
  const sls = structuredClone(result);
  sls.member_loads[0].limit_state = "serviceability";
  assert.doesNotThrow(() => applyWindSource(SAMPLE_FRAME_INPUTS, { ...source, result: sls }));
});

const source = {
  id: "wind-run-1",
  calculationId: "wind-calc-1",
  definitionId: "au.wind.frame_loads",
  runSequence: 2,
  stale: false,
  provenance: {},
  result: {
    standard: "AS/NZS 1170.2:2021",
    load_unit: "kN/m",
    length_unit: "m",
    member_distributed_loads: [{ member_id: "M1", load_case: "W-X", direction: "Fy", start_kn_m: -4, end_kn_m: -4, start_m: 0, end_m: 6 }],
    member_loads: [{ member_id: "M1", load_case: "W-X", direction: "Fy", start_kn_m: -4, end_kn_m: -4, start_m: 0, end_m: 6, axis_reference: "Local y is positive upward; panel normal is negative local y.", source_run_id: "wind-site-run", standard: "AS/NZS 1170.2:2021", load_unit: "kN/m", length_unit: "m", limit_state: "ultimate" }],
  },
};

test("applying an exact saved wind run replaces member loads and retains its source pointer", () => {
  const applied = applyWindSource(SAMPLE_FRAME_INPUTS, source);
  assert.deepEqual(applied.inputs.model.member_distributed_loads, source.result.member_distributed_loads);
  assert.deepEqual(applied.inputs.model.load_cases.at(-1), { id: "W-X", name: "W-X" });
  assert.equal(applied.inputs.model.load_combinations[0].factors["W-X"], 0);
  assert.deepEqual(linkedInputRequest(applied.link), {
    sourceCalculationId: "wind-calc-1",
    sourceRunId: "wind-run-1",
    sourceOutputPath: "/member_distributed_loads",
    targetInputPath: "/model/member_distributed_loads",
  });
  assert.deepEqual(missingCombinationFactors(applied.inputs), ["W-X"]);
  assert.deepEqual(frameLinkIsValid(applied.link, applied.inputs, source), []);
});

test("rejects stale or wrong-definition runs, invalid axes, missing members, spans and nonfinite loads", () => {
  assert.throws(() => applyWindSource(SAMPLE_FRAME_INPUTS, { ...source, stale: true }), /stale/);
  assert.throws(() => applyWindSource(SAMPLE_FRAME_INPUTS, { ...source, definitionId: "au.wind.site" }), /AS\/NZS 1170.2/);
  const badResult = structuredClone(source.result);
  badResult.member_loads[0].axis_reference = "";
  assert.throws(() => applyWindSource(SAMPLE_FRAME_INPUTS, { ...source, result: badResult }), /axis reference/);
  const longResult = structuredClone(source.result);
  longResult.member_distributed_loads[0].end_m = 7;
  longResult.member_loads[0].end_m = 7;
  assert.throws(() => applyWindSource(SAMPLE_FRAME_INPUTS, { ...source, result: longResult }), /outside member/);
  const unknownResult = structuredClone(source.result);
  unknownResult.member_distributed_loads[0].member_id = "M404";
  unknownResult.member_loads[0].member_id = "M404";
  assert.throws(() => applyWindSource(SAMPLE_FRAME_INPUTS, { ...source, result: unknownResult }), /missing frame member/);
  const nanResult = structuredClone(source.result);
  nanResult.member_distributed_loads[0].start_kn_m = Number.NaN;
  assert.throws(() => applyWindSource(SAMPLE_FRAME_INPUTS, { ...source, result: nanResult }), /no valid member distributed loads/);
});

test("the exact source link becomes invalid after member orientation or geometry changes", () => {
  const applied = applyWindSource(SAMPLE_FRAME_INPUTS, source);
  const reversed = structuredClone(applied.inputs);
  reversed.model.members[0].start_node = "N2";
  reversed.model.members[0].end_node = "N1";
  assert.equal(windLinkGeometryIsCurrent(applied.link, reversed.model), false);
  assert.match(frameLinkIsValid(applied.link, reversed, source)[0], /geometry or member orientation changed/);
  const rotated = structuredClone(applied.inputs);
  rotated.model.members[0].rotation_degrees = 15;
  assert.equal(windLinkGeometryIsCurrent(applied.link, rotated.model), false);
});

test("saved provenance restores its exact source run without selecting the latest run", () => {
  const applied = applyWindSource(SAMPLE_FRAME_INPUTS, source);
  const saved = frameWindLinkFromProvenance({
    linked_inputs: [{
      source_calculation_id: "wind-calc-1",
      source_run_id: "wind-run-1",
      source_run_sequence: 2,
      source_output_path: "/member_distributed_loads",
      target_input_path: "/model/member_distributed_loads",
    }],
  }, applied.inputs);
  assert.equal(saved?.sourceRunId, "wind-run-1");
  assert.deepEqual(frameLinkIsValid(saved, applied.inputs, source), []);
  assert.match(frameLinkIsValid(saved, applied.inputs, { ...source, id: "wind-run-2" })[0], /exact linked wind source run is unavailable/);
});

test("malformed or unsupported saved frame links fail closed", () => {
  const applied = applyWindSource(SAMPLE_FRAME_INPUTS, source);
  const goodLink = {
    source_calculation_id: "wind-calc-1",
    source_run_id: "wind-run-1",
    source_output_path: "/member_distributed_loads",
    target_input_path: "/model/member_distributed_loads",
  };
  assert.throws(() => frameWindLinkFromProvenance({ linked_inputs: "broken" }, applied.inputs), /malformed/);
  assert.throws(() => frameWindLinkFromProvenance({ linked_inputs: [{ source_run_id: "wind-run-1" }] }, applied.inputs), /unsupported or malformed/);
  assert.throws(() => frameWindLinkFromProvenance({ linked_inputs: [goodLink, goodLink] }, applied.inputs), /multiple linked inputs/);
  assert.equal(frameWindLinkFromProvenance({ linked_inputs: [] }, applied.inputs), null);
});

test("unassigned combination factors are only required for currently linked wind loads", () => {
  const applied = applyWindSource(SAMPLE_FRAME_INPUTS, source);
  applied.inputs.model.load_combinations[0].factors["W-X"] = 1.2;
  assert.deepEqual(missingCombinationFactors(applied.inputs), []);
  assert.deepEqual(validateWindLoadsForFrame(applied.inputs.model.member_distributed_loads, applied.inputs.model, source.result.member_loads, source.result), []);
});
