import assert from "node:assert/strict";
import test from "node:test";
import { revisionStatuses, refreshedRunLinks } from "./calculation-revisions.ts";

const run = (c, id, n = 1, links = []) => ({ id, calculation_id: c, run_sequence: n,
  provenance_json: { linked_inputs: links.map(([source, sourceRun]) => ({ source_calculation_id: source,
    source_run_id: sourceRun, source_output_path: "/pressure", target_input_path: "/load" })) } });

test("upstream revisions mark direct and transitive dependants without changing saved links", () => {
  const b = run("B", "b1", 1, [["A", "a1"]]);
  const rows = [run("A", "a1"), b, run("C", "c1", 1, [["B", "b1"]]), run("A", "a2", 2)];
  const statuses = revisionStatuses(rows);
  assert.equal(statuses.get("A").stale, false);
  assert.equal(statuses.get("B").stale, true);
  assert.equal(statuses.get("C").stale, true);
  assert.equal(b.provenance_json.linked_inputs[0].source_run_id, "a1");
  assert.equal(refreshedRunLinks(b.provenance_json, rows)[0].source_run_id, "a2");
});

test("explicit upstream then downstream reruns clear stale status", () => {
  const rows = [run("A", "a2", 2), run("B", "b2", 2, [["A", "a2"]]), run("C", "c2", 2, [["B", "b2"]])];
  assert.ok([...revisionStatuses(rows).values()].every((status) => !status.stale));
});

test("missing sources and cycles fail closed", () => {
  const missing = run("B", "b1", 1, [["A", "a1"]]);
  assert.equal(revisionStatuses([missing]).get("B").stale, true);
  assert.throws(() => refreshedRunLinks(missing.provenance_json, [missing]), /unavailable/);
  const cyclic = [run("A", "a1", 1, [["B", "b1"]]), run("B", "b1", 1, [["A", "a1"]])];
  assert.ok([...revisionStatuses(cyclic).values()].every((status) => status.stale));
});

test("malformed saved dependency provenance is stale", () => {
  const invalid = { id: "b1", calculation_id: "B", run_sequence: 1,
    provenance_json: { linked_inputs: [{ source_calculation_id: "A" }] } };
  assert.deepEqual(revisionStatuses([invalid]).get("B"), {
    stale: true,
    reasons: ["Saved dependency provenance is incomplete"],
  });
});
