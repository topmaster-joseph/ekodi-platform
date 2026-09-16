-- EKODI Activity Engine: reusable workspace-owned activities/events
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  activity_type text not null default 'event',
  title text not null,
  summary text,
  starts_at timestamptz,
  ends_at timestamptz,
  venue text,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'draft' check (status in ('draft','review','published','closed','archived')),
  visibility text not null default 'private' check (visibility in ('private','workspace','public')),
  registration_open boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_registrations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  person_id uuid default auth.uid(),
  display_name text not null,
  contact text,
  party_size integer not null default 1 check (party_size > 0),
  language text,
  dietary_notes text,
  support_notes text,
  media_consent text not null default 'confirm_on_site' check (media_consent in ('yes','confirm_on_site','no')),
  status text not null default 'registered' check (status in ('registered','waitlist','confirmed','attended','cancelled','no_show')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activities_workspace_idx on public.activities(workspace_id, starts_at desc);
create index if not exists activity_registrations_activity_idx on public.activity_registrations(activity_id, created_at);

alter table public.activities enable row level security;
alter table public.activity_registrations enable row level security;

-- Public discovery is explicit: both published and public are required.
drop policy if exists activities_public_read on public.activities;
create policy activities_public_read on public.activities for select using (status = 'published' and visibility = 'public');

-- Authenticated creators can manage their own drafts. Workspace authority can be
-- layered by the existing workspace authorization service without centralizing tenant data.
drop policy if exists activities_creator_manage on public.activities;
create policy activities_creator_manage on public.activities for all to authenticated
using (created_by = auth.uid()) with check (created_by = auth.uid());

-- Registration is permitted only for explicitly published/open activities.
drop policy if exists activity_registration_create on public.activity_registrations;
create policy activity_registration_create on public.activity_registrations for insert to anon, authenticated
with check (exists (select 1 from public.activities a where a.id = activity_id and a.status='published' and a.registration_open));

drop policy if exists activity_registration_self_read on public.activity_registrations;
create policy activity_registration_self_read on public.activity_registrations for select to authenticated
using (person_id = auth.uid());

comment on table public.activities is 'Reusable workspace-owned Activity Engine; event is one activity_type. Private/draft by default.';
comment on table public.activity_registrations is 'Activity registration lifecycle; tenant-owned records remain outside central admin.';