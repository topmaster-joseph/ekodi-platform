create table if not exists public.trade_supply_routes (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.trade_engagements(id) on delete cascade,
  supplier_counterparty_id uuid references public.trade_counterparties(id) on delete set null,
  supply_kind text not null default 'manufacturer'
    check (supply_kind in ('domestic','overseas','manufacturer','distributor','agent','oem','odm','multiple')),
  origin_country_code text not null default '',
  departure_country_code text not null default '',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  incoterm text not null default '',
  moq numeric(18,4),
  unit_cost numeric(18,4),
  payment_terms text not null default '',
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  exclusivity_scope text not null default 'none'
    check (exclusivity_scope in ('none','country','region','global')),
  status text not null default 'active'
    check (status in ('draft','active','paused','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trade_supply_routes_engagement_idx on public.trade_supply_routes(engagement_id,status);
create index if not exists trade_supply_routes_country_idx on public.trade_supply_routes(origin_country_code,departure_country_code);

create table if not exists public.trade_sales_markets (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.trade_engagements(id) on delete cascade,
  country_code text not null default '',
  market_scope text not null default 'international'
    check (market_scope in ('domestic','international')),
  sales_mode text not null default 'b2b'
    check (sales_mode in ('b2b','b2c','dealer','ecommerce','offline','project','export')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  list_price numeric(18,4),
  channel_name text not null default '',
  channel_url text,
  certification_status text not null default 'pending'
    check (certification_status in ('not_required','pending','in_progress','approved','blocked')),
  sales_status text not null default 'preparing'
    check (sales_status in ('preparing','available','paused','sold_out','discontinued','blocked')),
  fulfillment_mode text not null default 'direct'
    check (fulfillment_mode in ('direct','local_stock','dropship','dealer','project')),
  dealer_counterparty_id uuid references public.trade_counterparties(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trade_sales_markets_engagement_idx on public.trade_sales_markets(engagement_id,sales_status);
create index if not exists trade_sales_markets_country_idx on public.trade_sales_markets(country_code,market_scope,sales_mode);

alter table public.trade_supply_routes enable row level security;
alter table public.trade_sales_markets enable row level security;

drop policy if exists trade_supply_routes_read on public.trade_supply_routes;
create policy trade_supply_routes_read on public.trade_supply_routes for select to authenticated
using (exists (select 1 from public.trade_engagements e where e.id=engagement_id
  and coalesce((public.trade_company_access(e.counterparty_id)->>'allowed')::boolean,false)=true));

drop policy if exists trade_supply_routes_write on public.trade_supply_routes;
create policy trade_supply_routes_write on public.trade_supply_routes for insert to authenticated
with check (exists (select 1 from public.trade_engagements e where e.id=engagement_id
  and coalesce((public.trade_company_access(e.counterparty_id)->>'can_write')::boolean,false)=true));

drop policy if exists trade_supply_routes_update on public.trade_supply_routes;
create policy trade_supply_routes_update on public.trade_supply_routes for update to authenticated
using (exists (select 1 from public.trade_engagements e where e.id=engagement_id
  and coalesce((public.trade_company_access(e.counterparty_id)->>'can_write')::boolean,false)=true))
with check (exists (select 1 from public.trade_engagements e where e.id=engagement_id
  and coalesce((public.trade_company_access(e.counterparty_id)->>'can_write')::boolean,false)=true));

drop policy if exists trade_sales_markets_read on public.trade_sales_markets;
create policy trade_sales_markets_read on public.trade_sales_markets for select to authenticated
using (exists (select 1 from public.trade_engagements e where e.id=engagement_id
  and coalesce((public.trade_company_access(e.counterparty_id)->>'allowed')::boolean,false)=true));

drop policy if exists trade_sales_markets_write on public.trade_sales_markets;
create policy trade_sales_markets_write on public.trade_sales_markets for insert to authenticated
with check (exists (select 1 from public.trade_engagements e where e.id=engagement_id
  and coalesce((public.trade_company_access(e.counterparty_id)->>'can_write')::boolean,false)=true));

drop policy if exists trade_sales_markets_update on public.trade_sales_markets;
create policy trade_sales_markets_update on public.trade_sales_markets for update to authenticated
using (exists (select 1 from public.trade_engagements e where e.id=engagement_id
  and coalesce((public.trade_company_access(e.counterparty_id)->>'can_write')::boolean,false)=true))
with check (exists (select 1 from public.trade_engagements e where e.id=engagement_id
  and coalesce((public.trade_company_access(e.counterparty_id)->>'can_write')::boolean,false)=true));

grant select, insert, update on public.trade_supply_routes to authenticated;
grant select, insert, update on public.trade_sales_markets to authenticated;
revoke all on public.trade_supply_routes from anon;
revoke all on public.trade_sales_markets from anon;
