-- Proposed tenant-isolated data model. Do not apply before operator and auth review.
create table if not exists public.seasonal_farm_demands (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 created_by uuid not null references auth.users(id),
 crop text not null check (crop in ('onion','garlic','sweet_potato','greenhouse','other')),
 workers integer not null check(workers between 1 and 1000),
 start_month date not null,
 duration_months integer not null check(duration_months between 1 and 8),
 housing_status text not null check(housing_status in ('ready','preparing','support_needed')),
 status text not null default 'submitted' check(status in ('submitted','under_review','approved','rejected','cancelled')),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists seasonal_farm_demands_tenant_status_idx on public.seasonal_farm_demands(tenant_id,status,created_at desc);
alter table public.seasonal_farm_demands enable row level security;
-- Intentionally no policies: deny all client reads/writes until a verified tenant membership
-- source, operator approval and audit trail are integrated with EKODI authentication.
revoke all on public.seasonal_farm_demands from anon, authenticated;
comment on table public.seasonal_farm_demands is 'Unactivated design schema: never expose before authorized tenant RBAC, audit and retention are implemented';
