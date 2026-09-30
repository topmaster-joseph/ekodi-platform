-- EKODI Church groups and ministry teams.
-- Group metadata and membership remain private; attendance is aggregated from the canonical member attendance ledger.

create table if not exists church_private.groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  church_slug text not null,
  parent_group_id uuid references church_private.groups(id) on delete set null,
  name text not null,
  group_type text not null default 'small_group'
    check (group_type in ('small_group','department','ministry_team','class','other')),
  description text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,name)
);

create table if not exists church_private.group_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  church_slug text not null,
  group_id uuid not null references church_private.groups(id) on delete cascade,
  member_id uuid not null references church_private.members(id) on delete cascade,
  role text not null default 'member'
    check (role in ('leader','member','teacher','volunteer','staff')),
  joined_on date,
  left_on date,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,group_id,member_id),
  check (left_on is null or joined_on is null or left_on >= joined_on)
);

create index if not exists church_groups_scope_idx
  on church_private.groups(tenant_id,active,group_type,name);
create index if not exists church_group_memberships_scope_idx
  on church_private.group_memberships(tenant_id,group_id,active,member_id);
create index if not exists church_group_memberships_member_idx
  on church_private.group_memberships(tenant_id,member_id,active);

drop trigger if exists church_groups_touch_updated_at on church_private.groups;
create trigger church_groups_touch_updated_at before update on church_private.groups
for each row execute function church_private.touch_updated_at();

drop trigger if exists church_group_memberships_touch_updated_at on church_private.group_memberships;
create trigger church_group_memberships_touch_updated_at before update on church_private.group_memberships
for each row execute function church_private.touch_updated_at();

alter table church_private.groups enable row level security;
alter table church_private.group_memberships enable row level security;
revoke all privileges on church_private.groups, church_private.group_memberships from anon, authenticated;
grant all privileges on church_private.groups, church_private.group_memberships to service_role;

comment on table church_private.groups is
  'Restricted church organization metadata for small groups, departments, ministry teams and classes.';
comment on table church_private.group_memberships is
  'Restricted many-to-many church group membership; membership is not a public directory.';

create or replace function public.church_group_list(
  p_church_slug text,
  p_active_only boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church_private
as $$
declare
  v_tenant_id uuid;
  v_result jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select id into v_tenant_id from public.tenants
  where slug=p_church_slug and status='active' limit 1;
  if v_tenant_id is null then return v_result; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',g.id,
    'parent_group_id',g.parent_group_id,
    'name',g.name,
    'group_type',g.group_type,
    'description',g.description,
    'active',g.active,
    'member_count',coalesce(mc.member_count,0),
    'created_at',g.created_at,
    'updated_at',g.updated_at
  ) order by g.group_type,g.name),'[]'::jsonb)
  into v_result
  from church_private.groups g
  left join lateral (
    select count(*)::integer member_count
    from church_private.group_memberships gm
    where gm.tenant_id=g.tenant_id and gm.group_id=g.id and gm.active=true
  ) mc on true
  where g.tenant_id=v_tenant_id
    and (not p_active_only or g.active=true);

  return v_result;
end;
$$;

create or replace function public.church_group_member_list(
  p_church_slug text,
  p_group_id uuid default null,
  p_active_only boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church_private
as $$
declare
  v_tenant_id uuid;
  v_result jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select id into v_tenant_id from public.tenants
  where slug=p_church_slug and status='active' limit 1;
  if v_tenant_id is null then return v_result; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',gm.id,
    'group_id',gm.group_id,
    'group_name',g.name,
    'group_type',g.group_type,
    'member_id',gm.member_id,
    'member_name',coalesce(m.preferred_name,m.full_name),
    'member_status',m.status,
    'role',gm.role,
    'joined_on',gm.joined_on,
    'left_on',gm.left_on,
    'active',gm.active,
    'created_at',gm.created_at
  ) order by g.name,coalesce(m.preferred_name,m.full_name)),'[]'::jsonb)
  into v_result
  from church_private.group_memberships gm
  join church_private.groups g on g.id=gm.group_id and g.tenant_id=gm.tenant_id
  join church_private.members m on m.id=gm.member_id and m.tenant_id=gm.tenant_id
  where gm.tenant_id=v_tenant_id
    and (p_group_id is null or gm.group_id=p_group_id)
    and (not p_active_only or gm.active=true);

  return v_result;
