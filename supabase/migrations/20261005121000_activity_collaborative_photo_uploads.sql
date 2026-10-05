-- Direct collaborative photo uploads for EKODI Mission activity archives.
-- Durable file bytes live in the canonical EKODI Shared Drive. Supabase keeps only operational metadata.

alter table public.activity_media_links
  add column if not exists storage_provider text not null default 'external_link',
  add column if not exists storage_file_id text,
  add column if not exists content_sha256 text,
  add column if not exists perceptual_hash text,
  add column if not exists mime_type text not null default '',
  add column if not exists file_size bigint,
  add column if not exists original_filename text not null default '',
  add column if not exists upload_state text not null default 'ready',
  add column if not exists upload_token text,
  add column if not exists uploaded_at timestamptz;

create unique index if not exists activity_media_links_content_sha256_unique
  on public.activity_media_links(activity_id,content_sha256)
  where content_sha256 is not null;

create index if not exists activity_media_links_upload_state_idx
  on public.activity_media_links(activity_id,upload_state,visibility,hidden_at,submitted_at);

create or replace function public.activity_public_reserve_media_upload(
  p_workspace_slug text,
  p_activity_key text,
  p_sha256 text,
  p_title text,
  p_original_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_submitted_by_name text default '',
  p_perceptual_hash text default ''
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_activity public.activities%rowtype;
  v_existing public.activity_media_links%rowtype;
  v_id uuid:=gen_random_uuid();
  v_token text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  v_hash text:=lower(trim(coalesce(p_sha256,'')));
  v_mime text:=lower(trim(coalesce(p_mime_type,'')));
  v_name text:=left(trim(coalesce(p_original_filename,'')),180);
  v_url text;
  v_inserted uuid;
begin
  select a.* into v_activity
  from public.activities a join public.tenants t on t.id=a.workspace_tenant_id
  where t.slug=lower(trim(p_workspace_slug))
    and a.activity_key=p_activity_key
    and a.visibility='public'
    and a.status in ('published','closed','archived')
  limit 1;
  if not found then return jsonb_build_object('ok',false,'error','activity_not_found'); end if;
  if v_activity.ends_at is null or v_activity.ends_at>now() then
    return jsonb_build_object('ok',false,'error','activity_not_ended');
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok',false,'error','invalid_sha256'); end if;
  if v_mime not in ('image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif') then
    return jsonb_build_object('ok',false,'error','unsupported_media_type');
  end if;
  if coalesce(p_file_size,0)<=0 or p_file_size>8388608 then
    return jsonb_build_object('ok',false,'error','invalid_file_size');
  end if;

  select * into v_existing
  from public.activity_media_links
  where activity_id=v_activity.id and content_sha256=v_hash
  limit 1;

  if found then
    if v_existing.upload_state='ready' and v_existing.hidden_at is null then
      return jsonb_build_object('ok',true,'reserved',false,'duplicate',true,'id',v_existing.id,'url',v_existing.url,'state','ready');
    end if;
    if v_existing.upload_state='uploading' and v_existing.updated_at>now()-interval '15 minutes' then
      return jsonb_build_object('ok',true,'reserved',false,'duplicate',true,'pending',true,'id',v_existing.id,'state','uploading');
    end if;
    update public.activity_media_links
    set media_type='photo',
        title=left(trim(coalesce(p_title,'')),160),
        source_channel='ekodi_storage',
        submitted_by_name=left(trim(coalesce(p_submitted_by_name,'')),80),
        storage_provider='google_workspace_shared_drive',
        storage_file_id=null,
        perceptual_hash=nullif(lower(trim(coalesce(p_perceptual_hash,''))),''),
        mime_type=v_mime,
        file_size=p_file_size,
        original_filename=v_name,
        upload_state='uploading',
        upload_token=v_token,
        visibility='private',
        hidden_at=null,
        hidden_by=null,
        updated_at=now()
    where id=v_existing.id;
    return jsonb_build_object('ok',true,'reserved',true,'duplicate',false,'id',v_existing.id,'upload_token',v_token,'state','uploading');
  end if;

  v_url:='https://ekodi.kr/ekodimission/media/'||v_id::text;
  insert into public.activity_media_links(
    id,activity_id,media_type,title,url,canonical_url,source_channel,submitted_by_name,
    visibility,sort_order,storage_provider,content_sha256,perceptual_hash,mime_type,file_size,
    original_filename,upload_state,upload_token,submitted_at
  ) values(
    v_id,v_activity.id,'photo',left(trim(coalesce(p_title,'')),160),v_url,v_url,'ekodi_storage',
    left(trim(coalesce(p_submitted_by_name,'')),80),'private',0,'google_workspace_shared_drive',
    v_hash,nullif(lower(trim(coalesce(p_perceptual_hash,''))),''),v_mime,p_file_size,v_name,'uploading',v_token,now()
  )
  on conflict(activity_id,content_sha256) where content_sha256 is not null do nothing
  returning id into v_inserted;

  if v_inserted is null then
    select * into v_existing from public.activity_media_links
    where activity_id=v_activity.id and content_sha256=v_hash limit 1;
    return jsonb_build_object('ok',true,'reserved',false,'duplicate',true,'pending',coalesce(v_existing.upload_state,'')<>'ready',
      'id',v_existing.id,'url',v_existing.url,'state',v_existing.upload_state);
  end if;
  return jsonb_build_object('ok',true,'reserved',true,'duplicate',false,'id',v_id,'upload_token',v_token,'state','uploading');
end;
$$;
revoke all on function public.activity_public_reserve_media_upload(text,text,text,text,text,text,bigint,text,text) from public;
grant execute on function public.activity_public_reserve_media_upload(text,text,text,text,text,text,bigint,text,text) to anon,authenticated;

create or replace function public.activity_public_finalize_media_upload(
  p_workspace_slug text,
  p_activity_key text,
  p_media_id uuid,
  p_upload_token text,
  p_storage_file_id text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_activity public.activities%rowtype; v_row public.activity_media_links%rowtype;
begin
  select a.* into v_activity
  from public.activities a join public.tenants t on t.id=a.workspace_tenant_id
  where t.slug=lower(trim(p_workspace_slug)) and a.activity_key=p_activity_key and a.visibility='public'
  limit 1;
  if not found then return jsonb_build_object('ok',false,'error','activity_not_found'); end if;
  if coalesce(trim(p_storage_file_id),'') !~ '^[A-Za-z0-9_-]{8,200}$' then
    return jsonb_build_object('ok',false,'error','invalid_storage_file_id');
  end if;
  update public.activity_media_links
  set storage_file_id=trim(p_storage_file_id),upload_state='ready',visibility='public',upload_token=null,
      thumbnail_url=url,uploaded_at=now(),updated_at=now()
  where id=p_media_id and activity_id=v_activity.id and upload_state='uploading'
    and upload_token=coalesce(p_upload_token,'')
  returning * into v_row;
  if not found then return jsonb_build_object('ok',false,'error','upload_finalize_forbidden'); end if;
  return jsonb_build_object('ok',true,'id',v_row.id,'url',v_row.url,'archive_url','/ekodimission/activities/'||v_activity.activity_key||'/archive');
end;
$$;
revoke all on function public.activity_public_finalize_media_upload(text,text,uuid,text,text) from public;
grant execute on function public.activity_public_finalize_media_upload(text,text,uuid,text,text) to anon,authenticated;

create or replace function public.activity_public_fail_media_upload(
  p_workspace_slug text,
  p_activity_key text,
  p_media_id uuid,
  p_upload_token text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_activity public.activities%rowtype;
begin
  select a.* into v_activity
  from public.activities a join public.tenants t on t.id=a.workspace_tenant_id
  where t.slug=lower(trim(p_workspace_slug)) and a.activity_key=p_activity_key
  limit 1;
  if not found then return jsonb_build_object('ok',false,'error','activity_not_found'); end if;
  update public.activity_media_links
  set upload_state='failed',visibility='private',upload_token=null,updated_at=now()
  where id=p_media_id and activity_id=v_activity.id and upload_state='uploading'
    and upload_token=coalesce(p_upload_token,'');
  return jsonb_build_object('ok',true,'id',p_media_id);
end;
$$;
revoke all on function public.activity_public_fail_media_upload(text,text,uuid,text) from public;
grant execute on function public.activity_public_fail_media_upload(text,text,uuid,text) to anon,authenticated;

create or replace function public.activity_public_media_file_ref(
  p_media_id uuid
) returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select coalesce((
    select jsonb_build_object(
      'ok',true,'id',m.id,'storage_file_id',m.storage_file_id,'mime_type',m.mime_type,
      'file_size',m.file_size,'filename',m.original_filename,'title',m.title
    )
    from public.activity_media_links m
    join public.activities a on a.id=m.activity_id
    where m.id=p_media_id
      and m.storage_provider='google_workspace_shared_drive'
      and m.upload_state='ready'
      and m.visibility='public'
      and m.hidden_at is null
      and m.storage_file_id is not null
      and a.visibility='public'
      and a.status in ('published','closed','archived')
      and a.ends_at is not null and a.ends_at<=now()
  ),jsonb_build_object('ok',false,'error','not_found'));
$$;
revoke all on function public.activity_public_media_file_ref(uuid) from public;
grant execute on function public.activity_public_media_file_ref(uuid) to anon,authenticated;

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
        'source_channel',m.source_channel,'submitted_at',m.submitted_at,
        'storage_provider',m.storage_provider,'mime_type',m.mime_type,
        'file_size',m.file_size,'original_filename',m.original_filename,
        'perceptual_hash',m.perceptual_hash
      ) order by m.sort_order,m.submitted_at,m.created_at)
      from public.activity_media_links m
      where m.activity_id=v_activity.id and m.visibility='public' and m.hidden_at is null
        and m.upload_state='ready'
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.activity_public_archive_snapshot(text,text) from public;
grant execute on function public.activity_public_archive_snapshot(text,text) to anon,authenticated;
