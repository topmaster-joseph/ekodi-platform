-- Store operating spaces: one store, one root workspace, one canonical menu context.
-- Delivery-platform records remain source data. No menu name, price or option is fabricated.

alter table public.stores
  add column if not exists operating_space_slug text;

create unique index if not exists stores_operating_space_slug_uq
  on public.stores(lower(operating_space_slug))
  where operating_space_slug is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stores_operating_space_slug_format_chk'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_operating_space_slug_format_chk
      check (
        operating_space_slug is null
        or operating_space_slug ~ '^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$'
      );
  end if;
end
$$;
update public.stores set operating_space_slug = 'jadam'
 where slug = 'jadam-mokpo-univ';
update public.stores set operating_space_slug = 'pizzamaru'
 where slug = 'pizzamaru-mokpo-univ';
update public.stores set operating_space_slug = 'yogurt'
 where slug = 'yogurtpurple-mokpo-univ';

create table if not exists public.store_channel_profiles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null check (provider in ('baemin','coupang_eats','yogiyo','store')),
  display_name text not null,
  platform_store_name text,
  external_store_ref text,
  source_url text,
  connection_status text not null default 'setup_required'
    check (connection_status in ('ready','active','setup_required','partner_required','credentials_required','paused','error')),
  source_kind text not null default 'not_connected'
    check (source_kind in ('not_connected','official_api','partner_import','verified_file','manual_verified')),
  minimum_order_amount integer check (minimum_order_amount is null or minimum_order_amount >= 0),
  delivery_fee_min integer check (delivery_fee_min is null or delivery_fee_min >= 0),
  delivery_fee_max integer check (delivery_fee_max is null or delivery_fee_max >= 0),
  business_hours jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, provider),
  check (delivery_fee_max is null or delivery_fee_min is null or delivery_fee_max >= delivery_fee_min)
);

create index if not exists store_channel_profiles_store_status_idx
  on public.store_channel_profiles(store_id, connection_status);

