-- Calculation identity, lifecycle state and links are written by the authenticated
-- edge services. Direct Data API writes would bypass the RPC project lock, exact
-- parent checks and issued-state protection. Existing member SELECT policies stay.
revoke insert, update, delete, truncate, references, trigger
  on public.calculations, public.calculation_links from public, anon, authenticated;

drop policy if exists calculations_insert_engineer on public.calculations;
drop policy if exists calculations_update_engineer on public.calculations;
drop policy if exists calculations_delete_engineer on public.calculations;
drop policy if exists calculation_links_insert_engineer on public.calculation_links;
drop policy if exists calculation_links_update_engineer on public.calculation_links;
drop policy if exists calculation_links_delete_engineer on public.calculation_links;
