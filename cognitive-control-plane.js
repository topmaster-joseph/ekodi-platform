import { evaluateAutonomousOperation } from './sovereign-autonomy-runtime.js';
export const COGNITIVE_CONTROL_POLICY = Object.freeze({
  version: '1.1.0',
  planes: Object.freeze(['control', 'governance', 'execution', 'data']),
  environments: Object.freeze(['development', 'verification', 'production']),
  promotionPath: Object.freeze(['development', 'verification', 'production']),
  requiredPromotionGates: Object.freeze([
    'source-isolation',
    'build',
    'tests',
    'security',
    'policy',
    'staging-smoke',
    'artifact-identity',
    'release-authorization',
    'audit',
  ]),
  requiredVerificationGates: Object.freeze([
    'source-isolation',
    'build',
    'tests',
    'security',
    'policy',
    'artifact-identity',
  ]),
  requiredMigrationGates: Object.freeze([
    'additive-schema-validation',
    'verification',
    'staging-smoke',
    'recovery-point',
    'release-authorization',
    'audit',
  ]),
  highImpactOperations: Object.freeze([
    'rollback',
    'production-secret-change',
    'production-dns-change',
    'destructive-production-data-change',
    'repository-force-push',
    'repository-delete',
  ]),
  productionMutationMode: 'promotion-only',
  productionDataSchemaMode: 'governed-additive-migration-only',
  rebuildOnPromotion: false,
});

const MUTATING_OPERATIONS = new Set([
  'execute',
  'promote',
  'migrate-additive',
  'rollback',
  'data-write',
  'policy-change',
  'production-secret-change',
  'production-dns-change',
  'destructive-production-data-change',
  'repository-force-push',
  'repository-delete',
]);
const HIGH_IMPACT = new Set(COGNITIVE_CONTROL_POLICY.highImpactOperations);
const PLANE_SET = new Set(COGNITIVE_CONTROL_POLICY.planes);
const ENVIRONMENT_SET = new Set(COGNITIVE_CONTROL_POLICY.environments);

const clean = value => String(value ?? '').trim();
const unique = values => [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];

function normalizeArtifact(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.freeze({
    id: clean(source.id || source.digest || source.versionId),
    immutable: source.immutable === true,
    verified: source.verified === true,
  });
}

export function normalizeControlIntent(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.freeze({
    requestId: clean(source.requestId),
    actor: clean(source.actor || 'unknown'),
    actorPlane: clean(source.actorPlane || 'control').toLowerCase(),
    operation: clean(source.operation || 'plan').toLowerCase(),
    sourceEnvironment: clean(source.sourceEnvironment || 'development').toLowerCase(),
    targetEnvironment: clean(source.targetEnvironment || 'development').toLowerCase(),
    sourceChange: source.sourceChange === true,
    sourceIsolated: source.sourceIsolated === true,
    readOnly: source.readOnly === true,
    audited: source.audited === true,
    governanceAuthorized: source.governanceAuthorized === true,
    rebuildOnPromotion: source.rebuildOnPromotion === true,
    highImpact: source.highImpact === true,
    standingDelegation: source.standingDelegation === true,
    personId: clean(source.personId || source.person_id), workspaceId: clean(source.workspaceId || source.workspace_id), role: clean(source.role), capability: clean(source.capability),
    existingBoundary: source.existingBoundary === true, preflightVerified: source.preflightVerified === true, reversible: source.reversible === true, rollbackDefined: source.rollbackDefined === true, verificationDefined: source.verificationDefined === true, postVerificationRequired: source.postVerificationRequired === true, automaticRollback: source.automaticRollback === true, knownStableTarget: source.knownStableTarget === true, failedVerification: source.failedVerification === true,
    paidCommitment: source.paidCommitment === true, explicitDelegatedBudget: source.explicitDelegatedBudget === true, permissionExpansion: source.permissionExpansion === true, canonicalIdentityChange: source.canonicalIdentityChange === true, workspaceAuthorityChange: source.workspaceAuthorityChange === true, destructiveDataChange: source.destructiveDataChange === true, massDataChange: source.massDataChange === true, newDomainOwnership: source.newDomainOwnership === true, securityBoundaryChange: source.securityBoundaryChange === true, newIndependentDeployment: source.newIndependentDeployment === true, providerLockIn: source.providerLockIn === true, productionSecretChange: source.productionSecretChange === true, productionDnsChange: source.productionDnsChange === true,
    gates: Object.freeze(unique(source.gates)),
    artifact: normalizeArtifact(source.artifact),
  });
}