create table if not exists public.store_menu_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  canonical_name text not null,
  category text,
  description text,
  base_price integer check (base_price is null or base_price >= 0),
  options jsonb not null default '[]'::jsonb,
  image_url text,
  availability text not null default 'unknown'
    check (availability in ('available','sold_out','hidden','unknown')),
  source_basis text not null default 'pending'
    check (source_basis in ('pending','platform_verified','operator_verified','pos_verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_menu_items_store_idx
  on public.store_menu_items(store_id, category, canonical_name);
create table if not exists public.store_channel_menu_listings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  menu_item_id uuid references public.store_menu_items(id) on delete set null,
  provider text not null check (provider in ('baemin','coupang_eats','yogiyo','store')),
  external_item_ref text,
  listing_name text not null,
  listing_description text,
  listed_price integer check (listed_price is null or listed_price >= 0),
  options jsonb not null default '[]'::jsonb,
  availability text not null default 'unknown'
    check (availability in ('available','sold_out','hidden','unknown')),
  source_kind text not null
    check (source_kind in ('official_api','partner_import','verified_file','manual_verified')),
  captured_at timestamptz not null default now(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_channel_menu_listings_store_provider_idx
  on public.store_channel_menu_listings(store_id, provider, listing_name);
create unique index if not exists store_channel_menu_listings_external_ref_uq
  on public.store_channel_menu_listings(store_id, provider, external_item_ref)
  where external_item_ref is not null;
insert into public.store_channel_profiles(store_id,provider,display_name,connection_status,source_kind)
select s.id, p.provider, p.display_name, 'partner_required', 'not_connected'
from public.stores s
cross join (values
  ('baemin'::text,'배달의민족'::text),
  ('coupang_eats'::text,'쿠팡이츠'::text),
  ('yogiyo'::text,'요기요'::text)
) as p(provider,display_name)
where s.operating_space_slug in ('jadam','pizzamaru','yogurt')
on conflict(store_id,provider) do nothing;

alter table public.store_channel_profiles enable row level security;
alter table public.store_menu_items enable row level security;
alter table public.store_channel_menu_listings enable row level security;

drop policy if exists store_channel_profiles_private_read on public.store_channel_profiles;
create policy store_channel_profiles_private_read on public.store_channel_profiles
  for select to authenticated
  using (public.has_store_private_access(store_id));

drop policy if exists store_menu_items_private_read on public.store_menu_items;
create policy store_menu_items_private_read on public.store_menu_items
  for select to authenticated
  using (public.has_store_private_access(store_id));

drop policy if exists store_channel_menu_listings_private_read on public.store_channel_menu_listings;
create policy store_channel_menu_listings_private_read on public.store_channel_menu_listings
  for select to authenticated
  using (public.has_store_private_access(store_id));
revoke all on public.store_channel_profiles from anon, authenticated;
revoke all on public.store_menu_items from anon, authenticated;
revoke all on public.store_channel_menu_listings from anon, authenticated;
grant select on public.store_channel_profiles to authenticated;
grant select on public.store_menu_items to authenticated;
grant select on public.store_channel_menu_listings to authenticated;

create or replace function public.current_store_operating_spaces()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'workspace_id', s.id,
      'slug', s.operating_space_slug,
      'name', s.name,
      'kind', 'store',
      'role', coalesce(
        (select sm.role::text from public.store_members sm
          where sm.store_id = s.id and sm.user_id = auth.uid()
          order by case sm.role::text when 'store_owner' then 0 when 'store_staff' then 1 else 9 end
          limit 1),
        (select tm.role::text from public.tenant_members tm
          where tm.tenant_id = s.tenant_id and tm.user_id = auth.uid() and tm.status = 'active'
          order by case tm.role::text when 'platform_admin' then 0 when 'tenant_admin' then 1 else 9 end
          limit 1),
        'member'
      ),
      'status', 'active',
      'url', 'https://ekodi.kr/' || s.operating_space_slug,
      'store_slug', s.slug
    ) as row_data
    from public.stores s
    where s.operating_space_slug is not null
      and public.has_store_private_access(s.id)
  ) q;

  return v_result;
end
$$;

revoke all on function public.current_store_operating_spaces() from public, anon;
grant execute on function public.current_store_operating_spaces() to authenticated;
create or replace function public.store_operating_space_snapshot(p_operating_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_slug text := lower(trim(coalesce(p_operating_slug,'')));
  v_store record;
  v_role text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select s.* into v_store
    from public.stores s
   where lower(s.operating_space_slug) = v_slug
   limit 1;

  if v_store.id is null then
    raise exception 'workspace_not_found' using errcode = '22023';
  end if;
  if not public.has_store_private_access(v_store.id) then
    raise exception 'workspace_access_required' using errcode = '42501';
  end if;

  select coalesce(
    (select sm.role::text from public.store_members sm
      where sm.store_id = v_store.id and sm.user_id = auth.uid()
      order by case sm.role::text when 'store_owner' then 0 when 'store_staff' then 1 else 9 end
      limit 1),
    (select tm.role::text from public.tenant_members tm
      where tm.tenant_id = v_store.tenant_id and tm.user_id = auth.uid() and tm.status = 'active'
      order by case tm.role::text when 'platform_admin' then 0 when 'tenant_admin' then 1 else 9 end
      limit 1),
    'member'
  ) into v_role;

  select jsonb_build_object(
    'workspace_id', v_store.id,
    'slug', v_store.operating_space_slug,
    'name', v_store.name,
    'kind', 'store',
    'role', v_role,
    'store', jsonb_build_object(
      'id', v_store.id,
      'store_slug', v_store.slug,
      'name', v_store.name,
      'category', v_store.category,
      'address', v_store.public_address,
      'phone', v_store.public_phone,
      'business_hours', coalesce(v_store.business_hours,'{}'::jsonb),
      'description', v_store.public_description,
      'order_enabled', v_store.order_enabled
    ),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', c.provider,
        'display_name', c.display_name,
        'platform_store_name', c.platform_store_name,
        'connection_status', c.connection_status,
        'source_kind', c.source_kind,
        'minimum_order_amount', c.minimum_order_amount,
        'delivery_fee_min', c.delivery_fee_min,
        'delivery_fee_max', c.delivery_fee_max,
        'business_hours', c.business_hours,
        'last_synced_at', c.last_synced_at,
        'verified_at', c.verified_at
      ) order by c.display_name)
      from public.store_channel_profiles c
      where c.store_id = v_store.id
    ), '[]'::jsonb),
    'menu', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'name', m.canonical_name,
        'category', m.category,
        'description', m.description,
        'base_price', m.base_price,
        'options', m.options,
        'image_url', m.image_url,
        'availability', m.availability,
        'source_basis', m.source_basis,
        'listings', coalesce((
          select jsonb_agg(jsonb_build_object(
            'provider', l.provider,
            'external_item_ref', l.external_item_ref,
            'name', l.listing_name,
            'description', l.listing_description,
            'price', l.listed_price,
            'options', l.options,
            'availability', l.availability,
            'source_kind', l.source_kind,
            'captured_at', l.captured_at,
            'last_synced_at', l.last_synced_at
          ) order by l.provider, l.listing_name)
          from public.store_channel_menu_listings l
          where l.store_id = v_store.id and l.menu_item_id = m.id
        ), '[]'::jsonb)
      ) order by coalesce(m.category,''), m.canonical_name)
      from public.store_menu_items m
      where m.store_id = v_store.id
    ), '[]'::jsonb),
    'unmapped_channel_listings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', l.provider,
        'external_item_ref', l.external_item_ref,
        'name', l.listing_name,
        'price', l.listed_price,
        'availability', l.availability,
        'source_kind', l.source_kind,
        'captured_at', l.captured_at,
        'last_synced_at', l.last_synced_at
      ) order by l.provider, l.listing_name)
      from public.store_channel_menu_listings l
      where l.store_id = v_store.id and l.menu_item_id is null
    ), '[]'::jsonb),
    'summary', jsonb_build_object(
      'canonical_menu_count', (select count(*) from public.store_menu_items m where m.store_id = v_store.id),
      'platform_listing_count', (select count(*) from public.store_channel_menu_listings l where l.store_id = v_store.id),
      'connected_channel_count', (select count(*) from public.store_channel_profiles c where c.store_id = v_store.id and c.connection_status in ('ready','active'))
    ),
    'data_policy', jsonb_build_object(
      'canonical_source', 'ekodi_store_menu_master',
      'external_channel_policy', 'official-contract-only',
      'synthetic_menu_data', false,
      'price_change_requires_human_approval', true
    )
  ) into v_result;

  return v_result;
