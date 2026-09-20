-- Site-local My Page foundation + customization.
create schema if not exists private;
-- Capabilities/services are never copied into these rows. Runtime always projects
-- the latest Capability Registry, Workspace Packs and user-service registry.

create table if not exists public.workspace_experience_foundations (
  subject_kind text not null check (subject_kind in ('person','tenant','store')),
  subject_id uuid not null,
  audience_kind text not null default 'person',
  foundation_mode text not null default 'registry_live'
    check (foundation_mode = 'registry_live'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subject_kind, subject_id)
);

create table if not exists public.site_member_home_preferences (
  subject_kind text not null check (subject_kind in ('person','tenant','store')),
  subject_id uuid not null,
  site_key text not null,
  preferences jsonb not null default '{"pinnedServices":[],"hiddenServices":[],"serviceOrder":[],"density":"comfortable"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subject_kind, subject_id, site_key),
  constraint site_member_home_site_key_format check (site_key ~ '^[a-z0-9][a-z0-9-]{0,99}$')
);

create index if not exists site_member_home_preferences_site_idx
  on public.site_member_home_preferences(site_key, subject_kind);

alter table public.workspace_experience_foundations enable row level security;
alter table public.site_member_home_preferences enable row level security;
revoke all on table public.workspace_experience_foundations from anon, authenticated;
revoke all on table public.site_member_home_preferences from anon, authenticated;

create or replace function public.site_member_audience(p_kind text)
returns text language sql immutable as $$
  select case lower(coalesce(p_kind,''))
    when 'business' then 'business'
    when 'church' then 'church'
    when 'community' then 'community'
    when 'team' then 'team'
    when 'project' then 'project'
    else 'organization'
  end
$$;

create or replace function public.ensure_workspace_experience_foundation()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_subject_kind text := tg_argv[0];
  v_audience text := 'person';
begin
  if v_subject_kind='tenant' then v_audience:=public.site_member_audience(new.kind::text); end if;
  if v_subject_kind='store' then v_audience:='business'; end if;
  insert into public.workspace_experience_foundations(subject_kind,subject_id,audience_kind,foundation_mode)
  values(v_subject_kind,new.id,v_audience,'registry_live')
  on conflict(subject_kind,subject_id) do update
    set audience_kind=excluded.audience_kind,foundation_mode='registry_live',updated_at=now();
  return new;
end
$$;

drop trigger if exists people_site_member_foundation on public.people;
create trigger people_site_member_foundation
after insert on public.people
for each row execute function public.ensure_workspace_experience_foundation('person');

drop trigger if exists tenants_site_member_foundation on public.tenants;
create trigger tenants_site_member_foundation
after insert or update of kind on public.tenants
for each row execute function public.ensure_workspace_experience_foundation('tenant');

drop trigger if exists stores_site_member_foundation on public.stores;
create trigger stores_site_member_foundation
after insert on public.stores
for each row execute function public.ensure_workspace_experience_foundation('store');

insert into public.workspace_experience_foundations(subject_kind,subject_id,audience_kind,foundation_mode)
select 'person',p.id,'person','registry_live' from public.people p
on conflict(subject_kind,subject_id) do nothing;

insert into public.workspace_experience_foundations(subject_kind,subject_id,audience_kind,foundation_mode)
select 'tenant',t.id,public.site_member_audience(t.kind::text),'registry_live' from public.tenants t
on conflict(subject_kind,subject_id) do update set audience_kind=excluded.audience_kind,updated_at=now();

insert into public.workspace_experience_foundations(subject_kind,subject_id,audience_kind,foundation_mode)
select 'store',s.id,'business','registry_live' from public.stores s
on conflict(subject_kind,subject_id) do nothing;

