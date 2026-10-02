create table if not exists public.public_discovery_registry (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('site','subsite','post','article','event','product','service','local_business','other')),
  source_key text not null,
  canonical_url text not null unique check (canonical_url ~ '^https://ekodi\.kr(?:/|$)'),
  parent_url text null check (parent_url is null or parent_url ~ '^https://ekodi\.kr(?:/|$)'),
  title text not null check (char_length(title) between 1 and 240),
  description text not null default '' check (char_length(description) <= 1000),
  schema_type text not null default 'WebPage' check (char_length(schema_type) between 1 and 80),
  language text not null default 'ko' check (language ~ '^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$'),
  image_url text null check (image_url is null or image_url ~ '^https://'),
  publication_status text not null default 'published' check (publication_status in ('published','hidden','draft','preparing','private')),
  published_at timestamptz null,
  modified_at timestamptz not null default now(),
  expires_at timestamptz null,
  public_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(public_payload) = 'object'),
  source_updated_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (source_type, source_key)
);

comment on table public.public_discovery_registry is
'Public-safe canonical Discovery Projection registry for EKODI SEO/AEO/GEO. Contains only unrestricted public facts; never credentials, private contacts, admin state, or private identifiers.';

alter table public.public_discovery_registry enable row level security;

drop policy if exists "public discovery published read" on public.public_discovery_registry;
create policy "public discovery published read"
on public.public_discovery_registry
for select
to anon, authenticated
using (
  publication_status = 'published'
  and (expires_at is null or expires_at > now())
);

revoke insert, update, delete on public.public_discovery_registry from anon, authenticated;
grant select on public.public_discovery_registry to anon, authenticated;

create or replace function public.discovery_private_path(p_url text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    coalesce(p_url,'') ~* '/(?:admin|api|auth|oauth)(?:/|$)'
    or coalesce(p_url,'') ~* '/preview(?:/|$)'
    or coalesce(p_url,'') ~* '/my(?:/|$)'
    or coalesce(p_url,'') ~* '/share(?:/|$)'
    or coalesce(p_url,'') ~* '/edit(?:/|$)';
$$;

create or replace function public.discovery_upsert_public_record(
  p_source_type text,
  p_source_key text,
  p_canonical_url text,
  p_parent_url text,
  p_title text,
  p_description text,
  p_schema_type text,
  p_language text default 'ko',
  p_image_url text default null,
  p_published_at timestamptz default null,
  p_modified_at timestamptz default now(),
  p_public_payload jsonb default '{}'::jsonb,
  p_source_updated_at timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_canonical_url is null
     or p_canonical_url !~ '^https://ekodi\.kr(?:/|$)'
     or public.discovery_private_path(p_canonical_url)
  then
    delete from public.public_discovery_registry
    where source_type = p_source_type and source_key = p_source_key;
    return;
  end if;

  insert into public.public_discovery_registry (
    source_type, source_key, canonical_url, parent_url, title, description,
    schema_type, language, image_url, publication_status, published_at,
    modified_at, public_payload, source_updated_at
  ) values (
    p_source_type, p_source_key, p_canonical_url, p_parent_url, p_title,
    coalesce(p_description,''), coalesce(nullif(p_schema_type,''),'WebPage'),
    coalesce(nullif(p_language,''),'ko'), p_image_url, 'published',
    p_published_at, coalesce(p_modified_at,now()),
    coalesce(p_public_payload,'{}'::jsonb), p_source_updated_at
  )
  on conflict (source_type, source_key) do update set
    canonical_url = excluded.canonical_url,
    parent_url = excluded.parent_url,
    title = excluded.title,
    description = excluded.description,
    schema_type = excluded.schema_type,
    language = excluded.language,
    image_url = excluded.image_url,
    publication_status = 'published',
    published_at = coalesce(excluded.published_at, public.public_discovery_registry.published_at),
    modified_at = excluded.modified_at,
    public_payload = excluded.public_payload,
    source_updated_at = excluded.source_updated_at;
end;
$$;

create or replace function public.discovery_remove_record(p_source_type text, p_source_key text)
returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.public_discovery_registry
  where source_type = p_source_type and source_key = p_source_key;
$$;

create or replace function public.sync_activity_discovery()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_slug text;
  v_url text;
  v_description text;
  v_payload jsonb;
begin
  if tg_op = 'DELETE' then
    perform public.discovery_remove_record('event', old.id::text);
    return old;
  end if;

  if new.status <> 'published' or new.visibility <> 'public' then
    perform public.discovery_remove_record('event', new.id::text);
    return new;
  end if;

  select slug into v_slug from public.tenants where id = new.workspace_tenant_id;
  v_url := nullif(new.metadata->>'canonical_url','');

  if v_url is null and v_slug = 'ekodimission' then
    if new.activity_key = '260926-chuseok-open-table' then
      v_url := 'https://ekodi.kr/ekodimission/apply/260926-open-table';
    elsif new.activity_key = '261003-autumn-community-trip' then
      v_url := 'https://ekodi.kr/ekodimission/apply/261003-autumn-trip';
    end if;
  end if;

  if v_url is null then
    return new;
  end if;

  v_description := coalesce(nullif(new.summary,''), concat_ws(' · ', nullif(new.venue,''), new.starts_at::date::text));
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'startDate', new.starts_at,
    'endDate', new.ends_at,
    'location', nullif(new.venue,''),
    'registrationOpen', new.registration_open
  ));

  perform public.discovery_upsert_public_record(
    'event', new.id::text, v_url, 'https://ekodi.kr/' || trim(both '/' from coalesce(v_slug,'')),
    new.title, v_description, 'Event', 'ko', null, new.created_at, new.updated_at, v_payload, new.updated_at
  );
  return new;
