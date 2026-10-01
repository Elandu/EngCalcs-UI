import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedRunIdsMatch,
  isDefiniteRpcRejection,
  rpcFailure,
  validateWindWorkflowEnvelope,
} from "./wind-workflow-rpc.mjs";

const calcA = "00000000-0000-4000-8000-000000000001";
const calcB = "00000000-0000-4000-8000-000000000002";
const runA = "00000000-0000-4000-8000-000000000011";
const runB = "00000000-0000-4000-8000-000000000012";

test("expected run map must exactly match the displayed calculation parents", () => {
  const calculations = [{ id: calcA }, { id: calcB }];
  const latest = new Map([[calcA, { id: runA }], [calcB, { id: runB }]]);
  assert.equal(expectedRunIdsMatch({ [calcA]: runA, [calcB]: runB }, calculations, latest), true);
  assert.equal(expectedRunIdsMatch({ [calcA]: runA, [calcB]: "stale" }, calculations, latest), false);
  assert.equal(expectedRunIdsMatch({ [calcA]: runA }, calculations, latest), false);
  assert.equal(expectedRunIdsMatch({ [calcA]: runA, [calcB]: runB, extra: runA }, calculations, latest), false);
  assert.equal(expectedRunIdsMatch([], calculations, latest), false);
});

test("only definite RPC rejections permit deleting an uploaded issue artifact", () => {
  assert.equal(isDefiniteRpcRejection({ status: 409, code: "40001" }), true);
  assert.equal(isDefiniteRpcRejection({ status: 404, code: "PGRST202" }), true);
  assert.equal(isDefiniteRpcRejection({ code: "22023" }), true);
  assert.equal(isDefiniteRpcRejection({ code: "42501" }), true);
  assert.equal(isDefiniteRpcRejection({ code: "23505" }), true);
  assert.equal(isDefiniteRpcRejection({ code: "08007" }), false);
  assert.equal(isDefiniteRpcRejection({ code: "40003" }), false);
  assert.equal(isDefiniteRpcRejection({ code: "40003", status: 400 }), false);
  assert.equal(isDefiniteRpcRejection({ code: "08007", status: 409 }), false);
  assert.equal(isDefiniteRpcRejection({ status: 408 }), false);
  assert.equal(isDefiniteRpcRejection({ status: 429 }), false);
  assert.equal(isDefiniteRpcRejection({ status: 500 }), false);
  assert.equal(isDefiniteRpcRejection({ message: "connection reset" }), false);
  assert.equal(isDefiniteRpcRejection(null), false);
});

test("engine envelope guard requires workflow evidence but accepts blocked speeds", () => {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const rows = directions.map((direction) => ({ direction }));
  const workflow = {
    variables: [
      { variable: "VR" },
      { variable: "Mc" },
      ...["Md", "Mzcat", "Ms", "Mt", "Vsitb"].flatMap((variable) =>
        directions.map((direction) => ({ variable, direction }))
      ),
    ],
    directional_vsitb: rows.map((row) => ({ ...row, status: "blocked", final_vsitb: null })),
    design_wind_speeds: [],
  };
  const envelope = {
    workflow_id: "au.wind.site_assessment",
    result: workflow,
    stages: {
      site: { site_analysis: { site: { latitude: -33, longitude: 151 }, profiles: [], features: [] } },
      wind_inputs: {
        wind_region_assessment: {}, regional_wind_speed_assessment: {},
        direction_multiplier_assessment: {},
      },
      terrain: { terrain_category_evidence: { directions: rows, mzcat_assessment: rows } },
      obstructions: { obstruction_summary: { total_obstructions: 0, shielding_sectors: 0, warnings: [] } },
      workflow: { workflow },
    },
  };
  assert.equal(validateWindWorkflowEnvelope(envelope), null);
  assert.match(validateWindWorkflowEnvelope({ ...envelope, stages: {} }), /complete site analysis/);
  const missingResult = structuredClone(envelope);
  delete missingResult.result;
  assert.equal(validateWindWorkflowEnvelope(missingResult), null);
  assert.match(validateWindWorkflowEnvelope({
    ...envelope,
    stages: { ...envelope.stages, workflow: { workflow: {} } },
  }), /complete directional workflow results/);
  const incompleteVariables = structuredClone(envelope);
  incompleteVariables.stages.workflow.workflow.variables =
    incompleteVariables.stages.workflow.workflow.variables.filter((row) => row.variable !== "Md");
  assert.match(validateWindWorkflowEnvelope(incompleteVariables), /incomplete workflow variable set/);
});

test("RPC failures map conflict, authorization and missing deployment distinctly", () => {
  assert.deepEqual(rpcFailure({ code: "40001", message: "stale" }), { error: "stale", status: 409 });
  assert.deepEqual(rpcFailure({ code: "42501", message: "forbidden" }), { error: "forbidden", status: 403 });
  assert.deepEqual(rpcFailure({ code: "PGRST202", message: "missing" }), {
    error: "Atomic Wind workflow support is not deployed yet.",
    status: 503,
  });
});
