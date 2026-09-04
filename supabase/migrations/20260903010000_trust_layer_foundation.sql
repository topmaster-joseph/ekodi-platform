-- EKODI Trust Layer foundation
-- Shadow-only transition infrastructure. This migration does not replace existing
-- Identity, Access, Workspace authorization, RPC enforcement, or RLS.

create table if not exists public.trust_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_version text not null unique,
  capability_schema_version text not null,
  projection_version text not null,
  status text not null check (status in ('draft','shadow','active','retired')),
  config jsonb not null default '{}'::jsonb,
  description text,
  created_by uuid,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create index if not exists trust_policy_versions_status_created_idx
  on public.trust_policy_versions(status, created_at desc);

create table if not exists public.trust_projection_profiles (
  profile_key text primary key,
  projection_version text not null,
  description text not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trust_shadow_decisions (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  subject_hash text not null,
  workspace_id text,
  service text not null,
  resource text not null,
  action text not null,
  purpose text,
  risk text not null check (risk in ('low','medium','high','critical')),
  legacy_allowed boolean not null,
  trust_allowed boolean not null,
  effective_allowed boolean not null,
  parity boolean not null,
  severity text not null check (severity in ('ok','review','critical')),
  policy_version text not null,
  capability_schema_version text not null,
  projection_version text not null,
  projection_profile text not null,
  rule_id text not null,
  context_summary jsonb not null default '{}'::jsonb
);

create index if not exists trust_shadow_decisions_occurred_idx
  on public.trust_shadow_decisions(occurred_at desc);
create index if not exists trust_shadow_decisions_parity_idx
  on public.trust_shadow_decisions(parity, severity, occurred_at desc);
create index if not exists trust_shadow_decisions_scope_idx
  on public.trust_shadow_decisions(service, workspace_id, occurred_at desc);

alter table public.trust_policy_versions enable row level security;
alter table public.trust_projection_profiles enable row level security;
alter table public.trust_shadow_decisions enable row level security;

-- Intentional deny-direct posture. These tables are internal Trust Layer state.
-- Controlled server-side gateways use the service role. No permissive browser policy.
revoke all on table public.trust_policy_versions from anon, authenticated;
revoke all on table public.trust_projection_profiles from anon, authenticated;
revoke all on table public.trust_shadow_decisions from anon, authenticated;

insert into public.trust_policy_versions (
  policy_version,
  capability_schema_version,
  projection_version,
  status,
  config,
  description
) values (
  'trust_policy_v1',
  'capability_schema_v1',
  'projection_v1',
  'shadow',
  jsonb_build_object(
    'mode', 'compatibility',
    'rules', '[]'::jsonb,
    'authoritative_source', 'legacy',
    'cutover_allowed', false
  ),
  'Initial EKODI Trust Layer shadow policy. Mirrors current authorization until independent rules are validated.'
)
on conflict (policy_version) do nothing;

insert into public.trust_projection_profiles (profile_key, projection_version, description, config)
values
  ('user-self', 'projection_v1', 'Minimum self-service user projection.', jsonb_build_object('deny_secrets', true, 'export_separate_capability', true)),
  ('workspace-member', 'projection_v1', 'Minimum workspace member projection.', jsonb_build_object('deny_secrets', true, 'tenant_scoped', true, 'export_separate_capability', true)),
  ('safe-admin', 'projection_v1', 'Administrative projection without reusable secrets or raw infrastructure details.', jsonb_build_object('deny_secrets', true, 'raw_diagnostics', false, 'export_separate_capability', true)),
  ('experience', 'projection_v1', 'Sanitized experience/demo projection using safe or synthetic data only.', jsonb_build_object('deny_secrets', true, 'synthetic_preferred', true, 'source_details', false)),
  ('external-AI', 'projection_v1', 'Purpose-bound minimum projection for external AI providers.', jsonb_build_object('deny_secrets', true, 'pseudonymize_subjects', true, 'topology', false)),
  ('agent-task', 'projection_v1', 'Task-scoped projection for operational agents.', jsonb_build_object('deny_secrets', true, 'task_scoped', true, 'expires', true))
on conflict (profile_key) do update
set projection_version = excluded.projection_version,
    description = excluded.description,
    config = excluded.config,
    updated_at = now();

comment on table public.trust_policy_versions is
  'Versioned EKODI Trust Layer policy metadata. Browser roles intentionally have no direct access.';
comment on table public.trust_projection_profiles is
  'Purpose-bound secure projection profiles. Browser roles intentionally have no direct access.';
comment on table public.trust_shadow_decisions is
  'Minimum-data shadow comparison audit. Does not store request bodies, credentials, or reusable secrets.';
