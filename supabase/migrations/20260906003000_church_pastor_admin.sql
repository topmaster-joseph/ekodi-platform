-- EKODI Church Pastor Admin v1
-- Target: dedicated Supabase project `ekodi-church` (lxcxwbdwwojjkgybbqii).
-- Authentication remains in EKODI central auth. The church-pastor-api verifies that token
-- and is the only application path allowed to use the service role against these tables.
-- No public first-claim bootstrap is permitted.

create table if not exists public.church_staff (
  id uuid primary key default gen_random_uuid(),
  church_slug text not null,
  user_id uuid not null,
  email text,
  display_name text,
  role text not null check (role in ('senior_pastor','pastor','care_staff','staff','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (church_slug,user_id)
);

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
  created_by uuid,
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
  created_by uuid,
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
  created_by uuid,
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
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.church_audit_logs (
  id bigint generated always as identity primary key,
  church_slug text not null,
  actor_user_id uuid,
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

-- The browser must never access pastoral tables directly. The Edge Function uses the
-- project service role after verifying the EKODI central token and church_staff role.
revoke all on table public.church_staff from anon, authenticated;
revoke all on table public.church_members from anon, authenticated;
revoke all on table public.church_services from anon, authenticated;
revoke all on table public.church_care_tasks from anon, authenticated;
revoke all on table public.church_events from anon, authenticated;
revoke all on table public.church_audit_logs from anon, authenticated;

comment on table public.church_care_tasks is 'Restricted pastoral follow-up. Do not store full counselling transcripts here.';
comment on table public.church_audit_logs is 'Append-only audit records written by church-pastor-api using the service role.';
