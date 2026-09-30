-- EKODI Work administrator audit trail.
-- Additive only: does not alter existing Work data or RLS policies.

create table if not exists public.work_admin_audit (
  id bigint generated always as identity primary key,
  admin_email text not null check (char_length(admin_email) between 3 and 320),
  action text not null check (char_length(action) between 3 and 80),
  resource_type text not null check (resource_type in ('job','organization')),
  resource_id uuid not null,
  reason text not null default '' check (char_length(reason) <= 300),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists work_admin_audit_resource_idx
  on public.work_admin_audit(resource_type, resource_id, created_at desc);
create index if not exists work_admin_audit_time_idx
  on public.work_admin_audit(created_at desc);

alter table public.work_admin_audit enable row level security;
revoke all on public.work_admin_audit from anon, authenticated;
