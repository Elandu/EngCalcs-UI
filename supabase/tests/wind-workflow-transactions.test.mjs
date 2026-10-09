import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../migrations/20260929061116_wind_workflow_transactions.sql", import.meta.url), "utf8");
const revisionMigration = await readFile(new URL("../migrations/20260928065237_calculation_revision_runs.sql", import.meta.url), "utf8");
const namespaceMigration = await readFile(new URL("../migrations/20261009000000_engcalcs_rpc_aliases.sql", import.meta.url), "utf8");
const writeBoundary = await readFile(new URL("../migrations/20260929063214_calculation_write_boundary.sql", import.meta.url), "utf8");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const keys = ["site", "wind_region", "terrain", "shielding", "topography", "design"];
const heads = (saved) => Object.fromEntries(saved.runs.map((run) => [run.calculation_id, run.id]));
const payload = () => ({ workflow_id: "engine-wind-v1", overrides: [], stages: keys.map((key) => ({
  stage_key: key, title: key, definition: `au.wind.workflow.${key === "design" ? "design_wind_speed" : key}`,
  run: { engine_plugin_id: "au.openwind", engine_plugin_version: "test", calculation_definition_version: "1",
    input_json: { workflow_inputs: { address: "Fixture" } }, result_json: { value: 1 },
    provenance_json: { source: "fixture" }, warnings_json: [], input_hash: "test" },
})) });

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table projects(id uuid primary key, organisation_id uuid, address text);
    create table organisation_members(organisation_id uuid,user_id uuid,role text);
    create table calculations(id uuid primary key default gen_random_uuid(),project_id uuid references projects,
      workflow_instance_id uuid,stage_key text,calculation_definition_id text,title text,sort_order int default 0,
      state text default 'draft',created_by uuid,updated_at timestamptz default now());
    create table calculation_runs(id uuid primary key default gen_random_uuid(),calculation_id uuid references calculations,
      parent_run_id uuid references calculation_runs,run_sequence int default 1,engine_plugin_id text not null,
      engine_plugin_version text not null,calculation_definition_id text not null,calculation_definition_version text not null,
      standard_reference_json jsonb,input_json jsonb not null,result_json jsonb not null,warnings_json jsonb not null,
      provenance_json jsonb not null,input_hash text,created_by uuid,created_at timestamptz default now());
    create table calculation_links(source_calculation_id uuid references calculations,source_output_path text,
      target_calculation_id uuid references calculations,target_input_path text,created_by uuid,
      unique(target_calculation_id,target_input_path));
    create table calculation_overrides(id uuid primary key default gen_random_uuid(),workflow_instance_id uuid,
      calculation_id uuid references calculations,source_run_id uuid not null references calculation_runs,
      applied_run_id uuid references calculation_runs,variable text,direction text,original_value numeric,
      override_value numeric,reason text,source_reference text,created_by uuid,is_active boolean default true,
      created_at timestamptz default now(),superseded_at timestamptz,superseded_by_id uuid references calculation_overrides);
    create table calculation_run_reviews(run_id uuid primary key references calculation_runs,status text not null,
      submitted_by uuid not null,submitted_at timestamptz not null,reviewer_id uuid,review_note text,
      reviewed_at timestamptz,updated_at timestamptz);
    create table reports(id uuid primary key default gen_random_uuid(),project_id uuid references projects,
      calculation_run_id uuid references calculation_runs,workflow_instance_id uuid,storage_path text not null,
      report_type text,title text,revision int,status text,report_hash text,metadata_json jsonb,
      supersedes_report_id uuid references reports,issued_by uuid,issued_at timestamptz);
    create table audit_events(organisation_id uuid,project_id uuid,actor_user_id uuid,event_type text,
      entity_type text,entity_id uuid,metadata_json jsonb);
    insert into projects values('${id(1)}','${id(2)}',null),('${id(9)}','${id(10)}',null);
    insert into organisation_members values('${id(2)}','${id(3)}','engineer'),('${id(2)}','${id(4)}','reviewer'),
      ('${id(2)}','${id(5)}','viewer'),('${id(10)}','${id(3)}','engineer');
    grant all on all tables in schema public to service_role;
  `);
  await db.exec(revisionMigration);
  await db.exec(migration);
  await db.exec(namespaceMigration);
  await db.exec("set role service_role");
  const action = async (kind, workflow = null, expected = {}, data = {}, actor = id(3), project = id(1)) =>
    (await db.query("select engcalcs_wind_workflow_action($1,$2,$3,$4,$5::jsonb,$6::jsonb) result",
      [project, actor, workflow, kind, JSON.stringify(expected), JSON.stringify(data)])).rows[0].result;
  return { db, action };
}

test("Wind revisions save all six stages, exact parents, overrides and audit atomically", async () => {
  const { db, action } = await setup();
  try {
    const first = await action("save", null, {}, payload());
    assert.equal(first.runs.length, 6);
    assert(first.runs.every((run) => run.run_sequence === 1 && run.parent_run_id === null));
    const nextPayload = payload();
    nextPayload.overrides = [{ variable: "VR", override_value: 44, reason: "Reviewed map", source_reference: "A-1" }];
    const second = await action("save", first.workflowInstanceId, heads(first), nextPayload);
    assert(second.runs.every((run) => run.run_sequence === 2 && run.parent_run_id === heads(first)[run.calculation_id]));
    const snapshots = (await db.query("select provenance_json from calculation_runs where id=$1", [second.runs[0].id])).rows[0].provenance_json;
    assert.deepEqual(Object.values(snapshots.workflow_run_ids).sort(), second.runs.map((run) => run.id).sort());
    assert.equal((await db.query("select count(*)::int n from calculation_links")).rows[0].n, 8);
    const third = await action("save", first.workflowInstanceId, heads(second), nextPayload);
    const overrides = (await db.query("select * from calculation_overrides order by created_at")).rows;
    assert.equal(overrides.length, 2);
    assert.equal(overrides.filter((row) => row.is_active).length, 1);
    assert.equal(overrides.find((row) => !row.is_active).superseded_by_id, overrides.find((row) => row.is_active).id);
    await assert.rejects(action("save", first.workflowInstanceId, heads(second), payload()), /workflow changed/);
    await assert.rejects(action("save", first.workflowInstanceId, heads(third), payload(), id(3), id(9)), /not found or incomplete/);
    await assert.rejects(action("save", null, {}, payload(), id(5)), /Role does not permit/);
    const bad = payload();
    bad.overrides = [{ variable: "VR", override_value: -1, reason: "Invalid" }];
    await assert.rejects(action("save", first.workflowInstanceId, heads(third), bad), /Invalid Wind override/);
    assert.equal((await db.query("select count(*)::int n from calculation_runs")).rows[0].n, 18, "late override failure rolls back every stage run");
    assert.equal((await db.query("select count(*)::int n from audit_events")).rows[0].n, 3);
    const invalidInitial = payload();
    delete invalidInitial.stages[5].run.engine_plugin_id;
    await assert.rejects(action("save", null, {}, invalidInitial), /not-null/);
    assert.equal((await db.query("select count(*)::int n from calculations")).rows[0].n, 6, "failed initial save leaves no graph");
    const attempts = await Promise.allSettled([
      action("save", first.workflowInstanceId, heads(third), payload()),
      action("save", first.workflowInstanceId, heads(third), payload()),
    ]);
    assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((item) => item.status === "rejected").length, 1);
    assert.equal((await db.query("select count(*)::int n from calculation_runs")).rows[0].n, 24);
    for (const role of ["authenticated", "anon"]) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(action("save", null, {}, payload()), /permission denied/);
    }
  } finally { await db.close(); }
});

test("review and issue reject changed snapshots and protect issued workflows", async () => {
  const { db, action } = await setup();
  try {
    const first = await action("save", null, {}, payload());
    const workflow = first.workflowInstanceId;
    const expected = heads(first);
    await assert.rejects(action("approve", workflow, expected, {}, id(3)), /Role does not permit/);
    await assert.rejects(action("approve", workflow, expected, {}, id(4)), /must be submitted/);
    await action("submit", workflow, expected);
    await action("approve", workflow, expected, { note: "Checked" }, id(4));
    const approved = (await db.query("select * from calculation_run_reviews")).rows;
    const report = { storage_path: `${id(2)}/fixture/attempt-1.pdf`, revision: 1,
      report_hash: "a".repeat(64), issued_at: "2026-09-29T00:00:00Z", supersedes_report_id: null, metadata_json: {} };
    const issue = () => action("issue", workflow, expected, { report, expected_reviews: approved }, id(4));
    await action("request_changes", workflow, expected, { note: "Recheck" }, id(4));
    await assert.rejects(issue(), /must be approved/);
    await action("submit", workflow, expected);
    await action("approve", workflow, expected, { note: "Rechecked" }, id(4));
    await assert.rejects(issue(), /review changed/);
    const currentReviews = (await db.query("select * from calculation_run_reviews")).rows;
    const issued = await action("issue", workflow, expected, { report, expected_reviews: currentReviews }, id(4));
    assert.equal(issued.report.revision, 1);
    assert.equal((await db.query("select count(*)::int n from calculations where state='issued'")).rows[0].n, 6);
    assert.deepEqual(issued.report.metadata_json.latest_run_ids.sort(), first.runs.map((run) => run.id).sort());
    for (const kind of ["save", "submit", "approve", "request_changes", "issue"]) {
      await assert.rejects(action(kind, workflow, expected, payload(), kind === "save" || kind === "submit" ? id(3) : id(4)), /Issued Wind workflows/);
    }
    assert.equal((await db.query("select count(*)::int n from reports")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from calculation_runs")).rows[0].n, 6);
    const another = await action("save", null, {}, payload());
    await action("submit", another.workflowInstanceId, heads(another));
    const revised = await action("save", another.workflowInstanceId, heads(another), payload());
    await assert.rejects(action("approve", another.workflowInstanceId, heads(another), {}, id(4)), /workflow changed/);
    assert(revised.runs.every((run) => run.run_sequence === 2));
  } finally { await db.close(); }
});

test("direct client writes cannot bypass workflow transactions or issued protection", async () => {
  const { db, action } = await setup();
  try {
    const saved = await action("save", null, {}, payload());
    await db.exec(`reset role;
      grant select, insert, update, delete on calculations, calculation_links to authenticated;
      alter table calculations enable row level security;
      alter table calculation_links enable row level security;
      create policy calculations_select_member on calculations for select to authenticated using (true);
      create policy calculation_links_select_member on calculation_links for select to authenticated using (true);
      create policy calculations_update_engineer on calculations for update to authenticated using (true) with check (true);
      create policy calculations_delete_engineer on calculations for delete to authenticated using (true);
      create policy calculations_insert_engineer on calculations for insert to authenticated with check (true);
      create policy calculation_links_update_engineer on calculation_links for update to authenticated using (true) with check (true);
      create policy calculation_links_delete_engineer on calculation_links for delete to authenticated using (true);
      create policy calculation_links_insert_engineer on calculation_links for insert to authenticated with check (true);
      alter role service_role bypassrls;
      set role authenticated;
      update calculations set state='issued';
    `);
    await db.exec("reset role");
    await db.exec(writeBoundary);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select count(*)::int n from calculations")).rows[0].n, 6);
    assert.equal((await db.query("select count(*)::int n from calculation_links")).rows[0].n, 8);
    for (const sql of [
      "update calculations set state='draft'",
      "update calculations set workflow_instance_id=null",
      "delete from calculations",
      "insert into calculations(title) values('Bypass')",
      "delete from calculation_links",
      "update calculation_links set target_input_path='/forged'",
      "insert into calculation_links(source_output_path) values('/forged')",
    ]) await assert.rejects(db.exec(sql), /permission denied/);
    await db.exec("set role service_role");
    await assert.rejects(action("save", saved.workflowInstanceId, heads(saved), payload()), /Issued Wind workflows/);
    const next = await action("save", null, {}, payload());
    assert.equal(next.runs.length, 6, "authorized edge RPC remains usable after privilege restriction");
  } finally { await db.close(); }
});


test("legacy OpenCalcs workflow RPC name remains callable", async () => {
  const { db } = await setup();
  try {
    const legacy = await db.query(
      "select opencalcs_wind_workflow_action($1,$2,$3,$4,$5::jsonb,$6::jsonb) result",
      [id(1), id(3), null, "save", JSON.stringify({}), JSON.stringify(payload())],
    );
    assert.equal(legacy.rows[0].result.runs.length, 6);
  } finally { await db.close(); }
});
