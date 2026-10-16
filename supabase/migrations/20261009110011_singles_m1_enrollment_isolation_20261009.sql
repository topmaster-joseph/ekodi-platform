-- EKODI Singles M1 development enrollment isolation.
-- Applied first to ekodi-platform-dev via Supabase migration 20261009110011.
-- Do not collect users or enable discovery until legal approval and guarded production release.
create table if not exists public.singles_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id),
  status text not null default 'active' check(status in ('active','withdrawn','suspended')),
  age_19_confirmed boolean not null default false,
  adult_verified_at timestamptz,
  base_consent boolean not null default false,
  religion_consent boolean not null default false,
  marriage_opt_in boolean not null default false,
  discoverable boolean not null default false check(discoverable = false),
  consent_version text not null default 'singles-m1-2026-10-09-draft',
  consented_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint singles_marriage_requires_explicit_religion_and_adult_check check(
    marriage_opt_in = false or (religion_consent = true and age_19_confirmed = true and base_consent = true)
  ),
  constraint singles_withdrawn_has_no_active_consent check(
    status <> 'withdrawn' or (discoverable = false and base_consent = false and religion_consent = false and marriage_opt_in = false)
  )
);
comment on table public.singles_memberships is
  'EKODI Singles M1 explicit enrollment and consent state; not discoverable; independent of general Connect.';
create table if not exists public.singles_sensitive_profiles (
  user_id uuid primary key references public.singles_memberships(user_id) on delete cascade,
  encrypted_payload bytea,
  updated_at timestamptz not null default now()
);
comment on table public.singles_sensitive_profiles is
  'Future encrypted sensitive faith fields. M1 never writes here; no direct browser grants.';
create table if not exists public.singles_public_cards (
  user_id uuid primary key references public.singles_memberships(user_id) on delete cascade,
  safe_label text not null default '',
  visibility text not null default 'private' check(visibility = 'private'),
  updated_at timestamptz not null default now(),
  constraint singles_public_card_safe_label_size check(char_length(safe_label)<=80)
);
comment on table public.singles_public_cards is
  'Future min-data projection. Public visibility intentionally unavailable during M1.';
create table if not exists public.singles_consent_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check(action in ('enrolled','withdrawn')),
  consent_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists singles_consent_receipts_user_idx
  on public.singles_consent_receipts(user_id,created_at desc);
alter table public.singles_memberships enable row level security;
alter table public.singles_sensitive_profiles enable row level security;
alter table public.singles_public_cards enable row level security;
alter table public.singles_consent_receipts enable row level security;
revoke all on table public.singles_memberships,public.singles_sensitive_profiles,
  public.singles_public_cards,public.singles_consent_receipts from PUBLIC,anon,authenticated;
grant select,insert,update,delete on table public.singles_memberships,
  public.singles_sensitive_profiles,public.singles_public_cards to service_role;
grant select,insert on table public.singles_consent_receipts to service_role;
