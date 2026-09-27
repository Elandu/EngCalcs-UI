import assert from "node:assert/strict";
import test from "node:test";
import {
  isSupportedLinkValue,
  matchesSchema,
  pointerPathsOverlap,
} from "./linked-validation.ts";

test("supports complete array values for structured links", () => {
  assert.equal(isSupportedLinkValue([]), true);
  assert.equal(isSupportedLinkValue([{ pressure: 1.2 }]), true);
  assert.equal(isSupportedLinkValue(null), false);
  assert.equal(isSupportedLinkValue(undefined), false);
});

test("detects overlapping target paths without matching neighboring fields", () => {
  assert.equal(pointerPathsOverlap("/loads", "/loads/0/pressure"), true);
  assert.equal(pointerPathsOverlap("/loads/0", "/loads"), true);
  assert.equal(pointerPathsOverlap("/loads", "/loads2"), false);
  assert.equal(pointerPathsOverlap("/load~1case", "/load/case"), false);
});

test("validates array item types, nested properties, and item limits", () => {
  const schema = {
    type: "array",
    minItems: 1,
    maxItems: 2,
    items: {
      type: "object",
      required: ["pressure"],
      properties: {
        pressure: { type: "number", minimum: 0 },
        direction: { type: "string" },
      },
    },
  };

  assert.equal(matchesSchema([{ pressure: 1.2 }, { pressure: 0 }], schema), true);
  assert.equal(matchesSchema([], schema), false);
  assert.equal(matchesSchema([{ pressure: 1 }, { pressure: 2 }, { pressure: 3 }], schema), false);
  assert.equal(matchesSchema([{ pressure: "1.2" }], schema), false);
  assert.equal(matchesSchema([{ direction: "north" }], schema), false);
  assert.equal(matchesSchema([{ pressure: -0.1 }], schema), false);
});

test("validates nested arrays recursively", () => {
  const schema = {
    type: "array",
    items: {
      type: "array",
      minItems: 2,
      items: { type: "integer" },
    },
  };

  assert.equal(matchesSchema([[1, 2], [3, 4]], schema), true);
  assert.equal(matchesSchema([[1], [3, 4]], schema), false);
  assert.equal(matchesSchema([[1, 2.5]], schema), false);
});