end;
$$;

drop trigger if exists trg_sync_activity_discovery on public.activities;
create trigger trg_sync_activity_discovery
after insert or update or delete on public.activities
for each row execute function public.sync_activity_discovery();

create or replace function public.sync_trade_product_discovery()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.discovery_remove_record('product', old.engagement_id::text);
    return old;
  end if;

  if new.publication_status <> 'published'
     or new.sale_status = 'preparing'
     or new.mall_public_url is null
  then
    perform public.discovery_remove_record('product', new.engagement_id::text);
    return new;
  end if;

  perform public.discovery_upsert_public_record(
    'product', new.engagement_id::text, new.mall_public_url, 'https://ekodi.kr/ekodimall',
    new.public_name,
    coalesce(new.short_description,''),
    'Product', 'ko', new.image_url, null, new.updated_at,
    jsonb_strip_nulls(jsonb_build_object(
      'sku', new.product_code,
      'brand', nullif(new.brand,''),
      'model', nullif(new.model,''),
      'priceCurrency', 'KRW',
      'price', new.list_price_krw,
      'availability', new.sale_status
    )),
    new.updated_at
  );
  return new;
end;
$$;

drop trigger if exists trg_sync_trade_product_discovery on public.trade_product_public_profiles;
create trigger trg_sync_trade_product_discovery
after insert or update or delete on public.trade_product_public_profiles
for each row execute function public.sync_trade_product_discovery();

create or replace function public.sync_store_profile_discovery()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_url text;
begin
  if tg_op = 'DELETE' then
    perform public.discovery_remove_record('local_business', old.store_id::text);
    return old;
  end if;

  if new.is_published is not true then
    perform public.discovery_remove_record('local_business', new.store_id::text);
    return new;
  end if;

  v_url := 'https://ekodi.kr/store/' || new.store_slug;

  perform public.discovery_upsert_public_record(
    'local_business', new.store_id::text, v_url, 'https://ekodi.kr/',
    new.store_name, coalesce(new.short_intro,''), 'LocalBusiness', 'ko',
    new.hero_image_url, null, new.updated_at,
    jsonb_strip_nulls(jsonb_build_object(
      'address', new.store_address,
      'telephone', new.store_phone,
      'featuredMenu', new.featured_menu_name,
      'featuredMenuPrice', new.featured_menu_price,
      'benefit', new.today_benefit
    )),
    new.updated_at
  );
  return new;
end;
$$;

drop trigger if exists trg_sync_store_profile_discovery on public.store_public_profiles;
create trigger trg_sync_store_profile_discovery
after insert or update or delete on public.store_public_profiles
for each row execute function public.sync_store_profile_discovery();

update public.activities set updated_at = updated_at where status='published' and visibility='public';


-- Explicit Data API execution policy. Registry mutation helpers are server-only.
revoke execute on function public.discovery_private_path(text)
from public, anon, authenticated;
grant execute on function public.discovery_private_path(text)
to service_role;

revoke execute on function public.discovery_upsert_public_record(
  text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,jsonb,timestamptz
) from public, anon, authenticated;
grant execute on function public.discovery_upsert_public_record(
  text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,jsonb,timestamptz
) to service_role;

revoke execute on function public.discovery_remove_record(text,text)
from public, anon, authenticated;
grant execute on function public.discovery_remove_record(text,text)
to service_role;

revoke execute on function public.sync_activity_discovery()
from public, anon, authenticated;
grant execute on function public.sync_activity_discovery()
to service_role;

revoke execute on function public.sync_trade_product_discovery()
from public, anon, authenticated;
grant execute on function public.sync_trade_product_discovery()
to service_role;

revoke execute on function public.sync_store_profile_discovery()
from public, anon, authenticated;
grant execute on function public.sync_store_profile_discovery()
to service_role;
