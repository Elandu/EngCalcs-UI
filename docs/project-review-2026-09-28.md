# OpenCalcs foundation and Stabileo review

Review date: 2026-09-28. Scope: current OpenCalcs-UI worktree, OpenCalcs frame plugin and linked-run architecture, OpenWind verification records, and Stabileo source/CI. This is a software and integration review; it does not repeat the licensed-standard audit or provide independent engineering sign-off.

Latest continuation: **2026-09-29**. The priority findings below record the original review;
the continuation sections record implemented fixes and current evidence. Release acceptance
and independent engineering approval remain separate outstanding gates.

## Current delivery status

- Combined Wind workspace and reviewed saved wind-to-frame import are implemented locally.
- Standalone revisions and the complete Wind save/review/issue lifecycle use transactional
  persistence with exact expected parents. These migrations and endpoints are not deployed.
- Local checks pass; authenticated interactive acceptance is still blocked by the in-app
  browser's saved-permissions security check. This is not an authentication test result.
- Production remains pinned to the older OpenWind revision. No new GitHub release is published.
- Keep PyNite. The pinned Stabileo comparison still fails P-Delta transverse equilibrium.

The numbered priority findings and earlier counts below are historical review checkpoints;
the final continuation section records the latest checks and fixes.

## Decision

Keep PyNite as the current frame solver. Evaluate Stabileo through a separate, pinned adapter before considering replacement. Keep the product name **Frame analysis** and record the actual solver/version on every saved run. OpenWind remains responsible for Australian wind calculations regardless of frame solver.

Stabileo is a credible candidate, with an existing graphical editor, Rust/WebAssembly engine, and actual numerical benchmark tests. Replacing the solver alone will not complete wind-load generation, linked-calculation lifecycle, project storage, or engineering review.

## Priority findings

### 1. Complete the physical wind-to-frame load path

The current combined AS/NZS 1170.2 workflow produces directional wind speeds. OpenWind's `docs/base-standard-verification.md` explicitly excludes general design pressures and structural actions. A speed cannot directly become a frame line load.

Implement reviewable steps for pressure coefficients, internal/external pressure cases, applicable response factors, tributary areas/widths, member load directions, and load combinations. Each conversion must preserve units, standard/edition, assumptions and exact upstream run IDs. Show unsupported cases explicitly.

Intended chain:

`Wind assessment -> pressure cases -> tributary load distribution -> frame load cases/combinations -> analysis -> design checks`

AS 4055 is a distinct method within the Wind calculation workspace, with its own scope gate and inputs. Its categories and speeds must not be inferred by converting the AS/NZS 1170.2 multipliers.

### 2. Separate completed software checks from standards approval

The OpenWind working tree includes preliminary AS 4055 classification and Section 3 surface pressures. Its independent review package explicitly leaves site-category derivation, automatic zone areas, Section 4/Table 4 roof anchoring, and Section 5/Table 5.2 racking pressure selection incomplete. Racking arithmetic from a supplied pressure is not a completed racking assessment.

The AS/NZS 1170.2 verification record covers the 2021 base edition and leaves amendments/adoption and named independent engineering review pending. Its prior 631-test result is historical repository evidence, not a test rerun in this review. The AS 4055 code is still uncommitted locally. Do not describe either calculation path as fully independently approved.

OpenCalcs `requirements-render.txt` pins OpenWind to `bc054f23d2645eb9dfe44b1b4b504a94ebec01db`; the local AS 4055 additions are outside that deployed source revision. A UI release alone will not deliver those backend capabilities.

### 3. Make result presentation match the calculation scope

The pending UI changes group the six wind primitives into **Wind calculation**, retain components under an advanced section, route **Frame analysis** to its specialist workspace, and show both bending axes, both shear axes, axial force and transverse deflection diagrams.

Member diagrams must identify local axes, units, member and load combination. Nodal displacement is not the maximum member deflection: a simply supported beam has zero support displacement and nonzero midspan deflection. Station samples must not be labelled as exact extrema. The current result contract has no torsion station field, so a complete 3D force result needs a later backend extension.

This review corrected the UI deflection summary to use the selected member's sampled local displacement, labelled sampled extrema, and enlarged the diagrams. It also prevents an in-flight solve from applying results to a subsequently edited model; the earlier saved run remains available in history. Interactive verification of these changes is still pending.

The existing PyNite regression verifies the UDL beam reactions and bending moment. Its P-Delta test checks that results exist, without a compression-sensitive numerical benchmark. Add analytical deflection and second-order benchmarks before making broader numerical validation claims or using PyNite as the sole reference for a replacement solver.

