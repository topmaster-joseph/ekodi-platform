-- TEST-ONLY schema baseline for ephemeral Local Supabase CI.
-- This file mirrors only the existing production objects required to validate
-- new identity/workspace migrations. It is never applied to production.

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

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.site_access_registry enable row level security;
alter table public.identity_challenges enable row level security;
