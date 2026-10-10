# Engineering provenance and change-impact backend

## Scope

This increment adds the backend foundations for keeping engineering inputs linked to source information and making changes reviewable. It does **not** introduce an AI drawing parser, automatically adopt proposed values, perform an unvalidated engineering design or execute additional solvers.

### Existing mechanisms reused

- Authenticated projects, organisation membership and RLS.
- Immutable calculation runs with source-run ID snapshots in `provenance_json.linked_inputs`.
- `calculation_links` for persisted calculation graph edges.
- Atomic calculation revision writes through `opencalcs_save_run` and versioned edge runners.

### 1. Project graph / impact API

`GET /api/projects/:projectId/impact` lists supported source calculations and linked edges. It requires an authenticated project member and does not include sensitive project data for non-members.

`GET /api/projects/:projectId/impact?sourceCalculationId=<uuid>` additionally compares the latest two saved source runs, reads linked output values, and traverses direct and transitive dependencies. The response identifies whether an output changed, whether linked source-run snapshots were superseded, and which downstream calculations require **engineering review**, not a claim that calculated downstream outputs actually changed.

Data access is read-only; results are scoped to one project and not cached. The endpoint bounds the number of calculations, links and historical runs and returns an error rather than silently truncating calculations.

### 2. Project source references

`GET /api/projects/:projectId/sources?offset=0`: paginated list.

`POST /api/projects/:projectId/sources`:

```json
{
  "kind": "drawing",
  "title": "Architectural first floor plan",
  "revisionLabel": "C",
  "reference": "A-101, sheet 2, revision C",
  "contentSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

`contentSha256` is optional. Sources register evidence *metadata*, not uploaded content or AI-extracted text. Revision labels and references must be genuine project inputs supplied by the engineer.

### 3. Proposed engineering inputs

`GET /api/projects/:projectId/proposals?offset=0`: paginated list including each proposal's review state.

`POST /api/projects/:projectId/proposals`:

```json
{
  "sourceId": "<project-source-uuid>",
  "targetCalculationId": "<draft-calculation-uuid>",
  "targetInputPath": "/wind/region",
  "proposedValue": "A2",
  "sourceLocation": "Drawing A-101, revision C, gridline 3",
  "rationale": "Location and wind region require engineering verification"
}
```

Only owner, admin and engineer members can create manual proposals. A proposal must cite a registered source and include a specific location. Tenant-scoped composite foreign keys prevent links to source documents or calculations in another project. Direct authenticated users cannot forge the `ai` origin on these records; future AI suggestions must originate through a restricted server-side integration with a separate authenticated trust boundary.

**A proposal is not an engineering input.** It is never automatically applied to a calculation, accepted merely by AI confidence, or re-saved into a calculation run.

### 4. Explicit decision

`POST /api/projects/:projectId/proposals/:proposalId/decision`:

```json
{
  "decision": "accepted",
  "reviewNote": "Reviewed A-101 revision C and confirmed the site input"
}
```

An engineer/reviewer/admin/owner can write one append-only decision. Subsequent or contradictory decisions are rejected (HTTP 409). The decision does **not** apply the value; a calculation run must still be prepared, executed and independently reviewed under its own supported workflow.

### Access and security

New evidence tables use project-membership RLS for reading; only engineer roles can create source metadata/proposals, and reviewer roles may create decisions. Authenticated roles cannot update or delete source references, proposals or review decisions. Direct Data API writes to `calculations` and `calculation_links` are revoked so authenticated users must use the verified atomic execution path.

These changes are covered by PGlite SQL regression tests for cross-project FKs, RLS, role permissions, append-only decisions, invalid AI origin, and the existing atomic-run test suite. The production DB migration must be applied only after the application build and migration tests pass.

### Deliberate limitations

- No document storage/upload API, OCR, LLM integration or generated technical findings.
- No auto-linking from an accepted proposal to any calculation. That must be implemented as a separately reviewed source-to-input contract.
- No automated approval, new calculation run or automatic regeneration of engineering reports.
- No public, unauthenticated access to project impact data.