### 4. Preserve an auditable calculation lifecycle

Existing links resolve exact immutable source runs on the server and retain their values and provenance. This is a useful foundation. A future worksheet experience also needs explicit downstream stale-state detection, intentional reruns after upstream changes, dependency ordering, and a reviewed run that can be reopened with its exact inputs. The current generic runner inserts a new calculation on each submission; decide how calculation identity and successive revisions should work before presenting it as a fully linked worksheet system.

The pending output pane restores persisted link provenance after reload. Authenticated save/reload testing remains required before release.

## Stabileo assessment

Inspected revision: [`7d87e551b765c88956df95b375e0ef0befda53f7`](https://github.com/lambdaclass/stabileo/tree/7d87e551b765c88956df95b375e0ef0befda53f7), main at review time.

| Area | Evidence and implication |
| --- | --- |
| Editor | Basic 2D/3D modelling and force diagrams are available; PRO is explicitly in development. Strong reference for the intended frame workspace. |
| Engine | Rust with native/WASM exports, including linear and P-Delta solving and broader analysis modules. Availability in source does not establish UI completeness or fitness for every analysis. |
| Verification | The benchmark ledger reports 5,655 engine-coupled passing tests at an older August revision and separately identifies 1,192 formula-only checks. Representative engine tests use analytical displacement/equilibrium assertions. These suites were inspected, not independently rerun. |
| Current CI | Main's workflow run 36168692825 failed in a browser E2E slow-suite job; core engine and other jobs passed. Do not treat the current main revision as fully green. |
| Runtime integration | The inspected backend serves AI routes and has no solve HTTP endpoint. OpenCalcs needs a Rust service/native bridge, or a browser-solver architecture with independently defined trust and persistence rules. |
| Data mapping | Stabileo uses numeric IDs/maps and MPa stiffness; the current OpenCalcs contract uses string IDs/arrays and kPa stiffness. Coordinates, section roll, local axes, signs, load cases/combinations and station output require explicit mapping. |
| Licence | Stabileo and OpenCalcs both use AGPL-3.0. Preserve notices and confirm corresponding-source obligations for the chosen integration. Licensing alone does not rule out the pilot. |
| Australian standards | A structural solver does not replace the AS/NZS 1170.2 or AS 4055 assessment, nor perform all member/connection design checks. Keep those as separate versioned calculations. |

Sources:

- [README and product status](https://github.com/lambdaclass/stabileo/blob/7d87e551b765c88956df95b375e0ef0befda53f7/README.md)
- [Solver exports](https://github.com/lambdaclass/stabileo/blob/7d87e551b765c88956df95b375e0ef0befda53f7/engine/src/lib.rs)
- [Input schema](https://github.com/lambdaclass/stabileo/blob/7d87e551b765c88956df95b375e0ef0befda53f7/engine/src/types/input.rs) and [output schema](https://github.com/lambdaclass/stabileo/blob/7d87e551b765c88956df95b375e0ef0befda53f7/engine/src/types/output.rs)
- [Backend routes](https://github.com/lambdaclass/stabileo/blob/7d87e551b765c88956df95b375e0ef0befda53f7/backend/src/main.rs)
- [Benchmark ledger](https://github.com/lambdaclass/stabileo/blob/7d87e551b765c88956df95b375e0ef0befda53f7/docs/BENCHMARKS.md)
- [CI run](https://github.com/lambdaclass/stabileo/actions/runs/36168692825)

## Proposed Stabileo pilot acceptance criteria

1. Pin one revision. Add a separate solver adapter without changing existing saved runs or their PyNite identifiers.
2. Use a solver-neutral model/result contract with explicit unit and axis conventions. Keep solver provenance in the result envelope.
3. Compare analytical fixtures and both solvers: simply supported UDL beam, cantilever, axial bar, portal frame, out-of-plane bending, rotated section, multiple combinations, partial/trapezoidal loading and unstable mechanisms. Add a compression-sensitive P-Delta case; a transverse-only beam is insufficient second-order validation.
4. Check reactions and global equilibrium, translations/rotations, member forces, diagram signs and discontinuities. Document absolute/relative tolerances for each quantity; agreement between two engines alone is insufficient evidence.
5. Baseline fixture: 6 m beam, 2 kN/m UDL, E = 200,000,000 kPa, Iz = 0.000084 m4: 6 kN vertical reaction at each support, 9 kN.m maximum absolute bending moment, approximately 2.009 mm maximum transverse deflection. State the signed axis convention separately.
6. Exercise save/reload, run hashes, warnings, failed convergence, unsupported features, and linked-run provenance. Benchmark real solve time and browser responsiveness.
7. Review findings before selecting an engine for the released product. Browser preview results must not silently replace the authoritative saved calculation.

## Release verification

Checks are run from a local NTFS source mirror because the mapped-drive development server had filesystem watcher failures. No environment secrets were copied.

- UI test suite: 18/18 passed.
- ESLint: passed.
- Production compilation and TypeScript checking: passed.
- Git whitespace/diff check: passed.
- Authenticated interactive acceptance: blocked. The in-app browser could not verify saved browser permissions for the ready local preview. This security control was not bypassed.
- New GitHub release: not published. Finish catalogue routing, combined wind, frame diagrams and linked save/reload acceptance first.

## Recommended sequence

1. Finish the current UI acceptance checks and publish the scoped UI release.
2. Complete the wind pressure/load-distribution and calculation dependency contracts.
3. Run the bounded Stabileo adapter pilot alongside PyNite.
4. Complete AS 4055 missing methods and independent engineering review for the intended released scope.

## Continuation evidence (2026-09-28)

The earlier findings above describe the starting point. This addendum records the new work.

- OpenWind now supplies reviewed AS/NZS 1170.2 pressure cases and tributary member loads in
  the OpenCalcs distributed-load contract. External/internal speeds remain separate;
  dynamic-sensitive cases, bad references, overlapping assignments and area imbalance fail.
  Coefficients and normal/axis alignment are reviewed inputs, not automatically selected.
- AS 4055 adds simple flat/gable automatic zone areas, Table 4 net roof anchoring, and
  Tables 5.2(A-M) racking selection/interpolation. Table headers and geometry are enforced.
  Independent engineering review remains pending; see the updated OpenWind review package.
- Saved classifications are checked against recomputed site/class/speed data and current
  lookup digest. Forged or obsolete classifications cannot silently generate loads.
- Standalone calculation revisions retain exact source runs and parents, detect direct and
  transitive staleness, and require explicit source refresh/recalculation. Atomic SQL rejects
  stale saves, incompatible targets, cycles and cross-project sources. The migration and
  v3 runner are prepared locally and are NOT deployed.
- UI results stay tied to the selected saved calculation; busy forms cannot be edited during
  a solve. Missing revision deployments and 409 conflicts are reported accurately.

Verification at this checkpoint:

- OpenWind final complete local suite: **678 passed**, one third-party deprecation warning.
  Initial GIS failures were due to absent GDAL data in the local pyogrio wheel; reinstalling
  the same pyogrio 0.13.0 version repaired the environment. No assertions were weakened.
- UI: **25 tests passed**, database revision scenarios passed, ESLint and production build /
  TypeScript passed. Deno checking of the v3 edge function passed in an isolated workspace.
- Actual solver comparison: PyNite passed 5 analytical models. Stabileo passed the 4 linear
  models, but its 8-element P-Delta cantilever reports +1.0120687687 kN root transverse
  reaction against +1 kN applied load. Deflection matches theory; equilibrium fails by
  1.2069%. Keep this failure visible and retain PyNite as production engine.
- The comparison is reproducible in OpenCalcs `benchmarks/`, pinned to Stabileo
  `7d87e551b765c88956df95b375e0ef0befda53f7`. No production solver was changed.
- In-app UI acceptance remains blocked by the browser tool's saved-permissions security
  check. The rebuilt preview is running at http://127.0.0.1:3105.
- No commits, pushes, deployments or GitHub releases were performed in this continuation.

### Remaining delivery gates

1. Completed locally: housing and pressure/load steps in the combined Wind workspace,
   deliberate saved wind-to-frame loading, and visible source revision state. Verify these
   in the authenticated browser against the updated backend before release.
2. Complete authenticated browser acceptance of combined wind, frame diagrams, source
   refresh, revision conflicts, and save/reload. Browser permissions must work first.
3. Apply and verify the revision, Wind lifecycle and calculation write-boundary migrations
   and updated standalone/workflow runners after final integration
   review; exercise real RLS/authorization and concurrent saves on a designated QA project.
4. Finish scope-specific packaging, version/pin alignment across all three repositories,
   release notes, and the authorized GitHub release after acceptance. Do not publish an
   engineering-approval claim. Original AS 4055 category derivation, complex roof zones,
   elevation geometry and independent sign-off remain explicit limitations.
5. Broader Stabileo qualification or correction of the observed reaction error is required
   before reconsidering a production solver switch. The current comparison supports keeping PyNite.

## Review continuation (2026-09-29)

- The combined Wind workspace now contains the AS/NZS 1170.2 site workflow, a single
  AS 4055 housing assessment, and reviewed pressure/tributary frame loads. The housing
  method checks both directions and every storey, sharing one classification and geometry
  across SLS/ULS surface and anchoring cases and ultimate racking demands.
- Added `/api/as4055/housing-assessment`, including parity with the registry and explicit
  client errors for inconsistent geometry, storeys/directions and cladding scope.
- Corrected duplicate output-heading IDs in the multi-panel workspace.
- Corrected a wind provenance gap: linked pressure cases must now resolve both speeds
  individually from the declared source run. Partial, mixed-source and mismatched links
  fail before calculation/persistence in both v2 and v3. Unlinked source references remain
  caller assertions. Added missing m/s schema units so verified speed links can be used.
- Extended database checks for issued/workflow revision protection and rollback after a
  duplicate-link failure occurring after run insertion. All database scenarios pass.
  Deno type checks pass for both updated edge runners; neither was deployed here.
- New linked runs in v2 now use the same atomic RPC and project lock as v3 revisions.
  The former separate insert/cleanup sequence could expose a partially saved graph to a
  concurrent revision. Deployment must install the RPC migration before updating v2.
- Resynced the Python verification mirror and checked hashes after finding that it lacked
  the latest combined housing changes. The updated complete suite passed **683 tests**.
  After the new API route, the focused API/extension suite passed **94 tests**. Its first
  parity assertion failed on Python tuples versus JSON arrays; JSON-normalized comparison
  now passes without changing numerical expectations. A third-party deprecation warning remains.
  The final complete rerun after the API and speed-unit schema changes passed **684 tests**;
  affected Python files also pass Ruff.
- Executed both new methods through the actual OpenCalcs registry with the current local
  OpenWind plugin; dispatch and attached calculation provenance passed. A local GDAL
  data-path warning appeared during imports; these fixtures do not use GIS data.
- Rebuilt the pinned Stabileo adapter in an empty directory using the documented builder.
  Compilation succeeded. The five-model comparison reproduced the previous JSON exactly,
  including the failed P-Delta equilibrium check. The comparison correctly exits nonzero.
- The browser permission check still prevents navigation to the local preview. No
  authenticated browser acceptance, deployment or GitHub release is claimed.

### Publication order after acceptance

1. Review and commit the scoped OpenWind source/tests/docs. Exclude local browser scratch,
   standards scans/OCR, credentials and unrelated worktree changes.
2. Update OpenCalcs' pinned OpenWind revision to that actual commit, package the selected
   production PyNite path, and verify the new registry definitions in the deployed API.
3. Apply all three additive migrations and deploy the updated v2/v3 and Wind run/review/issue
   edge runners. Verify membership,
   project boundaries, stale-parent conflicts and concurrent saves on a QA project.
4. Complete authenticated Wind/Frame save, reload, source-refresh and diagram acceptance
   against those deployed dependencies; then publish the UI and scoped GitHub release notes.

The release must retain preliminary AS 4055 status and disclose supported geometry. The
software checks do not supply the named independent engineer's review or amendment/adoption
confirmation. PyNite remains the production solver; Stabileo is an isolated comparison.

### Wind lifecycle transaction and frame import review

The legacy specialist workflow wrote separate stage runs and could reset issued workflows
to draft. It is now replaced locally by `opencalcs_wind_workflow_action`, coordinating
all six stage runs, exact parents, overrides, audit, review and issue under the same project
lock as standalone revisions. Each stage records the exact six-run snapshot. The UI sends
the displayed calculation-to-run map and prevents mutations of issued workflows.

The live schema was inspected read-only. It still permits authenticated engineers to edit
calculation state and links directly, bypassing the new RPC protections. The local
`calculation_write_boundary` migration removes those direct write grants and policies while
preserving member reads and service writes. A regression reproduces the previous direct
write and proves that the migration blocks state reset, identity edits, inserts, deletes
and link changes. Current UI code writes these tables through edge services already.

Frame import now accepts the real OpenWind limit states (`ultimate` / `serviceability`).
An actual engine-generated fixture confirms the full contract: 40/30 m/s external/internal
speeds, 0.8/0.2 coefficients, 12 m2 pressure area and a 6 m member with 2 m tributary width
produce 0.66 kPa, 1.32 kN/m and 7.92 kN. Imports preserve exact source IDs, reviewed axes,
member geometry/orientation, and require deliberate load-combination factors. Geometry
edits, missing provenance and obsolete sources block linked solving until resolved.

Local database checks cover rollback, role/project boundaries, issued protection, changed
review snapshots and competing stale-parent calls. PGlite serializes commands; these checks
do not replace live multi-connection concurrency or authenticated RLS acceptance.

No production data or schema was changed during this review.

### Final local checks at this review checkpoint

- **40 UI/contract tests passed**, including actual OpenWind frame-load metadata and the
  canonical m/s schema for saved combined-workflow speed outputs. Unknown definitions and
  conflicting registered units remain rejected.
- **4 database scenarios passed**, including the direct-client write-boundary regression.
- ESLint, production build and TypeScript passed. Deno checked all five modified edge
  runners. A PDF digest typed-array error found by Deno was fixed and rechecked.
- Workflow envelope guards reject missing engine stage data before saving. All required
  variable directions must be present; legitimate blocked speed results remain explicit.
- Issue cleanup recognizes SQL rejections without relying on an HTTP status embedded in
  the error. Unknown completion/transport outcomes retain the PDF and attempt recovery by
  unique storage path, preventing deletion after a possibly successful issue transaction.
- A fresh locked OpenWind environment passed the complete **684-test suite**, with one
  third-party AnyIO deprecation warning. The new wheel/source archive built successfully;
  module bytes match the worktree and the source archive excludes local scratch and env files.
- A separate combined OpenCalcs/OpenWind/PyNite environment passed **16 backend/plugin
  tests**. Its new ASGI bridge test reproduces OpenWind's host policy; the bridge now uses
  `localhost`, matching the documented allowlist. One Starlette/httpx deprecation warning remains.
- The actual PyNite plugin passed all **5 analytical fixtures** again. Stabileo's earlier
  reproduced P-Delta reaction failure remains unresolved; no solver switch is proposed.
- All three repositories were fetched before preparing coordinated wind-frame
  branches. OpenWind is committed as `d0a3ae2615241f932b93cf93ae8324142a446177`.
  OpenCalcs is committed as `b40d4faf76bb1b849dba909a71f91f5748d2fece` and now pins that
  exact OpenWind commit in `requirements-render.txt`. These are review branches; remote
  production, authenticated browser acceptance and release publication remain pending.

### Acceptance and deployment checklist

1. Publish the reviewed OpenWind source revision and update the backend's exact dependency
   pin. Confirm the API advertises housing assessment and pressure/frame-load definitions.
2. Install the revision RPC, Wind lifecycle RPC and calculation write-boundary migrations
   before enabling the corresponding UI/endpoints. Deploy v2/v3 plus Wind run/review/issue
   as one coordinated change; stale clients must receive clear conflict/unavailable errors.
3. Provision the private `issued-calculation-packs` storage bucket with PDF restrictions.
   Read-only inspection on 2026-09-29 found it absent. The issue handler deliberately fails
   closed when the bucket is absent or public; request-time issuance does not alter bucket
   security. Verify authorized downloads through the report endpoint.
4. On a designated QA project, use engineer and reviewer accounts to save all six Wind
   stages, submit, approve and issue. Verify that neither UI actions nor direct authenticated
   Data API writes can revise or reset the issued assessment.
5. Open the same Wind assessment in two sessions. Save competing reruns and confirm exactly
   one succeeds while the other receives 409, with no partial stages/overrides/audit writes.
   Repeat review-versus-rerun and issue-versus-review races with separate DB connections.
6. Link both pressure-case speeds from one exact saved Wind run. Save pressure/tributary
   loads, import them into Frame analysis, review axes and combination factors, then solve.
   Confirm source pointers, units, BMD/SFD and deflection values after save/reload.
7. Revise the Wind source. Confirm stale status propagates to pressures and frame; refresh
   each deliberately in dependency order. Change member endpoints/rotation and confirm
   linked loads require renewed review. Preserve historical results and source references.
8. Check AS 4055 supported housing geometry and both elevation directions, plus explicit
   rejection of unsupported scope. Keep preliminary status and the independent-review gate.
9. Complete responsive browser acceptance and publish scoped release notes only after the
   above gates pass. Retain the Stabileo failed-equilibrium evidence and current PyNite engine.
