-- EKODI platform free-plan liveness probe.
-- Read-only by design: no business, tenant, or personal data is read or written.

create or replace function public.ekodi_keepalive()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.ekodi_keepalive() from public;
grant execute on function public.ekodi_keepalive() to anon, authenticated, service_role;

comment on function public.ekodi_keepalive() is
  'Read-only EKODI platform liveness RPC. Does not read or write business or personal data.';
