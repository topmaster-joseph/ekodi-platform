-- EKODI Mission activity archive: show one representative for each matching perceptual hash.
-- Originals remain stored and addressable; grouping affects the public archive projection only.

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
      with visible_media as (
        select
          m.*,
          case
            when m.media_type='photo' and length(coalesce(m.perceptual_hash,''))=16
              then 'ph:'||m.perceptual_hash
            else 'id:'||m.id::text
          end as display_group
        from public.activity_media_links m
        where m.activity_id=v_activity.id
          and m.visibility='public'
          and m.hidden_at is null
          and m.upload_state='ready'
      ),
      grouped as (
        select
          v.*,
          row_number() over(
            partition by v.display_group
            order by v.sort_order asc,v.submitted_at asc,v.created_at asc,v.id asc
          ) as display_rank,
          count(*) over(partition by v.display_group) as display_group_count
        from visible_media v
      )
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'type',m.media_type,'title',m.title,'url',m.url,
        'thumbnail_url',m.thumbnail_url,'sort_order',m.sort_order,
        'source_channel',m.source_channel,'submitted_at',m.submitted_at,
        'storage_provider',m.storage_provider,'mime_type',m.mime_type,
        'file_size',m.file_size,'original_filename',m.original_filename,
        'perceptual_hash',m.perceptual_hash,
        'similar_count',greatest(m.display_group_count-1,0)
      ) order by m.sort_order,m.submitted_at,m.created_at)
      from grouped m
      where m.display_rank=1
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.activity_public_archive_snapshot(text,text) from public;
grant execute on function public.activity_public_archive_snapshot(text,text) to anon,authenticated;
