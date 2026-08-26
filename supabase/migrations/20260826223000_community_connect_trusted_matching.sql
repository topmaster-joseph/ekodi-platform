-- EKODI Connect: consent-first trusted matching inside EKODI Community.
-- Direct browser access is denied. The authenticated connect-api is the only v1 write/read path.

create table if not exists public.community_connect_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  intents text[] not null default '{}',
  relationship_values text[] not null default '{}',
  life_priorities text[] not null default '{}',
  conversation_style text not null default '',
  discoverable boolean not null default false,
  marriage_enabled boolean not null default false,
  consent_version text not null default '2026-08-26-v1',
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_connect_profiles_intents_allowed check (
    intents <@ array['friend','colleague','mentor','collaborator','marriage']::text[]
  ),
  constraint community_connect_profiles_values_limit check (cardinality(relationship_values) <= 12),
  constraint community_connect_profiles_priorities_limit check (cardinality(life_priorities) <= 12),
  constraint community_connect_profiles_style_limit check (char_length(conversation_style) <= 120),
  constraint community_connect_marriage_requires_intent check (
    marriage_enabled = false or 'marriage' = any(intents)
  )
);

comment on table public.community_connect_profiles is
  'Private-by-default EKODI Connect consent and self-declared matching preferences. No inferred sensitive traits.';

create table if not exists public.community_connect_actions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  intent text not null,
  action text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_connect_action_not_self check (actor_user_id <> target_user_id),
  constraint community_connect_action_intent_allowed check (
    intent = any(array['friend','colleague','mentor','collaborator','marriage']::text[])
  ),
  constraint community_connect_action_allowed check (
    action = any(array['interested','pass','withdrawn']::text[])
  ),
  unique(actor_user_id, target_user_id, intent)
);

create table if not exists public.community_connect_matches (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references auth.users(id) on delete cascade,
  user_b_id uuid not null references auth.users(id) on delete cascade,
  intent text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint community_connect_match_not_self check (user_a_id <> user_b_id),
  constraint community_connect_match_intent_allowed check (
    intent = any(array['friend','colleague','mentor','collaborator','marriage']::text[])
  ),
  constraint community_connect_match_status_allowed check (
    status = any(array['active','closed']::text[])
  )
);

create unique index if not exists community_connect_matches_pair_intent_uidx
  on public.community_connect_matches (least(user_a_id,user_b_id), greatest(user_a_id,user_b_id), intent);

create table if not exists public.community_connect_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key(blocker_user_id, blocked_user_id),
  constraint community_connect_block_not_self check (blocker_user_id <> blocked_user_id),
  constraint community_connect_block_reason_limit check (char_length(reason) <= 300)
);

create table if not exists public.community_connect_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  detail text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint community_connect_report_not_self check (reporter_user_id <> target_user_id),
  constraint community_connect_report_category_allowed check (
    category = any(array['spam','harassment','false_profile','unsafe','other']::text[])
  ),
  constraint community_connect_report_status_allowed check (
    status = any(array['open','reviewing','resolved','dismissed']::text[])
  ),
  constraint community_connect_report_detail_limit check (char_length(detail) <= 1200)
);

create index if not exists community_connect_profiles_discovery_idx
  on public.community_connect_profiles(discoverable, updated_at desc);
create index if not exists community_connect_actions_target_idx
  on public.community_connect_actions(target_user_id, intent, action);
create index if not exists community_connect_matches_user_a_idx
  on public.community_connect_matches(user_a_id, status, created_at desc);
create index if not exists community_connect_matches_user_b_idx
  on public.community_connect_matches(user_b_id, status, created_at desc);
create index if not exists community_connect_reports_status_idx
  on public.community_connect_reports(status, created_at desc);

alter table public.community_connect_profiles enable row level security;
alter table public.community_connect_actions enable row level security;
alter table public.community_connect_matches enable row level security;
alter table public.community_connect_blocks enable row level security;
alter table public.community_connect_reports enable row level security;

-- v1 uses a server-side service-role Edge Function after JWT validation.
-- Do not expose these private relationship tables directly to browser roles.
revoke all on table public.community_connect_profiles from anon, authenticated;
revoke all on table public.community_connect_actions from anon, authenticated;
revoke all on table public.community_connect_matches from anon, authenticated;
revoke all on table public.community_connect_blocks from anon, authenticated;
revoke all on table public.community_connect_reports from anon, authenticated;

grant all on table public.community_connect_profiles to service_role;
grant all on table public.community_connect_actions to service_role;
grant all on table public.community_connect_matches to service_role;
grant all on table public.community_connect_blocks to service_role;
grant all on table public.community_connect_reports to service_role;
