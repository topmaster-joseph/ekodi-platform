-- Persist MCP audience across refreshes while the user's OAuth consent remains active.
-- A revoked consent immediately stops future MCP-audience token issuance.

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
  'Issues the EKODI MCP audience only for an active OAuth consent whose client/user pair previously approved resource https://api.ekodi.kr/mcp; revocation removes future MCP audience issuance.';
