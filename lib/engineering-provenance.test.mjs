import assert from "node:assert/strict";
import test from "node:test";

import {
  projectRoles, reviewRoles, uuidPattern,
  validSourceCreate, validProposalCreate, validDecisionCreate, validJsonPointer,
} from "./engineering-provenance.ts";

const uuid = "00000000-0000-4000-8000-000000000001";
const source = {
  kind: "drawing",
  title: "Architectural plan",
  revisionLabel: "C",
  reference: "A-101 / Rev C",
  contentSha256: "c".repeat(64),
};
const proposal = {
  sourceId: uuid,
  targetInputPath: "/wind/region",
  proposedValue: "A2",
  sourceLocation: "A-101 grid 3 / sheet 2",
  rationale: "Adopted from the supplied planning drawing for engineering review",
};

test("source metadata requires a specific project reference and valid immutable hash", () => {
  assert.equal(validSourceCreate(source), true);
  assert.equal(validSourceCreate({ ...source, title: " " }), false);
  assert.equal(validSourceCreate({ ...source, kind: "unknown" }), false);
  assert.equal(validSourceCreate({ ...source, contentSha256: "not-a-hash" }), false);
  assert.equal(validSourceCreate({ ...source, reference: "" }), false);
  assert.equal(validSourceCreate({ ...source, revisionLabel: "R".repeat(81) }), false);
});

test("input suggestions require a source citation, bounded JSON and valid RFC 6901 paths", () => {
  assert.equal(uuidPattern.test(uuid), true);
  assert.equal(validProposalCreate(proposal), true);
  assert.equal(validProposalCreate({ ...proposal, proposedValue: 0 }), true);
  assert.equal(validProposalCreate({ ...proposal, proposedValue: false }), true);
  assert.equal(validProposalCreate({ ...proposal, proposedValue: null }), false);
  assert.equal(validProposalCreate({ ...proposal, sourceLocation: "" }), false);
  assert.equal(validProposalCreate({ ...proposal, proposedValue: Infinity }), false);
  assert.equal(validProposalCreate({ ...proposal, targetCalculationId: "cross project" }), false);
  assert.equal(validProposalCreate({ ...proposal, proposedValue: { text: "x".repeat(17000) } }), false);
  assert.equal(validProposalCreate({ ...proposal, proposedValue: { nested: [1,2,{ok:true}] } }), true);
  assert.equal(validProposalCreate({ ...proposal, proposedValue: new Array(401).fill(1) }), false);
  assert.equal(validJsonPointer("/models/0/section~1ref"), true);
  assert.equal(validJsonPointer("/broken~9escape"), false);
  assert.equal(validJsonPointer("load/case"), false);
  assert.equal(validJsonPointer("/"), false);
});

test("review decisions are explicit and restricted to accepted/rejected with notes", () => {
  assert.equal(validDecisionCreate({ decision: "accepted", reviewNote: "Source dimensions checked against architectural revision" }), true);
  assert.equal(validDecisionCreate({ decision: "rejected", reviewNote: "Unsupported assumptions" }), true);
  assert.equal(validDecisionCreate({ decision: "pending", reviewNote: "Check" }), false);
  assert.equal(validDecisionCreate({ decision: "accepted", reviewNote: " " }), false);
  assert.deepEqual(projectRoles, ["owner", "admin", "engineer"]);
  assert.ok(reviewRoles.includes("reviewer"));
});
