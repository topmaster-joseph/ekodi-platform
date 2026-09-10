-- Backward-compatible query/count semantics for the Church Pastor Admin client.
-- Keeps the canonical RPC boundary while matching the existing client contract.

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
  v_statuses text[];
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select t.id into v_tenant_id
  from public.tenants t
  where t.slug = p_church_slug and t.status = 'active'
  limit 1;
  if v_tenant_id is null then return v_result; end if;

  if p_status is not null then
    if p_status like 'in.(%)' then
      v_statuses := string_to_array(replace(trim(both '()' from substring(p_status from 4)), ' ', ''), ',');
    else
      v_statuses := array[regexp_replace(p_status, '^eq\.', '')];
    end if;
  end if;

  case p_table
    when 'church_staff' then
      select coalesce(jsonb_agg(x.row_value order by
        case when lower(coalesce(p_order,'')) like 'created_at.asc%' then x.created_at end asc,
        case when lower(coalesce(p_order,'')) not like 'created_at.asc%' then x.created_at end desc
      ), '[]'::jsonb)
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
        order by
          case when lower(coalesce(p_order,'')) like 'created_at.asc%' then s.created_at end asc,
          case when lower(coalesce(p_order,'')) not like 'created_at.asc%' then s.created_at end desc
        limit v_limit
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
          and (v_statuses is null or m.status = any(v_statuses))
          and (p_id is null or m.id = p_id)
        order by lower(m.full_name) asc limit v_limit
      ) x;

    when 'church_services' then
      select coalesce(jsonb_agg(x.row_value order by
        case when lower(coalesce(p_order,'')) like 'service_date.asc%' then x.sort_key end asc,
        case when lower(coalesce(p_order,'')) not like 'service_date.asc%' then x.sort_key end desc
      ), '[]'::jsonb)
      into v_result
      from (
        select jsonb_build_object(
          'id', s.id, 'service_date', s.service_date, 'title', s.title,
          'scripture', s.scripture, 'sermon_title', s.sermon_title,
          'preacher', s.preacher, 'status', s.status, 'created_at', s.created_at
        ) as row_value, s.service_date as sort_key
        from church.services s
        where s.tenant_id = v_tenant_id
          and (v_statuses is null or s.status = any(v_statuses))
          and (p_id is null or s.id = p_id)
        order by
          case when lower(coalesce(p_order,'')) like 'service_date.asc%' then s.service_date end asc,
          case when lower(coalesce(p_order,'')) not like 'service_date.asc%' then s.service_date end desc
        limit v_limit
      ) x;

    when 'church_care_tasks' then
      select coalesce(jsonb_agg(x.row_value order by x.sort_key asc nulls last, x.created_at desc), '[]'::jsonb)
      into v_result
      from (
        select jsonb_build_object(
          'id', c.id, 'member_id', c.member_id, 'subject_name', c.subject_name,
          'care_type', c.care_type, 'next_action', c.next_action,
          'due_on', c.due_on, 'status', c.status, 'created_at', c.created_at
        ) as row_value, c.due_on as sort_key, c.created_at
        from church_private.care_tasks c
        where c.tenant_id = v_tenant_id
          and (v_statuses is null or c.status = any(v_statuses))
          and (p_id is null or c.id = p_id)
        order by c.due_on asc nulls last, c.created_at desc limit v_limit
      ) x;

    when 'church_events' then
      select coalesce(jsonb_agg(x.row_value order by x.sort_key asc, x.created_at desc), '[]'::jsonb)
      into v_result
      from (
        select jsonb_build_object(
          'id', e.id, 'title', e.title, 'event_date', e.event_date,
          'event_time', e.event_time, 'location', e.location,
          'category', e.category, 'status', e.status, 'created_at', e.created_at
        ) as row_value, e.event_date as sort_key, e.created_at
        from church.events e
        where e.tenant_id = v_tenant_id
          and (v_statuses is null or e.status = any(v_statuses))
          and (p_id is null or e.id = p_id)
        order by e.event_date asc, e.created_at desc limit v_limit
      ) x;

    else
      raise exception 'table not allowed' using errcode = '22023';
  end case;
  return v_result;
end;
$$;

create or replace function public.church_pastor_count(
  p_table text,
  p_church_slug text,
  p_requester_user_id uuid default null,
  p_is_senior boolean default false,
  p_status text default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church, church_private
as $$
declare
  v_tenant_id uuid;
  v_statuses text[];
  v_count bigint := 0;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select t.id into v_tenant_id
  from public.tenants t
  where t.slug = p_church_slug and t.status = 'active'
  limit 1;
  if v_tenant_id is null then return 0; end if;

  if p_status is not null then
    if p_status like 'in.(%)' then
      v_statuses := string_to_array(replace(trim(both '()' from substring(p_status from 4)), ' ', ''), ',');
    else
      v_statuses := array[regexp_replace(p_status, '^eq\.', '')];
    end if;
  end if;

  case p_table
    when 'church_staff' then
      select count(*) into v_count from church.staff s
      where s.tenant_id=v_tenant_id and (p_is_senior or s.user_id=p_requester_user_id);
    when 'church_members' then
      select count(*) into v_count from church_private.members m
      where m.tenant_id=v_tenant_id and (v_statuses is null or m.status=any(v_statuses));
    when 'church_services' then
      select count(*) into v_count from church.services s
      where s.tenant_id=v_tenant_id and (v_statuses is null or s.status=any(v_statuses));
    when 'church_care_tasks' then
      select count(*) into v_count from church_private.care_tasks c
      where c.tenant_id=v_tenant_id and (v_statuses is null or c.status=any(v_statuses));
    when 'church_events' then
      select count(*) into v_count from church.events e
      where e.tenant_id=v_tenant_id and (v_statuses is null or e.status=any(v_statuses));
    else
      raise exception 'table not allowed' using errcode = '22023';
  end case;
  return v_count;
end;
$$;

revoke all on function public.church_pastor_list(text, text, uuid, boolean, text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.church_pastor_list(text, text, uuid, boolean, text, uuid, text, integer) to service_role;
revoke all on function public.church_pastor_count(text, text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.church_pastor_count(text, text, uuid, boolean, text) to service_role;
