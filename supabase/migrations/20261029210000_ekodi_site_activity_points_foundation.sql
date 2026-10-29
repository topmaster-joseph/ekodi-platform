-- EKODI per-site activity points: private ledger foundation.
-- No automatic grants or production backfill.
create table if not exists public.ekodi_point_sites (
  site_id text primary key check (site_id ~ '^[a-z0-9_-]{2,64}$'),
  display_name text not null,
  enabled boolean not null default false,
  daily_cap integer not null default 100 check (daily_cap between 0 and 100000),
  created_at timestamptz not null default now()
);
create table if not exists public.ekodi_point_rules (
  site_id text not null references public.ekodi_point_sites(site_id),
  rule_id text not null,
  points integer not null check (points between 0 and 10000),
  daily_cap integer not null check (daily_cap between 0 and 100000),
  daily_events integer not null check (daily_events between 0 and 10000),
  min_active_seconds integer not null default 0 check (min_active_seconds between 0 and 86400),
  enabled boolean not null default false,
  primary key (site_id,rule_id)
);
create table if not exists public.ekodi_point_wallets (
  site_id text not null references public.ekodi_point_sites(site_id),
  user_id uuid not null references auth.users(id),
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now(),
  primary key(site_id,user_id)
);
create table if not exists public.ekodi_point_ledger (
  id bigint generated always as identity primary key,
  site_id text not null,
  user_id uuid not null,
  amount integer not null check (amount <> 0),
  event_kind text not null,
  rule_id text,
  event_key text not null,
  transfer_group uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(site_id,user_id,event_key),
  foreign key(site_id,user_id) references public.ekodi_point_wallets(site_id,user_id)
);
create index if not exists ekodi_point_ledger_daily_idx on public.ekodi_point_ledger(site_id,user_id,created_at);
create table if not exists public.ekodi_point_transfer_policies (
  from_site text not null references public.ekodi_point_sites(site_id),
  to_site text not null references public.ekodi_point_sites(site_id),
  numerator integer not null check(numerator>0),
  denominator integer not null check(denominator>0),
  daily_cap integer not null check(daily_cap>=0),
  enabled boolean not null default false,
  primary key(from_site,to_site),
  check(from_site<>to_site)
);
alter table public.ekodi_point_sites enable row level security;
alter table public.ekodi_point_rules enable row level security;
alter table public.ekodi_point_wallets enable row level security;
alter table public.ekodi_point_ledger enable row level security;
alter table public.ekodi_point_transfer_policies enable row level security;
revoke all on public.ekodi_point_sites,public.ekodi_point_rules,public.ekodi_point_wallets,public.ekodi_point_ledger,public.ekodi_point_transfer_policies from anon,authenticated;
-- Subsequent migrations will add authenticated, audited SECURITY DEFINER
-- award, spend, transfer and donate RPCs with locked search_path.
-- Do not allow browser clients to insert ledger entries directly.
