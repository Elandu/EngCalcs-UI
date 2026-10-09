# EngCalcs / EngCalcs-UI / OpenWind review completion

Review date: 2026-09-30. Decision: keep the coordinated changes in draft; deployment and acceptance gates remain outstanding. The CI-fix continuation below addresses the three original findings; final PR check results are recorded in GitHub.

This completes the software-review continuation from `project-review-2026-09-28.md`. It is not deployment acceptance or independent verification against licensed engineering standards. The initial review changed only this report; the subsequently requested CI fixes and existing continuation are recorded below.

## Reviewed state

| Repository | Reviewed revision | Additional scope |
| --- | --- | --- |
| OpenWind-AU | `d0a3ae2615241f932b93cf93ae8324142a446177` | Exact PR archive; the live checkout remains on `main` at `bc054f23` |
| EngCalcs | `b40d4faf76bb1b849dba909a71f91f5748d2fece` | Existing uncommitted CI changes |
| EngCalcs-UI | `180cbc291843c2d56bebcf9b81799996f94fc8f1` | Existing uncommitted CI/package changes and standalone runner delegation/test |

The three open draft PRs are [OpenWind #21](https://github.com/Elandu/OpenWind-AU/pull/21), [EngCalcs #1](https://github.com/Elandu/OpenCalcs/pull/1), and [EngCalcs-UI #1](https://github.com/Elandu/OpenCalcs-UI/pull/1). Their remote head hashes were checked. Existing untracked scratch files and local changes were preserved.

## Confirmed findings

### P2: Restore test dependencies in the proposed backend CI job

`EngCalcs/.github/workflows/ci.yml:76-82` replaces the installation of `.[dev]` with `requirements-render.txt`, then runs `python -m pytest tests/test_workflows.py`. The runtime requirements do not include pytest. Traversing the installed metadata for EngCalcs, its PyNite adapter, and OpenWind confirmed that pytest is absent from their runtime dependency closure. A clean environment therefore cannot run this new step. Retain the exact production dependency installation and also install the test extra. This defect is in the existing local CI change, not the currently published PR check.

### P2: Format the OpenWind validation block before merging

`OpenWind-AU/src/openwind_au/models.py:1351-1359` fails Ruff formatting. This is independently confirmed in the current PR CI logs on Python 3.11–3.14 and by a local check of the exact archived PR file. CI run [36553798996](https://github.com/Elandu/OpenWind-AU/actions/runs/36553798996) fails its test jobs at the format step; artifact/container jobs are skipped. Apply the repository formatter and re-run the PR checks.

### P2: Format the new EngCalcs workflow test

`EngCalcs/tests/test_workflows.py:25-36` fails Ruff formatting in the StreamingResponse call and middleware list. Current PR CI run [36553801996](https://github.com/Elandu/OpenCalcs/actions/runs/36553801996) confirms this across Python 3.11–3.14. The test passes locally, but the required format check does not. Format the test and re-run CI.

## Verification

| Check | Current review result |
| --- | --- |
| OpenWind exact PR archive | 678 tests passed, 6 skipped, one warning; Ruff lint passed |
| EngCalcs backend and PyNite plugin | 16 tests passed; one Starlette/httpx deprecation warning |
| PyNite analytical fixtures | All 5 cases passed |
| UI contract/handler tests | 43 passed |
| Local PGlite transaction scenarios | 4 passed |
| UI lint and production build | Passed; TypeScript passed and all six static pages generated |
| Six calculation/Wind edge entrypoints | Deno type checking passed, including the standalone delegation |
| Git whitespace checks | Passed |
| Remote UI CI | Green on `180cbc2`; does not cover the uncommitted continuation |

The six skipped OpenWind cases require the production Geoscience Australia wind-region shapefile, which was absent from the archive's runtime cache: four `test_production_wind_region_validation_cases` cases plus the Bourke A0 classification and diagnosis tests. The Windows extended-path test passed. Module resolution was checked against the archived PR sources, not the older live checkout. These results must not be described as a fresh 684-test pass.

The PGlite fixtures exercise the RPC logic using a simplified schema. They do not prove production RLS behavior or simultaneous independent PostgreSQL connections. No new numerical defect in the pressure/tributary or preliminary AS 4055 paths was confirmed in this bounded review. That is not a full standards audit.

UI tests, lint and build ran from the current primary checkout. The PGlite tests ran in the existing local dependency mirror after copying the two current test files and their three referenced migrations; no environment files were copied. Exact source-run retention, frame import/restore, revision freshness and server save paths were inspected. No additional actionable UI defect was confirmed.

## Live deployment evidence and remaining acceptance

Read-only inspection of the named Supabase project `EngCalcs-UI` (`amfmmkonklwcohbsdiic`) confirmed:

- `calculation_runs.parent_run_id` and `run_sequence` exist.
- Neither `engcalcs_save_run` nor `engcalcs_wind_workflow_action` exists in the public schema.
- `engcalcs-run-calculation-v3` is absent from the deployed edge-function list.
- The `issued-calculation-packs` storage bucket is absent.
- The older authenticated calculation insert/update/delete policies remain active; the proposed write-boundary migration is not in force.
- The migration-list API returned no recorded migrations; the schema checks above establish the specific missing features independently.

Consequently, deploying only the new UI would not deliver the reviewed revision/issue workflow. Coordinate the source pin, RPC/write-boundary migrations, private bucket, and all affected edge entrypoints, including the original standalone endpoint. Then run role/project-boundary tests, separate-connection save/review/issue races, and authenticated Wind → pressure/tributary loads → Frame save/reload and stale-source refresh acceptance on a designated QA project.

Authenticated browser acceptance was not performed in this review. The earlier saved-browser-permission blocker was not bypassed or reclassified as a successful test. A read-only request to the public backend `/api/v1/about` timed out after 40 seconds, so the current production backend revision was not confirmed.

The embedded OpenWind bridge deliberately uses `Host: localhost`; the exact OpenWind PR documents including `localhost` in `OPENWIND_TRUSTED_HOSTS`. Verify that deployment setting. A rejection from an allowlist that omits localhost is a configuration prerequisite, not a newly established code defect.

Keep PyNite as the production solver. The previously recorded Stabileo P-Delta equilibrium failure was not re-run or resolved here. AS 4055 retains its preliminary scope and independent engineering-review gate.

## Authorized CI-fix continuation

- Formatted the OpenWind workflow validation block and the EngCalcs host-policy regression test.
- Restored the EngCalcs development/test extra before installing `requirements-render.txt` in the OpenWind integration CI job. The job now tests the actual production-pinned plugin set and checks the new housing/frame-load definitions. CI also runs the five-case PyNite analytical benchmark.
- Updated the backend's exact OpenWind pin to the corrected engine PR head, so integration CI tests the same source intended for release.
- Included the existing original calculation endpoint delegation to the atomic v2 runner and its handler regression tests in the UI PR scope. Existing clients now use the same guarded save transaction, including audit persistence and failure handling.
- Included database regression coverage and isolated Deno checking of all six affected entrypoints in UI CI, and registered the handler tests in `npm test`.
- Kept unrelated scratch directories, the untracked backend `uv.lock`, and Supabase CLI temporary files out of these commits. The PRs remain drafts; no production database or edge deployment was performed.

The first rerun passed the OpenWind Python 3.11–3.14 matrix and all EngCalcs jobs. It exposed a separate OpenWind locked-dependency audit failure for PyJWT 2.13.0. A targeted lockfile update to PyJWT 2.14.0 changed only that package's version and distribution records; `uv audit --locked --preview-features audit-command` then reported no known vulnerabilities in 78 packages. The audit check remains enabled.

For this continuation, OpenWind lint/format and all 35 model tests passed; the backend host-policy test and repository lint/format passed; UI tests (43), database scenarios (4), lint, production build and six edge-entrypoint checks passed. The locked OpenWind suite and remote final-commit jobs verify the dependency follow-up before completion.

## Next actions

1. Check CI on the final coordinated commits in all three PRs.
2. Complete the coordinated deployment and acceptance checks above before release or merge approval.
