-- Moderation guard 1/3: prevent anonymous canonical-link conflicts from unhiding a moderated media row.
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
    updated_at=now()
  where public.activity_media_links.hidden_at is null
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok',false,'error','media_moderated');
  end if;

  return jsonb_build_object(
    'ok',true,
    'id',v_id,
    'archive_url','/ekodimission/activities/'||v_activity.activity_key||'/archive'
  );
end;
$$;

revoke all on function public.activity_public_submit_media_link(text,text,text,text,text,text,text,text) from public;
grant execute on function public.activity_public_submit_media_link(text,text,text,text,text,text,text,text) to anon,authenticated;
comment on function public.activity_public_submit_media_link(text,text,text,text,text,text,text,text) is
  'Intentional anonymous post-event media-link submission. Canonical duplicate updates require unmoderated rows; only an authorized operator can unhide.';
