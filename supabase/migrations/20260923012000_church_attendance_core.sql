-- EKODI Church attendance core: tenant-scoped worship attendance with member self-service summary.
-- Attendance remains private and is exposed only through authenticated service boundaries.

create table if not exists church_private.attendance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  church_slug text not null,
  service_id uuid not null references church.services(id) on delete cascade,
  member_id uuid not null references church_private.members(id) on delete cascade,
  attendance_state text not null
    check (attendance_state in ('present','late','online','absent','excused')),
  check_in_at timestamptz,
  source text not null default 'manual'
    check (source in ('manual','checkin','import')),
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, service_id, member_id)
);

create index if not exists church_attendance_scope_idx
  on church_private.attendance_records(tenant_id, service_id, attendance_state);
create index if not exists church_attendance_member_idx
  on church_private.attendance_records(tenant_id, member_id, created_at desc);

drop trigger if exists church_attendance_touch_updated_at on church_private.attendance_records;
create trigger church_attendance_touch_updated_at before update on church_private.attendance_records
for each row execute function church_private.touch_updated_at();

alter table church_private.attendance_records enable row level security;
revoke all privileges on church_private.attendance_records from anon, authenticated;
grant all privileges on church_private.attendance_records to service_role;

comment on table church_private.attendance_records is
  'Restricted church attendance register. Member-level attendance is never public by default.';

create or replace function public.church_attendance_list(
  p_church_slug text,
  p_member_id uuid default null,
  p_limit integer default 250
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church, church_private
as $$
declare
  v_tenant_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit,250),500));
  v_result jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;

  select id into v_tenant_id
  from public.tenants
  where slug=p_church_slug and status='active'
  limit 1;
  if v_tenant_id is null then return v_result; end if;

  select coalesce(jsonb_agg(x.row_value order by x.service_date desc, x.created_at desc),'[]'::jsonb)
  into v_result
  from (
    select
      jsonb_build_object(
        'id',a.id,
        'member_id',a.member_id,
        'member_name',coalesce(m.preferred_name,m.full_name),
        'service_id',a.service_id,
        'service_date',s.service_date,
        'service_title',s.title,
        'attendance_state',a.attendance_state,
        'check_in_at',a.check_in_at,
        'source',a.source,
        'note',a.note,
        'created_at',a.created_at,
        'updated_at',a.updated_at
      ) row_value,
      s.service_date,
      a.created_at
    from church_private.attendance_records a
    join church_private.members m
      on m.id=a.member_id and m.tenant_id=a.tenant_id
    join church.services s
      on s.id=a.service_id and s.tenant_id=a.tenant_id
    where a.tenant_id=v_tenant_id
      and (p_member_id is null or a.member_id=p_member_id)
    order by s.service_date desc,a.created_at desc
    limit v_limit
  ) x;

  return v_result;
end;
$$;

