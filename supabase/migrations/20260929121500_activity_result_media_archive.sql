-- Activity result archive + automatic registration close at end.
create table if not exists public.activity_media_links (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  media_type text not null check (media_type in ('photo','video','album','document','other')),
  title text not null default '',
  url text not null,
  thumbnail_url text not null default '',
  sort_order integer not null default 0,
  visibility text not null default 'public' check (visibility in ('public','private')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(activity_id,url)
);
create index if not exists activity_media_links_activity_sort_idx on public.activity_media_links(activity_id,visibility,sort_order,created_at);
alter table public.activity_media_links enable row level security;
revoke all on table public.activity_media_links from anon,authenticated,service_role;

create or replace function public.activity_public_archive_snapshot(p_workspace_slug text,p_activity_key text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_activity public.activities%rowtype;
begin
  select a.* into v_activity from public.activities a join public.tenants t on t.id=a.workspace_tenant_id
  where t.slug=lower(trim(p_workspace_slug)) and a.activity_key=p_activity_key
    and a.visibility='public' and a.status in ('published','closed','archived') limit 1;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_activity.ends_at is null or v_activity.ends_at>now() then return jsonb_build_object('ok',false,'error','not_ended','ends_at',v_activity.ends_at); end if;
  return jsonb_build_object('ok',true,'activity',jsonb_build_object('activity_key',v_activity.activity_key,'title',v_activity.title,'summary',v_activity.summary,'starts_at',v_activity.starts_at,'ends_at',v_activity.ends_at,'venue',v_activity.venue),
    'archive_url','/ekodimission/activities/'||v_activity.activity_key||'/archive',
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'type',m.media_type,'title',m.title,'url',m.url,'thumbnail_url',m.thumbnail_url,'sort_order',m.sort_order) order by m.sort_order,m.created_at)
      from public.activity_media_links m where m.activity_id=v_activity.id and m.visibility='public'),'[]'::jsonb));
end; $$;
revoke all on function public.activity_public_archive_snapshot(text,text) from public;
grant execute on function public.activity_public_archive_snapshot(text,text) to anon,authenticated;

create or replace function public.activity_registration_is_open(p_activity public.activities)
returns boolean language sql stable set search_path=public,pg_temp as $$
  select p_activity.status='published' and p_activity.visibility='public' and p_activity.registration_open
    and (p_activity.ends_at is null or p_activity.ends_at>now());
$$;

create or replace function public.activity_admin_upsert_media_link(
  p_workspace_slug text,p_activity_key text,p_media_type text,p_title text,p_url text,
  p_thumbnail_url text default '',p_sort_order integer default 0,p_visibility text default 'public'
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_activity public.activities%rowtype; v_id uuid;
begin
  select a.* into v_activity from public.activities a join public.tenants t on t.id=a.workspace_tenant_id
  where t.slug=lower(trim(p_workspace_slug)) and a.activity_key=p_activity_key limit 1;
  if not found or not public.activity_is_workspace_operator(v_activity.workspace_tenant_id) then raise exception 'ACTIVITY_ADMIN_FORBIDDEN'; end if;
  if lower(trim(p_media_type)) not in ('photo','video','album','document','other') then raise exception 'INVALID_MEDIA_TYPE'; end if;
  if lower(trim(p_visibility)) not in ('public','private') then raise exception 'INVALID_VISIBILITY'; end if;
  if coalesce(trim(p_url),'') !~ '^https://[^[:space:]]+$' then raise exception 'INVALID_MEDIA_URL'; end if;
  insert into public.activity_media_links(activity_id,media_type,title,url,thumbnail_url,sort_order,visibility,created_by)
  values(v_activity.id,lower(trim(p_media_type)),left(trim(coalesce(p_title,'')),160),trim(p_url),left(trim(coalesce(p_thumbnail_url,'')),500),coalesce(p_sort_order,0),lower(trim(p_visibility)),auth.uid())
  on conflict(activity_id,url) do update set media_type=excluded.media_type,title=excluded.title,thumbnail_url=excluded.thumbnail_url,sort_order=excluded.sort_order,visibility=excluded.visibility,updated_at=now()
  returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id,'archive_url','/ekodimission/activities/'||v_activity.activity_key||'/archive');
end; $$;
revoke all on function public.activity_admin_upsert_media_link(text,text,text,text,text,text,integer,text) from public;
grant execute on function public.activity_admin_upsert_media_link(text,text,text,text,text,text,integer,text) to authenticated;
