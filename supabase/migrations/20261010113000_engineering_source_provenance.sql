-- EngCalcs source provenance and input proposal review.
-- Metadata-only: this migration does NOT ingest drawing files or run AI.
-- Each source, proposed input and decision is scoped to a single project.
--
-- Existing calculation graph writes are restricted to atomic edge-service/RPC
-- paths; SELECT access continues through existing project-membership RLS.

revoke insert, update, delete, truncate, references, trigger
  on public.calculations, public.calculation_links
  from public, anon, authenticated;

drop policy if exists calculations_insert_engineer on public.calculations;
drop policy if exists calculations_update_engineer on public.calculations;
drop policy if exists calculations_delete_engineer on public.calculations;
drop policy if exists calculation_links_insert_engineer on public.calculation_links;
drop policy if exists calculation_links_update_engineer on public.calculation_links;
drop policy if exists calculation_links_delete_engineer on public.calculation_links;

-- Required for composite FKs: a source/proposal cannot point to a calculation
-- or project belonging to another tenant.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.calculations'::regclass
      and conname = 'calculations_id_project_scope_key'
  ) then
    alter table public.calculations
      add constraint calculations_id_project_scope_key unique (id, project_id);
  end if;
end;
$$;

create table if not exists public.engineering_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_kind text not null check (source_kind in ('drawing','schedule','site_observation','report','other')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  revision_label text not null default '' check (char_length(revision_label) <= 80),
  source_reference text not null check (char_length(btrim(source_reference)) between 1 and 1024),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique(id,project_id)
);

create index if not exists engineering_sources_project_created_idx
  on public.engineering_sources(project_id,created_at desc,id desc);

alter table public.engineering_sources enable row level security;
drop policy if exists engineering_sources_select_member on public.engineering_sources;
create policy engineering_sources_select_member on public.engineering_sources
  for select to authenticated
  using ((select app_private.user_has_project_role(project_id,null::text[])));
drop policy if exists engineering_sources_insert_engineer on public.engineering_sources;
create policy engineering_sources_insert_engineer on public.engineering_sources
  for insert to authenticated
  with check (
    created_by = (select auth.uid()) and
    (select app_private.user_has_project_role(project_id,array['owner','admin','engineer']::text[]))
  );

revoke all on public.engineering_sources from public,anon,authenticated;
grant select,insert on public.engineering_sources to authenticated;
grant all on public.engineering_sources to service_role;

create table if not exists public.engineering_input_proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null,
  target_calculation_id uuid,
  target_input_path text not null check (
    char_length(target_input_path) between 2 and 1024
    and left(target_input_path,1) = '/'
    and target_input_path !~ '~([^01]|$)'
  ),
  proposed_value_json jsonb not null check (
    jsonb_typeof(proposed_value_json) is distinct from 'null'
    and octet_length(proposed_value_json::text) <= 16384
  ),
  source_location text not null check (char_length(btrim(source_location)) between 1 and 512),
  rationale text not null check (char_length(btrim(rationale)) between 1 and 2000),
  proposal_origin text not null default 'manual' check (proposal_origin in ('manual','ai')),
  model_identifier text check (model_identifier is null or char_length(model_identifier) <= 160),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique(id,project_id),
  foreign key (source_id,project_id)
    references public.engineering_sources(id,project_id) on delete cascade,
  foreign key (target_calculation_id,project_id)
    references public.calculations(id,project_id) on delete restrict
);

create index if not exists engineering_input_proposals_project_created_idx
  on public.engineering_input_proposals(project_id,created_at desc,id desc);
create index if not exists engineering_input_proposals_source_idx
  on public.engineering_input_proposals(source_id);

alter table public.engineering_input_proposals enable row level security;
drop policy if exists engineering_input_proposals_select_member on public.engineering_input_proposals;
create policy engineering_input_proposals_select_member on public.engineering_input_proposals
  for select to authenticated
  using ((select app_private.user_has_project_role(project_id,null::text[])));
drop policy if exists engineering_input_proposals_insert_engineer on public.engineering_input_proposals;
create policy engineering_input_proposals_insert_engineer on public.engineering_input_proposals
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and proposal_origin = 'manual'
    and model_identifier is null
    and (select app_private.user_has_project_role(project_id,array['owner','admin','engineer']::text[]))
  );

revoke all on public.engineering_input_proposals from public,anon,authenticated;
grant select,insert on public.engineering_input_proposals to authenticated;
grant all on public.engineering_input_proposals to service_role;

-- Decisions are append-only. A proposal remains pending until one explicit
-- accepted/rejected decision; acceptance does NOT write a calculation input.
create table if not exists public.engineering_proposal_decisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique,
  project_id uuid not null references public.projects(id) on delete cascade,
  decision text not null check (decision in ('accepted','rejected')),
  review_note text not null check (char_length(btrim(review_note)) between 1 and 2000),
  reviewed_by uuid not null default auth.uid() references auth.users(id),
  reviewed_at timestamptz not null default now(),
  foreign key (proposal_id,project_id)
    references public.engineering_input_proposals(id,project_id) on delete cascade
);

create index if not exists engineering_proposal_decisions_project_idx
  on public.engineering_proposal_decisions(project_id,reviewed_at desc);

alter table public.engineering_proposal_decisions enable row level security;
drop policy if exists engineering_proposal_decisions_select_member on public.engineering_proposal_decisions;
create policy engineering_proposal_decisions_select_member on public.engineering_proposal_decisions
  for select to authenticated
  using ((select app_private.user_has_project_role(project_id,null::text[])));
drop policy if exists engineering_proposal_decisions_insert_reviewer on public.engineering_proposal_decisions;
create policy engineering_proposal_decisions_insert_reviewer on public.engineering_proposal_decisions
  for insert to authenticated
  with check (
    reviewed_by = (select auth.uid())
    and (select app_private.user_has_project_role(
      project_id,array['owner','admin','engineer','reviewer']::text[]
    ))
  );

revoke all on public.engineering_proposal_decisions from public,anon,authenticated;
grant select,insert on public.engineering_proposal_decisions to authenticated;
grant all on public.engineering_proposal_decisions to service_role;