end;
$$;

create or replace function public.church_group_upsert(
  p_church_slug text,
  p_payload jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, church_private
as $$
declare
  v_tenant_id uuid;
  v_id uuid;
  v_parent uuid;
  v_name text;
  v_type text;
  v_result jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select id into v_tenant_id from public.tenants
  where slug=p_church_slug and status='active' limit 1;
  if v_tenant_id is null then raise exception 'church tenant not found' using errcode='P0002'; end if;

  v_id := nullif(trim(p_payload->>'id'),'')::uuid;
  v_parent := nullif(trim(p_payload->>'parent_group_id'),'')::uuid;
  v_name := nullif(trim(p_payload->>'name'),'');
  v_type := coalesce(nullif(trim(p_payload->>'group_type'),''),'small_group');
  if v_name is null or v_type not in ('small_group','department','ministry_team','class','other') then
    raise exception 'invalid group payload' using errcode='22023';
  end if;
  if v_parent is not null and not exists (
    select 1 from church_private.groups
    where id=v_parent and tenant_id=v_tenant_id and (v_id is null or id<>v_id)
  ) then raise exception 'invalid parent group' using errcode='22023'; end if;

  if v_id is null then
    insert into church_private.groups(
      tenant_id,church_slug,parent_group_id,name,group_type,description,active,created_by
    ) values (
      v_tenant_id,p_church_slug,v_parent,v_name,v_type,
      nullif(trim(p_payload->>'description'),''),
      coalesce((p_payload->>'active')::boolean,true),p_actor
    ) returning id into v_id;
  else
    update church_private.groups
    set parent_group_id=v_parent,
        name=v_name,
        group_type=v_type,
        description=nullif(trim(p_payload->>'description'),''),
        active=coalesce((p_payload->>'active')::boolean,active),
        updated_at=now()
    where id=v_id and tenant_id=v_tenant_id;
    if not found then raise exception 'group not found' using errcode='P0002'; end if;
  end if;

  select jsonb_build_object(
    'id',g.id,'parent_group_id',g.parent_group_id,'name',g.name,
    'group_type',g.group_type,'description',g.description,'active',g.active,
    'created_at',g.created_at,'updated_at',g.updated_at
  ) into v_result
  from church_private.groups g
  where g.id=v_id and g.tenant_id=v_tenant_id;

  insert into church_private.audit_logs(
    tenant_id,church_slug,actor_user_id,action,entity_type,entity_id,detail
  ) values (
    v_tenant_id,p_church_slug,p_actor,'upsert','church_group',v_id::text,
    jsonb_build_object('name',v_name,'group_type',v_type)
  );

  return v_result;
end;
$$;

create or replace function public.church_group_membership_upsert(
  p_church_slug text,
  p_payload jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, church_private
as $$
declare
  v_tenant_id uuid;
  v_group_id uuid;
  v_member_id uuid;
  v_role text;
  v_result jsonb;
  v_record_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select id into v_tenant_id from public.tenants
  where slug=p_church_slug and status='active' limit 1;
  if v_tenant_id is null then raise exception 'church tenant not found' using errcode='P0002'; end if;

  v_group_id := nullif(trim(p_payload->>'group_id'),'')::uuid;
  v_member_id := nullif(trim(p_payload->>'member_id'),'')::uuid;
  v_role := coalesce(nullif(trim(p_payload->>'role'),''),'member');
  if v_group_id is null or v_member_id is null
     or v_role not in ('leader','member','teacher','volunteer','staff') then
    raise exception 'invalid group membership payload' using errcode='22023';
  end if;
  if not exists (
    select 1 from church_private.groups where id=v_group_id and tenant_id=v_tenant_id
  ) then raise exception 'group not found' using errcode='22023'; end if;
  if not exists (
    select 1 from church_private.members
    where id=v_member_id and tenant_id=v_tenant_id and status<>'inactive'
  ) then raise exception 'member not found' using errcode='22023'; end if;

  insert into church_private.group_memberships(
    tenant_id,church_slug,group_id,member_id,role,joined_on,left_on,active,created_by
  ) values (
    v_tenant_id,p_church_slug,v_group_id,v_member_id,v_role,
    nullif(trim(p_payload->>'joined_on'),'')::date,
    nullif(trim(p_payload->>'left_on'),'')::date,
    coalesce((p_payload->>'active')::boolean,true),p_actor
  )
  on conflict (tenant_id,group_id,member_id) do update
  set role=excluded.role,
      joined_on=coalesce(excluded.joined_on,church_private.group_memberships.joined_on),
      left_on=excluded.left_on,
      active=excluded.active,
      updated_at=now()
  returning id into v_record_id;

  select jsonb_build_object(
    'id',gm.id,'group_id',gm.group_id,'member_id',gm.member_id,'role',gm.role,
    'joined_on',gm.joined_on,'left_on',gm.left_on,'active',gm.active,
    'created_at',gm.created_at,'updated_at',gm.updated_at
  ) into v_result
  from church_private.group_memberships gm
  where gm.id=v_record_id;

  insert into church_private.audit_logs(
    tenant_id,church_slug,actor_user_id,action,entity_type,entity_id,detail
  ) values (
    v_tenant_id,p_church_slug,p_actor,'upsert','church_group_membership',v_record_id::text,
    jsonb_build_object('group_id',v_group_id,'member_id',v_member_id,'role',v_role)
  );

  return v_result;
end;
$$;

create or replace function public.church_group_attendance_summaries(
  p_church_slug text,
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
  v_year integer := coalesce(p_year,extract(year from current_date)::integer);
  v_result jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select id into v_tenant_id from public.tenants
  where slug=p_church_slug and status='active' limit 1;
  if v_tenant_id is null then return v_result; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'group_id',g.id,
    'group_name',g.name,
    'group_type',g.group_type,
    'year',v_year,
    'member_count',coalesce(ms.member_count,0),
    'recorded_count',coalesce(ast.recorded_count,0),
    'attended_count',coalesce(ast.attended_count,0),
    'absent_count',coalesce(ast.absent_count,0),
    'excused_count',coalesce(ast.excused_count,0),
    'attendance_rate',case when coalesce(ast.recorded_count,0)=0 then null
      else round((ast.attended_count::numeric/ast.recorded_count::numeric)*100,1) end,
    'rate_basis','recorded_attendance'
  ) order by g.group_type,g.name),'[]'::jsonb)
  into v_result
  from church_private.groups g
  left join lateral (
    select count(*)::integer member_count
    from church_private.group_memberships gm
    join church_private.members m
      on m.id=gm.member_id and m.tenant_id=gm.tenant_id and m.status<>'inactive'
    where gm.tenant_id=g.tenant_id and gm.group_id=g.id and gm.active=true
  ) ms on true
  left join lateral (
    select
      count(*)::integer recorded_count,
      count(*) filter (where a.attendance_state in ('present','late','online'))::integer attended_count,
      count(*) filter (where a.attendance_state='absent')::integer absent_count,
      count(*) filter (where a.attendance_state='excused')::integer excused_count
    from church_private.group_memberships gm
    join church_private.attendance_records a
      on a.tenant_id=gm.tenant_id and a.member_id=gm.member_id
    join church.services s
      on s.id=a.service_id and s.tenant_id=a.tenant_id
    where gm.tenant_id=g.tenant_id
      and gm.group_id=g.id
      and gm.active=true
      and extract(year from s.service_date)::integer=v_year
      and (gm.joined_on is null or s.service_date>=gm.joined_on)
      and (gm.left_on is null or s.service_date<=gm.left_on)
  ) ast on true
  where g.tenant_id=v_tenant_id and g.active=true;

  return v_result;
end;
$$;

revoke all on function public.church_group_list(text,boolean) from public,anon,authenticated;
revoke all on function public.church_group_member_list(text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.church_group_upsert(text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.church_group_membership_upsert(text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.church_group_attendance_summaries(text,integer) from public,anon,authenticated;
grant execute on function public.church_group_list(text,boolean) to service_role;
grant execute on function public.church_group_member_list(text,uuid,boolean) to service_role;
grant execute on function public.church_group_upsert(text,jsonb,uuid) to service_role;
grant execute on function public.church_group_membership_upsert(text,jsonb,uuid) to service_role;
grant execute on function public.church_group_attendance_summaries(text,integer) to service_role;
