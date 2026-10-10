-- Private project drawing ingestion. Only source metadata is stored in Postgres.
-- Document binaries live in a non-public Supabase Storage bucket and never enter the calculation runtime.

alter table public.engineering_sources
  add column if not exists storage_path text,
  add column if not exists storage_byte_size integer,
  add column if not exists storage_mime_type text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.engineering_sources'::regclass and conname='engineering_sources_verified_upload_shape') then
    alter table public.engineering_sources
      add constraint engineering_sources_verified_upload_shape check (
        (storage_path is null and storage_byte_size is null and storage_mime_type is null)
        or
        (
          storage_path is not null and storage_byte_size between 5 and 10485760
          and storage_mime_type = 'application/pdf'
          and storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$'
          and split_part(storage_path, '/', 1) = project_id::text
          and content_sha256 ~ '^[a-f0-9]{64}$'
        )
      );
  end if;
end;
$$;

create unique index if not exists engineering_sources_storage_path_uniq
  on public.engineering_sources(storage_path) where storage_path is not null;

-- An authenticated user may register a manual source reference, but may NOT
-- assert that an uploaded file was cryptographically verified. Only the authenticated
-- Edge Function (using the service role) inserts storage_path and checksum together.
drop policy if exists engineering_sources_insert_engineer on public.engineering_sources;
create policy engineering_sources_insert_engineer on public.engineering_sources
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and storage_path is null
    and storage_byte_size is null
    and storage_mime_type is null
    and (select app_private.user_has_project_role(project_id, array['owner','admin','engineer']::text[]))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('engineering-project-sources', 'engineering-project-sources', false, 10485760, array['application/pdf']::text[])
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1 from storage.buckets where id='engineering-project-sources'
      and (public is true or file_size_limit is distinct from 10485760 or allowed_mime_types is distinct from array['application/pdf']::text[])
  ) then
    raise exception 'The engineering-project-sources bucket must be private and PDF-only (10 MiB)';
  end if;
end;
$$;

-- A user can only upload or download PDFs within projects for which they hold
-- membership. Never grant anonymous, UPDATE or DELETE access to objects.
drop policy if exists engineering_source_objects_select_member on storage.objects;
create policy engineering_source_objects_select_member on storage.objects
  for select to authenticated
  using (
    bucket_id='engineering-project-sources'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$'
    and exists (
      select 1 from public.projects p
        where p.id::text = split_part(name,'/',1)
          and (select app_private.user_has_project_role(p.id, null::text[]))
    )
  );

drop policy if exists engineering_source_objects_insert_engineer on storage.objects;
create policy engineering_source_objects_insert_engineer on storage.objects
  for insert to authenticated
  with check (
    bucket_id='engineering-project-sources'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$'
    and exists (
      select 1 from public.projects p
        where p.id::text = split_part(name,'/',1)
          and (select app_private.user_has_project_role(p.id, array['owner','admin','engineer']::text[]))
    )
  );
