-- 에코디교회 관리자 '일정' 수정·삭제. church-pastor-api(service role)만 호출하며 감사 로그를 남긴다.
create or replace function public.church_event_update(p_church_slug text, p_id uuid, p_payload jsonb, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'church', 'church_private'
as $$
declare
  v_tenant_id uuid;
  v_result jsonb;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select t.id into v_tenant_id from public.tenants t
  where t.slug = p_church_slug and t.status = 'active' limit 1;
  if v_tenant_id is null then
    raise exception 'church tenant not found' using errcode = 'P0002';
  end if;

  update church.events e set
    title = coalesce(nullif(trim(p_payload->>'title'), ''), e.title),
    event_date = coalesce(nullif(trim(p_payload->>'event_date'), '')::date, e.event_date),
    event_time = case when p_payload ? 'event_time' then nullif(trim(p_payload->>'event_time'), '')::time else e.event_time end,
    location = case when p_payload ? 'location' then nullif(trim(p_payload->>'location'), '') else e.location end,
    category = coalesce(nullif(trim(p_payload->>'category'), ''), e.category),
    status = coalesce(nullif(trim(p_payload->>'status'), ''), e.status),
    updated_at = now()
  where e.id = p_id and e.tenant_id = v_tenant_id and e.church_slug = p_church_slug
  returning jsonb_build_object(
    'id', e.id, 'title', e.title, 'event_date', e.event_date, 'event_time', e.event_time,
    'location', e.location, 'category', e.category, 'status', e.status, 'created_at', e.created_at
  ) into v_result;
  if v_result is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  insert into church_private.audit_logs(tenant_id, church_slug, actor_user_id, action, entity_type, entity_id, detail)
  values (v_tenant_id, p_church_slug, p_actor, 'update', 'church_events', p_id::text,
    jsonb_build_object('source', 'church-pastor-api'));
  return v_result;
end;
$$;

create or replace function public.church_event_delete(p_church_slug text, p_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'church', 'church_private'
as $$
declare
  v_tenant_id uuid;
  v_row jsonb;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select t.id into v_tenant_id from public.tenants t
  where t.slug = p_church_slug and t.status = 'active' limit 1;
  if v_tenant_id is null then
    raise exception 'church tenant not found' using errcode = 'P0002';
  end if;

  delete from church.events e
  where e.id = p_id and e.tenant_id = v_tenant_id and e.church_slug = p_church_slug
  returning jsonb_build_object('id', e.id, 'title', e.title, 'event_date', e.event_date) into v_row;
  if v_row is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  -- 삭제된 일정의 제목·날짜를 감사 로그에 남겨 복구할 수 있게 한다.
  insert into church_private.audit_logs(tenant_id, church_slug, actor_user_id, action, entity_type, entity_id, detail)
  values (v_tenant_id, p_church_slug, p_actor, 'delete', 'church_events', p_id::text,
    jsonb_build_object('source', 'church-pastor-api', 'deleted', v_row));
  return v_row;
end;
$$;

revoke all on function public.church_event_update(text, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.church_event_delete(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.church_event_update(text, uuid, jsonb, uuid) to service_role;
grant execute on function public.church_event_delete(text, uuid, uuid) to service_role;
