import assert from "node:assert/strict";
import test from "node:test";

import { PREVIEWABLE_CALCULATION_IDS } from "./calculation-catalogue.ts";
import { previewFailure } from "./calculation-preview.ts";

test("only structural calculations can be previewed without saving", () => {
  assert.deepEqual([...PREVIEWABLE_CALCULATION_IDS].sort(), [
    "structural.as3600.section_analysis",
    "structural.as4100.section_analysis",
    "structural.pynite.frame_analysis",
  ]);
});

test("engine responses map to user-facing preview outcomes", () => {
  assert.equal(previewFailure(200, { tension: {} }), null);
  assert.equal(previewFailure(200, null).status, 502);
  assert.equal(previewFailure(422, { detail: "Net area must not exceed gross area." }).message, "Net area must not exceed gross area.");
  assert.equal(
    previewFailure(422, { detail: [{ loc: ["body", "inputs", "section"], msg: "Field required" }] }).message,
    "inputs.section: Field required",
  );
  assert.equal(previewFailure(422, {}).message, "The engine rejected these inputs.");
  assert.equal(previewFailure(404, { detail: "Unknown calculation" }).message, "This calculation is not installed in the connected engine yet.");
  assert.equal(previewFailure(401, {}).status, 401);
  assert.equal(previewFailure(503, {}).status, 502);
});
