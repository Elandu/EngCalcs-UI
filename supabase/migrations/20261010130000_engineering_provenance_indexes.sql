-- Cover tenant-scoped proposal/source foreign keys and review attribution.
-- The SaaS project is initially small; these avoid expensive scans as teams,
-- project source sets and historical review records expand.
create index if not exists engineering_sources_created_by_idx
  on public.engineering_sources(created_by);

create index if not exists engineering_input_proposals_created_by_idx
  on public.engineering_input_proposals(created_by);

create index if not exists engineering_input_proposals_source_scope_idx
  on public.engineering_input_proposals(source_id, project_id);

create index if not exists engineering_input_proposals_target_scope_idx
  on public.engineering_input_proposals(target_calculation_id, project_id)
  where target_calculation_id is not null;

create index if not exists engineering_proposal_decisions_proposal_scope_idx
  on public.engineering_proposal_decisions(proposal_id, project_id);

create index if not exists engineering_proposal_decisions_reviewer_idx
  on public.engineering_proposal_decisions(reviewed_by);
