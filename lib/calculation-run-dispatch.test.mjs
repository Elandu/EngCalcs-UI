import assert from "node:assert/strict";
import test from "node:test";

import {
  calculationRunFailure,
  calculationRunnerFunction,
} from "./calculation-run-dispatch.ts";

test("dispatches standalone runs to the deployed runner", () => {
  assert.equal(
    calculationRunnerFunction(false),
    "opencalcs-run-calculation",
  );
});

test("dispatches linked runs to the linked runner", () => {
  assert.equal(
    calculationRunnerFunction(true),
    "opencalcs-run-calculation-v2",
  );
});

test("dispatches revisions to the revision runner even without linked inputs", () => {
  assert.equal(
    calculationRunnerFunction(false, true),
    "opencalcs-run-calculation-v3",
  );
});

test("reports a missing linked runner as unavailable without claiming a saved run", () => {
  const result = calculationRunFailure(
    { message: "Edge Function returned a non-2xx status code", context: { status: 404 } },
    null,
    true,
  );

  assert.deepEqual(result, {
    message: "Linked calculation support is not deployed yet. No linked run was saved.",
    status: 503,
  });
});

test("reports a missing revision runner as unavailable without claiming a saved run", () => {
  assert.deepEqual(
    calculationRunFailure(
      { message: "Edge Function returned a non-2xx status code", context: { status: 404 } },
      null,
      false,
      true,
    ),
    {
      message: "Calculation revision support is not deployed yet. No revision was saved.",
      status: 503,
    },
  );
});

test("preserves revision conflict status and server message", () => {
  assert.deepEqual(
    calculationRunFailure(
      { message: "Edge Function returned a non-2xx status code", context: { status: 409 } },
      { error: "Calculation changed. Reload before saving a revision." },
      false,
      true,
    ),
    { message: "Calculation changed. Reload before saving a revision.", status: 409 },
  );
});

test("does not mislabel standalone errors as a missing linked runner", () => {
  assert.deepEqual(
    calculationRunFailure(
      { message: "Calculation function not found", context: { status: 404 } },
      null,
      false,
    ),
    { message: "Calculation function not found", status: 404 },
  );
});

test("uses edge-function response errors for linked runs other than a missing runner", () => {
  assert.deepEqual(
    calculationRunFailure(
      { message: "Edge Function returned a non-2xx status code", context: { status: 422 } },
      { error: "Linked value does not satisfy the target schema" },
      true,
    ),
    { message: "Linked value does not satisfy the target schema", status: 422 },
  );
});

test("uses returned calculation errors when invocation itself succeeded", () => {
  assert.deepEqual(
    calculationRunFailure(null, { error: "Calculation failed validation" }, false),
    { message: "Calculation failed validation", status: 422 },
  );
});

test("leaves successful responses untouched", () => {
  assert.equal(calculationRunFailure(null, { result: { value: 5 } }, true), null);
});
