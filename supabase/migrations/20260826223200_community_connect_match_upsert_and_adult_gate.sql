-- Follow-up to the already-applied Connect foundation.
-- Keep mutual-match upserts deterministic and keep marriage discovery adult-only.

create unique index if not exists community_connect_matches_canonical_uidx
  on public.community_connect_matches(user_a_id, user_b_id, intent);

alter table public.community_connect_profiles
  add column if not exists age_19_confirmed boolean not null default false;

alter table public.community_connect_profiles
  drop constraint if exists community_connect_marriage_requires_adult;

alter table public.community_connect_profiles
  add constraint community_connect_marriage_requires_adult
  check (marriage_enabled = false or age_19_confirmed = true);

comment on column public.community_connect_profiles.age_19_confirmed is
  'User attestation that they are age 19 or older. No birth date is stored in Connect v1.';
