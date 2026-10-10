-- Required private object storage for issued engineering calculation PDFs.
-- Reports are uploaded by authenticated Edge Functions using their service
-- role after reviewing organisation membership and the exact approved runs.
-- No public objects, public read policies, or direct authenticated writes.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'issued-calculation-packs',
  'issued-calculation-packs',
  false,
  26214400,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'issued-calculation-packs'
      and public = false
      and (allowed_mime_types is null or 'application/pdf' = any(allowed_mime_types))
  ) then
    raise exception 'Issued calculation storage bucket must be private and accept PDFs';
  end if;
end;
$$;
