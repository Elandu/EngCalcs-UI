-- One transaction for the complete Wind lifecycle. Only authenticated edge services
-- may invoke it; the actor's project role is checked independently inside the RPC.
create or replace function public.opencalcs_wind_workflow_action(
  p_project_id uuid, p_actor_id uuid, p_workflow_id uuid, p_action text,
  p_expected_run_ids jsonb, p_payload jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_org uuid;
  v_role text;
  v_workflow uuid := coalesce(p_workflow_id, pg_catalog.gen_random_uuid());
  v_keys text[] := array['site','wind_region','terrain','shielding','topography','design'];
  v_definitions text[] := array['au.wind.workflow.site','au.wind.workflow.wind_region',
    'au.wind.workflow.terrain','au.wind.workflow.shielding','au.wind.workflow.topography',
    'au.wind.workflow.design_wind_speed'];
  v_calcs jsonb := '{}'::jsonb;
  v_current jsonb := '{}'::jsonb;
  v_parents jsonb := '{}'::jsonb;
  v_new_ids jsonb := '{}'::jsonb;
  v_runs jsonb := '[]'::jsonb;
  v_overrides jsonb := coalesce(p_payload->'overrides','[]'::jsonb);
  v_stage jsonb;
  v_run jsonb;
  v_override jsonb;
  v_expected_review jsonb;
  v_key text;
  v_var text;
  v_direction text;
  v_calc_id uuid;
  v_override_id uuid;
  v_parent public.calculation_runs;
  v_saved public.calculation_runs;
  v_review public.calculation_run_reviews;
  v_report public.reports;
  v_prior public.reports;
  v_design public.calculation_runs;
  v_report_payload jsonb;
  v_i integer;
  v_changed uuid[] := '{}';
  v_expected_ids uuid[];
  v_status text;
begin
  select organisation_id into v_org from public.projects where id=p_project_id;
  select role into v_role from public.organisation_members
    where organisation_id=v_org and user_id=p_actor_id;
  if v_org is null or v_role is null then
    raise exception 'Project membership required' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('save','submit','approve','request_changes','issue')
    or jsonb_typeof(p_expected_run_ids) is distinct from 'object'
    or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Invalid Wind workflow action' using errcode='22023';
  end if;
  if (p_action in ('save','submit') and v_role not in ('owner','admin','engineer'))
    or (p_action in ('approve','request_changes','issue') and v_role not in ('owner','admin','reviewer')) then
    raise exception 'Role does not permit this Wind workflow action' using errcode='42501';
  end if;

  -- Same lock as standalone v2/v3 saves; review and issue cannot race a new revision.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_project_id::text,0));
  if p_workflow_id is not null then
    perform id from public.calculations
      where project_id=p_project_id and workflow_instance_id=v_workflow order by id for update;
    if (select count(*) from public.calculations
      where project_id=p_project_id and workflow_instance_id=v_workflow) <> 6 then
      raise exception 'Wind workflow graph not found or incomplete' using errcode='22023';
    end if;
    for v_i in 1..6 loop
      select id into v_calc_id from public.calculations where project_id=p_project_id
        and workflow_instance_id=v_workflow and stage_key=v_keys[v_i]
        and calculation_definition_id=v_definitions[v_i];
      if v_calc_id is null then
        raise exception 'Invalid Wind workflow stage' using errcode='22023';
      end if;
      v_calcs := v_calcs || jsonb_build_object(v_keys[v_i],v_calc_id);
      select * into v_parent from public.calculation_runs where calculation_id=v_calc_id
        order by run_sequence desc, created_at desc,id desc limit 1;
      if v_parent.id is null then
        raise exception 'Every Wind stage requires a saved run' using errcode='22023';
      end if;
      v_current := v_current || jsonb_build_object(v_calc_id::text,v_parent.id);
      v_parents := v_parents || jsonb_build_object(v_keys[v_i],v_parent.id);
    end loop;
    if v_current is distinct from p_expected_run_ids then
      raise exception 'Wind workflow changed. Reload the displayed runs before continuing.' using errcode='40001';
    end if;
    if exists(select 1 from public.calculations where project_id=p_project_id
      and workflow_instance_id=v_workflow and state='issued') then
      raise exception 'Issued Wind workflows cannot be modified. Start a new assessment.' using errcode='40001';
    end if;
  elsif p_action <> 'save' or p_expected_run_ids <> '{}'::jsonb then
    raise exception 'A new Wind workflow cannot have parent runs' using errcode='22023';
  end if;

  if p_action='save' then
    if jsonb_typeof(p_payload->'stages') is distinct from 'array'
      or jsonb_array_length(p_payload->'stages') <> 6
      or jsonb_typeof(v_overrides) is distinct from 'array'
      or jsonb_array_length(v_overrides)>50 then
      raise exception 'A complete six-stage Wind result is required' using errcode='22023';
    end if;
    if p_workflow_id is null and jsonb_array_length(v_overrides)>0 then
      raise exception 'Overrides require an existing initial Wind run' using errcode='22023';
    end if;
    -- Allocate identities first so each stage records this exact six-run snapshot.
    for v_i in 1..6 loop
      if (select count(*) from jsonb_array_elements(p_payload->'stages') s
        where s->>'stage_key'=v_keys[v_i] and s->>'definition'=v_definitions[v_i]) <> 1 then
        raise exception 'Wind stages must be complete and unique' using errcode='22023';
      end if;
      select value into v_stage from jsonb_array_elements(p_payload->'stages')
        where value->>'stage_key'=v_keys[v_i];
      v_run := v_stage->'run';
      if jsonb_typeof(v_run) is distinct from 'object'
        or jsonb_typeof(v_run->'input_json') is distinct from 'object'
        or jsonb_typeof(v_run->'result_json') is distinct from 'object'
        or jsonb_typeof(v_run->'provenance_json') is distinct from 'object'
        or length(trim(coalesce(v_stage->>'title',''))) not between 1 and 200 then
        raise exception 'Invalid Wind run envelope' using errcode='22023';
      end if;
      if p_workflow_id is null then
        insert into public.calculations(project_id,workflow_instance_id,stage_key,
          calculation_definition_id,title,sort_order,state,created_by)
          values(p_project_id,v_workflow,v_keys[v_i],v_definitions[v_i],v_stage->>'title',v_i-1,'draft',p_actor_id)
          returning id into v_calc_id;
        v_calcs := v_calcs || jsonb_build_object(v_keys[v_i],v_calc_id);
      end if;
      v_new_ids := v_new_ids || jsonb_build_object(v_keys[v_i],pg_catalog.gen_random_uuid());
    end loop;
    for v_i in 1..6 loop
      v_key := v_keys[v_i];
      select value->'run' into v_run from jsonb_array_elements(p_payload->'stages')
        where value->>'stage_key'=v_key;
      select * into v_parent from public.calculation_runs where id=(v_parents->>v_key)::uuid;
      insert into public.calculation_runs(id,calculation_id,parent_run_id,run_sequence,
        engine_plugin_id,engine_plugin_version,calculation_definition_id,calculation_definition_version,
        standard_reference_json,input_json,result_json,warnings_json,provenance_json,input_hash,created_by)
      values((v_new_ids->>v_key)::uuid,(v_calcs->>v_key)::uuid,v_parent.id,
        coalesce(v_parent.run_sequence,0)+1,v_run->>'engine_plugin_id',v_run->>'engine_plugin_version',
        v_definitions[v_i],v_run->>'calculation_definition_version',v_run->'standard_reference_json',
        (v_run->'input_json') || jsonb_build_object('workflow_instance_id',v_workflow),
        v_run->'result_json',coalesce(v_run->'warnings_json','[]'::jsonb),
        (v_run->'provenance_json') || jsonb_build_object('workflow_instance_id',v_workflow,
          'workflow_run_ids',v_new_ids,'workflow_calculation_ids',v_calcs),v_run->>'input_hash',p_actor_id)
      returning * into v_saved;
      v_runs := v_runs || jsonb_build_array(jsonb_build_object('id',v_saved.id,
        'calculation_id',v_saved.calculation_id,'parent_run_id',v_saved.parent_run_id,
        'run_sequence',v_saved.run_sequence,'created_at',v_saved.created_at));
    end loop;
    if p_workflow_id is null then
      insert into public.calculation_links(source_calculation_id,source_output_path,
        target_calculation_id,target_input_path,created_by)
      select (v_calcs->>e.source)::uuid,e.source_path,(v_calcs->>e.target)::uuid,e.target_path,p_actor_id
      from (values ('site','/','wind_region','/site'),('site','/','terrain','/site'),
        ('terrain','/','shielding','/terrain'),('site','/features','topography','/features'),
        ('wind_region','/','design','/wind_inputs'),('terrain','/','design','/terrain'),
        ('shielding','/','design','/shielding'),('topography','/','design','/topography'))
        as e(source,source_path,target,target_path);
    end if;
    if (select count(*) from jsonb_array_elements(v_overrides)) <>
      (select count(distinct (value->>'variable',coalesce(value->>'direction','')))
       from jsonb_array_elements(v_overrides)) then
      raise exception 'Duplicate Wind overrides' using errcode='22023';
    end if;
    for v_override in select value from jsonb_array_elements(v_overrides) loop
      v_var := v_override->>'variable';
      v_direction := v_override->>'direction';
      if v_var is null or v_var not in ('VR','Md','Mzcat','Ms','Mt','Vsitb')
        or (v_var='VR' and v_direction is not null)
        or (v_var<>'VR' and (v_direction is null or v_direction not in ('N','NE','E','SE','S','SW','W','NW')))
        or jsonb_typeof(v_override->'override_value') is distinct from 'number'
        or (v_override->>'override_value')::numeric <= 0
        or length(trim(coalesce(v_override->>'reason','')))=0 then
        raise exception 'Invalid Wind override' using errcode='22023';
      end if;
      v_key := case v_var when 'VR' then 'wind_region' when 'Md' then 'wind_region'
        when 'Mzcat' then 'terrain' when 'Ms' then 'shielding' when 'Mt' then 'topography' else 'design' end;
      insert into public.calculation_overrides(workflow_instance_id,calculation_id,source_run_id,
        applied_run_id,variable,direction,original_value,override_value,reason,source_reference,created_by,is_active)
      values(v_workflow,(v_calcs->>v_key)::uuid,(v_parents->>v_key)::uuid,
        (v_new_ids->>v_key)::uuid,v_var,v_direction,(v_override->>'original_value')::numeric,
        (v_override->>'override_value')::numeric,trim(v_override->>'reason'),v_override->>'source_reference',p_actor_id,true)
      returning id into v_override_id;
      update public.calculation_overrides set is_active=false,superseded_at=now(),superseded_by_id=v_override_id
        where workflow_instance_id=v_workflow and variable=v_var and direction is not distinct from v_direction
          and is_active and id<>v_override_id;
    end loop;
    update public.calculations set state='draft',updated_at=now()
      where project_id=p_project_id and workflow_instance_id=v_workflow;
    if jsonb_typeof(p_payload->'project_address')='string' then
      update public.projects set address=p_payload->>'project_address'
        where id=p_project_id and coalesce(address,'')='';
    end if;
    insert into public.audit_events(organisation_id,project_id,actor_user_id,event_type,entity_type,entity_id,metadata_json)
      values(v_org,p_project_id,p_actor_id,case when p_workflow_id is null then 'wind_workflow.run' else 'wind_workflow.rerun' end,
      'calculation',(v_calcs->>'design')::uuid,jsonb_build_object('workflow_instance_id',v_workflow,
      'workflow_id',p_payload->'workflow_id','run_ids',v_new_ids,'parent_run_ids',v_parents,'override_count',jsonb_array_length(v_overrides)));
    return jsonb_build_object('workflowInstanceId',v_workflow,'calculationIds',v_calcs,
      'runs',v_runs,'affectedStages',to_jsonb(v_keys));
  end if;

  select array_agg(value::uuid) into v_expected_ids from jsonb_each_text(v_current);
  if p_action='issue' then
    if (select count(*) from public.calculation_run_reviews
      where run_id=any(v_expected_ids) and status='approved')<>6 then
      raise exception 'Every latest Wind stage must be approved before issue' using errcode='40001';
    end if;
    if jsonb_typeof(p_payload->'expected_reviews') is distinct from 'array'
      or jsonb_array_length(p_payload->'expected_reviews')<>6
      or (select count(distinct value->>'run_id') from jsonb_array_elements(p_payload->'expected_reviews'))<>6 then
      raise exception 'The exact approved review snapshot is required' using errcode='22023';
    end if;
    for v_expected_review in select value from jsonb_array_elements(p_payload->'expected_reviews') loop
      select * into v_review from public.calculation_run_reviews
        where run_id=(v_expected_review->>'run_id')::uuid and run_id=any(v_expected_ids);
      if v_review.run_id is null or v_review.status is distinct from v_expected_review->>'status'
        or v_review.reviewer_id is distinct from (v_expected_review->>'reviewer_id')::uuid
        or v_review.submitted_by is distinct from (v_expected_review->>'submitted_by')::uuid
        or v_review.review_note is distinct from v_expected_review->>'review_note'
        or v_review.reviewed_at is distinct from (v_expected_review->>'reviewed_at')::timestamptz
        or v_review.submitted_at is distinct from (v_expected_review->>'submitted_at')::timestamptz then
        raise exception 'Wind review changed during report generation. Reload and retry.' using errcode='40001';
      end if;
    end loop;
    v_report_payload := p_payload->'report';
    select * into v_prior from public.reports where project_id=p_project_id
      and workflow_instance_id=v_workflow and status='issued' order by revision desc limit 1;
    if jsonb_typeof(v_report_payload) is distinct from 'object'
      or (v_report_payload->>'revision')::integer is distinct from coalesce(v_prior.revision,0)+1
      or (v_report_payload->>'supersedes_report_id')::uuid is distinct from v_prior.id then
      raise exception 'Report revision changed. Reload and retry.' using errcode='40001';
    end if;
    if coalesce(v_report_payload->>'report_hash','') !~ '^[0-9a-f]{64}$'
      or left(coalesce(v_report_payload->>'storage_path',''),37) <> v_org::text || '/'
      or nullif(v_report_payload->>'issued_at','') is null then
      raise exception 'Invalid report artifact' using errcode='22023';
    end if;
    select * into v_design from public.calculation_runs where id=(v_parents->>'design')::uuid;
    insert into public.reports(project_id,calculation_run_id,workflow_instance_id,storage_path,
      report_type,title,revision,status,report_hash,metadata_json,supersedes_report_id,issued_by,issued_at)
    values(p_project_id,v_design.id,v_workflow,v_report_payload->>'storage_path','wind_calculation_pack',
      'Wind Calculation Pack',(v_report_payload->>'revision')::integer,'issued',v_report_payload->>'report_hash',
      coalesce(v_report_payload->'metadata_json','{}'::jsonb) || jsonb_build_object('latest_run_ids',to_jsonb(v_expected_ids),
        'workflow_instance_id',v_workflow),v_prior.id,p_actor_id,(v_report_payload->>'issued_at')::timestamptz)
    returning * into v_report;
    update public.calculations set state='issued',updated_at=now()
      where project_id=p_project_id and workflow_instance_id=v_workflow;
    insert into public.audit_events(organisation_id,project_id,actor_user_id,event_type,entity_type,entity_id,metadata_json)
      values(v_org,p_project_id,p_actor_id,'wind_workflow.issued','report',v_report.id,
        jsonb_build_object('workflow_instance_id',v_workflow,'latest_run_ids',to_jsonb(v_expected_ids),
          'revision',v_report.revision,'report_hash',v_report.report_hash));
    return jsonb_build_object('report',to_jsonb(v_report));
  end if;

  if p_action='submit' then
    insert into public.calculation_run_reviews(run_id,status,submitted_by,submitted_at,reviewer_id,review_note,reviewed_at,updated_at)
      select r.id,'pending',p_actor_id,now(),null,null,null,now() from public.calculation_runs r
      left join public.calculation_run_reviews rv on rv.run_id=r.id
      where r.id=any(v_expected_ids) and coalesce(rv.status,'')<>'approved'
      on conflict(run_id) do update set status='pending',submitted_by=p_actor_id,submitted_at=now(),
        reviewer_id=null,review_note=null,reviewed_at=null,updated_at=now();
    select array_agg(run_id) into v_changed from public.calculation_run_reviews
      where run_id=any(v_expected_ids) and status='pending';
    v_status := case when coalesce(cardinality(v_changed),0)=0 then 'approved' else 'pending' end;
  else
    if exists(select 1 from unnest(v_expected_ids) r(id) left join public.calculation_run_reviews rv on rv.run_id=r.id
      where rv.status is null or rv.status not in ('pending','approved')) then
      raise exception 'Every latest Wind stage must be submitted or approved' using errcode='40001';
    end if;
    v_status := case when p_action='approve' then 'approved' else 'changes_requested' end;
    with changed as (
      update public.calculation_run_reviews set status=v_status,reviewer_id=p_actor_id,
        review_note=nullif(trim(p_payload->>'note'),''),reviewed_at=now(),updated_at=now()
      where run_id=any(v_expected_ids) and (status='pending' or p_action='request_changes') returning run_id
    ) select array_agg(run_id) into v_changed from changed;
  end if;
  update public.calculations set state=case when p_action='request_changes' then 'draft' else 'review' end,updated_at=now()
    where id in (select calculation_id from public.calculation_runs where id=any(v_changed));
  insert into public.audit_events(organisation_id,project_id,actor_user_id,event_type,entity_type,entity_id,metadata_json)
    values(v_org,p_project_id,p_actor_id,case p_action when 'submit' then 'wind_workflow.review_submitted'
      when 'approve' then 'wind_workflow.review_approved' else 'wind_workflow.changes_requested' end,
      'calculation',(v_calcs->>'design')::uuid,jsonb_build_object('workflow_instance_id',v_workflow,
        'run_ids',to_jsonb(v_expected_ids),'changed_run_ids',to_jsonb(v_changed),'note',p_payload->'note'));
  return jsonb_build_object('workflowInstanceId',v_workflow,'status',v_status,'runIds',to_jsonb(v_expected_ids),
    'submittedRunIds',to_jsonb(coalesce(v_changed,'{}'::uuid[])),'reviewerId',p_actor_id,'reviewedAt',now());
end;
$$;
revoke all on function public.opencalcs_wind_workflow_action(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.opencalcs_wind_workflow_action(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
