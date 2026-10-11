-- EKODI Presence: additive offline-first attendance staging.
-- No biometric templates, facial embeddings, or automatic face matching.
-- Tables are service-role-only; caller authorization MUST be enforced by API layer.
create schema if not exists presence_private;

create table if not exists presence_private.people (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  display_name text,
  member_ref uuid,
  central_person_id uuid references public.people(id) on delete set null,
  identity_status text not null default 'unverified' check (identity_status in ('unverified','verified','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presence_people_name_length check (display_name is null or char_length(display_name) between 1 and 120),
  unique (tenant_id,id)
);

create table if not exists presence_private.sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  external_meeting_ref text,
  title text not null,
  starts_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','open','closed','cancelled')),
  created_at timestamptz not null default now(),
  unique (tenant_id,id)
);

-- Anonymous group headcounts are NOT individual identities.
create table if not exists presence_private.headcounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null,
  observed_at timestamptz not null default now(),
  count_estimate integer not null check (count_estimate >= 0),
  method text not null check (method in ('manual','camera_aggregate')),
  source_note text,
  foreign key (tenant_id,session_id) references presence_private.sessions(tenant_id,id) on delete cascade
);

-- Unidentified observation tokens are scoped to ONE session, never cross-session tracked.
create table if not exists presence_private.observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null,
  origin text not null check (origin in ('staff','self_checkin','qr','nfc')),
  provisional_label text,
  state text not null default 'pending' check (state in ('pending','linked','discarded')),
  person_id uuid,
  observed_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  foreign key (tenant_id,session_id) references presence_private.sessions(tenant_id,id) on delete cascade,
  foreign key (tenant_id,person_id) references presence_private.people(tenant_id,id),
  unique (tenant_id,id),
  check ((state='linked' and person_id is not null and resolved_at is not null) or (state<>'linked' and person_id is null))
);

create table if not exists presence_private.attendances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null,
  person_id uuid not null,
  channel text not null check (channel in ('onsite','online')),
  status text not null default 'present' check (status in ('present','late','excused','retracted')),
  verification_method text not null check (verification_method in ('self_checkin','staff_verified','qr','nfc')),
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null,
  observation_id uuid unique,
  unique (tenant_id,session_id,person_id,channel),
  foreign key (tenant_id,session_id) references presence_private.sessions(tenant_id,id) on delete cascade,
  foreign key (tenant_id,person_id) references presence_private.people(tenant_id,id),
  foreign key (tenant_id,observation_id) references presence_private.observations(tenant_id,id)
);

create table if not exists presence_private.audit_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  subject_id uuid,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create unique index if not exists presence_sessions_external_key on presence_private.sessions(tenant_id,external_meeting_ref) where external_meeting_ref is not null;
create unique index if not exists presence_people_central_identity on presence_private.people(tenant_id,central_person_id) where central_person_id is not null;

create table if not exists presence_private.requests (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  fingerprint text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(tenant_id,request_id)
);

create index if not exists presence_sessions_scope_idx on presence_private.sessions(tenant_id,starts_at desc);
create index if not exists presence_obs_pending_idx on presence_private.observations(tenant_id,session_id,state);
create index if not exists presence_attendance_person_idx on presence_private.attendances(tenant_id,person_id,recorded_at desc);
create index if not exists presence_audit_scope_idx on presence_private.audit_events(tenant_id,occurred_at desc);

-- Defense in depth: no client role can directly read/write these tables.
do $$ declare t text; begin
  foreach t in array array['people','sessions','headcounts','observations','attendances','audit_events','requests'] loop
    execute format('alter table presence_private.%I enable row level security', t);
    execute format('revoke all on presence_private.%I from public,anon,authenticated',t);
    execute format('grant all on presence_private.%I to service_role',t);
  end loop;
end $$;
revoke all on schema presence_private from public,anon,authenticated;
grant usage on schema presence_private to service_role;
revoke all on sequence presence_private.audit_events_id_seq from public,anon,authenticated;
grant usage, select on sequence presence_private.audit_events_id_seq to service_role;
comment on schema presence_private is 'Tenant-scoped attendance staging; only authorized backend may reconcile verified identities. Never identify people from video alone.';