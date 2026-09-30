-- Narrow EKODI MCP audience issuance to an explicitly approved MCP resource request.
-- OAuth client_id alone is not sufficient to receive the MCP audience.

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
        from auth.oauth_authorizations oa
       where oa.client_id::text = oauth_client_id
         and oa.user_id::text = oauth_user_id
         and oa.resource = 'https://api.ekodi.kr/mcp'
         and oa.status::text = 'approved'
         and oa.expires_at > now()
    ) into mcp_authorized;
  end if;

  if mcp_authorized then
    claims := jsonb_set(claims, '{aud}', to_jsonb('https://api.ekodi.kr/mcp'::text), true);
    claims := jsonb_set(claims, '{ekodi_ai_client}', 'true'::jsonb, true);
  else
    claims := claims - 'ekodi_ai_client';
  end if;

  return jsonb_build_object('claims', claims);
end
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.ekodi_mcp_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.ekodi_mcp_access_token_hook(jsonb) from authenticated, anon, public;

comment on function public.ekodi_mcp_access_token_hook(jsonb) is
  'Issues the EKODI MCP audience only when the current OAuth client and user have an approved, unexpired authorization for resource https://api.ekodi.kr/mcp.';
