-- OAuth access-token hardening for the EKODI MCP resource server.
-- This function must be enabled as the Supabase Custom Access Token hook.

create or replace function public.ekodi_mcp_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := event->'claims';
  oauth_client_id text;
begin
  oauth_client_id := nullif(claims->>'client_id', '');

  if oauth_client_id is not null then
    claims := jsonb_set(claims, '{aud}', to_jsonb('https://api.ekodi.kr/mcp'::text), true);
    claims := jsonb_set(claims, '{ekodi_ai_client}', 'true'::jsonb, true);
  end if;

  return jsonb_build_object('claims', claims);
end
$$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.ekodi_mcp_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.ekodi_mcp_access_token_hook(jsonb) from authenticated, anon, public;

comment on function public.ekodi_mcp_access_token_hook(jsonb) is
  'Sets an MCP resource audience only for OAuth client tokens. Direct EKODI user sessions keep their existing audience.';
