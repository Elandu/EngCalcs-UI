# OpenCalcs SaaS architecture

OpenCalcs is split deliberately between the SaaS application and the engineering calculation runtime.

## OpenCalcs UI

Next.js owns the product experience:

- public marketing site
- authentication and account flows
- organisation and workspace navigation
- project management
- calculation browser and forms
- calculation review and issue states
- report library and presentation
- billing/account management when introduced

## Supabase

Use a dedicated OpenCalcs Supabase project for application state, not engineering formula execution.

Initial responsibilities:

- Auth users and sessions
- organisations/workspaces
- organisation memberships and roles
- projects
- project defaults
- saved calculation instances
- immutable calculation-run records
- review/issue metadata
- report metadata and object-storage references
- audit events

The browser uses only the project URL and publishable key. Secret/service-role credentials must never be exposed through `NEXT_PUBLIC_*` variables.

Every table exposed through the Data API must use Row Level Security. Organisation access should be checked through membership records rather than user-editable auth metadata.

## OpenCalcs runtime

The Python OpenCalcs service remains authoritative for calculation discovery and execution.

The UI sends typed inputs to the runtime. The runtime discovers the installed versioned engineering package (for example OpenWind-AU), executes the calculation and returns structured results with engineering provenance.

Supabase should persist the input/result envelope and metadata; it should not reimplement engineering formulae.

## Proposed first data model

### organisations

- id
- name
- slug
- created_at

### organisation_members

- organisation_id
- user_id
- role: owner | admin | engineer | reviewer | viewer
- created_at

### projects

- id
- organisation_id
- project_number
- name
- address
- status
- standards_region
- created_by
- created_at
- updated_at

### project_defaults

- project_id
- key
- value_json
- source
- updated_by
- updated_at

### calculations

Represents the saved calculation instance in a project.

- id
- project_id
- calculation_definition_id
- title
- sort_order
- state: draft | review | issued
- created_by
- created_at
- updated_at

### calculation_runs

Immutable execution history.

- id
- calculation_id
- engine_plugin_id
- engine_plugin_version
- calculation_definition_id
- calculation_definition_version
- standard_reference_json
- input_json
- result_json
- warnings_json
- provenance_json
- input_hash
- created_by
- created_at

### calculation_links

Typed dependency edges between calculation outputs and downstream inputs.

- id
- source_calculation_id
- source_output_path
- target_calculation_id
- target_input_path
- created_by
- created_at

For generic calculation runs, `source_output_path` and `target_input_path` use
RFC 6901 JSON Pointers. Wind workflow edges retain their workflow-stage paths.
The edge records the reusable mapping; the immutable target run's
`provenance_json.linked_inputs` records the exact source run, resolved value,
and units used for that execution. The linked-run function verifies that the
source run belongs to the selected source calculation in the same project,
checks the target JSON Schema type and unit, resolves the value server-side,
and saves the resolved inputs and mapping together. Scalar values and complete
JSON objects can be linked when the target schema accepts them. No unit
conversion is implicit.

The generic `opencalcs-run-calculation` function remains the standalone path.
`opencalcs-run-calculation-v2` is the linked path; deploy it to the project's
Supabase environment before enabling linked runs in a deployed UI.

### reports

- id
- project_id
- calculation_run_id
- storage_path
- report_type
- issued_by
- issued_at

### audit_events

- id
- organisation_id
- project_id
- actor_user_id
- event_type
- entity_type
- entity_id
- metadata_json
- created_at

## Important design rule

A saved project must remain reproducible. A calculation run therefore stores the exact plugin version, calculation definition version, standard edition/reference and immutable input/result payloads used at execution time.

Project defaults can change later without rewriting historical runs.
