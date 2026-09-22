-- EKODI public person page: private-first projection managed only from My EKODI.
-- Public readers can see only the explicitly published projection; person/workspace identity stays private.

create table if not exists public.person_public_profiles (
  person_id uuid primary key references public.people(id) on delete cascade,
  handle text not null,
  display_name text not null,
  headline text not null default '',
  bio text not null default '',
  links jsonb not null default '[]'::jsonb,
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_public_profiles_handle_format
    check (handle ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  constraint person_public_profiles_display_name_length
    check (char_length(display_name) between 1 and 120),
  constraint person_public_profiles_headline_length
    check (char_length(headline) <= 160),
  constraint person_public_profiles_bio_length
    check (char_length(bio) <= 2000),
  constraint person_public_profiles_links_array
    check (jsonb_typeof(links) = 'array'),
  constraint person_public_profiles_visibility
    check (visibility in ('private','public'))
);

create unique index if not exists person_public_profiles_handle_uidx
  on public.person_public_profiles (lower(handle));

create index if not exists person_public_profiles_public_updated_idx
  on public.person_public_profiles (updated_at desc)
  where visibility = 'public';

alter table public.person_public_profiles enable row level security;

revoke all on table public.person_public_profiles from public, anon, authenticated;
grant select (handle, display_name, headline, bio, links, visibility, updated_at)
  on public.person_public_profiles to anon, authenticated;

drop policy if exists person_public_profiles_read_published on public.person_public_profiles;
create policy person_public_profiles_read_published
  on public.person_public_profiles
  for select
  to anon, authenticated
  using (visibility = 'public');

comment on table public.person_public_profiles is
  'Public-only person projection. Writes are service-role mediated by profile-api; My EKODI remains the sole management surface.';
