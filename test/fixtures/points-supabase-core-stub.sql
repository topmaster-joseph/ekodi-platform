-- ISOLATED THROWAWAY DATABASE ONLY. Minimal Supabase-compatible core used to
-- execute point migrations and SQL smokes locally/CI. Never load into Supabase.
do $r$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $r$;
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text,
  created_at timestamptz not null default now(), confirmed_at timestamptz,
  email_confirmed_at timestamptz, phone_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as
 $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create table public.tenants(id uuid primary key default gen_random_uuid());
create table public.people(id uuid primary key default gen_random_uuid(), ekodi_id text unique,
  display_name text, status text not null default 'active', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create table public.login_identities(id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade, provider text not null,
  provider_subject text not null, email text not null, is_primary boolean not null default false,
  status text not null default 'active', linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(), unique(provider,provider_subject), unique(auth_user_id));
insert into auth.users(email,created_at,email_confirmed_at) select 'fx'||g||'@example.invalid', now()-interval '60 days', now()-interval '60 days' from generate_series(1,4) g;
insert into public.tenants default values;
