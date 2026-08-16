-- TEST-ONLY schema baseline for ephemeral Local Supabase CI.
-- This file mirrors only existing production objects required to validate
-- new identity/workspace/Business OS migrations. It is never applied to production.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  create type public.app_role as enum (
    'platform_admin',
    'tenant_admin',
    'store_owner',
    'store_staff',
    'member',
    'customer'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.order_status as enum (
    'draft','pending','confirmed','preparing','ready','completed','cancelled'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  phone text
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  kind text not null default 'association',
  settings jsonb not null default '{}'::jsonb
);

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  status text not null default 'active',
  primary key (tenant_id, user_id, role)
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null,
  name text not null,
  category text,
  public_address text,
  public_phone text,
  business_hours jsonb not null default '{}'::jsonb,
  public_description text,
  is_published boolean not null default false,
  order_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  primary key (store_id, user_id, role)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  order_no text not null,
  customer_user_id uuid references auth.users(id) on delete set null,
  customer_name text,
  customer_phone text,
  fulfillment_type text not null default 'pickup',
  table_ref text,
  subtotal integer not null default 0,
  discount integer not null default 0,
  delivery_fee integer not null default 0,
  total integer not null default 0,
  status public.order_status not null default 'pending',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_access_registry (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  site_key text not null,
  tenant_id uuid references public.tenants(id) on delete cascade,
  role public.app_role not null default 'member',
  status text not null default 'active'
    check (status in ('pre_registered','active','suspended','revoked')),
  source text not null default 'manual',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  plan text not null default 'standard',
  unique (email, site_key, tenant_id, role)
);

create table if not exists public.identity_challenges (
  nonce_hash text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Production exposes these public helpers through private, security-definer
-- implementations. The ephemeral baseline reproduces the effective access rules
-- required by migration contracts without copying production internals.
create or replace function public.has_tenant_access(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(
    select 1 from public.profiles p
     where p.user_id = auth.uid() and p.platform_admin = true
  ) or exists(
    select 1 from public.tenant_members tm
     where tm.tenant_id = p_tenant
       and tm.user_id = auth.uid()
       and tm.status = 'active'
       and tm.role in ('platform_admin','tenant_admin','store_owner','store_staff','member')
  );
$$;

create or replace function public.has_store_access(p_store uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(
    select 1 from public.profiles p
     where p.user_id = auth.uid() and p.platform_admin = true
  ) or exists(
    select 1 from public.store_members sm
     where sm.store_id = p_store and sm.user_id = auth.uid()
  ) or exists(
    select 1
      from public.stores s
      join public.tenant_members tm on tm.tenant_id = s.tenant_id
     where s.id = p_store
       and tm.user_id = auth.uid()
       and tm.status = 'active'
       and tm.role in ('platform_admin','tenant_admin')
  );
$$;

create or replace function public.has_store_private_access(p_store uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(
    select 1 from public.profiles p
     where p.user_id = auth.uid() and p.platform_admin = true
  ) or exists(
    select 1 from public.store_members sm
     where sm.store_id = p_store
       and sm.user_id = auth.uid()
       and sm.role in ('store_owner','store_staff')
  ) or exists(
    select 1
      from public.stores s
      join public.tenant_members tm on tm.tenant_id = s.tenant_id
     where s.id = p_store
       and tm.user_id = auth.uid()
       and tm.status = 'active'
       and tm.role in ('platform_admin','tenant_admin')
  );
$$;

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.orders enable row level security;
alter table public.site_access_registry enable row level security;
alter table public.identity_challenges enable row level security;