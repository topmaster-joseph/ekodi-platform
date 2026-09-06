const freezeList = values => Object.freeze([...values]);

export const SOVEREIGN_AUTONOMY_POLICY = Object.freeze({
  version: '1.8.1',
  hierarchy: freezeList(['sovereign', 'autonomous', 'agentic', 'services']),
  authorityContext: 'Person + Workspace + Role + Capability',
  finalHumanAuthority: 'ekodi_platform_super_administrator',
  autonomyLoop: freezeList(['observe', 'detect', 'reason', 'plan', 'execute', 'verify', 'recover', 'learn']),
  executionClasses: Object.freeze({
    green: Object.freeze({
      description: 'Parallel-safe surface and reversible operational work.',
      areas: freezeList([
        'ui', 'content', 'documentation', 'knowledge', 'agent_prompt', 'tenant_presentation',
        'health_checks', 'analytics', 'read_only_audits', 'observability', 'service_catalog',
      ]),
      requirement: 'delegated + reversible + audited + preflight verified',
    }),
    yellow: Object.freeze({
      description: 'Contract-sensitive work that may proceed only inside an explicit bounded interface.',
      areas: freezeList([
        'service_contract', 'api_contract', 'agent_tool', 'worker', 'queue', 'cache',
        'tenant_configuration', 'knowledge_index', 'content_pipeline', 'data_projection', 'bounded_production_promotion',
      ]),
      requirement: 'explicit contract + bounded capability + rollback + verification',
    }),
    red: Object.freeze({
      description: 'Sovereign-core or irreversible/high-impact work requiring independent human authority.',
      areas: freezeList([
        'auth', 'identity_authority', 'core_schema', 'gateway', 'policy', 'secrets',
        'production_deployment', 'production_dns', 'destructive_data', 'permission_expansion',
        'sovereign_control_plane', 'constitutional_change',
      ]),
      requirement: 'human gate + governed promotion path',
    }),
  }),
  planes: Object.freeze({
    sovereignCore: freezeList(['identity', 'policy', 'authorization', 'audit', 'constitution', 'service-contract-authority']),
    controlPlane: freezeList(['intent', 'classification', 'delegation', 'routing', 'approval', 'release-order', 'evidence']),
    autonomousOperations: freezeList(['observe', 'detect', 'reason', 'plan', 'execute', 'verify', 'recover', 'learn']),
    agenticPlane: freezeList(['chief-orchestrator', 'specialist-agents', 'capability-tools', 'provider-adapters']),
    servicePlane: freezeList(['ui', 'services', 'tenant', 'knowledge', 'content', 'agent-features']),
  }),
  invariants: freezeList([
    'human_sovereignty_is_not_delegated_to_ai',
    'person_workspace_role_capability_is_the_authority_context',
    'workspace_id_remains_identity_authority',
    'agents_receive_capabilities_not_root_credentials',
    'cross_boundary_access_uses_declared_contracts',
    'production_mutation_uses_verified_promotion_only',
    'every_autonomous_execution_is_audited_and_verified',
    'failed_verification_enters_recovery_or_safe_degraded_state',
    'learning_may_recommend_policy_change_but_cannot_expand_its_own_authority',
    'provider_failure_degrades_capability_not_sovereignty',
    'shared_before_dedicated_and_no_speculative_scale',
  ]),
});

const GREEN = new Set(SOVEREIGN_AUTONOMY_POLICY.executionClasses.green.areas);
const YELLOW = new Set(SOVEREIGN_AUTONOMY_POLICY.executionClasses.yellow.areas);
const RED = new Set(SOVEREIGN_AUTONOMY_POLICY.executionClasses.red.areas);
const clean = value => String(value ?? '').trim();

export function normalizeSovereignContext(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.freeze({
    personId: clean(source.personId || source.person_id),
    workspaceId: clean(source.workspaceId || source.workspace_id),
    role: clean(source.role),
    capability: clean(source.capability),
    delegated: source.delegated === true,
    reversible: source.reversible === true,
    audited: source.audited === true || source.logged === true,
    preflightVerified: source.preflightVerified === true,
    contractDeclared: source.contractDeclared === true,
    rollbackDefined: source.rollbackDefined === true,
    verificationDefined: source.verificationDefined === true,
    production: source.production === true,
    highImpact: source.highImpact === true,
    standingDelegation: source.standingDelegation === true,
    existingBoundary: source.existingBoundary === true,
    postVerificationRequired: source.postVerificationRequired === true,
    automaticRollback: source.automaticRollback === true,
    knownStableTarget: source.knownStableTarget === true,
    paidCommitment: source.paidCommitment === true,
    explicitDelegatedBudget: source.explicitDelegatedBudget === true,
    permissionExpansion: source.permissionExpansion === true,
    canonicalIdentityChange: source.canonicalIdentityChange === true,
    workspaceAuthorityChange: source.workspaceAuthorityChange === true,
    destructiveDataChange: source.destructiveDataChange === true,
    massDataChange: source.massDataChange === true,
    newDomainOwnership: source.newDomainOwnership === true,
    securityBoundaryChange: source.securityBoundaryChange === true,
    newIndependentDeployment: source.newIndependentDeployment === true,
    providerLockIn: source.providerLockIn === true,
    productionSecretChange: source.productionSecretChange === true,
    productionDnsChange: source.productionDnsChange === true,
  });
}

export function classifyAutonomousArea(area) {
  const normalized = clean(area).toLowerCase();
  if (RED.has(normalized)) return 'red';
  if (YELLOW.has(normalized)) return 'yellow';
  if (GREEN.has(normalized)) return 'green';
  return 'yellow';
}

