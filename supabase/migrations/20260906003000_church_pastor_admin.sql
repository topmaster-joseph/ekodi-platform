-- EKODI Church Pastor Admin v1
-- Security principle: no public bootstrap. The first senior_pastor must be inserted with service-role/admin tooling.

create table if not exists public.church_staff (
  id uuid primary key default gen_random_uuid(),
  church_slug text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null check (role in ('senior_pastor','pastor','care_staff','staff','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (church_slug,user_id)
);

create or replace function public.is_church_staff(target_church text, allowed_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.church_staff s
    where s.church_slug = target_church
      and s.user_id = auth.uid()
      and s.active = true
      and (allowed_roles is null or s.role = any(allowed_roles))
  );
$$;
revoke all on function public.is_church_staff(text,text[]) from public;
grant execute on function public.is_church_staff(text,text[]) to authenticated;

create table if not exists public.church_members (
  id uuid primary key default gen_random_uuid(),
  church_slug text not null,
  full_name text not null,
  preferred_name text,
  phone text,
  email text,
  household_name text,
  status text not null default 'active' check (status in ('active','newcomer','inactive')),
  joined_on date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.church_services (
  id uuid primary key default gen_random_uuid(),
  church_slug text not null,
  service_date date not null,
  title text not null,
  scripture text,
  sermon_title text,
  preacher text,
  status text not null default 'draft' check (status in ('draft','ready','complete','cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.church_care_tasks (
  id uuid primary key default gen_random_uuid(),
  church_slug text not null,
  member_id uuid references public.church_members(id) on delete set null,
  subject_name text not null,
  care_type text not null default 'other' check (care_type in ('visit','call','prayer','newcomer','other')),
  next_action text,
  due_on date,
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.church_events (
  id uuid primary key default gen_random_uuid(),
  church_slug text not null,
  title text not null,
  event_date date not null,
  event_time time,
  location text,
  category text not null default 'other' check (category in ('worship','ministry','meeting','care','other')),
  status text not null default 'scheduled' check (status in ('scheduled','done','cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.church_audit_logs (
  id bigint generated always as identity primary key,
  church_slug text not null,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists church_staff_scope_idx on public.church_staff(church_slug,user_id,active);
create index if not exists church_members_scope_idx on public.church_members(church_slug,status,full_name);
create index if not exists church_services_scope_idx on public.church_services(church_slug,service_date desc);
create index if not exists church_care_scope_idx on public.church_care_tasks(church_slug,status,due_on);
create index if not exists church_events_scope_idx on public.church_events(church_slug,event_date);
create index if not exists church_audit_scope_idx on public.church_audit_logs(church_slug,created_at desc);

alter table public.church_staff enable row level security;
alter table public.church_members enable row level security;
alter table public.church_services enable row level security;
alter table public.church_care_tasks enable row level security;
alter table public.church_events enable row level security;
alter table public.church_audit_logs enable row level security;

-- Staff may see their own grant. Senior pastors may see all staff in their church.
drop policy if exists church_staff_select on public.church_staff;
create policy church_staff_select on public.church_staff for select to authenticated
using (user_id = auth.uid() or public.is_church_staff(church_slug,array['senior_pastor']));

drop policy if exists church_staff_manage on public.church_staff;
create policy church_staff_manage on public.church_staff for all to authenticated
using (public.is_church_staff(church_slug,array['senior_pastor']))
with check (public.is_church_staff(church_slug,array['senior_pastor']));

-- Congregation directory: all active church staff can read. Pastors/staff can maintain basic directory fields.
drop policy if exists church_members_select on public.church_members;
create policy church_members_select on public.church_members for select to authenticated
using (public.is_church_staff(church_slug,null));

drop policy if exists church_members_insert on public.church_members;
create policy church_members_insert on public.church_members for insert to authenticated
with check (public.is_church_staff(church_slug,array['senior_pastor','pastor','staff']));

drop policy if exists church_members_update on public.church_members;
create policy church_members_update on public.church_members for update to authenticated
using (public.is_church_staff(church_slug,array['senior_pastor','pastor','staff']))
with check (public.is_church_staff(church_slug,array['senior_pastor','pastor','staff']));

drop policy if exists church_members_delete on public.church_members;
create policy church_members_delete on public.church_members for delete to authenticated
using (public.is_church_staff(church_slug,array['senior_pastor','pastor']));

-- Worship data is operational, but still tenant-isolated.
drop policy if exists church_services_select on public.church_services;
create policy church_services_select on public.church_services for select to authenticated
using (public.is_church_staff(church_slug,null));

drop policy if exists church_services_write on public.church_services;
create policy church_services_write on public.church_services for all to authenticated
using (public.is_church_staff(church_slug,array['senior_pastor','pastor','staff']))
with check (public.is_church_staff(church_slug,array['senior_pastor','pastor','staff']));

-- Care is deliberately narrower than the general directory.
drop policy if exists church_care_select on public.church_care_tasks;
create policy church_care_select on public.church_care_tasks for select to authenticated
using (public.is_church_staff(church_slug,array['senior_pastor','pastor','care_staff']));

drop policy if exists church_care_write on public.church_care_tasks;
create policy church_care_write on public.church_care_tasks for all to authenticated
using (public.is_church_staff(church_slug,array['senior_pastor','pastor','care_staff']))
with check (public.is_church_staff(church_slug,array['senior_pastor','pastor','care_staff']));

-- Calendar is visible to church staff and writable by active operators.
drop policy if exists church_events_select on public.church_events;
create policy church_events_select on public.church_events for select to authenticated
using (public.is_church_staff(church_slug,null));

drop policy if exists church_events_write on public.church_events;
create policy church_events_write on public.church_events for all to authenticated
using (public.is_church_staff(church_slug,array['senior_pastor','pastor','care_staff','staff']))
with check (public.is_church_staff(church_slug,array['senior_pastor','pastor','care_staff','staff']));

-- Audit records are append-only for staff and readable only by the senior pastor.
drop policy if exists church_audit_select on public.church_audit_logs;
create policy church_audit_select on public.church_audit_logs for select to authenticated
using (public.is_church_staff(church_slug,array['senior_pastor']));

drop policy if exists church_audit_insert on public.church_audit_logs;
create policy church_audit_insert on public.church_audit_logs for insert to authenticated
with check (actor_user_id = auth.uid() and public.is_church_staff(church_slug,null));

revoke update, delete on public.church_audit_logs from authenticated;

grant select on public.church_staff to authenticated;
grant select,insert,update,delete on public.church_members to authenticated;
grant select,insert,update,delete on public.church_services to authenticated;
grant select,insert,update,delete on public.church_care_tasks to authenticated;
grant select,insert,update,delete on public.church_events to authenticated;
grant select,insert on public.church_audit_logs to authenticated;
