-- Access API Trust migration slice
-- Adds independent candidate policy only for access-request review actions.
-- Legacy authorization remains authoritative; RLS/RPC defenses are unchanged.

insert into public.trust_policy_versions (
  policy_version,
  capability_schema_version,
  projection_version,
  status,
  config,
  description
) values (
  'trust_policy_v2',
  'capability_schema_v2',
  'projection_v1',
  'shadow',
  jsonb_build_object(
    'mode', 'candidate-shadow',
    'generic_evaluator_compatible', false,
    'coverage', jsonb_build_array(
      jsonb_build_object(
        'services', jsonb_build_array('*'),
        'resources', jsonb_build_array('access-request'),
        'actions', jsonb_build_array('pending.read', 'review')
      )
    ),
    'rules', jsonb_build_array(
      jsonb_build_object(
        'id', 'access-request-pending-read-reviewer',
        'priority', 100,
        'services', jsonb_build_array('*'),
        'resources', jsonb_build_array('access-request'),
        'actions', jsonb_build_array('pending.read'),
        'rolesAny', jsonb_build_array('tenant_admin', 'platform_admin'),
        'allow', true,
        'capabilities', jsonb_build_array('workspace:access.read'),
        'projectionProfile', 'safe-admin'
      ),
      jsonb_build_object(
        'id', 'access-request-review-reviewer',
        'priority', 100,
        'services', jsonb_build_array('*'),
        'resources', jsonb_build_array('access-request'),
        'actions', jsonb_build_array('review'),
        'rolesAny', jsonb_build_array('tenant_admin', 'platform_admin'),
        'allow', true,
        'capabilities', jsonb_build_array('workspace:access.review'),
        'projectionProfile', 'safe-admin'
      )
    ),
    'authoritative_source', 'legacy',
    'cutover_allowed', false
  ),
  'Candidate Trust policy for access-api pending/review actions. Legacy tenantReviewer remains authoritative while parity is measured.'
)
on conflict (policy_version) do nothing;
