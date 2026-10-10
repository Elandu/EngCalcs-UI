import assert from "node:assert/strict";
import test from "node:test";
import { assessRevisionImpact, valueAtPointer } from "./revision-impact.ts";

const calc = (id, title = id, definition = "test.engine") => ({
  id, title, calculation_definition_id: definition, state: "draft",
});
const run = (calcId, id, sequence, result, links = []) => ({
  id, calculation_id: calcId, run_sequence: sequence, result_json: { result },
  provenance_json: { linked_inputs: links },
});
const link = (source, target, output = "/pressure", input = "/loads") => ({
  source_calculation_id: source,
  source_output_path: output,
  target_calculation_id: target,
  target_input_path: input,
});
const snapshot = (source, id, output = "/pressure", input = "/loads") => ({
  ...link(source, "ignored", output, input),
  source_run_id: id,
});

test("JSON pointers read escaped keys and array entries, but never traverse unsafe paths", () => {
  const row = { result: { "a/b": [{ "~value": 1.32 }] } };
  assert.deepEqual(valueAtPointer(row, "/result/a~1b/0/~0value"), { found: true, value: 1.32 });
  assert.equal(valueAtPointer(row, "/result/a~1b/1/~0value").found, false);
  assert.equal(valueAtPointer(row, "result/a~1b").found, false);
  assert.equal(valueAtPointer(row, "/result/a~2b").found, false);
});

test("saved wind revision changes a linked frame input and flags downstream checking", () => {
  const nodes = [calc("wind", "Wind loads"), calc("frame", "Frame analysis"), calc("steel", "Steel member")];
  const graph = [link("wind", "frame", "/member_distributed_loads", "/model/member_distributed_loads"),
    link("frame", "steel", "/member_results", "/actions")];
  const prior = [{ member_id: "M1", start_kn_m: 1.32, end_kn_m: 1.32 }];
  const current = [{ member_id: "M1", start_kn_m: 1.44, end_kn_m: 1.44 }];
  const results = [
    run("wind", "wind-run-1", 1, { member_distributed_loads: prior }),
    run("wind", "wind-run-2", 2, { member_distributed_loads: current }),
    run("frame", "frame-run-1", 1, { member_results: [{ axial_kn: 3 }] },
      [snapshot("wind", "wind-run-1", "/member_distributed_loads", "/model/member_distributed_loads")]),
    run("steel", "steel-run-1", 1, { utilisation: 0.5 },
      [snapshot("frame", "frame-run-1", "/member_results", "/actions")]),
  ];
  const before = JSON.stringify(results);
  const assessment = assessRevisionImpact(nodes, results, graph, "wind");
  assert.equal(assessment.isActualRevision, true);
  assert.equal(assessment.outputComparisons.length, 1);
  assert.equal(assessment.outputComparisons[0].status, "changed");
  assert.deepEqual(assessment.outputComparisons[0].before, prior);
  assert.deepEqual(assessment.outputComparisons[0].after, current);
  assert.deepEqual(assessment.affected.map((x) => x.calculation.id), ["frame", "steel"]);
  assert.equal(assessment.affected[0].cause, "linked_output_changed");
  assert.equal(assessment.affected[0].savedSourceCurrent, false);
  assert.equal(assessment.affected[1].cause, "downstream_review");
  assert.equal(assessment.affected[1].savedSourceCurrent, true);
  assert.equal(JSON.stringify(results), before, "Impact assessment must not mutate saved run records");
});

test("source run changes, even if its linked output does not, must not silently approve dependent runs", () => {
  const result = assessRevisionImpact([calc("a"), calc("b")],
    [run("a", "a1", 1, { pressure: 1.32 }), run("a", "a2", 2, { pressure: 1.32 }),
      run("b", "b1", 1, {}, [snapshot("a", "a1")])],
    [link("a", "b")], "a");
  assert.equal(result.outputComparisons[0].status, "unchanged");
  assert.equal(result.affected[0].cause, "new_source_run");
  assert.equal(result.affected[0].savedSourceCurrent, false);
});

test("missing previous runs or removed linked outputs fail closed as unverifiable", () => {
  const nodes = [calc("a"), calc("b")];
  const edges = [link("a", "b")];
  const first = assessRevisionImpact(nodes, [run("a", "a1", 1, {}), run("b", "b1", 1, {})], edges, "a");
  assert.equal(first.isActualRevision, false);
  assert.equal(first.outputComparisons[0].status, "unverifiable");
  assert.equal(first.affected[0].cause, "unverifiable");
  const removed = assessRevisionImpact(nodes,
    [run("a", "a1", 1, { pressure: 2 }), run("a", "a2", 2, {}), run("b", "b1", 1, {})], edges, "a");
  assert.equal(removed.outputComparisons[0].status, "unverifiable");
  assert.ok(removed.warnings.some((w) => w.includes("absent")));
});

test("cross-project links are ignored and cycles are reported rather than recursed", () => {
  const nodes = [calc("a"), calc("b")];
  const graph = [link("a", "other"), link("a", "b"), link("b", "a")];
  const result = assessRevisionImpact(nodes, [run("a", "a1", 1, { pressure: 1 }), run("a", "a2", 2, { pressure: 2 })], graph, "a");
  assert.deepEqual(result.affected.map((x) => x.calculation.id), ["b"]);
  assert.ok(result.warnings.some((warning) => warning.includes("missing project calculation")));
  assert.ok(result.warnings.some((warning) => warning.includes("cycle")));
  assert.throws(() => assessRevisionImpact(nodes, [], graph, "not-a-project-node"), /not in this project/);
});

test("comparison includes every linked root output and reports mixed changed/unchanged", () => {
  const nodes = [calc("a"), calc("b"), calc("c")];
  const graph = [link("a", "b", "/pressure", "/p"), link("a", "c", "/speed", "/v")];
  const result = assessRevisionImpact(nodes,
    [run("a", "a1", 1, { pressure: 1, speed: 30 }), run("a", "a2", 2, { pressure: 2, speed: 30 })],
    graph, "a");
  assert.deepEqual(result.outputComparisons.map((x) => [x.path, x.status]),
    [["/pressure", "changed"], ["/speed", "unchanged"]]);
});
