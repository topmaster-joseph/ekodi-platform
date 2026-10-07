-- Collapse My EKODI access fan-out to one authenticated RPC and add scale indexes.
-- The wrapper stays SECURITY INVOKER; existing per-site functions retain their authorization behavior.

create index if not exists site_access_registry_identity_site_status_idx
  on public.site_access_registry (lower(email), site_key, status, tenant_id)
  where status in ('pre_registered','active');

create index if not exists stores_tenant_created_idx
  on public.stores (tenant_id, created_at)
  where tenant_id is not null;

create or replace function public.my_dashboard_access_context(p_site_keys text[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_site text;
  v_access jsonb := '{}'::jsonb;
  v_workspaces jsonb := '{}'::jsonb;
  v_limit integer := coalesce(cardinality(p_site_keys),0);
begin
  if auth.uid() is null then
    return jsonb_build_object('authenticated',false,'access','{}'::jsonb,'workspaces','{}'::jsonb);
  end if;

  if v_limit > 20 then
    raise exception 'too_many_site_keys';
  end if;

  foreach v_site in array coalesce(p_site_keys, array[]::text[]) loop
    v_site := lower(trim(v_site));
    if v_site = '' or length(v_site) > 64 or v_site !~ '^[a-z0-9][a-z0-9_-]*$' then
      continue;
    end if;
    v_access := v_access || jsonb_build_object(v_site, public.current_site_access(v_site));
    v_workspaces := v_workspaces || jsonb_build_object(v_site, public.current_site_workspaces(v_site));
  end loop;

  return jsonb_build_object(
    'authenticated',true,
    'access',v_access,
    'workspaces',v_workspaces
  );
end
$function$;

revoke all on function public.my_dashboard_access_context(text[]) from public;
revoke all on function public.my_dashboard_access_context(text[]) from anon;
grant execute on function public.my_dashboard_access_context(text[]) to authenticated;
