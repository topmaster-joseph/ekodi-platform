-- ISOLATED DEV ONLY. The canonical activity tables are not yet installed in
-- ekodi-platform-dev. Load this BEFORE points migrations inside BEGIN/ROLLBACK.
-- Do not run against a populated activity environment or production.
create table public.activities (
  id uuid primary key,
  workspace_tenant_id uuid not null references public.tenants(id),
  status text not null,
  starts_at timestamptz
);
create table public.activity_participations (
  id uuid primary key,
  activity_id uuid not null references public.activities(id),
  person_id uuid not null references public.people(id),
  status text not null,
  checked_in_at timestamptz
);
create table public.activity_participation_audit (
  id bigint generated always as identity primary key,
  activity_id uuid,
  participation_id uuid,
  actor_user_id uuid,
  action text,
  after_state jsonb,
  source_channel text
);
