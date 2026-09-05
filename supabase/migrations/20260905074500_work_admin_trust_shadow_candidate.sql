-- Work Admin Trust candidate slice
-- Observes service-level admin mutations without changing the verified-admin live authority.
-- Kept as draft until every existing Trust observer resolves policies by explicit coverage.

insert into public.trust_policy_versions (
  policy_version,
  capability_schema_version,
  projection_version,
  status,
  config,
  description
) values (
  'trust_policy_v3',
  'capability_schema_v2',
  'projection_v1',
  'draft',
  jsonb_build_object(
    'mode', 'candidate-shadow',
    'generic_evaluator_compatible', false,
    'coverage', jsonb_build_array(
      jsonb_build_object(
        'services', jsonb_build_array('work'),
        'resources', jsonb_build_array('work-admin'),
        'actions', jsonb_build_array('job.moderate', 'organization.verify')
      )
    ),
    'rules', jsonb_build_array(
      jsonb_build_object(
        'id', 'work-admin-service-operate',
        'priority', 100,
        'services', jsonb_build_array('work'),
        'resources', jsonb_build_array('work-admin'),
        'actions', jsonb_build_array('job.moderate', 'organization.verify'),
        'requiredCapabilities', jsonb_build_array('service:operate'),
        'allow', true,
        'capabilities', jsonb_build_array('service:operate'),
        'projectionProfile', 'safe-admin'
      )
    ),
    'authority_source', 'api-session-authority',
    'authoritative_source', 'legacy',
    'cutover_allowed', false
  ),
  'Draft Trust candidate for work-admin-api job moderation and organization verification. Existing verified-admin authorization remains authoritative while service:operate parity is measured.'
)
on conflict (policy_version) do nothing;
