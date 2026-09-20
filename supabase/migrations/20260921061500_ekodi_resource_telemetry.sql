-- EKODI aggregate-only resource telemetry for Free-Tier Resource Governor.
create or replace function public.ekodi_resource_telemetry()
returns table (
  database_bytes bigint,
  storage_object_bytes bigint
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    pg_database_size(current_database())::bigint as database_bytes,
    coalesce((
      select sum(nullif(metadata->>'size','')::bigint)
      from storage.objects
      where metadata ? 'size'
    ),0)::bigint as storage_object_bytes;
$$;

revoke all on function public.ekodi_resource_telemetry() from public;
revoke all on function public.ekodi_resource_telemetry() from anon;
revoke all on function public.ekodi_resource_telemetry() from authenticated;
grant execute on function public.ekodi_resource_telemetry() to service_role;

comment on function public.ekodi_resource_telemetry() is
  'EKODI aggregate-only free-tier telemetry; callable only by service_role behind the telemetry Edge Function.';
