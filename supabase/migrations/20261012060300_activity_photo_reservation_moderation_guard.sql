-- Moderation guard 2/3: a public duplicate photo reservation must never restore a hidden row.
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
    if v_existing.hidden_at is not null then
      return jsonb_build_object('ok',false,'error','media_moderated');
    end if;
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
        updated_at=now()
    where id=v_existing.id and hidden_at is null;
    if not found then
      return jsonb_build_object('ok',false,'error','media_moderated');
    end if;
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
    if v_existing.hidden_at is not null then
      return jsonb_build_object('ok',false,'error','media_moderated');
    end if;
    return jsonb_build_object('ok',true,'reserved',false,'duplicate',true,'pending',coalesce(v_existing.upload_state,'')<>'ready',
      'id',v_existing.id,'url',v_existing.url,'state',v_existing.upload_state);
  end if;
  return jsonb_build_object('ok',true,'reserved',true,'duplicate',false,'id',v_id,'upload_token',v_token,'state','uploading');
end;
$$;
revoke all on function public.activity_public_reserve_media_upload(text,text,text,text,text,text,bigint,text,text) from public;
grant execute on function public.activity_public_reserve_media_upload(text,text,text,text,text,text,bigint,text,text) to anon,authenticated;
comment on function public.activity_public_reserve_media_upload(text,text,text,text,text,text,bigint,text,text) is
  'Intentional anonymous post-event photo reservation. Validates SHA-256, format, file size and event completion; moderated rows cannot be reserved even during duplicate races.';