create or replace function public.church_attendance_count(
  p_church_slug text,
  p_member_id uuid default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church_private
as $$
declare v_tenant_id uuid; v_count bigint := 0;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select id into v_tenant_id
  from public.tenants
  where slug=p_church_slug and status='active'
  limit 1;
  if v_tenant_id is null then return 0; end if;

  select count(*) into v_count
  from church_private.attendance_records
  where tenant_id=v_tenant_id
    and (p_member_id is null or member_id=p_member_id);

  return v_count;
end;
$$;

create or replace function public.church_attendance_upsert(
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
  v_service_id uuid;
  v_member_id uuid;
  v_state text;
  v_result jsonb;
  v_record_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;

  select id into v_tenant_id
  from public.tenants
  where slug=p_church_slug and status='active'
  limit 1;
  if v_tenant_id is null then
    raise exception 'church tenant not found' using errcode='P0002';
  end if;

  v_service_id := nullif(trim(p_payload->>'service_id'),'')::uuid;
  v_member_id := nullif(trim(p_payload->>'member_id'),'')::uuid;
  v_state := lower(trim(coalesce(p_payload->>'attendance_state','')));

  if v_service_id is null or v_member_id is null
     or v_state not in ('present','late','online','absent','excused') then
    raise exception 'invalid attendance payload' using errcode='22023';
  end if;

  if not exists (
    select 1 from church.services
    where id=v_service_id and tenant_id=v_tenant_id
  ) then
    raise exception 'service not found' using errcode='22023';
  end if;

  if not exists (
    select 1 from church_private.members
    where id=v_member_id and tenant_id=v_tenant_id and status<>'inactive'
  ) then
    raise exception 'member not found' using errcode='22023';
  end if;

  insert into church_private.attendance_records(
    tenant_id,church_slug,service_id,member_id,attendance_state,check_in_at,source,note,recorded_by
  ) values (
    v_tenant_id,p_church_slug,v_service_id,v_member_id,v_state,
    case
      when v_state in ('present','late','online')
        then coalesce(nullif(trim(p_payload->>'check_in_at'),'')::timestamptz,now())
      else null
    end,
    coalesce(nullif(trim(p_payload->>'source'),''),'manual'),
    nullif(trim(p_payload->>'note'),''),
    p_actor
  )
  on conflict (tenant_id,service_id,member_id) do update
  set attendance_state=excluded.attendance_state,
      check_in_at=excluded.check_in_at,
      source=excluded.source,
      note=excluded.note,
      recorded_by=excluded.recorded_by,
      updated_at=now()
  returning id into v_record_id;

  select jsonb_build_object(
    'id',a.id,
    'member_id',a.member_id,
    'member_name',coalesce(m.preferred_name,m.full_name),
    'service_id',a.service_id,
    'service_date',s.service_date,
    'service_title',s.title,
    'attendance_state',a.attendance_state,
    'check_in_at',a.check_in_at,
    'source',a.source,
    'note',a.note,
    'updated_at',a.updated_at
  )
  into v_result
  from church_private.attendance_records a
  join church_private.members m on m.id=a.member_id and m.tenant_id=a.tenant_id
  join church.services s on s.id=a.service_id and s.tenant_id=a.tenant_id
  where a.id=v_record_id;

  insert into church_private.audit_logs(
    tenant_id,church_slug,actor_user_id,action,entity_type,entity_id,detail
  ) values (
    v_tenant_id,p_church_slug,p_actor,'upsert','church_attendance',v_record_id::text,
    jsonb_build_object('service_id',v_service_id,'member_id',v_member_id,'attendance_state',v_state)
  );

  return v_result;
end;
$$;

create or replace function public.church_member_attendance_summary(
  p_church_slug text,
  p_user_id uuid,
  p_email text,
  p_year integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church, church_private
as $$
declare
  v_tenant_id uuid;
  v_member church_private.members%rowtype;
  v_year integer := coalesce(p_year,extract(year from current_date)::integer);
  v_matches integer := 0;
  v_items jsonb := '[]'::jsonb;
  v_recorded integer := 0;
  v_attended integer := 0;
  v_present integer := 0;
  v_late integer := 0;
  v_online integer := 0;
  v_absent integer := 0;
  v_excused integer := 0;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;

  select id into v_tenant_id
  from public.tenants
  where slug=p_church_slug and status='active'
  limit 1;
  if v_tenant_id is null then
    return jsonb_build_object('linked',false,'reason','tenant_not_found');
  end if;

  select * into v_member
  from church_private.members
  where tenant_id=v_tenant_id and auth_user_id=p_user_id and status<>'inactive'
  limit 1;

  if v_member.id is null and nullif(trim(coalesce(p_email,'')),'') is not null then
    select count(*) into v_matches
    from church_private.members
    where tenant_id=v_tenant_id
      and status<>'inactive'
      and lower(email)=lower(trim(p_email));

    if v_matches=1 then
      select * into v_member
      from church_private.members
      where tenant_id=v_tenant_id
        and status<>'inactive'
        and lower(email)=lower(trim(p_email))
      limit 1;
    elsif v_matches>1 then
      return jsonb_build_object('linked',false,'reason','ambiguous_email');
    end if;
  end if;

  if v_member.id is null then
    return jsonb_build_object('linked',false,'reason','member_not_linked');
  end if;

  select
    count(*)::integer,
    count(*) filter (where a.attendance_state in ('present','late','online'))::integer,
    count(*) filter (where a.attendance_state='present')::integer,
    count(*) filter (where a.attendance_state='late')::integer,
    count(*) filter (where a.attendance_state='online')::integer,
    count(*) filter (where a.attendance_state='absent')::integer,
    count(*) filter (where a.attendance_state='excused')::integer
  into v_recorded,v_attended,v_present,v_late,v_online,v_absent,v_excused
  from church_private.attendance_records a
  join church.services s
    on s.id=a.service_id and s.tenant_id=a.tenant_id
  where a.tenant_id=v_tenant_id
    and a.member_id=v_member.id
    and extract(year from s.service_date)::integer=v_year;

  select coalesce(jsonb_agg(x.row_value order by x.service_date desc),'[]'::jsonb)
  into v_items
  from (
    select
      jsonb_build_object(
        'service_id',s.id,
        'service_date',s.service_date,
        'service_title',s.title,
        'attendance_state',a.attendance_state,
        'check_in_at',a.check_in_at
      ) row_value,
      s.service_date
    from church_private.attendance_records a
    join church.services s
      on s.id=a.service_id and s.tenant_id=a.tenant_id
    where a.tenant_id=v_tenant_id
      and a.member_id=v_member.id
      and extract(year from s.service_date)::integer=v_year
    order by s.service_date desc
    limit 500
  ) x;

  return jsonb_build_object(
    'linked',true,
    'year',v_year,
    'member',jsonb_build_object(
      'id',v_member.id,
      'name',coalesce(v_member.preferred_name,v_member.full_name)
    ),
    'recorded_count',v_recorded,
    'attended_count',v_attended,
    'present_count',v_present,
    'late_count',v_late,
    'online_count',v_online,
    'absent_count',v_absent,
    'excused_count',v_excused,
    'attendance_rate',case when v_recorded=0 then null else round((v_attended::numeric/v_recorded::numeric)*100,1) end,
    'attendance',v_items,
    'rate_basis','recorded_attendance'
  );
end;
$$;

revoke all on function public.church_attendance_list(text,uuid,integer) from public,anon,authenticated;
revoke all on function public.church_attendance_count(text,uuid) from public,anon,authenticated;
revoke all on function public.church_attendance_upsert(text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.church_member_attendance_summary(text,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.church_attendance_list(text,uuid,integer) to service_role;
grant execute on function public.church_attendance_count(text,uuid) to service_role;
grant execute on function public.church_attendance_upsert(text,jsonb,uuid) to service_role;
grant execute on function public.church_member_attendance_summary(text,uuid,text,integer) to service_role;
