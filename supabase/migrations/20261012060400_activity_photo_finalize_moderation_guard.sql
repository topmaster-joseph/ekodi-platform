-- Moderation guard 3/3: uploading media hidden by an operator cannot be finalized as public.
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
    and upload_token=coalesce(p_upload_token,'') and hidden_at is null
  returning * into v_row;
  if not found then return jsonb_build_object('ok',false,'error','upload_finalize_forbidden'); end if;
  return jsonb_build_object('ok',true,'id',v_row.id,'url',v_row.url,'archive_url','/ekodimission/activities/'||v_activity.activity_key||'/archive');
end;
$$;
revoke all on function public.activity_public_finalize_media_upload(text,text,uuid,text,text) from public;
grant execute on function public.activity_public_finalize_media_upload(text,text,uuid,text,text) to anon,authenticated;
comment on function public.activity_public_finalize_media_upload(text,text,uuid,text,text) is
  'Intentional anonymous photo finalization using a one-time matching upload token. Hidden uploads cannot transition back to public.';

comment on function public.activity_public_fail_media_upload(text,text,uuid,text) is
  'Intentional anonymous failed-upload cleanup restricted by activity, uploading state and one-time matching upload token.';
comment on function public.activity_public_media_file_ref(uuid) is
  'Intentional anonymous public file metadata projection limited to completed activities and ready, visible, unmoderated media.';
comment on function public.activity_public_registration_status(text,text) is
  'Intentional anonymous registration status projection limited to publicly visible activity schedule and open/closed state.';
