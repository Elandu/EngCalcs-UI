-- Atomic run persistence, invoked only by the authenticated edge runner's service client.
-- Existing run payloads are never updated. Revisions carry their exact parent run.
create or replace function public.opencalcs_save_run(
  p_project_id uuid, p_actor_id uuid, p_definition_id text, p_title text,
  p_run jsonb, p_calculation_id uuid default null, p_expected_run_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_calculation public.calculations;
  v_parent public.calculation_runs;
  v_run public.calculation_runs;
  v_organisation uuid;
  v_links jsonb := coalesce(p_run #> '{provenance_json,linked_inputs}', '[]'::jsonb);
  v_link jsonb;
  v_source uuid;
begin
  select organisation_id into v_organisation from public.projects where id = p_project_id;
  if v_organisation is null or not exists (
    select 1 from public.organisation_members
    where organisation_id = v_organisation and user_id = p_actor_id
      and role in ('owner', 'admin', 'engineer')
  ) then raise exception 'Engineer access required' using errcode = '42501'; end if;
  if p_title is null or length(trim(p_title)) not between 1 and 200
    or p_definition_id is null or length(trim(p_definition_id)) = 0
    or jsonb_typeof(p_run) is distinct from 'object'
    or jsonb_typeof(p_run->'input_json') is distinct from 'object'
    or jsonb_typeof(p_run->'result_json') is distinct from 'object'
    or jsonb_typeof(p_run->'provenance_json') is distinct from 'object'
    or jsonb_typeof(v_links) is distinct from 'array' or jsonb_array_length(v_links) > 50
  then raise exception 'Invalid run envelope' using errcode = '22023'; end if;

  -- Serialize graph mutations within this project; also prevents concurrent cycle insertion.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_project_id::text, 0));
  if p_calculation_id is null then
    if p_expected_run_id is not null then
      raise exception 'A new calculation cannot have a parent' using errcode = '22023';
    end if;
    insert into public.calculations(project_id, calculation_definition_id, title, created_by)
      values(p_project_id, p_definition_id, trim(p_title), p_actor_id)
      returning * into v_calculation;
  else
    select * into v_calculation from public.calculations
      where id = p_calculation_id and project_id = p_project_id for update;
    if v_calculation.id is null or v_calculation.calculation_definition_id <> p_definition_id
      or v_calculation.stage_key is not null or v_calculation.workflow_instance_id is not null
    then raise exception 'Incompatible calculation revision' using errcode = '22023'; end if;
    if v_calculation.state = 'issued' then
      raise exception 'Issued calculations cannot be revised' using errcode = '22023';
    end if;
    select * into v_parent from public.calculation_runs where calculation_id = v_calculation.id
      order by run_sequence desc, created_at desc, id desc limit 1;
    if p_expected_run_id is null or v_parent.id is distinct from p_expected_run_id then
      raise exception 'Calculation changed. Reload before saving a revision.' using errcode = '40001';
    end if;
  end if;

  for v_link in select value from jsonb_array_elements(v_links) loop
    if jsonb_typeof(v_link) is distinct from 'object'
      or jsonb_typeof(v_link->'source_output_path') is distinct from 'string'
      or jsonb_typeof(v_link->'target_input_path') is distinct from 'string'
      or left(v_link->>'source_output_path', 1) <> '/'
      or left(v_link->>'target_input_path', 1) <> '/'
    then raise exception 'Invalid linked input path' using errcode = '22023'; end if;
    v_source := (v_link->>'source_calculation_id')::uuid;
    if v_source = v_calculation.id or not exists (
      select 1 from public.calculation_runs r join public.calculations c on c.id = r.calculation_id
      where r.id = (v_link->>'source_run_id')::uuid and c.id = v_source and c.project_id = p_project_id
    ) then raise exception 'Invalid linked source run' using errcode = '22023'; end if;
    if exists (
      with recursive descendants(id) as (
        select target_calculation_id from public.calculation_links where source_calculation_id = v_calculation.id
        union
        select l.target_calculation_id from public.calculation_links l join descendants d on d.id = l.source_calculation_id
      ) select 1 from descendants where id = v_source
    ) then raise exception 'Calculation dependency cycle' using errcode = '22023'; end if;
  end loop;

  insert into public.calculation_runs(
    calculation_id, parent_run_id, run_sequence, engine_plugin_id, engine_plugin_version,
    calculation_definition_id, calculation_definition_version, standard_reference_json,
    input_json, result_json, warnings_json, provenance_json, input_hash, created_by
  ) values (
    v_calculation.id, v_parent.id, coalesce(v_parent.run_sequence, 0) + 1,
    p_run->>'engine_plugin_id', p_run->>'engine_plugin_version', p_definition_id,
    p_run->>'calculation_definition_version', p_run->'standard_reference_json',
    p_run->'input_json', p_run->'result_json', coalesce(p_run->'warnings_json', '[]'),
    p_run->'provenance_json', p_run->>'input_hash', p_actor_id
  ) returning * into v_run;

  -- Graph represents the latest revision; each older run retains its immutable link snapshot.
  delete from public.calculation_links where target_calculation_id = v_calculation.id;
  insert into public.calculation_links(source_calculation_id, source_output_path, target_calculation_id, target_input_path, created_by)
    select (value->>'source_calculation_id')::uuid, value->>'source_output_path',
      v_calculation.id, value->>'target_input_path', p_actor_id from jsonb_array_elements(v_links);
  update public.calculations set title = trim(p_title), state = 'draft', updated_at = now()
    where id = v_calculation.id;
  insert into public.audit_events(organisation_id, project_id, actor_user_id, event_type, entity_type, entity_id, metadata_json)
    values(v_organisation, p_project_id, p_actor_id, 'calculation.run', 'calculation_run', v_run.id,
      jsonb_build_object('parent_run_id', v_parent.id, 'run_sequence', v_run.run_sequence, 'linked_inputs', v_links));
  return jsonb_build_object('calculationId', v_calculation.id, 'runId', v_run.id,
    'createdAt', v_run.created_at, 'runSequence', v_run.run_sequence, 'parentRunId', v_parent.id);
end;
$$;
revoke all on function public.opencalcs_save_run(uuid,uuid,text,text,jsonb,uuid,uuid) from public, anon, authenticated;
grant execute on function public.opencalcs_save_run(uuid,uuid,text,text,jsonb,uuid,uuid) to service_role;
