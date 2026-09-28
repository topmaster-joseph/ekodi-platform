-- EKODI Trade product public catalog.
-- Public-safe product facts are separated from internal trade records.

create table if not exists public.trade_product_public_profiles (
  engagement_id uuid primary key references public.trade_engagements(id) on delete cascade,
  product_code text not null unique,
  public_name text not null,
  brand text not null default '',
  model text not null default '',
  short_description text not null default '',
  public_specs jsonb not null default '[]'::jsonb,
  list_price_krw integer,
  sale_status text not null default 'preparing',
  publication_status text not null default 'draft',
  mall_public_url text,
  image_url text,
  fulfillment text not null default '',
  after_sales_note text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint trade_product_public_profiles_specs_array check (jsonb_typeof(public_specs)='array'),
  constraint trade_product_public_profiles_sale_status check (sale_status in ('preparing','available','sold_out','discontinued')),
  constraint trade_product_public_profiles_publication_status check (publication_status in ('draft','published')),
  constraint trade_product_public_profiles_price_check check (list_price_krw is null or list_price_krw >= 0),
  constraint trade_product_public_profiles_mall_url_https check (mall_public_url is null or mall_public_url ~ '^https://'),
  constraint trade_product_public_profiles_image_url_https check (image_url is null or image_url ~ '^https://'),
  constraint trade_product_public_profiles_available_requires_checkout check (
    sale_status <> 'available' or (list_price_krw is not null and mall_public_url is not null)
  )
);

alter table public.trade_product_public_profiles enable row level security;

revoke all on table public.trade_product_public_profiles from anon, authenticated;
grant select on table public.trade_product_public_profiles to anon, authenticated;
grant insert, update on table public.trade_product_public_profiles to authenticated;

drop policy if exists trade_product_public_read_anon on public.trade_product_public_profiles;
create policy trade_product_public_read_anon
on public.trade_product_public_profiles
for select
to anon
using (publication_status='published');

drop policy if exists trade_product_read_authenticated on public.trade_product_public_profiles;
create policy trade_product_read_authenticated
on public.trade_product_public_profiles
for select
to authenticated
using (
  publication_status='published'
  or exists (
    select 1
    from public.trade_engagements e
    where e.id=engagement_id
      and (public.trade_company_access(e.counterparty_id)->>'side')='ekodibiz'
      and coalesce((public.trade_company_access(e.counterparty_id)->>'allowed')::boolean,false)=true
  )
);

drop policy if exists trade_product_admin_insert on public.trade_product_public_profiles;
create policy trade_product_admin_insert
on public.trade_product_public_profiles
for insert
to authenticated
with check (
  exists (
    select 1
    from public.trade_engagements e
    where e.id=engagement_id
      and (public.trade_company_access(e.counterparty_id)->>'side')='ekodibiz'
      and coalesce((public.trade_company_access(e.counterparty_id)->>'can_write')::boolean,false)=true
  )
);

drop policy if exists trade_product_admin_update on public.trade_product_public_profiles;
create policy trade_product_admin_update
on public.trade_product_public_profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.trade_engagements e
    where e.id=engagement_id
      and (public.trade_company_access(e.counterparty_id)->>'side')='ekodibiz'
      and coalesce((public.trade_company_access(e.counterparty_id)->>'can_write')::boolean,false)=true
  )
)
with check (
  exists (
    select 1
    from public.trade_engagements e
    where e.id=engagement_id
      and (public.trade_company_access(e.counterparty_id)->>'side')='ekodibiz'
      and coalesce((public.trade_company_access(e.counterparty_id)->>'can_write')::boolean,false)=true
  )
);

create index if not exists trade_product_public_profiles_status_idx
  on public.trade_product_public_profiles(publication_status,sale_status);