end
$$;

revoke all on function public.store_operating_space_snapshot(text) from public, anon;
grant execute on function public.store_operating_space_snapshot(text) to authenticated;
-- Business OS now resolves every store operating space through the same canonical route column.
create or replace function public.business_os_resolve_scope(p_workspace_key text)
returns table(
  workspace_key text,
  workspace_name text,
  tenant_id uuid,
  store_id uuid,
  store_slug text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_key text := lower(trim(coalesce(p_workspace_key,'')));
begin
  if v_key = 'ekodibiz' then
    return query
      select 'ekodibiz'::text, t.name, t.id, null::uuid, null::text
        from public.tenants t
       where t.slug = 'ekodibiz' and t.kind = 'business'
       limit 1;
    return;
  end if;

  return query
    select s.operating_space_slug, s.name, s.tenant_id, s.id, s.slug
      from public.stores s
     where lower(s.operating_space_slug) = v_key
     limit 1;
end
$$;

revoke all on function public.business_os_resolve_scope(text) from public, anon, authenticated;

comment on column public.stores.operating_space_slug is
  'Canonical apex route locator for a store workspace. Authorization remains bound to immutable store/workspace id.';
comment on table public.store_menu_items is
  'EKODI canonical menu master. Rows are created only from verified operator/POS/platform evidence.';
comment on table public.store_channel_menu_listings is
  'Read model of verified external channel menu listings. External platform data never becomes authorization truth.';
