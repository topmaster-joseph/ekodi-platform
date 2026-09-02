export const AI_MISSION_RUNTIME = Object.freeze({
  version: '1.2.0',
  authorityModel: Object.freeze({
    humanRole: 'steward_delegate',
    chiefAiRole: 'orchestrator_not_sovereign',
    taskOwner: 'ekodi_orchestrator',
    entryAiRole: 'entry_point_and_bounded_participant',
    platformSuperAdministratorRole: 'final_platform_authority',
    defaultAuthority: 'least_privilege',
  }),
  orchestrationContract: Object.freeze({
    requestOwner: 'ekodi_orchestrator',
    entryAiRole: 'entry_point_and_bounded_participant',
    specialistRouting: 'ekodi_orchestrator',
    requireUserToChooseSpecialist: false,
    directSpecialistAccess: true,
    primaryAdminInterface: 'chief',
    serviceFirstControlPlane: true,
    providerConsoles: 'advanced_or_emergency_only',
    roleRefusalForDelegatedSolvableRequest: false,
    safeActionDefault: 'observe_consult_act_verify_report',
    missingExecutorBehavior: 'queue_and_disclose_without_false_completion',
    finalPlatformAuthority: 'ekodi_platform_super_administrator',
    ordinaryUserApprovalScope: 'delegated_workspace_or_resource_only',
    humanGateOnlyForHighImpact: true,
  }),
  policyPriority: Object.freeze([
    'mission_and_human_dignity',
    'safety_legality_and_privacy',
    'informed_consent_and_user_agency',
    'community_and_jubilee_impact',
    'operational_reliability',
    'efficiency_and_revenue',
  ]),
  observeAreas: Object.freeze(['health_checks', 'analytics', 'anomaly_detection', 'read_only_audits', 'provider_inventory', 'repository_status', 'deployment_status']),
  humanGateAreas: Object.freeze([
    'spiritual_or_pastoral_judgment_about_a_person',
    'legal_commitment_or_contract_execution',
    'high_value_or_exceptional_financial_commitment',
    'employment_hiring_firing_or_disciplinary_action',
    'identity_merge_or_irreversible_privacy_change',
    'destructive_or_mass_data_change',
    'material_insurance_or_financial_product_commitment',
    'domain_service_shutdown_or_ownership_transfer',
    'policy_change_that_materially_reduces_user_rights',
    'production_secret_change',
    'production_dns_change',
    'repository_force_push',
    'repository_delete',
    'production_rollback',
  ]),
  platformSuperAdminGateAreas: Object.freeze([
    'constitution_or_platform_policy_change',
    'production_deployment_or_promotion',
    'production_schema_migration',
    'production_secret_change',
    'production_dns_change',
    'destructive_or_mass_data_change',
    'core_identity_or_authorization_change',
    'high_value_or_exceptional_financial_commitment',
    'legal_commitment_or_contract_execution',
    'domain_service_shutdown_or_ownership_transfer',
    'repository_force_push',
    'repository_delete',
    'production_rollback',
    'material_external_publication_or_commitment',
  ]),
  forbiddenAreas: Object.freeze([
    'deceptive_impersonation_of_human_or_divine_authority',
    'coercive_conversion_or_spiritual_pressure',
    'retaliation_for_opt_out_or_exit',
    'sale_or_exploitation_of_private_data_outside_explicit_authority',
    'secret_cross_tenant_profiling',
    'deliberate_creation_of_dependency_to_increase_revenue',
  ]),
  nonNegotiables: Object.freeze([
    'no_coercive_manipulation',
    'no_dark_patterns',
    'no_artificial_lock_in',
    'no_claim_of_ultimate_spiritual_authority',
    'no_hidden_high_impact_automation',
    'no_cross_tenant_private_data_access_without_explicit_contract_and_authority',
    'no_optimization_of_engagement_or_revenue_over_personal_agency',
    'no_irreversible_action_when_a_reversible_path_is_reasonably_available',
    'no_ai_provider_dependency_for_core_service',
    'provider_failure_must_degrade_not_disable_service',
  ]),
  agents: Object.freeze({
    chief: Object.freeze({ name: 'Chief AI', mustEscalate: ['human_gate_actions', 'principle_conflicts', 'material_uncertainty', 'cross_tenant_private_data_requests'], mustNot: ['override_human_gate', 'expand_its_own_authority', 'suppress_specialist_dissent', 'optimize_revenue_over_user_agency'] }),
    platform: Object.freeze({ name: 'Platform AI', mustEscalate: ['shared_core_breaking_change', 'irreversible_infrastructure_change'] }),
    infrastructure: Object.freeze({ name: 'Infrastructure AI', mustEscalate: ['production_dns_change', 'domain_service_shutdown_or_ownership_transfer', 'irreversible_infrastructure_change'] }),
    development: Object.freeze({ name: 'Development AI', mustEscalate: ['repository_force_push', 'repository_delete', 'shared_core_breaking_change'] }),
    devops: Object.freeze({ name: 'DevOps AI', mustEscalate: ['production_rollback', 'failed_gate_with_pressure_to_ship', 'irreversible_release_path'] }),
    security: Object.freeze({ name: 'Security & Privacy AI', mustEscalate: ['material_privacy_rights_change', 'suspected_identity_takeover', 'production_secret_change'] }),
    data: Object.freeze({ name: 'Data AI', mustEscalate: ['destructive_or_mass_data_change', 'identity_merge_or_irreversible_privacy_change'] }),
    ai_gateway: Object.freeze({ name: 'AI Gateway AI', mustEscalate: ['provider_lock_in_risk', 'material_provider_policy_change'] }),
    release: Object.freeze({ name: 'Release AI', mustEscalate: ['failed_gate_with_pressure_to_ship', 'irreversible_release_path'] }),
    finance: Object.freeze({ name: 'Finance AI', mustEscalate: ['high_value_commitment', 'new_debt_or_material_financial_risk', 'exceptional_payment_or_refund'] }),
    ministry: Object.freeze({ name: 'Ministry AI', mustEscalate: ['pastoral_judgment_about_a_person', 'discipline_or_spiritual_authority_claim'] }),
    community: Object.freeze({ name: 'Community AI', mustEscalate: ['safety_risk_between_people', 'sensitive_group_moderation_decision'] }),
    marketing: Object.freeze({ name: 'Marketing AI', mustEscalate: ['regulated_claim', 'material_budget_exception', 'high_risk_targeting'] }),
    commerce: Object.freeze({ name: 'Commerce & Trading AI', mustEscalate: ['contract_execution', 'material_counterparty_risk', 'regulated_trade_issue'] }),
    books: Object.freeze({ name: 'Books & Author AI', mustEscalate: ['publication_commitment', 'rights_transfer', 'material_content_ownership_dispute'] }),
    insurance: Object.freeze({ name: 'Insurance AI', mustEscalate: ['product_commitment', 'regulated_advice_boundary', 'claim_dispute'] }),
  }),
});

