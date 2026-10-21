-- EKODI Jubilee operational ledger
-- Stores policy and support execution evidence without classifying or labeling people.
-- Browser roles intentionally have no direct access. Controlled server-side gateways
-- use the service role and must keep beneficiary identity outside these tables.

create table if not exists public.jubilee_policy_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  request_id text not null unique,
  workspace_id text,
  purpose text not null default 'recommendation',
  policy_version text not null,
  decision_status text not null check (decision_status in ('ready','needs_more_options','blocked')),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  choice_count integer not null default 0 check (choice_count >= 0),
  support_action_count integer not null default 0 check (support_action_count >= 0),
  external_alternative_lookup_required boolean not null default false,
  human_review_required boolean not null default false,
  rules_triggered jsonb not null default '[]'::jsonb,
  warning_count integer not null default 0 check (warning_count >= 0),
  actor_ref_hash text,
  created_at timestamptz not null default now(),
  constraint jubilee_policy_events_rules_array check (jsonb_typeof(rules_triggered) = 'array')
);

create index if not exists jubilee_policy_events_time_idx
  on public.jubilee_policy_events(occurred_at desc);
create index if not exists jubilee_policy_events_workspace_time_idx
  on public.jubilee_policy_events(workspace_id, occurred_at desc);
create index if not exists jubilee_policy_events_review_idx
  on public.jubilee_policy_events(human_review_required, occurred_at desc)
  where human_review_required = true;

create table if not exists public.jubilee_support_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  request_id text,
  workspace_id text,
  support_ref uuid not null default gen_random_uuid(),
  action_code text not null check (action_code in (
    'consider_fee_waiver',
    'consider_jubilee_credit',
    'show_lower_cost_alternatives',
    'priority_access_review',
    'offer_assisted_channel',
    'offer_language_support',
    'offer_remote_or_accessible_option',
    'offer_low_friction_or_assisted_channel',
    'offer_async_or_flexible_option'
  )),
  delivery_status text not null default 'offered' check (delivery_status in ('offered','accepted','delivered','declined','expired','cancelled')),
  policy_version text not null,
  executed_by text,
  created_at timestamptz not null default now(),
  unique (support_ref, action_code)
);

create index if not exists jubilee_support_events_time_idx
  on public.jubilee_support_events(occurred_at desc);
create index if not exists jubilee_support_events_workspace_time_idx
  on public.jubilee_support_events(workspace_id, occurred_at desc);
create index if not exists jubilee_support_events_request_idx
  on public.jubilee_support_events(request_id)
  where request_id is not null;

create table if not exists public.jubilee_pool_entries (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  workspace_id text,
  entry_type text not null check (entry_type in ('platform_allocation','voluntary_contribution','partner_cofunding','support_commitment','support_release','reversal')),
  purpose text not null check (purpose in ('access_support','fee_relief','community_reinvestment','connection_support')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'KRW' check (currency ~ '^[A-Z]{3}$'),
  support_ref uuid,
  reference text,
  policy_version text not null,
  created_by text,
  created_at timestamptz not null default now(),
  constraint jubilee_pool_support_reference_rule check (
    (entry_type in ('support_commitment','support_release','reversal') and support_ref is not null)
    or (entry_type in ('platform_allocation','voluntary_contribution','partner_cofunding'))
  )
);

create index if not exists jubilee_pool_entries_time_idx
  on public.jubilee_pool_entries(occurred_at desc);
create index if not exists jubilee_pool_entries_workspace_time_idx
  on public.jubilee_pool_entries(workspace_id, occurred_at desc);
create index if not exists jubilee_pool_entries_support_idx
  on public.jubilee_pool_entries(support_ref)
  where support_ref is not null;

create or replace view public.jubilee_pool_balance_v1 as
select
  currency,
  sum(
    case
      when entry_type in ('platform_allocation','voluntary_contribution','partner_cofunding','support_release') then amount_minor
      when entry_type in ('support_commitment','reversal') then -amount_minor
      else 0
    end
  )::bigint as balance_minor,
  max(occurred_at) as updated_at
from public.jubilee_pool_entries
group by currency;

alter table public.jubilee_policy_events enable row level security;
alter table public.jubilee_support_events enable row level security;
alter table public.jubilee_pool_entries enable row level security;

revoke all on table public.jubilee_policy_events from anon, authenticated;
revoke all on table public.jubilee_support_events from anon, authenticated;
revoke all on table public.jubilee_pool_entries from anon, authenticated;
revoke all on table public.jubilee_pool_balance_v1 from anon, authenticated;

comment on table public.jubilee_policy_events is
  'Privacy-minimized Jubilee policy audit. Never store request bodies, sensitive traits, need signals, vulnerability labels, or beneficiary identity.';
comment on table public.jubilee_support_events is
  'Operational support-action evidence using opaque support_ref values. Beneficiary identity and need reason must remain outside this table.';
comment on table public.jubilee_pool_entries is
  'Append-oriented Jubilee Pool accounting entries. Do not store beneficiary identity or sensitive support reasons.';
comment on view public.jubilee_pool_balance_v1 is
  'Aggregate Jubilee Pool balance by currency. Internal service-role use only.';
