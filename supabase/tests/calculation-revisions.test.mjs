import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = await readFile(new URL("../migrations/20260928065237_calculation_revision_runs.sql", import.meta.url), "utf8");

test("atomic revisions preserve history, reject conflicts/cycles/cross-project links and enforce RPC grants", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table projects(id uuid primary key, organisation_id uuid);
      create table organisation_members(organisation_id uuid, user_id uuid, role text);
      create table calculations(id uuid primary key default gen_random_uuid(), project_id uuid references projects,
        calculation_definition_id text, title text, created_by uuid, stage_key text, workflow_instance_id uuid,
        state text default 'draft', updated_at timestamptz default now());
      create table calculation_runs(id uuid primary key default gen_random_uuid(), calculation_id uuid references calculations,
        parent_run_id uuid references calculation_runs, run_sequence integer default 1, engine_plugin_id text,
        engine_plugin_version text, calculation_definition_id text, calculation_definition_version text,
        standard_reference_json jsonb, input_json jsonb, result_json jsonb, warnings_json jsonb, provenance_json jsonb,
        input_hash text, created_by uuid, created_at timestamptz default now());
      create table calculation_links(id uuid default gen_random_uuid(), source_calculation_id uuid references calculations,
        source_output_path text, target_calculation_id uuid references calculations, target_input_path text, created_by uuid,
        unique(target_calculation_id,target_input_path));
      create table audit_events(organisation_id uuid, project_id uuid, actor_user_id uuid, event_type text,
        entity_type text, entity_id uuid, metadata_json jsonb);
      insert into projects values('${id(1)}','${id(2)}'),('${id(9)}','${id(2)}');
      insert into organisation_members values('${id(2)}','${id(3)}','engineer'),('${id(2)}','${id(4)}','viewer');
      grant all on all tables in schema public to service_role;
    `);
    await db.exec(migration);
    const save = async (calculation = null, parent = null, links = [], actor = id(3), project = id(1)) => {
      const run = { input_json: { value: 2 }, result_json: { value: 4 }, engine_plugin_id: "test", engine_plugin_version: "1",
        calculation_definition_version: "1", provenance_json: { linked_inputs: links }, input_hash: "test" };
      return (await db.query("select opencalcs_save_run($1,$2,'test.calc','Test',$3::jsonb,$4,$5) as saved",
        [project, actor, JSON.stringify(run), calculation, parent])).rows[0].saved;
    };
    const link = (source) => ({ source_calculation_id: source.calculationId, source_run_id: source.runId,
      source_output_path: "/value", target_input_path: "/value", source_value: 4 });
    await db.exec("set role service_role");
    const a = await save();
    const b = await save(null, null, [link(a)]);
    const a2 = await save(a.calculationId, a.runId);
    assert.equal(a2.runSequence, 2);
    assert.equal(a2.parentRunId, a.runId);
    const before = (await db.query("select provenance_json from calculation_runs where id=$1", [b.runId])).rows[0];
    assert.equal(before.provenance_json.linked_inputs[0].source_run_id, a.runId);
    await assert.rejects(save(a.calculationId, a.runId), /Calculation changed/);
    await assert.rejects(save(a.calculationId, a2.runId, [link(b)]), /cycle/);
    await assert.rejects(save(null, null, [link(a2)], id(3), id(9)), /Invalid linked/);
    await assert.rejects(save(null, null, [], id(4)), /Engineer access/);
    const b2 = await save(b.calculationId, b.runId, [link(a2)]);
    assert.equal(b2.runSequence, 2);
    assert.equal((await db.query("select count(*)::int as n from calculations")).rows[0].n, 2, "failed saves leave no orphan calculation");
    assert.equal((await db.query("select count(*)::int as n from calculation_runs")).rows[0].n, 4);
    assert.equal((await db.query("select count(*)::int as n from audit_events")).rows[0].n, 4);
    await db.query("update calculations set state='issued' where id=$1", [b.calculationId]);
    await assert.rejects(save(b.calculationId, b2.runId), /Issued calculations/);
    await db.query("update calculations set state='draft', stage_key='wind' where id=$1", [b.calculationId]);
    await assert.rejects(save(b.calculationId, b2.runId), /Incompatible calculation revision/);
    await db.query("update calculations set stage_key=null, workflow_instance_id=$2 where id=$1", [b.calculationId, id(8)]);
    await assert.rejects(save(b.calculationId, b2.runId), /Incompatible calculation revision/);
    await db.query("update calculations set workflow_instance_id=null where id=$1", [b.calculationId]);
    await assert.rejects(save(b.calculationId, null), /Calculation changed/);
    // Failure after run insertion and graph deletion must roll back both operations.
    await assert.rejects(save(b.calculationId, b2.runId, [link(a2), link(a2)]), /duplicate key/);
    assert.equal((await db.query("select count(*)::int as n from calculation_runs")).rows[0].n, 4);
    assert.equal((await db.query("select count(*)::int as n from audit_events")).rows[0].n, 4);
    assert.equal((await db.query("select count(*)::int as n from calculation_links where target_calculation_id=$1", [b.calculationId])).rows[0].n, 1);
    for (const envelope of [null, {}, { input_json: {}, result_json: null, provenance_json: {} }]) {
      await assert.rejects(db.query("select opencalcs_save_run($1,$2,'test.calc','Test',$3::jsonb)",
        [id(1), id(3), JSON.stringify(envelope)]), /Invalid run envelope/);
    }
    await assert.rejects(save(null, null, [{ ...link(a2), target_input_path: "value" }]), /Invalid linked input path/);
    assert.equal((await db.query("select count(*)::int as n from calculations")).rows[0].n, 2);
    await db.exec("reset role; set role authenticated");
    await assert.rejects(save(), /permission denied/);
    await db.exec("reset role; set role anon");
    await assert.rejects(save(), /permission denied/);
  } finally { await db.close(); }
});