export function isImmutableArtifactId(value) {
  const id = clean(value);
  if (!id) return false;
  if (/^sha256:[0-9a-f]{64}$/i.test(id)) return true;
  if (/^[0-9a-f]{40}$/i.test(id)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return true;
  return false;
}

function result(decision, reason, explanation, extra = {}) {
  return Object.freeze({
    decision,
    reason,
    explanation,
    policyVersion: COGNITIVE_CONTROL_POLICY.version,
    ...extra,
  });
}

function missingGates(intent, required) {
  const present = new Set(intent.gates);
  return required.filter(gate => !present.has(gate));
}

function artifactIssue(intent) {
  if (!intent.artifact.immutable) return 'artifact_not_immutable';
  if (!intent.artifact.verified) return 'artifact_not_verified';
  if (!isImmutableArtifactId(intent.artifact.id)) return 'artifact_identity_invalid';
  return '';
}

export function evaluateControlIntent(input = {}) {
  const intent = normalizeControlIntent(input);

  if (!PLANE_SET.has(intent.actorPlane)) {
    return result('deny', 'unknown_plane', 'Unknown planes receive no implicit authority.', { intent });
  }
  if (!ENVIRONMENT_SET.has(intent.sourceEnvironment) || !ENVIRONMENT_SET.has(intent.targetEnvironment)) {
    return result('deny', 'unknown_environment', 'Unknown environments fail closed.', { intent });
  }

  const mutating = MUTATING_OPERATIONS.has(intent.operation);
  if (intent.operation === 'rollback') {
    const safeRecovery = intent.standingDelegation && intent.failedVerification && intent.automaticRollback && intent.knownStableTarget && intent.existingBoundary && intent.reversible && intent.audited && intent.verificationDefined && intent.postVerificationRequired;
    if (safeRecovery) return result('allow', 'automatic_safe_rollback', 'Failed bounded production may recover automatically to a known stable target and must verify the recovery.', { intent, authorizationMode: 'standing_delegation' });
    return result('human_gate', 'high_impact_change', 'Rollback outside the verified safe-recovery envelope remains a sovereign human decision.', { intent });
  }
  const highImpact = intent.highImpact || HIGH_IMPACT.has(intent.operation);
  if (highImpact) return result('human_gate', 'high_impact_change', 'High-impact changes require an explicit human stewardship decision regardless of the requesting agent or environment.', { intent });

  if (intent.targetEnvironment === 'production' && intent.operation === 'observe') {
    if (!intent.readOnly || !intent.audited) {
      return result('deny', 'production_observation_not_bounded', 'Production observation must be read-only and auditable.', { intent });
    }
    return result('allow', 'production_observation', 'Read-only audited production observation is allowed.', { intent });
  }

  if (intent.targetEnvironment === 'production' && intent.operation === 'migrate-additive') {
    if (intent.sourceEnvironment !== 'verification') {
      return result('deny', 'verification_required', 'Production schema migration must originate from the verification environment.', { intent });
    }
    const sovereign = evaluateAutonomousOperation({ area:'bounded_production_promotion', personId:intent.personId, workspaceId:intent.workspaceId, role:intent.role, capability:intent.capability, production:true, standingDelegation:intent.standingDelegation, existingBoundary:intent.existingBoundary, delegated:intent.standingDelegation, reversible:intent.reversible, audited:intent.audited, preflightVerified:intent.preflightVerified, rollbackDefined:intent.rollbackDefined, verificationDefined:intent.verificationDefined, postVerificationRequired:intent.postVerificationRequired, automaticRollback:intent.automaticRollback, knownStableTarget:intent.knownStableTarget, paidCommitment:intent.paidCommitment, explicitDelegatedBudget:intent.explicitDelegatedBudget, permissionExpansion:intent.permissionExpansion, canonicalIdentityChange:intent.canonicalIdentityChange, workspaceAuthorityChange:intent.workspaceAuthorityChange, destructiveDataChange:intent.destructiveDataChange, massDataChange:intent.massDataChange, newDomainOwnership:intent.newDomainOwnership, securityBoundaryChange:intent.securityBoundaryChange, newIndependentDeployment:intent.newIndependentDeployment, providerLockIn:intent.providerLockIn, productionSecretChange:intent.productionSecretChange, productionDnsChange:intent.productionDnsChange });
    const standingAuthorized = sovereign.standingDelegationEligible === true;
    if (sovereign.tier === 'human_gate' && !intent.governanceAuthorized) return result('human_gate', sovereign.reason, sovereign.explanation, { intent, sovereign });
    if (!intent.governanceAuthorized && !standingAuthorized) return result('deny', 'governance_authorization_required', 'Production promotion needs explicit Governance authorization or a complete pre-approved bounded standing delegation.', { intent, sovereign });
    if (!intent.audited) {
      return result('deny', 'audit_required', 'Production schema migration must create durable audit evidence.', { intent });
    }
    const issue = artifactIssue(intent);
    if (issue) {
      return result('deny', issue, 'The additive migration set must have a verified immutable source identity.', { intent });
    }
    const missing = missingGates(intent, COGNITIVE_CONTROL_POLICY.requiredMigrationGates);
    if (missing.length) {
      return result('deny', 'migration_gates_incomplete', 'Every governed additive migration gate must be satisfied before production schema change.', { intent, missingGates: missing });
    }
    return result('allow', 'governed_additive_migration', 'A verified additive migration may run through the dedicated governed data-schema lane.', { intent });
  }

  if (intent.targetEnvironment === 'production') {
    if (!mutating) {
      return result('allow', 'production_non_mutating', 'Non-mutating production analysis is allowed when no execution authority is implied.', { intent });
    }
    if (intent.operation !== 'promote') {
      return result('deny', 'direct_production_mutation_forbidden', 'Production application runtime mutation is allowed only through artifact promotion.', { intent });
    }
    if (intent.sourceEnvironment !== 'verification') {
      return result('deny', 'verification_required', 'Production promotion must originate from the verification environment.', { intent });
    }
    if (!intent.governanceAuthorized) {
      return result('deny', 'governance_authorization_required', 'The requester may request promotion but may not authorize its own production change.', { intent });
    }
    if (intent.rebuildOnPromotion) {
      return result('deny', 'production_rebuild_forbidden', 'The verified artifact must be promoted unchanged; rebuilding in production is forbidden.', { intent });
    }
    const issue = artifactIssue(intent);
    if (issue) {
      return result('deny', issue, 'Production promotion requires one verified immutable artifact with a stable identity.', { intent });
    }
    const missing = missingGates(intent, COGNITIVE_CONTROL_POLICY.requiredPromotionGates);
    if (missing.length) {
      return result('deny', 'promotion_gates_incomplete', 'Every production promotion gate must be satisfied before release.', { intent, missingGates: missing });
    }
    return result('allow', 'verified_artifact_promotion', 'The same verified immutable artifact may be promoted through the guarded production controller.', { intent, authorizationMode: intent.governanceAuthorized ? 'explicit_governance' : 'standing_delegation' });
  }

  if (intent.targetEnvironment === 'verification' && mutating) {
    if (intent.sourceEnvironment !== 'development') {
      return result('deny', 'development_origin_required', 'Verification candidates must originate from development.', { intent });
    }
    if (intent.sourceChange && !intent.sourceIsolated) {
      return result('deny', 'source_isolation_required', 'Source-changing work must remain on an isolated branch/worktree before verification.', { intent });
    }
    const issue = artifactIssue(intent);
    if (issue) {
      return result('deny', issue, 'Verification requires an immutable identified candidate artifact.', { intent });
    }
    const missing = missingGates(intent, COGNITIVE_CONTROL_POLICY.requiredVerificationGates);
    if (missing.length) {
      return result('deny', 'verification_gates_incomplete', 'The candidate has not satisfied every pre-staging gate.', { intent, missingGates: missing });
    }
    return result('allow', 'verification_candidate', 'The isolated immutable candidate may enter staging/verification.', { intent });
  }

  if (intent.targetEnvironment === 'development' && mutating && intent.sourceChange && !intent.sourceIsolated) {
    return result('deny', 'source_isolation_required', 'Source-changing AI or human work must use an isolated branch/worktree.', { intent });
  }

  return result('allow', mutating ? 'bounded_non_production_execution' : 'planning_or_observation', 'The action remains outside direct production mutation and inside the declared boundary.', { intent });
}

export function getControlPlaneSummary() {
  return Object.freeze({
    policyVersion: COGNITIVE_CONTROL_POLICY.version,
    planes: COGNITIVE_CONTROL_POLICY.planes,
    environments: COGNITIVE_CONTROL_POLICY.environments,
    promotionPath: COGNITIVE_CONTROL_POLICY.promotionPath,
    productionMutationMode: COGNITIVE_CONTROL_POLICY.productionMutationMode,
    productionDataSchemaMode: COGNITIVE_CONTROL_POLICY.productionDataSchemaMode,
    rebuildOnPromotion: COGNITIVE_CONTROL_POLICY.rebuildOnPromotion,
    requiredPromotionGates: COGNITIVE_CONTROL_POLICY.requiredPromotionGates,
    requiredMigrationGates: COGNITIVE_CONTROL_POLICY.requiredMigrationGates,
  });
}
