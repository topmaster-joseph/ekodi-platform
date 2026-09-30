create or replace function public.ekodi_free_tier_usage()
returns table (
  database_bytes bigint,
  storage_object_bytes bigint,
  measured_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, storage
as $$
  select
    pg_database_size(current_database())::bigint as database_bytes,
    coalesce(
      (
        select sum((metadata->>'size')::bigint)
        from storage.objects
        where metadata ? 'size'
      ),
      0
    )::bigint as storage_object_bytes,
    now() as measured_at;
$$;

revoke all on function public.ekodi_free_tier_usage() from public;
revoke all on function public.ekodi_free_tier_usage() from anon;
revoke all on function public.ekodi_free_tier_usage() from authenticated;
grant execute on function public.ekodi_free_tier_usage() to service_role;

comment on function public.ekodi_free_tier_usage() is
  'Aggregate EKODI free-tier telemetry. Service-role only; returns no tenant or user data.';
