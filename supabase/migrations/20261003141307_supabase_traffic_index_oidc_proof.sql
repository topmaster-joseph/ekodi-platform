-- Read-only deployment proof for GitHub Actions OIDC.
-- The function is callable only by service_role; anon/authenticated/public remain revoked.
create or replace function public.ekodi_supabase_traffic_index_ready()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'activity_message_campaigns'
      and indexname = 'activity_message_campaigns_created_by_idx'
  );
$$;

revoke all on function public.ekodi_supabase_traffic_index_ready() from public;
revoke all on function public.ekodi_supabase_traffic_index_ready() from anon;
revoke all on function public.ekodi_supabase_traffic_index_ready() from authenticated;
grant execute on function public.ekodi_supabase_traffic_index_ready() to service_role;
