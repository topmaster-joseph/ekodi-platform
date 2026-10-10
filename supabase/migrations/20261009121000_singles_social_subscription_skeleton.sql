-- EKODI Singles: social + subscription skeleton, DEV first. No user discovery or billing activated.
-- Do not enable paid flows before required Korean matchmaking registration/legal review.
alter table public.singles_memberships drop constraint if exists singles_memberships_discoverable_check;
alter table public.singles_memberships
  add constraint singles_discovery_requires_verified_adult check (
    not discoverable or
    (status='active' and adult_verified_at is not null and age_19_confirmed and base_consent and religion_consent)
  );
create table if not exists public.singles_profiles (
  user_id uuid primary key references public.singles_memberships(user_id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 32),
  broad_region text not null default '' check (char_length(broad_region)<=40),
  intro text not null default '' check (char_length(intro)<=400),
  updated_at timestamptz not null default now()
);
create table if not exists public.singles_events (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id),
  title text not null check(char_length(title) between 3 and 120),
  summary text not null default '' check(char_length(summary)<=350),
  description text not null default '' check(char_length(description)<=5000),
  region text not null default '' check(char_length(region)<=80),
  starts_at timestamptz not null,
  capacity integer check(capacity between 1 and 500),
  state text not null default 'draft' check(state in ('draft','published','cancelled')),
  created_at timestamptz not null default now()
);
create table if not exists public.singles_event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.singles_events(id) on delete cascade,
  user_id uuid not null references public.singles_memberships(user_id) on delete cascade,
  status text not null default 'requested' check(status in ('requested','approved','cancelled','rejected')),
  created_at timestamptz not null default now(),
  unique(event_id,user_id)
);
create table if not exists public.singles_entitlements (
  user_id uuid primary key references public.singles_memberships(user_id) on delete cascade,
  tier text not null check(tier in ('plus')),
  status text not null check(status in ('active','past_due','cancelled','expired')),
  source text not null check(source='verified_central_billing'),
  receipt_id text not null check(char_length(receipt_id)>=16),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
comment on table public.singles_entitlements is
'Only central billing verified webhook/authorized orchestrator may write; never from client. Payment activation disabled by flags.';
create table if not exists public.singles_interests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.singles_memberships(user_id),
  to_user_id uuid not null references public.singles_memberships(user_id),
  status text not null default 'pending' check(status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(from_user_id,to_user_id),
  check(from_user_id<>to_user_id)
);
create table if not exists public.singles_messages (
  id uuid primary key default gen_random_uuid(),
  interest_id uuid not null references public.singles_interests(id) on delete cascade,
  sender_id uuid not null references public.singles_memberships(user_id),
  body text not null check(char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists singles_messages_thread_idx on public.singles_messages(interest_id,created_at);
create table if not exists public.singles_blocks (
  blocker_id uuid not null references public.singles_memberships(user_id) on delete cascade,
  blocked_id uuid not null references public.singles_memberships(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id<>blocked_id)
);
-- All personal tables are server-owned: no direct anon or authenticated privileges, RLS on.
alter table public.singles_profiles enable row level security;
alter table public.singles_events enable row level security;
alter table public.singles_event_rsvps enable row level security;
alter table public.singles_entitlements enable row level security;
alter table public.singles_interests enable row level security;
alter table public.singles_messages enable row level security;
alter table public.singles_blocks enable row level security;
revoke all on table public.singles_profiles,public.singles_events,public.singles_event_rsvps,
 public.singles_entitlements,public.singles_interests,public.singles_messages,public.singles_blocks
 from public,anon,authenticated;
grant select,insert,update,delete on table public.singles_profiles,public.singles_events,
 public.singles_event_rsvps,public.singles_interests,public.singles_messages,public.singles_blocks to service_role;
grant select,insert,update,delete on table public.singles_entitlements to service_role;
