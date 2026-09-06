-- EKODI church domain consolidation
-- Canonical production home: shared EKODI PostgreSQL, isolated by schema + tenant_id + RLS.

create schema if not exists church;
create schema if not exists church_private;

revoke all on schema church from public, anon;
revoke all on schema church_private from public, anon;
grant usage on schema church to authenticated, service_role;
grant usage on schema church_private to authenticated, service_role;

create table if not exists church.staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  church_slug text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null check (role in ('senior_pastor','pastor','care_staff','staff','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists church.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  church_slug text not null,
  service_date date not null,
  title text not null,
  scripture text,
  sermon_title text,
  preacher text,
  status text not null default 'draft' check (status in ('draft','ready','complete','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists church.events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  church_slug text not null,
  title text not null,
  event_date date not null,
  event_time time,
  location text,
  category text not null default 'other' check (category in ('worship','ministry','meeting','care','other')),
  status text not null default 'scheduled' check (status in ('scheduled','done','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists church_private.members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  church_slug text not null,
  full_name text not null,
  preferred_name text,
  phone text,
  email text,
  household_name text,
  status text not null default 'active' check (status in ('active','newcomer','inactive')),
  joined_on date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists church_private.care_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  church_slug text not null,
  member_id uuid references church_private.members(id) on delete set null,
  subject_name text not null,
  care_type text not null default 'other' check (care_type in ('visit','call','prayer','newcomer','other')),
  next_action text,
  due_on date,
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists church_private.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  church_slug text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists church_staff_scope_idx on church.staff(tenant_id, user_id, active);
create index if not exists church_services_scope_idx on church.services(tenant_id, service_date desc);
create index if not exists church_events_scope_idx on church.events(tenant_id, event_date);
create index if not exists church_members_scope_idx on church_private.members(tenant_id, status, full_name);
create index if not exists church_care_scope_idx on church_private.care_tasks(tenant_id, status, due_on);
create index if not exists church_audit_scope_idx on church_private.audit_logs(tenant_id, created_at desc);

create or replace function church_private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function church_private.touch_updated_at() from public, anon, authenticated;

create or replace function church_private.has_admin_access(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    coalesce((select p.platform_admin from public.profiles p where p.user_id = auth.uid()), false)
    or exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = p_tenant
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role = 'tenant_admin'
    )
$$;
revoke all on function church_private.has_admin_access(uuid) from public, anon;
grant execute on function church_private.has_admin_access(uuid) to authenticated;

create trigger church_staff_touch_updated_at before update on church.staff
for each row execute function church_private.touch_updated_at();
create trigger church_services_touch_updated_at before update on church.services
for each row execute function church_private.touch_updated_at();
create trigger church_events_touch_updated_at before update on church.events
for each row execute function church_private.touch_updated_at();
create trigger church_members_touch_updated_at before update on church_private.members
for each row execute function church_private.touch_updated_at();
create trigger church_care_touch_updated_at before update on church_private.care_tasks
for each row execute function church_private.touch_updated_at();

alter table church.staff enable row level security;
alter table church.services enable row level security;
alter table church.events enable row level security;
alter table church_private.members enable row level security;
alter table church_private.care_tasks enable row level security;
alter table church_private.audit_logs enable row level security;

create policy church_staff_read on church.staff for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy church_staff_admin_write on church.staff for all to authenticated
using (church_private.has_admin_access(tenant_id))
with check (church_private.has_admin_access(tenant_id));

create policy church_services_read on church.services for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy church_services_admin_write on church.services for all to authenticated
using (church_private.has_admin_access(tenant_id))
with check (church_private.has_admin_access(tenant_id));

create policy church_events_read on church.events for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy church_events_admin_write on church.events for all to authenticated
using (church_private.has_admin_access(tenant_id))
with check (church_private.has_admin_access(tenant_id));

create policy church_members_admin_only on church_private.members for all to authenticated
using (church_private.has_admin_access(tenant_id))
with check (church_private.has_admin_access(tenant_id));
create policy church_care_admin_only on church_private.care_tasks for all to authenticated
using (church_private.has_admin_access(tenant_id))
with check (church_private.has_admin_access(tenant_id));
create policy church_audit_admin_read on church_private.audit_logs for select to authenticated
using (church_private.has_admin_access(tenant_id));

grant select, insert, update, delete on church.staff, church.services, church.events to authenticated;
grant select, insert, update, delete on church_private.members, church_private.care_tasks to authenticated;
grant select on church_private.audit_logs to authenticated;

grant all privileges on all tables in schema church to service_role;
grant all privileges on all tables in schema church_private to service_role;
grant usage, select on all sequences in schema church_private to service_role;

revoke all privileges on all tables in schema church from anon;
revoke all privileges on all tables in schema church_private from anon;

comment on schema church is 'EKODI Church tenant-scoped ministry operations without member PII.';
comment on schema church_private is 'Restricted EKODI Church member, care, and audit data.';
