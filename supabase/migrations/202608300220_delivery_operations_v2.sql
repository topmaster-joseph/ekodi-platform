-- Delivery Hub AI operations v2
-- Extends the existing tenants / stores / orders model. No credentials or provider secrets live in these tables.

create table if not exists public.delivery_provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  provider_key text not null check (provider_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  provider_type text not null default 'agency' check (provider_type in ('agency','self','platform','manual')),
  adapter_status text not null default 'manual' check (adapter_status in ('manual','official-ready','connected','disabled')),
  active boolean not null default true,
  public_config jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_provider_store_tenant_fk foreign key (store_id, tenant_id) references public.stores(id, tenant_id) on delete cascade
);

create unique index if not exists delivery_provider_scope_key_uidx
  on public.delivery_provider_connections (tenant_id, coalesce(store_id,'00000000-0000-0000-0000-000000000000'::uuid), provider_key);
create index if not exists delivery_provider_tenant_idx on public.delivery_provider_connections(tenant_id, active);
create index if not exists delivery_provider_store_idx on public.delivery_provider_connections(store_id) where store_id is not null;

create table if not exists public.delivery_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  priority text not null default 'balanced' check (priority in ('balanced','cost','speed')),
  max_delivery_fee integer check (max_delivery_fee is null or max_delivery_fee >= 0),
  approval_fee_threshold integer check (approval_fee_threshold is null or approval_fee_threshold >= 0),
  target_minutes integer not null default 45 check (target_minutes between 1 and 360),
  minimum_reliability numeric(5,4) not null default 0 check (minimum_reliability between 0 and 1),
  allowed_provider_ids text[] not null default '{}'::text[],
  subsidy_type text not null default 'none' check (subsidy_type in ('none','fixed','percent')),
  subsidy_value numeric(12,2) not null default 0 check (subsidy_value >= 0),
  subsidy_cap integer check (subsidy_cap is null or subsidy_cap >= 0),
  customer_min_share integer not null default 0 check (customer_min_share >= 0),
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_policy_store_tenant_fk foreign key (store_id, tenant_id) references public.stores(id, tenant_id) on delete cascade
);

create index if not exists delivery_policy_tenant_idx on public.delivery_policies(tenant_id, active);
create index if not exists delivery_policy_store_idx on public.delivery_policies(store_id) where store_id is not null;

create table if not exists public.delivery_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  provider_connection_id uuid references public.delivery_provider_connections(id) on delete set null,
  policy_id uuid references public.delivery_policies(id) on delete set null,
  request_snapshot jsonb not null default '{}'::jsonb,
  decision_snapshot jsonb not null default '{}'::jsonb,
  approval_required boolean not null default false,
  dispatch_executed boolean not null default false check (dispatch_executed = false),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists delivery_decision_tenant_created_idx on public.delivery_decisions(tenant_id, created_at desc);
create index if not exists delivery_decision_store_created_idx on public.delivery_decisions(store_id, created_at desc) where store_id is not null;
create index if not exists delivery_decision_order_idx on public.delivery_decisions(order_id) where order_id is not null;

create table if not exists public.delivery_settlement_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  period_start date,
  period_end date,
  status text not null default 'draft' check (status in ('draft','reviewed','exported','void')),
  totals jsonb not null default '{}'::jsonb,
  rows jsonb not null default '[]'::jsonb,
  balanced boolean not null default true,
  settlement_executed boolean not null default false check (settlement_executed = false),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create index if not exists delivery_settlement_tenant_created_idx on public.delivery_settlement_drafts(tenant_id, created_at desc);
create index if not exists delivery_settlement_store_created_idx on public.delivery_settlement_drafts(store_id, created_at desc) where store_id is not null;

alter table public.delivery_provider_connections enable row level security;
alter table public.delivery_policies enable row level security;
alter table public.delivery_decisions enable row level security;
alter table public.delivery_settlement_drafts enable row level security;

revoke all on public.delivery_provider_connections from anon;
revoke all on public.delivery_policies from anon;
revoke all on public.delivery_decisions from anon;
revoke all on public.delivery_settlement_drafts from anon;
grant select, insert, update, delete on public.delivery_provider_connections to authenticated;
grant select, insert, update, delete on public.delivery_policies to authenticated;
grant select, insert on public.delivery_decisions to authenticated;
grant select, insert, update, delete on public.delivery_settlement_drafts to authenticated;

create policy delivery_provider_read on public.delivery_provider_connections
  for select to authenticated
  using (
    (store_id is null and public.has_tenant_access(tenant_id)) or
    (store_id is not null and (public.has_store_private_access(store_id) or public.has_tenant_admin_access(tenant_id)))
  );
create policy delivery_provider_write on public.delivery_provider_connections
  for all to authenticated
  using (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)))
  with check (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)));

create policy delivery_policy_read on public.delivery_policies
  for select to authenticated
  using (
    (store_id is null and public.has_tenant_access(tenant_id)) or
    (store_id is not null and (public.has_store_private_access(store_id) or public.has_tenant_admin_access(tenant_id)))
  );
create policy delivery_policy_write on public.delivery_policies
  for all to authenticated
  using (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)))
  with check (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)));

create policy delivery_decision_read on public.delivery_decisions
  for select to authenticated
  using (
    (store_id is null and public.has_tenant_admin_access(tenant_id)) or
    (store_id is not null and (public.has_store_private_access(store_id) or public.has_tenant_admin_access(tenant_id)))
  );
create policy delivery_decision_insert on public.delivery_decisions
  for insert to authenticated
  with check (
    dispatch_executed = false and
    ((store_id is null and public.has_tenant_admin_access(tenant_id)) or
     (store_id is not null and (public.has_store_private_access(store_id) or public.has_tenant_admin_access(tenant_id))))
  );

create policy delivery_settlement_read on public.delivery_settlement_drafts
  for select to authenticated
  using (
    (store_id is null and public.has_tenant_admin_access(tenant_id)) or
    (store_id is not null and (public.has_store_private_access(store_id) or public.has_tenant_admin_access(tenant_id)))
  );
create policy delivery_settlement_write on public.delivery_settlement_drafts
  for all to authenticated
  using (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)))
  with check (
    settlement_executed = false and
    (public.has_tenant_admin_access(tenant_id) or (store_id is not null and public.has_store_private_access(store_id)))
  );

comment on table public.delivery_provider_connections is 'Non-secret delivery provider connection metadata. Credentials remain in official adapter secret storage.';
comment on table public.delivery_decisions is 'Immutable-ish decision-support audit records. V2 forbids external dispatch execution.';
comment on table public.delivery_settlement_drafts is 'Preview/export drafts only. V2 forbids settlement execution.';
