-- EKODI APEX-PATH-ONLY-001 database verification surface.
-- This does not preserve any retired child-host address.

create or replace function public.ekodi_apex_path_policy_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_definition_hits integer := 0;
  v_oauth_hits integer := 0;
  v_suffix text := '.' || 'ekodi.kr';
begin
  select count(*)
    into v_definition_hits
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog','information_schema')
     and p.prokind in ('f','p')
     and position(v_suffix in lower(pg_get_functiondef(p.oid))) > 0;

  select count(*)
    into v_oauth_hits
    from auth.oauth_authorizations
   where position(v_suffix in lower(coalesce(resource,''))) > 0;

  return jsonb_build_object(
    'policy', 'APEX-PATH-ONLY-001',
    'canonical_host', 'ekodi.kr',
    'function_definition_child_host_hits', v_definition_hits,
    'oauth_resource_child_host_hits', v_oauth_hits,
    'ok', (v_definition_hits = 0 and v_oauth_hits = 0)
  );
end
$$;

revoke all on function public.ekodi_apex_path_policy_health() from public, anon, authenticated;
grant execute on function public.ekodi_apex_path_policy_health() to service_role;
comment on function public.ekodi_apex_path_policy_health() is
  'APEX-PATH-ONLY-001 database audit: EKODI-owned child-host references must remain zero.';
