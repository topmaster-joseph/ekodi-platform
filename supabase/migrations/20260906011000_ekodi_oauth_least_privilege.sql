-- Least-privilege boundary for dynamically registered OAuth / MCP clients.
-- OAuth access tokens never inherit the normal authenticated PostgREST role.

create or replace function public.current_ekodi_mcp_identity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_person_id uuid;
  v_ekodi_id text;
  v_provider text;
begin
  if v_user_id is null then
    return jsonb_build_object('authenticated', false, 'authorized', false);
  end if;

  if nullif(v_jwt->>'client_id', '') is null
     or coalesce(v_jwt->>'aud', '') <> 'https://api.ekodi.kr/mcp'
     or coalesce((v_jwt->>'ekodi_ai_client')::boolean, false) is not true then
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

revoke all on function public.current_ekodi_mcp_identity() from public, authenticated;
grant execute on function public.current_ekodi_mcp_identity() to anon;

comment on function public.current_ekodi_mcp_identity() is
  'Minimal identity projection for OAuth MCP tokens. Requires client_id, the EKODI MCP audience, and ekodi_ai_client=true before resolving the canonical person.';

create or replace function public.ekodi_mcp_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := event->'claims';
  oauth_client_id text := nullif(event->'claims'->>'client_id', '');
  oauth_user_id text := nullif(event->>'user_id', '');
  mcp_authorized boolean := false;
begin
  if oauth_client_id is not null then
    claims := jsonb_set(claims, '{role}', to_jsonb('anon'::text), true);
  end if;

  if oauth_client_id is not null and oauth_user_id is not null then
    select exists (
      select 1
        from auth.oauth_consents c
       where c.client_id::text = oauth_client_id
         and c.user_id::text = oauth_user_id
         and c.revoked_at is null
         and exists (
           select 1
             from auth.oauth_authorizations oa
            where oa.client_id = c.client_id
              and oa.user_id = c.user_id
              and oa.resource = 'https://api.ekodi.kr/mcp'
              and oa.status::text = 'approved'
         )
    ) into mcp_authorized;
  end if;

  if mcp_authorized then
    claims := jsonb_set(claims, '{aud}', to_jsonb('https://api.ekodi.kr/mcp'::text), true);
    claims := jsonb_set(claims, '{ekodi_ai_client}', 'true'::jsonb, true);
  else
    if claims->>'aud' = 'https://api.ekodi.kr/mcp' then
      claims := jsonb_set(claims, '{aud}', to_jsonb('authenticated'::text), true);
    end if;
    claims := claims - 'ekodi_ai_client';
  end if;

  return jsonb_build_object('claims', claims);
end
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.ekodi_mcp_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.ekodi_mcp_access_token_hook(jsonb) from authenticated, anon, public;

comment on function public.ekodi_mcp_access_token_hook(jsonb) is
  'For OAuth tokens, forces the PostgREST role to anon. Only active user consent plus an approved EKODI MCP resource request adds the MCP audience and ekodi_ai_client marker.';
