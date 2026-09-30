-- Service-role-only RPC boundary for the canonical EKODI Church schemas.
-- The Edge Function authenticates the human user; these RPCs keep private schemas
-- out of the public PostgREST exposure surface.

create or replace function public.church_pastor_staff_for_user(
  p_church_slug text,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church, church_private
as $$
declare
  v_tenant_id uuid;
  v_result jsonb;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select t.id into v_tenant_id
  from public.tenants t
  where t.slug = p_church_slug and t.status = 'active'
  limit 1;
  if v_tenant_id is null then return null; end if;

  select jsonb_build_object(
    'id', s.id, 'user_id', s.user_id, 'email', s.email,
    'display_name', s.display_name, 'role', s.role,
    'active', s.active, 'created_at', s.created_at
  ) into v_result
  from church.staff s
  where s.tenant_id = v_tenant_id
    and s.user_id = p_user_id
    and s.active = true
  limit 1;
  return v_result;
end;
$$;

create or replace function public.church_pastor_list(
  p_table text,
  p_church_slug text,
  p_requester_user_id uuid default null,
  p_is_senior boolean default false,
  p_status text default null,
  p_id uuid default null,
  p_order text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church, church_private
as $$
declare
  v_tenant_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 250));
  v_result jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select t.id into v_tenant_id
  from public.tenants t
  where t.slug = p_church_slug and t.status = 'active'
  limit 1;
  if v_tenant_id is null then return v_result; end if;

  case p_table
    when 'church_staff' then
      select coalesce(jsonb_agg(x.row_value order by x.created_at desc), '[]'::jsonb)
      into v_result
      from (
        select jsonb_build_object(
          'id', s.id, 'user_id', s.user_id, 'email', s.email,
          'display_name', s.display_name, 'role', s.role,
          'active', s.active, 'created_at', s.created_at
        ) as row_value, s.created_at
        from church.staff s
        where s.tenant_id = v_tenant_id
          and (p_is_senior or s.user_id = p_requester_user_id)
          and (p_id is null or s.id = p_id)
        order by s.created_at desc limit v_limit
      ) x;

    when 'church_members' then
      select coalesce(jsonb_agg(x.row_value order by x.sort_key asc), '[]'::jsonb)
      into v_result
      from (
        select jsonb_build_object(
          'id', m.id, 'full_name', m.full_name, 'preferred_name', m.preferred_name,
          'phone', m.phone, 'email', m.email, 'status', m.status,
          'household_name', m.household_name, 'joined_on', m.joined_on,
          'created_at', m.created_at
        ) as row_value, lower(m.full_name) as sort_key
        from church_private.members m
        where m.tenant_id = v_tenant_id
          and (p_status is null or m.status = p_status)
          and (p_id is null or m.id = p_id)
        order by lower(m.full_name) asc limit v_limit
      ) x;

    when 'church_services' then
      select coalesce(jsonb_agg(x.row_value order by x.sort_key desc), '[]'::jsonb)
      into v_result
      from (
        select jsonb_build_object(
          'id', s.id, 'service_date', s.service_date, 'title', s.title,
          'scripture', s.scripture, 'sermon_title', s.sermon_title,
          'preacher', s.preacher, 'status', s.status, 'created_at', s.created_at
        ) as row_value, s.service_date as sort_key
        from church.services s
        where s.tenant_id = v_tenant_id
          and (p_status is null or s.status = p_status)
          and (p_id is null or s.id = p_id)
        order by s.service_date desc limit v_limit
      ) x;

    when 'church_care_tasks' then
      select coalesce(jsonb_agg(x.row_value order by x.sort_key asc nulls last), '[]'::jsonb)
      into v_result
      from (
        select jsonb_build_object(
          'id', c.id, 'member_id', c.member_id, 'subject_name', c.subject_name,
          'care_type', c.care_type, 'next_action', c.next_action,
          'due_on', c.due_on, 'status', c.status, 'created_at', c.created_at
        ) as row_value, c.due_on as sort_key
        from church_private.care_tasks c
        where c.tenant_id = v_tenant_id
          and (p_status is null or c.status = p_status)
          and (p_id is null or c.id = p_id)
        order by c.due_on asc nulls last, c.created_at desc limit v_limit
      ) x;

    when 'church_events' then
      select coalesce(jsonb_agg(x.row_value order by x.sort_key asc), '[]'::jsonb)
      into v_result
      from (
        select jsonb_build_object(
          'id', e.id, 'title', e.title, 'event_date', e.event_date,
          'event_time', e.event_time, 'location', e.location,
          'category', e.category, 'status', e.status, 'created_at', e.created_at
        ) as row_value, e.event_date as sort_key
        from church.events e
        where e.tenant_id = v_tenant_id
          and (p_status is null or e.status = p_status)
          and (p_id is null or e.id = p_id)
        order by e.event_date asc, e.created_at desc limit v_limit
      ) x;

    else
      raise exception 'table not allowed' using errcode = '22023';
  end case;
  return v_result;