function decision(tier, reason, explanation, extra = {}) {
  return Object.freeze({
    tier,
    reason,
    explanation,
    policyVersion: SOVEREIGN_AUTONOMY_POLICY.version,
    ...extra,
  });
}

function authorityMissing(context) {
  if (!context.personId) return 'person_id';
  if (!context.workspaceId) return 'workspace_id';
  if (!context.role) return 'role';
  if (!context.capability) return 'capability';
  return '';
}


function sovereignEscalation(context) {
  if (context.paidCommitment && !context.explicitDelegatedBudget) return 'unbudgeted_paid_commitment';
  for (const [key, reason] of [['permissionExpansion','permission_expansion'],['canonicalIdentityChange','canonical_identity_change'],['workspaceAuthorityChange','workspace_authority_change'],['destructiveDataChange','destructive_data_change'],['massDataChange','mass_data_change'],['newDomainOwnership','new_domain_ownership'],['securityBoundaryChange','security_boundary_change'],['newIndependentDeployment','new_independent_deployment'],['providerLockIn','provider_lock_in'],['productionSecretChange','production_secret_change'],['productionDnsChange','production_dns_or_topology_change']]) if (context[key]) return reason;
  return '';
}
function standingDelegationEvidence(context) {
  const missing=[];
  for (const [key,label] of [['standingDelegation','standing_delegation'],['existingBoundary','existing_registered_boundary'],['delegated','delegated'],['reversible','reversible'],['audited','audited'],['preflightVerified','preflight_verified'],['rollbackDefined','rollback_defined'],['knownStableTarget','known_stable_rollback_target'],['verificationDefined','verification_defined'],['postVerificationRequired','post_promotion_verification'],['automaticRollback','automatic_safe_recovery']]) if (!context[key]) missing.push(label);
  return Object.freeze({eligible:missing.length===0,missing:Object.freeze(missing)});
}

export function evaluateAutonomousOperation(input = {}) {
  const area = clean(input.area).toLowerCase();
  const context = normalizeSovereignContext(input.context || input);
  const executionClass = classifyAutonomousArea(area);

  const sovereignReason = sovereignEscalation(context);
  if (context.highImpact || sovereignReason || executionClass === 'red') {
    return decision('human_gate', context.highImpact ? 'high_impact' : (sovereignReason || `red_area:${area || 'unknown'}`), 'Sovereign-core and high-impact changes require independent human authority and the governed promotion path.', { executionClass, context });
  }

  const missing = authorityMissing(context);
  if (missing) {
    return decision('assist', `authority_context_missing:${missing}`, 'Autonomous execution requires Person + Workspace + Role + Capability context. Analysis may continue without execution authority.', { executionClass, context });
  }

  if (context.production) {
    const standing = standingDelegationEvidence(context);
    return decision('control_plane_required', 'production_promotion_only', 'Autonomous agents may prepare and verify a production candidate, but production mutation must pass the independent control/release plane.', { executionClass, context, standingDelegationEligible: standing.eligible, standingDelegationMissing: standing.missing });
  }

  if (executionClass === 'green') {
    if (context.delegated && context.reversible && context.audited && context.preflightVerified) {
      return decision('execute_reversible', 'green_bounded_execution', 'Parallel-safe work may execute inside delegated reversible scope and must proceed to verification.', { executionClass, context, nextStage: 'verify' });
    }
    return decision('assist', 'green_execution_evidence_incomplete', 'The work is parallel-safe, but autonomous execution evidence is incomplete.', { executionClass, context });
  }

  if (context.delegated && context.reversible && context.audited && context.preflightVerified && context.contractDeclared && context.rollbackDefined && context.verificationDefined) {
    return decision('execute_bounded_contract', 'yellow_contract_satisfied', 'Contract-sensitive work may execute inside the declared capability boundary and must verify before completion.', { executionClass, context, nextStage: 'verify' });
  }

  return decision('assist', 'yellow_contract_evidence_incomplete', 'Contract-sensitive work remains assist-only until contract, rollback, verification, delegation and audit requirements are all satisfied.', { executionClass, context });
}

export function nextAutonomyStage(stage, outcome = 'ok') {
  const current = clean(stage).toLowerCase();
  const loop = SOVEREIGN_AUTONOMY_POLICY.autonomyLoop;
  if (!loop.includes(current)) return 'observe';
  if (current === 'verify' && outcome !== 'ok') return 'recover';
  if (current === 'recover') return outcome === 'ok' ? 'learn' : 'observe';
  const index = loop.indexOf(current);
  return loop[(index + 1) % loop.length];
}

export function getSovereignAutonomySummary() {
  return Object.freeze({
    version: SOVEREIGN_AUTONOMY_POLICY.version,
    hierarchy: SOVEREIGN_AUTONOMY_POLICY.hierarchy,
    authorityContext: SOVEREIGN_AUTONOMY_POLICY.authorityContext,
    autonomyLoop: SOVEREIGN_AUTONOMY_POLICY.autonomyLoop,
    executionClasses: Object.freeze({
      green: SOVEREIGN_AUTONOMY_POLICY.executionClasses.green.areas,
      yellow: SOVEREIGN_AUTONOMY_POLICY.executionClasses.yellow.areas,
      red: SOVEREIGN_AUTONOMY_POLICY.executionClasses.red.areas,
    }),
    planes: SOVEREIGN_AUTONOMY_POLICY.planes,
  });
}