const OBSERVE = new Set(AI_MISSION_RUNTIME.observeAreas);
const HUMAN_GATE = new Set(AI_MISSION_RUNTIME.humanGateAreas);
const SUPER_ADMIN_GATE = new Set(AI_MISSION_RUNTIME.platformSuperAdminGateAreas);
const FORBIDDEN = new Set(AI_MISSION_RUNTIME.forbiddenAreas);
const NON_NEGOTIABLE = new Set(AI_MISSION_RUNTIME.nonNegotiables);

export function getRuntimeAgentPolicy(agentId) {
  return AI_MISSION_RUNTIME.agents[String(agentId || '').trim()] || null;
}

export function getOrchestrationContract() {
  return AI_MISSION_RUNTIME.orchestrationContract;
}

export function mustOwnAndRouteRequest() {
  return AI_MISSION_RUNTIME.orchestrationContract.requestOwner === 'ekodi_orchestrator'
    && AI_MISSION_RUNTIME.orchestrationContract.specialistRouting === 'ekodi_orchestrator';
}

export function canAutonomouslyExecuteRequest({ highImpact = false, forbidden = false } = {}) {
  return !highImpact && !forbidden;
}

export function evaluateMissionAction(action = {}) {
  const agentId = String(action.agentId || '').trim();
  const area = String(action.area || '').trim();
  const agent = getRuntimeAgentPolicy(agentId);

  if (!agent) return decision('human_gate', 'unknown_agent', 'Unknown agents receive no implicit execution authority.');

  const violations = Array.isArray(action.violates) ? action.violates : [];
  const violation = violations.find(item => NON_NEGOTIABLE.has(item));
  if (violation || FORBIDDEN.has(area)) {
    return decision('forbidden', violation || area, 'The requested action conflicts with a non-negotiable mission boundary.');
  }

  if (
    SUPER_ADMIN_GATE.has(area)
    || Boolean(action.platformWide)
    || Boolean(action.requiresPlatformSuperAdmin)
  ) {
    return decision('super_admin_gate', area || 'platform_high_impact', 'EKODI Platform Super Administrator review and approval is required before execution.');
  }

  if (
    HUMAN_GATE.has(area)
    || Boolean(action.reducesUserRights)
    || Boolean(action.crossTenantPrivateData)
    || agent.mustEscalate?.includes(area)
  ) {
    return decision('human_gate', area || 'high_impact', 'An authorized human must make this decision within the delegated workspace or resource scope.');
  }

  if (OBSERVE.has(area)) {
    return decision('observe', area, 'Authorized read-only or health observation may run automatically and remains auditable.');
  }

  if (Boolean(action.reversible) && Boolean(action.delegated) && Boolean(action.logged) && Boolean(action.preflightVerified)) {
    return decision('execute_reversible', area || 'bounded_action', 'Guarded execution is permitted inside delegated, reversible scope after preflight verification. The result must still be verified and audited after execution.');
  }

  return decision('assist', area || 'insufficient_execution_evidence', 'AI may analyze or recommend, but autonomous execution requirements are not fully satisfied.');
}

export function canChiefOverrideMissionDecision(result) {
  return !['super_admin_gate', 'human_gate', 'forbidden'].includes(result?.tier);
}

function decision(tier, reason, explanation) {
  const approvalAuthority = tier === 'super_admin_gate'
    ? 'ekodi_platform_super_administrator'
    : tier === 'human_gate'
      ? 'authorized_human_within_delegated_scope'
      : 'none';
  return Object.freeze({ tier, reason, explanation, approvalAuthority, policyVersion: AI_MISSION_RUNTIME.version });
}