end;
$$;

create or replace function public.church_pastor_create(
  p_table text,
  p_church_slug text,
  p_payload jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, church, church_private
as $$
declare
  v_tenant_id uuid;
  v_result jsonb;
  v_entity_id text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select t.id into v_tenant_id
  from public.tenants t
  where t.slug = p_church_slug and t.status = 'active'
  limit 1;
  if v_tenant_id is null then
    raise exception 'church tenant not found' using errcode = 'P0002';
  end if;

  case p_table
    when 'church_members' then
      insert into church_private.members(
        tenant_id, church_slug, full_name, preferred_name, phone, email,
        household_name, status, joined_on, created_by
      ) values (
        v_tenant_id, p_church_slug, nullif(trim(p_payload->>'full_name'), ''),
        nullif(trim(p_payload->>'preferred_name'), ''), nullif(trim(p_payload->>'phone'), ''),
        nullif(trim(p_payload->>'email'), ''), nullif(trim(p_payload->>'household_name'), ''),
        coalesce(nullif(trim(p_payload->>'status'), ''), 'active'),
        nullif(trim(p_payload->>'joined_on'), '')::date, p_actor
      ) returning jsonb_build_object(
        'id', id, 'full_name', full_name, 'preferred_name', preferred_name,
        'phone', phone, 'email', email, 'status', status,
        'household_name', household_name, 'joined_on', joined_on,
        'created_at', created_at
      ) into v_result;

    when 'church_services' then
      insert into church.services(
        tenant_id, church_slug, service_date, title, scripture, sermon_title,
        preacher, status, created_by
      ) values (
        v_tenant_id, p_church_slug, (p_payload->>'service_date')::date,
        nullif(trim(p_payload->>'title'), ''), nullif(trim(p_payload->>'scripture'), ''),
        nullif(trim(p_payload->>'sermon_title'), ''), nullif(trim(p_payload->>'preacher'), ''),
        coalesce(nullif(trim(p_payload->>'status'), ''), 'draft'), p_actor
      ) returning jsonb_build_object(
        'id', id, 'service_date', service_date, 'title', title,
        'scripture', scripture, 'sermon_title', sermon_title,
        'preacher', preacher, 'status', status, 'created_at', created_at
      ) into v_result;

    when 'church_care_tasks' then
      insert into church_private.care_tasks(
        tenant_id, church_slug, member_id, subject_name, care_type,
        next_action, due_on, status, created_by
      ) values (
        v_tenant_id, p_church_slug, nullif(trim(p_payload->>'member_id'), '')::uuid,
        nullif(trim(p_payload->>'subject_name'), ''),
        coalesce(nullif(trim(p_payload->>'care_type'), ''), 'other'),
        nullif(trim(p_payload->>'next_action'), ''), nullif(trim(p_payload->>'due_on'), '')::date,
        coalesce(nullif(trim(p_payload->>'status'), ''), 'open'), p_actor
      ) returning jsonb_build_object(
        'id', id, 'member_id', member_id, 'subject_name', subject_name,
        'care_type', care_type, 'next_action', next_action,
        'due_on', due_on, 'status', status, 'created_at', created_at
      ) into v_result;

    when 'church_events' then
      insert into church.events(
        tenant_id, church_slug, title, event_date, event_time, location,
        category, status, created_by
      ) values (
        v_tenant_id, p_church_slug, nullif(trim(p_payload->>'title'), ''),
        (p_payload->>'event_date')::date, nullif(trim(p_payload->>'event_time'), '')::time,
        nullif(trim(p_payload->>'location'), ''),
        coalesce(nullif(trim(p_payload->>'category'), ''), 'other'),
        coalesce(nullif(trim(p_payload->>'status'), ''), 'scheduled'), p_actor
      ) returning jsonb_build_object(
        'id', id, 'title', title, 'event_date', event_date,
        'event_time', event_time, 'location', location, 'category', category,
        'status', status, 'created_at', created_at
      ) into v_result;

    else
      raise exception 'table not allowed' using errcode = '22023';
  end case;

  v_entity_id := coalesce(v_result->>'id', '');
  insert into church_private.audit_logs(
    tenant_id, church_slug, actor_user_id, action, entity_type, entity_id, detail
  ) values (
    v_tenant_id, p_church_slug, p_actor, 'create', p_table, v_entity_id,
    jsonb_build_object('source', 'church-pastor-api')
  );
  return v_result;
end;
$$;

revoke all on function public.church_pastor_staff_for_user(text, uuid) from public, anon, authenticated;
revoke all on function public.church_pastor_list(text, text, uuid, boolean, text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.church_pastor_create(text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.church_pastor_staff_for_user(text, uuid) to service_role;
grant execute on function public.church_pastor_list(text, text, uuid, boolean, text, uuid, text, integer) to service_role;
grant execute on function public.church_pastor_create(text, text, jsonb, uuid) to service_role;
