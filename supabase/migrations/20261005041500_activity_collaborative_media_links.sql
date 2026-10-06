-- Collaborative post-activity media/link collection for EKODI Mission.
-- Keeps public submission simple, de-duplicates canonical links, and lets admins soft-hide items.

alter table public.activity_media_links
  add column if not exists canonical_url text,
  add column if not exists source_channel text not null default 'manual',
  add column if not exists submitted_by_name text not null default '',
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references auth.users(id) on delete set null;

update public.activity_media_links
set canonical_url=lower(trim(url))
where canonical_url is null or trim(canonical_url)='';

alter table public.activity_media_links
  alter column canonical_url set not null;

create unique index if not exists activity_media_links_canonical_unique
  on public.activity_media_links(activity_id,canonical_url);

create index if not exists activity_media_links_visible_idx
  on public.activity_media_links(activity_id,visibility,hidden_at,submitted_at);

create or replace function public.activity_public_submit_media_link(
  p_workspace_slug text,
  p_activity_key text,
  p_media_type text,
  p_title text,
  p_url text,
  p_canonical_url text,
  p_source_channel text default 'manual',
  p_submitted_by_name text default ''
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_activity public.activities%rowtype;
  v_id uuid;
  v_type text:=lower(trim(coalesce(p_media_type,'other')));
  v_url text:=trim(coalesce(p_url,''));
  v_canonical text:=lower(trim(coalesce(p_canonical_url,'')));
  v_source text:=lower(trim(coalesce(p_source_channel,'manual')));
begin
  select a.* into v_activity
  from public.activities a
  join public.tenants t on t.id=a.workspace_tenant_id
  where t.slug=lower(trim(p_workspace_slug))
    and a.activity_key=p_activity_key
    and a.visibility='public'
    and a.status in ('published','closed','archived')
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','activity_not_found');
  end if;
  if v_activity.ends_at is null or v_activity.ends_at>now() then
    return jsonb_build_object('ok',false,'error','activity_not_ended');
  end if;
  if v_type not in ('photo','video','album','document','other') then
    v_type:='other';
  end if;
  if v_url !~ '^https://[^[:space:]]+$' then
    return jsonb_build_object('ok',false,'error','invalid_url');
  end if;
  if v_canonical='' or v_canonical !~ '^https://[^[:space:]]+$' then
    return jsonb_build_object('ok',false,'error','invalid_canonical_url');
  end if;
  if v_source not in ('manual','youtube','facebook','instagram','google_drive','google_photos','blog','news','external_board','other') then
    v_source:='other';
  end if;

  insert into public.activity_media_links(
    activity_id,media_type,title,url,canonical_url,source_channel,
    submitted_by_name,visibility,sort_order,submitted_at
  ) values(
    v_activity.id,v_type,left(trim(coalesce(p_title,'')),160),v_url,v_canonical,v_source,
    left(trim(coalesce(p_submitted_by_name,'')),80),'public',0,now()
  )
  on conflict(activity_id,canonical_url) do update set
    title=case when trim(public.activity_media_links.title)='' then excluded.title else public.activity_media_links.title end,
    media_type=case when public.activity_media_links.media_type='other' then excluded.media_type else public.activity_media_links.media_type end,
    source_channel=case when public.activity_media_links.source_channel='manual' then excluded.source_channel else public.activity_media_links.source_channel end,
    hidden_at=null,
    updated_at=now()
  returning id into v_id;

  return jsonb_build_object(
    'ok',true,
    'id',v_id,
    'archive_url','/ekodimission/activities/'||v_activity.activity_key||'/archive'
  );
end;
$$;

revoke all on function public.activity_public_submit_media_link(text,text,text,text,text,text,text,text) from public;
grant execute on function public.activity_public_submit_media_link(text,text,text,text,text,text,text,text) to anon,authenticated;

create or replace function public.activity_admin_hide_media_link(
  p_workspace_slug text,
  p_activity_key text,
  p_media_id uuid,
  p_hidden boolean default true
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_activity public.activities%rowtype;
begin
  select a.* into v_activity
  from public.activities a
  join public.tenants t on t.id=a.workspace_tenant_id
  where t.slug=lower(trim(p_workspace_slug)) and a.activity_key=p_activity_key
  limit 1;

  if not found or not public.activity_is_workspace_operator(v_activity.workspace_tenant_id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;

  update public.activity_media_links
  set hidden_at=case when coalesce(p_hidden,true) then now() else null end,
      hidden_by=case when coalesce(p_hidden,true) then auth.uid() else null end,
      updated_at=now()
  where id=p_media_id and activity_id=v_activity.id;

  if not found then
    return jsonb_build_object('ok',false,'error','media_not_found');
  end if;
  return jsonb_build_object('ok',true,'id',p_media_id,'hidden',coalesce(p_hidden,true));
end;
$$;

revoke all on function public.activity_admin_hide_media_link(text,text,uuid,boolean) from public;
grant execute on function public.activity_admin_hide_media_link(text,text,uuid,boolean) to authenticated;

create or replace function public.activity_public_archive_snapshot(
  p_workspace_slug text,
  p_activity_key text
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_activity public.activities%rowtype;
begin
  select a.* into v_activity
  from public.activities a join public.tenants t on t.id=a.workspace_tenant_id
  where t.slug=lower(trim(p_workspace_slug)) and a.activity_key=p_activity_key
    and a.visibility='public' and a.status in ('published','closed','archived')
  limit 1;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_activity.ends_at is null or v_activity.ends_at>now() then
    return jsonb_build_object('ok',false,'error','not_ended','ends_at',v_activity.ends_at);
  end if;
  return jsonb_build_object(
    'ok',true,
    'activity',jsonb_build_object(
      'activity_key',v_activity.activity_key,'title',v_activity.title,'summary',v_activity.summary,
      'starts_at',v_activity.starts_at,'ends_at',v_activity.ends_at,'venue',v_activity.venue
    ),
    'archive_url','/ekodimission/activities/'||v_activity.activity_key||'/archive',
    'media',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'type',m.media_type,'title',m.title,'url',m.url,
        'thumbnail_url',m.thumbnail_url,'sort_order',m.sort_order,
        'source_channel',m.source_channel,'submitted_at',m.submitted_at
      ) order by m.sort_order,m.submitted_at,m.created_at)
      from public.activity_media_links m
      where m.activity_id=v_activity.id and m.visibility='public' and m.hidden_at is null
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.activity_public_archive_snapshot(text,text) from public;
grant execute on function public.activity_public_archive_snapshot(text,text) to anon,authenticated;
