import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

const migration = await readFile(
  new URL("../migrations/20261010113000_engineering_source_provenance.sql", import.meta.url),
  "utf8",
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("source evidence is tenant-scoped, proposals are manually proposed and immutable, reviewer decisions are append-only", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, app_private to authenticated;
      grant execute on function auth.uid() to authenticated;
      create table public.projects(id uuid primary key, organisation_id uuid not null);
      create table public.organisation_members(organisation_id uuid, user_id uuid, role text);
      create table public.calculations(id uuid primary key, project_id uuid not null references public.projects,
        state text default 'draft');
      create table public.calculation_links(
        id uuid primary key default gen_random_uuid(),
        source_calculation_id uuid references public.calculations,
        target_calculation_id uuid references public.calculations
      );
      create function app_private.user_has_project_role(p_project_id uuid, p_roles text[])
        returns boolean language sql stable security definer set search_path = public
        as $$
          select exists (
            select 1 from public.projects p
            join public.organisation_members m on m.organisation_id = p.organisation_id
            where p.id = p_project_id and m.user_id = auth.uid()
              and (p_roles is null or m.role = any(p_roles))
          )
        $$;
      grant execute on function app_private.user_has_project_role(uuid,text[]) to authenticated;
      grant all on public.calculations, public.calculation_links to authenticated;
      insert into auth.users values
        ('${id(3)}'),('${id(4)}'),('${id(5)}'),('${id(6)}');
      insert into public.projects values ('${id(1)}','${id(2)}'),('${id(9)}','${id(8)}');
      insert into public.organisation_members values
        ('${id(2)}','${id(3)}','engineer'),
        ('${id(2)}','${id(4)}','viewer'),
        ('${id(2)}','${id(5)}','reviewer'),
        ('${id(8)}','${id(6)}','engineer');
      insert into public.calculations values ('${id(11)}','${id(1)}','draft'),
        ('${id(12)}','${id(9)}','draft');
    `);
    await db.exec(migration);

    const rights = (await db.query(`
      select has_table_privilege('authenticated','public.calculations','INSERT') as can_insert_calc,
        has_table_privilege('authenticated','public.calculation_links','UPDATE') as can_update_links,
        has_table_privilege('authenticated','public.engineering_input_proposals','INSERT') as can_propose,
        has_table_privilege('authenticated','public.engineering_proposal_decisions','UPDATE') as can_edit_decision
    `)).rows[0];
    assert.deepEqual(rights, {
      can_insert_calc: false, can_update_links: false, can_propose: true, can_edit_decision: false,
    });
    const policyInfo = await db.query(`
      select tablename, rowsecurity as rls from pg_tables where schemaname='public'
        and tablename in ('engineering_sources','engineering_input_proposals','engineering_proposal_decisions')
      order by tablename
    `);
    assert.equal(policyInfo.rows.length, 3);
    assert.ok(policyInfo.rows.every((row) => row.rls));

    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(3)]);
    const source = (await db.query(`
      insert into public.engineering_sources(project_id,source_kind,title,source_reference)
      values($1,'drawing','Architectural A-101','Sheet A-101 Rev C') returning id,project_id
    `, [id(1)])).rows[0];
    assert.equal(source.project_id, id(1));

    const proposed = (await db.query(`
      insert into public.engineering_input_proposals
        (project_id,source_id,target_calculation_id,target_input_path,proposed_value_json,source_location,rationale)
      values($1,$2,$3,'/wind/region','"A2"'::jsonb,'A-101 grid 3','Engineering review')
      returning id
    `, [id(1), source.id, id(11)])).rows[0];
    assert.ok(proposed.id);

    await assert.rejects(db.query(`
      insert into public.engineering_input_proposals
        (project_id,source_id,target_input_path,proposed_value_json,source_location,rationale,proposal_origin)
      values($1,$2,'/x','5'::jsonb,'A-101','Review','ai')
    `, [id(1), source.id]), /row-level security/);
    await assert.rejects(db.query(`
      insert into public.engineering_input_proposals
        (project_id,source_id,target_calculation_id,target_input_path,proposed_value_json,source_location,rationale)
      values($1,$2,$3,'/x','5'::jsonb,'A-101','Review')
    `, [id(1), source.id, id(12)]), /foreign key/);
    await assert.rejects(db.query("delete from public.engineering_sources where id=$1", [source.id]), /permission denied/);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(4)]);
    assert.equal((await db.query("select count(*)::int as n from public.engineering_sources")).rows[0].n, 1);
    await assert.rejects(db.query(`
      insert into public.engineering_sources(project_id,source_kind,title,source_reference)
      values($1,'drawing','Another','A-101')
    `, [id(1)]), /row-level security/);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(5)]);
    const decision = (await db.query(`
      insert into public.engineering_proposal_decisions
        (project_id, proposal_id, decision, review_note)
      values($1,$2,'accepted','Checked sheet revision and wind region')
      returning id
    `, [id(1), proposed.id])).rows[0];
    assert.ok(decision.id);
    await assert.rejects(db.query(`
      insert into public.engineering_proposal_decisions
        (project_id, proposal_id, decision, review_note)
      values($1,$2,'rejected','Contradictory review')
    `, [id(1), proposed.id]), /duplicate key/);
    await assert.rejects(db.query("update public.engineering_proposal_decisions set decision='rejected'"), /permission denied/);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(6)]);
    assert.equal((await db.query("select count(*)::int as n from public.engineering_sources")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from public.engineering_input_proposals")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from public.engineering_proposal_decisions")).rows[0].n, 0);
    await assert.rejects(db.query(`
      insert into public.engineering_proposal_decisions(project_id,proposal_id,decision,review_note)
      values($1,$2,'accepted','Cross tenant')
    `, [id(1), proposed.id]), /row-level security/);
  } finally {
    await db.close();
  }
});
