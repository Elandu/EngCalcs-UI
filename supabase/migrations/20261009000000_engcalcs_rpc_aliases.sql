-- EngCalcs RPC names forward to the established OpenCalcs implementations.
-- The original functions remain available for existing deployed clients.
create or replace function public.engcalcs_save_run(
  p_project_id uuid, p_actor_id uuid, p_definition_id text, p_title text,
  p_run jsonb, p_calculation_id uuid default null, p_expected_run_id uuid default null
) returns jsonb
language sql security invoker set search_path = ''
as $$
  select public.opencalcs_save_run(
    p_project_id, p_actor_id, p_definition_id, p_title, p_run, p_calculation_id, p_expected_run_id
  );
$$;
revoke all on function public.engcalcs_save_run(uuid,uuid,text,text,jsonb,uuid,uuid) from public, anon, authenticated;
grant execute on function public.engcalcs_save_run(uuid,uuid,text,text,jsonb,uuid,uuid) to service_role;

create or replace function public.engcalcs_wind_workflow_action(
  p_project_id uuid, p_actor_id uuid, p_workflow_id uuid, p_action text,
  p_expected_run_ids jsonb, p_payload jsonb
) returns jsonb
language sql security invoker set search_path = ''
as $$
  select public.opencalcs_wind_workflow_action(
    p_project_id, p_actor_id, p_workflow_id, p_action, p_expected_run_ids, p_payload
  );
$$;
revoke all on function public.engcalcs_wind_workflow_action(uuid,uuid,uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.engcalcs_wind_workflow_action(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
