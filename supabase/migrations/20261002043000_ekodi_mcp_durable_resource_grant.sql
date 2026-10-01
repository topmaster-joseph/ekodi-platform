create table if not exists public.ekodi_mcp_oauth_grants (
  user_id uuid not null,
  client_id uuid not null,
  resource text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, client_id, resource),
  constraint ekodi_mcp_oauth_grants_resource_check
    check (resource = 'https://ekodi.kr/mcp')
);

revoke all on table public.ekodi_mcp_oauth_grants from public, anon, authenticated;
grant select, insert, update, delete on table public.ekodi_mcp_oauth_grants to supabase_auth_admin;

create or replace function public.capture_ekodi_mcp_oauth_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_client_id uuid;
  v_resource text;
begin
  if tg_op = 'DELETE' then
    update public.ekodi_mcp_oauth_grants
       set revoked_at = coalesce(old.revoked_at, now())
     where user_id = old.user_id
       and client_id = old.client_id
       and resource = 'https://ekodi.kr/mcp'
       and revoked_at is null;
    return old;
  end if;

  v_user_id := new.user_id;
  v_client_id := new.client_id;

  if new.revoked_at is not null then
    update public.ekodi_mcp_oauth_grants
       set revoked_at = new.revoked_at
     where user_id = v_user_id
       and client_id = v_client_id
       and resource = 'https://ekodi.kr/mcp'
       and revoked_at is null;
    return new;
  end if;

  select oa.resource
    into v_resource
    from auth.oauth_authorizations oa
   where oa.user_id = v_user_id
     and oa.client_id = v_client_id
     and oa.resource = 'https://ekodi.kr/mcp'
     and oa.expires_at > now()
   order by oa.created_at desc
   limit 1;

  if v_resource = 'https://ekodi.kr/mcp' then
    insert into public.ekodi_mcp_oauth_grants(user_id, client_id, resource, granted_at, revoked_at)
    values (v_user_id, v_client_id, v_resource, now(), null)
    on conflict (user_id, client_id, resource)
    do update set granted_at = excluded.granted_at, revoked_at = null;
  end if;

  return new;
end
$$;

drop trigger if exists ekodi_capture_mcp_oauth_consent on auth.oauth_consents;
create trigger ekodi_capture_mcp_oauth_consent
after insert or update of revoked_at or delete on auth.oauth_consents
for each row execute function public.capture_ekodi_mcp_oauth_consent();

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
        from public.ekodi_mcp_oauth_grants g
       where g.client_id::text = oauth_client_id
         and g.user_id::text = oauth_user_id
         and g.resource = 'https://ekodi.kr/mcp'
         and g.revoked_at is null
         and exists (
           select 1
             from auth.oauth_consents c
            where c.client_id = g.client_id
              and c.user_id = g.user_id
              and c.revoked_at is null
         )
    ) into mcp_authorized;
  end if;

  if mcp_authorized then
    claims := jsonb_set(claims, '{aud}', to_jsonb('https://ekodi.kr/mcp'::text), true);
    claims := jsonb_set(claims, '{ekodi_ai_client}', 'true'::jsonb, true);
  else
    if claims->>'aud' = 'https://ekodi.kr/mcp' then
      claims := jsonb_set(claims, '{aud}', to_jsonb('authenticated'::text), true);
    end if;
    claims := claims - 'ekodi_ai_client';
  end if;

  return jsonb_build_object('claims', claims);
end
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.capture_ekodi_mcp_oauth_consent() to supabase_auth_admin;
grant execute on function public.ekodi_mcp_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.capture_ekodi_mcp_oauth_consent() from authenticated, anon, public;
revoke execute on function public.ekodi_mcp_access_token_hook(jsonb) from authenticated, anon, public;

comment on table public.ekodi_mcp_oauth_grants is
  'Durable record of explicit user consent bound to the canonical EKODI MCP resource.';
comment on function public.capture_ekodi_mcp_oauth_consent() is
  'Captures the validated MCP resource at consent time before Supabase consumes the transient OAuth authorization row.';
comment on function public.ekodi_mcp_access_token_hook(jsonb) is
  'Issues the canonical EKODI MCP audience only when durable MCP grant and active consent are both present.';
