-- Store user sites are virtual workspace surfaces, not per-store copied applications.
-- A canonical operating_space_slug provisions the shared user site automatically.
create table if not exists public.store_user_sites (
  store_id uuid primary key references public.stores(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused')),
  provisioning_mode text not null default 'workspace_automatic'
    check (provisioning_mode in ('workspace_automatic')),
  page_kicker text,
  page_lead text,
  page_theme text not null default 'default',
  page_description text,
  alias_slugs text[] not null default '{}'::text[],
  provisioned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (page_kicker is null or char_length(page_kicker) <= 80),
  check (page_lead is null or char_length(page_lead) <= 320),
  check (page_description is null or char_length(page_description) <= 240),
  check (page_theme ~ '^[a-z0-9][a-z0-9-]{0,31}$')
);

create index if not exists store_user_sites_status_idx
  on public.store_user_sites(status, updated_at desc);

create or replace function public.provision_store_user_site()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.operating_space_slug is not null then
    insert into public.store_user_sites(store_id)
    values (new.id)
    on conflict(store_id) do nothing;
  end if;
  return new;
end
$$;

drop trigger if exists stores_provision_user_site on public.stores;
create trigger stores_provision_user_site
after insert or update of operating_space_slug on public.stores
for each row execute function public.provision_store_user_site();

insert into public.store_user_sites(store_id)
select s.id
from public.stores s
where s.operating_space_slug is not null
on conflict(store_id) do nothing;

update public.store_user_sites us
set page_kicker='CHICKEN STORE USER PAGE',
    page_lead='치킨 메뉴·가격·배달채널을 자담치킨 데이터로만 분리해 운영합니다.',
    page_theme='jadam',
    page_description='자담치킨 목포대점 사용자 운영페이지',
    updated_at=now()
from public.stores s
where us.store_id=s.id and s.operating_space_slug='jadam';

update public.store_user_sites us
set page_kicker='PIZZA STORE USER PAGE',
    page_lead='피자 메뉴·옵션·판매가·배달채널을 피자마루 데이터로만 분리해 운영합니다.',
    page_theme='pizzamaru',
    page_description='피자마루 목포대점 사용자 운영페이지',
    updated_at=now()
from public.stores s
where us.store_id=s.id and s.operating_space_slug='pizzamaru';

update public.store_user_sites us
set page_kicker='YOGURT DESSERT USER PAGE',
    page_lead='요거트·디저트 메뉴·옵션·판매가·배달채널을 요거트퍼플 데이터로만 분리해 운영합니다.',
    page_theme='yogurt',
    page_description='요거트퍼플 목포대점 사용자 운영페이지',
    alias_slugs=array['yogurtpurple']::text[],
    updated_at=now()
from public.stores s
where us.store_id=s.id and s.operating_space_slug='yogurt';

create or replace function public.store_user_site_public_profile(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_result jsonb;
begin
  select jsonb_build_object(
    'canonical_slug', s.operating_space_slug,
    'name', s.name,
    'document_title', s.name || ' · EKODI',
    'kicker', coalesce(us.page_kicker,'STORE USER PAGE'),
    'lead', coalesce(us.page_lead,'이 점포의 운영정보를 독립된 사용자페이지에서 확인합니다.'),
    'theme', coalesce(us.page_theme,'default'),
    'description', coalesce(us.page_description,s.name || ' 사용자 운영페이지'),
    'aliases', us.alias_slugs,
    'status', us.status,
    'provisioning_mode', us.provisioning_mode
  ) into v_result
  from public.store_user_sites us
  join public.stores s on s.id=us.store_id
  where s.operating_space_slug is not null
    and (
      lower(s.operating_space_slug)=v_slug
      or v_slug=any(us.alias_slugs)
    )
  limit 1;

  return v_result;
end
$$;

revoke all on function public.store_user_site_public_profile(text) from public;
grant execute on function public.store_user_site_public_profile(text) to anon, authenticated;

create or replace function public.can_manage_store_user_site(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.store_members sm
      where sm.store_id=p_store_id
        and sm.user_id=auth.uid()
        and sm.role::text='store_owner'
    )
    or exists (
      select 1
      from public.stores s
      join public.tenant_members tm on tm.tenant_id=s.tenant_id
      where s.id=p_store_id
        and tm.user_id=auth.uid()
        and tm.status='active'
        and tm.role::text in ('tenant_admin','platform_admin')
    )
  );
$$;

revoke all on function public.can_manage_store_user_site(uuid) from public, anon;
grant execute on function public.can_manage_store_user_site(uuid) to authenticated;

create or replace function public.store_user_site_admin_snapshot(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_store record;
  v_site record;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select s.* into v_store
  from public.stores s
  where lower(s.operating_space_slug)=v_slug
  limit 1;

  if v_store.id is null then
    raise exception 'workspace_not_found' using errcode='22023';
  end if;
  if not public.can_manage_store_user_site(v_store.id) then
    raise exception 'workspace_admin_required' using errcode='42501';
  end if;

  select * into v_site

  from public.store_user_sites us
  where us.store_id=v_store.id;

  return jsonb_build_object(
    'store_id', v_store.id,
    'store_name', v_store.name,
    'canonical_slug', v_store.operating_space_slug,
    'canonical_url', 'https://ekodi.kr/' || v_store.operating_space_slug,
    'status', v_site.status,
    'provisioning_mode', v_site.provisioning_mode,
    'page_kicker', v_site.page_kicker,
    'page_lead', v_site.page_lead,
    'page_theme', v_site.page_theme,
    'page_description', v_site.page_description,
    'alias_slugs', v_site.alias_slugs,
    'provisioned_at', v_site.provisioned_at,
    'updated_at', v_site.updated_at,
    'generation_model', 'shared_shell_workspace_automatic',
    'generation_trigger', 'stores.operating_space_slug'
  );
end
$$;

revoke all on function public.store_user_site_admin_snapshot(text) from public, anon;
grant execute on function public.store_user_site_admin_snapshot(text) to authenticated;

create or replace function public.update_store_user_site_settings(
  p_slug text,
  p_status text,
  p_page_kicker text,
  p_page_lead text,
  p_page_theme text,
  p_page_description text,
  p_alias_slugs text[] default '{}'::text[]
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_store_id uuid;
  v_alias text;
  v_aliases text[];
begin
  select coalesce(array_agg(distinct lower(trim(x))), '{}'::text[])
    into v_aliases
  from unnest(coalesce(p_alias_slugs,'{}'::text[])) x
  where trim(x) <> '';
  select s.id into v_store_id
  from public.stores s
  where lower(s.operating_space_slug)=v_slug
  limit 1;

  if v_store_id is null then
    raise exception 'workspace_not_found' using errcode='22023';
  end if;
  if not public.can_manage_store_user_site(v_store_id) then
    raise exception 'workspace_admin_required' using errcode='42501';
  end if;
  if p_status not in ('active','paused') then
    raise exception 'invalid_site_status' using errcode='22023';
  end if;
  if coalesce(p_page_theme,'') !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
    raise exception 'invalid_page_theme' using errcode='22023';
  end if;

  foreach v_alias in array v_aliases loop
    if v_alias !~ '^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$' then
      raise exception 'invalid_alias_slug' using errcode='22023';
    end if;
    if v_alias = any(array['admin','api','auth','books','business','cafe','community','dev','energy','lab','live','login','logout','mail','mall','marketing','media','mission','money','pay','privacy','publish','social','space','status','support','tax','terms','trade','user','work','www']::text[]) then
      raise exception 'alias_conflicts_with_reserved_route' using errcode='22023';
    end if;
    if exists(select 1 from public.stores s where lower(s.operating_space_slug)=v_alias) then
      raise exception 'alias_conflicts_with_workspace_slug' using errcode='23505';
    end if;
    if exists(
      select 1 from public.store_user_sites us
      where us.store_id<>v_store_id and v_alias=any(us.alias_slugs)
    ) then
      raise exception 'alias_already_in_use' using errcode='23505';
    end if;
  end loop;

  update public.store_user_sites
  set status=p_status,
      page_kicker=nullif(trim(coalesce(p_page_kicker,'')),''),
      page_lead=nullif(trim(coalesce(p_page_lead,'')),''),
      page_theme=p_page_theme,
      page_description=nullif(trim(coalesce(p_page_description,'')),''),
      alias_slugs=v_aliases,
      updated_at=now()
  where store_id=v_store_id;

  return public.store_user_site_admin_snapshot(v_slug);
end
$$;

revoke all on function public.update_store_user_site_settings(text,text,text,text,text,text,text[]) from public, anon;
grant execute on function public.update_store_user_site_settings(text,text,text,text,text,text,text[]) to authenticated;

alter table public.store_user_sites enable row level security;
revoke all on public.store_user_sites from anon, authenticated;

comment on table public.store_user_sites is
  'Admin-controlled presentation and lifecycle settings for virtual store user sites. Canonical identity remains stores.id.';