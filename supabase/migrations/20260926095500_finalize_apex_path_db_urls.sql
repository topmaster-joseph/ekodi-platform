-- Finalize EKODI apex-path-only URLs inside live Supabase database objects.
-- Do not restore any EKODI-owned child host after this migration.

update auth.oauth_authorizations
   set resource = 'https://ekodi.kr/mcp'
 where resource in ('https://' || 'api.' || 'ekodi.kr/mcp','https://ekodi.kr/api/mcp');

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
     or coalesce(v_jwt->>'aud', '') <> 'https://ekodi.kr/mcp'
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
              and oa.resource = 'https://ekodi.kr/mcp'
              and oa.status::text = 'approved'
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
grant execute on function public.ekodi_mcp_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.ekodi_mcp_access_token_hook(jsonb) from authenticated, anon, public;

comment on function public.ekodi_mcp_access_token_hook(jsonb) is
  'Issues only the canonical https://ekodi.kr/mcp audience; ekodi.kr/api is retired.';


create or replace function public.publish_creator_to_my_ekodi(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_person_id uuid;
  v_workspace_key text;
  v_project public.author_projects%rowtype;
  v_item_id uuid;
  v_destination text;
begin
  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  select *
    into v_project
    from public.author_projects
   where id = p_project_id
     and owner_user_id = v_user_id
   limit 1;

  if v_project.id is null then
    raise exception 'creator_project_not_found';
  end if;

  if v_project.status not in ('author_approved','publish_ready','published') then
    raise exception 'creator_human_approval_required';
  end if;

  select li.person_id
    into v_person_id
    from public.login_identities li
   where li.auth_user_id = v_user_id
     and li.status = 'active'
   limit 1;

  v_workspace_key := 'personal:' || coalesce(v_person_id::text, v_user_id::text);

  v_destination := case v_project.creator_mode
    when 'writer' then 'EKODI BOOKS'
    when 'video' then 'Video Channels'
    when 'podcast' then 'Audio Channels'
    when 'lecture' then 'Learning'
    when 'research' then 'Knowledge'
    when 'visual' then 'Visual Channels'
    when 'mission' then 'Community'
    else 'Digital'
  end;

  insert into public.creator_portfolio_items (
    project_id, owner_user_id, person_id, workspace_key, title, summary, creator_mode,
    status, visibility, destinations, metadata, published_at, updated_at
  ) values (
    v_project.id,
    v_user_id,
    v_person_id,
    v_workspace_key,
    coalesce(nullif(v_project.working_title,''), v_project.title),
    left(coalesce(v_project.interest,''), 1200),
    v_project.creator_mode,
    'published',
    'private',
    jsonb_build_array(v_destination),
    jsonb_build_object(
      'field', v_project.field,
      'audience', v_project.audience,
      'format', v_project.book_format,
      'source_mode', v_project.source_mode,
      'creator_project_status', v_project.status
    ),
    now(),
    now()
  )
  on conflict (project_id)
  do update set
    person_id = excluded.person_id,
    workspace_key = excluded.workspace_key,
    title = excluded.title,
    summary = excluded.summary,
    creator_mode = excluded.creator_mode,
    status = 'published',
    destinations = excluded.destinations,
    metadata = excluded.metadata,
    published_at = coalesce(public.creator_portfolio_items.published_at, now()),
    updated_at = now()
  returning id into v_item_id;

  update public.author_projects
     set my_ekodi_status = 'published',
         my_ekodi_published_at = coalesce(my_ekodi_published_at, now()),
         status = case when status = 'author_approved' then 'publish_ready' else status end,
         updated_at = now()
   where id = v_project.id;

  insert into public.author_events(project_id, owner_user_id, actor, event_type, payload)
  values (
    v_project.id,
    v_user_id,
    'system',
    'my-ekodi.portfolio.synced',
    jsonb_build_object(
      'portfolio_item_id', v_item_id,
      'workspace_key', v_workspace_key,
      'creator_mode', v_project.creator_mode,
      'visibility', 'private'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'portfolio_item_id', v_item_id,
    'workspace_key', v_workspace_key,
    'creator_mode', v_project.creator_mode,
    'visibility', 'private',
    'my_ekodi_url', 'https://ekodi.kr/my/'
  );
end
$$;

revoke all on function public.publish_creator_to_my_ekodi(uuid) from public, anon;
grant execute on function public.publish_creator_to_my_ekodi(uuid) to authenticated;



comment on function public.publish_creator_to_my_ekodi(uuid) is
  'Human-gated handoff from Creator AI into the person-scoped My EKODI portfolio at https://ekodi.kr/my/.';
