import assert from "node:assert/strict";
import test from "node:test";

import { calculationStatus } from "./calculation-status.ts";

const steel = (tension, compression) => ({
  tension: { section_capacity_satisfied: tension },
  compression: { section_capacity_satisfied: compression },
});

test("steel section runs report pass or fail from engine check outcomes", () => {
  assert.equal(calculationStatus("structural.as4100.section_analysis", steel(true, true)), "pass");
  assert.equal(calculationStatus("structural.as4100.section_analysis", steel(true, false)), "fail");
  assert.equal(calculationStatus("structural.as4100.section_analysis", { result: steel(false, true) }), "fail");
});

test("stale, unchecked and missing results are not reported as passing", () => {
  assert.equal(calculationStatus("structural.as4100.section_analysis", steel(true, true), true), "stale");
  assert.equal(calculationStatus("structural.as3600.section_analysis", { ultimate: {} }), "info");
  assert.equal(calculationStatus("structural.as4100.section_analysis", { tension: {} }), "info");
  assert.equal(calculationStatus("structural.as4100.section_analysis", undefined), "none");
});