create or replace function private.current_site_member_subject(p_site_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  v_user uuid:=auth.uid();
  v_key text:=lower(trim(coalesce(p_site_key,'')));
  v_person uuid;
  v_store uuid;
  v_tenant uuid;
  v_kind text;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_key !~ '^[a-z0-9][a-z0-9-]{0,99}$' then raise exception 'invalid_site_key' using errcode='22023'; end if;

  select s.id into v_store
  from public.stores s
  where lower(coalesce(nullif(s.operating_space_slug,''),s.slug))=v_key
    and (
      exists(select 1 from public.store_members sm where sm.store_id=s.id and sm.user_id=v_user)
      or exists(select 1 from public.tenant_members tm where tm.tenant_id=s.tenant_id and tm.user_id=v_user and tm.status='active')
    )
  limit 1;
  if v_store is not null then
    return jsonb_build_object('subject_kind','store','subject_id',v_store,'audience_kind','business');
  end if;

  select tm.tenant_id,t.kind::text into v_tenant,v_kind
  from public.tenant_members tm
  join public.tenants t on t.id=tm.tenant_id
  where tm.user_id=v_user
    and coalesce(tm.status,'active')='active'
    and lower(t.slug)=v_key
  order by case tm.role::text when 'tenant_admin' then 0 else 1 end
  limit 1;
  if v_tenant is not null then
    return jsonb_build_object('subject_kind','tenant','subject_id',v_tenant,'audience_kind',public.site_member_audience(v_kind));
  end if;

  select li.person_id into v_person
  from public.login_identities li
  where li.auth_user_id=v_user and li.status='active'
  limit 1;
  if v_person is null then raise exception 'canonical_person_required' using errcode='42501'; end if;
  return jsonb_build_object('subject_kind','person','subject_id',v_person,'audience_kind','person');
end
$$;

create or replace function public.current_site_member_home_profile(p_site_key text)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  v_subject jsonb:=private.current_site_member_subject(p_site_key);
  v_kind text:=v_subject->>'subject_kind';
  v_id uuid:=(v_subject->>'subject_id')::uuid;
  v_audience text:=coalesce(v_subject->>'audience_kind','person');
  v_preferences jsonb;
begin
  insert into public.workspace_experience_foundations(subject_kind,subject_id,audience_kind,foundation_mode)
  values(v_kind,v_id,v_audience,'registry_live')
  on conflict(subject_kind,subject_id) do update
    set audience_kind=excluded.audience_kind,foundation_mode='registry_live',updated_at=now();

  insert into public.site_member_home_preferences(subject_kind,subject_id,site_key)
  values(v_kind,v_id,lower(trim(p_site_key)))
  on conflict(subject_kind,subject_id,site_key) do nothing;

  select preferences into v_preferences
  from public.site_member_home_preferences
  where subject_kind=v_kind and subject_id=v_id and site_key=lower(trim(p_site_key));

  return jsonb_build_object(
    'subject_kind',v_kind,
    'subject_id',v_id,
    'site_key',lower(trim(p_site_key)),
    'audience_kind',v_audience,
    'foundation_mode','registry_live',
    'preferences',coalesce(v_preferences,'{}'::jsonb)
  );
end
$$;

create or replace function public.update_site_member_home_preferences(p_site_key text,p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  v_subject jsonb:=private.current_site_member_subject(p_site_key);
  v_kind text:=v_subject->>'subject_kind';
  v_id uuid:=(v_subject->>'subject_id')::uuid;
  v_key text:=lower(trim(p_site_key));
  v_pinned jsonb:=coalesce(p_preferences->'pinnedServices','[]'::jsonb);
  v_hidden jsonb:=coalesce(p_preferences->'hiddenServices','[]'::jsonb);
  v_order jsonb:=coalesce(p_preferences->'serviceOrder','[]'::jsonb);
  v_density text:=coalesce(nullif(p_preferences->>'density',''),'comfortable');
  v_clean jsonb;
begin
  if jsonb_typeof(coalesce(p_preferences,'{}'::jsonb))<>'object' then raise exception 'invalid_preferences' using errcode='22023'; end if;
  if jsonb_typeof(v_pinned)<>'array' or jsonb_typeof(v_hidden)<>'array' or jsonb_typeof(v_order)<>'array' then raise exception 'invalid_service_preferences' using errcode='22023'; end if;
  if jsonb_array_length(v_pinned)>80 or jsonb_array_length(v_hidden)>80 or jsonb_array_length(v_order)>120 then raise exception 'preference_limit_exceeded' using errcode='22023'; end if;
  if v_density not in ('comfortable','compact') then v_density:='comfortable'; end if;
  if exists(select 1 from jsonb_array_elements_text(v_pinned||v_hidden||v_order) x where x !~ '^[a-z0-9][a-z0-9-]{0,79}$') then raise exception 'invalid_service_id' using errcode='22023'; end if;
  v_clean:=jsonb_build_object('pinnedServices',v_pinned,'hiddenServices',v_hidden,'serviceOrder',v_order,'density',v_density);
  insert into public.site_member_home_preferences(subject_kind,subject_id,site_key,preferences)
  values(v_kind,v_id,v_key,v_clean)
  on conflict(subject_kind,subject_id,site_key) do update set preferences=excluded.preferences,updated_at=now();
  return public.current_site_member_home_profile(v_key);
end
$$;

revoke all on function public.site_member_audience(text) from public,anon;
revoke all on function public.ensure_workspace_experience_foundation() from public,anon,authenticated;
revoke all on function private.current_site_member_subject(text) from public,anon,authenticated;
revoke all on function public.current_site_member_home_profile(text) from public,anon;
revoke all on function public.update_site_member_home_preferences(text,jsonb) from public,anon;
grant execute on function public.current_site_member_home_profile(text) to authenticated;
grant execute on function public.update_site_member_home_preferences(text,jsonb) to authenticated;

comment on table public.workspace_experience_foundations is
  'Eager subject foundation only. Never stores copied capability/service catalogs; current registries are always projected at runtime.';
comment on table public.site_member_home_preferences is
  'Site-local My Page presentation preferences. Never an authorization source.';
comment on function public.current_site_member_home_profile(text) is
  'Returns the current authorized subject presentation profile for a site-local My Page; registry_live means newest service/capability catalogs are projected dynamically.';
