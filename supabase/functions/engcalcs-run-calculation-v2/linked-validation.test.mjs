import assert from "node:assert/strict";
import test from "node:test";
import {
  isSupportedLinkValue,
  matchesSchema,
  pointerPathsOverlap,
  windSourceLinkError,
} from "./linked-validation.ts";

test("wind source references agree with both individually resolved design-speed links", () => {
  const definition = "au.wind.frame_loads";
  const inputs = { pressure_cases: [{ source_run_id: "run-a" }] };
  const links = ["vdes_external_mps", "vdes_internal_mps"].map((field) => ({
    source_run_id: "run-a", target_input_path: `/pressure_cases/0/${field}`,
  }));
  assert.equal(windSourceLinkError(definition, inputs, links), null);
  assert.match(windSourceLinkError(definition, { pressure_cases: [{ source_run_id: "run-b" }] }, links), /must match/);
  assert.match(windSourceLinkError(definition, inputs, [links[0], { ...links[1], source_run_id: "run-b" }]), /must match/);
  assert.match(windSourceLinkError(definition, inputs, links.slice(0, 1)), /both external and internal/);
  assert.match(windSourceLinkError(definition, inputs, [{ source_run_id: "run-a", target_input_path: "/pressure_cases" }]), /individually/);
  assert.equal(windSourceLinkError(definition, inputs, []), null, "manual references remain caller assertions");
  assert.equal(windSourceLinkError("other.method", inputs, links.slice(0, 1)), null);
  const twoCases = { pressure_cases: [{ source_run_id: "run-a" }, { source_run_id: "run-b" }] };
  const otherLinks = links.map((link) => ({ ...link, target_input_path: link.target_input_path.replace("/0/", "/1/") }));
  assert.match(windSourceLinkError(definition, twoCases, [...links, ...otherLinks]), /case 2/);
});

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
