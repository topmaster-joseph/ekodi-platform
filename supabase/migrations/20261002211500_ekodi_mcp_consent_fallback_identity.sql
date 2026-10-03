-- Allow EKODI MCP to verify explicit OAuth consent even when the hosted Auth
-- server has not yet applied the custom access-token hook claim projection.
-- This preserves bounded client/resource consent and does not authorize generic
-- user sessions or arbitrary OAuth clients.

create or replace function public.current_ekodi_mcp_identity()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_client_id uuid;
  v_authorized boolean := false;
  v_person_id uuid;
  v_ekodi_id text;
  v_provider text;
begin
  if v_user_id is null then
    return jsonb_build_object('authenticated', false, 'authorized', false);
  end if;

  begin
    v_client_id := nullif(v_jwt->>'client_id', '')::uuid;
  exception when others then
    v_client_id := null;
  end;

  if v_client_id is null then
    return jsonb_build_object('authenticated', true, 'authorized', false);
  end if;

  select exists (
    select 1
      from public.ekodi_mcp_oauth_grants g
      join auth.oauth_consents c
        on c.client_id = g.client_id
       and c.user_id = g.user_id
     where g.user_id = v_user_id
       and g.client_id = v_client_id
       and g.resource = 'https://ekodi.kr/mcp'
       and g.revoked_at is null
       and c.revoked_at is null
  ) into v_authorized;

  if not v_authorized then
    return jsonb_build_object('authenticated', true, 'authorized', false);
  end if;

  select li.person_id, li.provider, p.ekodi_id
    into v_person_id, v_provider, v_ekodi_id
    from public.login_identities li
    join public.people p on p.id = li.person_id
   where li.auth_user_id = v_user_id
     and li.status = 'active'
     and p.status = 'active'
   limit 1;

  if v_person_id is null then
    return jsonb_build_object(
      'authenticated', true,
      'authorized', true,
      'canonical', false,
      'auth_user_id', v_user_id
    );
  end if;

  return jsonb_build_object(
    'authenticated', true,
    'authorized', true,
    'canonical', true,
    'auth_user_id', v_user_id,
    'person_id', v_person_id,
    'ekodi_id', v_ekodi_id,
    'login_provider', v_provider
  );
end
$$;

revoke all on function public.current_ekodi_mcp_identity() from public;
grant execute on function public.current_ekodi_mcp_identity() to anon, authenticated;

comment on function public.current_ekodi_mcp_identity() is
  'Resolves MCP identity only for an OAuth client with active explicit consent and a durable grant bound to https://ekodi.kr/mcp.';
