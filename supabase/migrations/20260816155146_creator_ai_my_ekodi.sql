-- EKODI Creator AI + My EKODI integration
-- Keep author_* table names as compatibility surfaces while widening the product from books to multi-format creation.

alter table public.author_projects
  add column if not exists creator_mode text not null default 'writer';

alter table public.author_projects
  add column if not exists my_ekodi_status text not null default 'private';

alter table public.author_projects
  add column if not exists my_ekodi_published_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'author_projects_creator_mode_check'
      and conrelid = 'public.author_projects'::regclass
  ) then
    alter table public.author_projects
      add constraint author_projects_creator_mode_check
      check (creator_mode in ('writer','video','podcast','lecture','research','visual','mission','ai'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'author_projects_my_ekodi_status_check'
      and conrelid = 'public.author_projects'::regclass
  ) then
    alter table public.author_projects
      add constraint author_projects_my_ekodi_status_check
      check (my_ekodi_status in ('private','ready','published','archived'));
  end if;
end
$$;

update public.author_projects
   set creator_mode = coalesce(nullif(book_memory->>'creator_mode',''), 'writer')
 where creator_mode = 'writer'
   and coalesce(book_memory->>'creator_mode','') in ('writer','video','podcast','lecture','research','visual','mission','ai');

create index if not exists idx_author_projects_creator_mode
  on public.author_projects(owner_user_id, creator_mode, updated_at desc);

create index if not exists idx_author_projects_my_ekodi
  on public.author_projects(owner_user_id, my_ekodi_status, updated_at desc);

create table if not exists public.creator_portfolio_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.author_projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  workspace_key text not null,
  title text not null default '',
  summary text not null default '',
  creator_mode text not null default 'writer'
    check (creator_mode in ('writer','video','podcast','lecture','research','visual','mission','ai')),
  status text not null default 'draft'
    check (status in ('draft','ready','published','archived')),
  visibility text not null default 'private'
    check (visibility in ('private','unlisted','public')),
  source_service text not null default 'creator-ai',
  destinations jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creator_portfolio_person_updated
  on public.creator_portfolio_items(person_id, updated_at desc);

create index if not exists idx_creator_portfolio_owner_updated
  on public.creator_portfolio_items(owner_user_id, updated_at desc);

alter table public.creator_portfolio_items enable row level security;

drop policy if exists "creator_portfolio_person_select" on public.creator_portfolio_items;
create policy "creator_portfolio_person_select"
on public.creator_portfolio_items
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or person_id in (
    select li.person_id
      from public.login_identities li
     where li.auth_user_id = auth.uid()
       and li.status = 'active'
  )
);

drop policy if exists "creator_portfolio_owner_insert" on public.creator_portfolio_items;
create policy "creator_portfolio_owner_insert"
on public.creator_portfolio_items
for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "creator_portfolio_owner_update" on public.creator_portfolio_items;
create policy "creator_portfolio_owner_update"
on public.creator_portfolio_items
for update
to authenticated
using (
  owner_user_id = auth.uid()
  or person_id in (
    select li.person_id
      from public.login_identities li
     where li.auth_user_id = auth.uid()
       and li.status = 'active'
  )
)
with check (
  owner_user_id = auth.uid()
  or person_id in (
    select li.person_id
      from public.login_identities li
     where li.auth_user_id = auth.uid()
       and li.status = 'active'
  )
);

drop policy if exists "creator_portfolio_owner_delete" on public.creator_portfolio_items;
create policy "creator_portfolio_owner_delete"
on public.creator_portfolio_items
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  or person_id in (
    select li.person_id
      from public.login_identities li
     where li.auth_user_id = auth.uid()
       and li.status = 'active'
  )
);

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
    'my_ekodi_url', 'https://my.ekodi.kr/'
  );
end
$$;

revoke all on function public.publish_creator_to_my_ekodi(uuid) from public, anon;
grant execute on function public.publish_creator_to_my_ekodi(uuid) to authenticated;

comment on table public.creator_portfolio_items is
  'Person-scoped private-by-default creator portfolio contract consumed by My EKODI. Source project remains owned by Creator AI.';
comment on function public.publish_creator_to_my_ekodi(uuid) is
  'Human-gated handoff from Creator AI into the person-scoped My EKODI portfolio.';
