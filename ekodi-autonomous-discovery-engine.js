import { approvalGate } from './evolution-intelligence-runtime.js';
import { evaluateMissionAction } from './ai-governance-runtime.js';

export const EKODI_AUTONOMOUS_DISCOVERY_POLICY = Object.freeze({
  version: '1.0.0',
  principle: 'autonomous_research_human_governed_deployment',
  northStar: 'discover_research_evolve_verify_within_super_admin_values_and_authority',
  finalAuthority: 'ekodi_platform_super_administrator',
  currentGeneration: 10,
  candidateGeneration: 11,
  candidateGenerationOfficialName: null,
  promotionIsAutomatic: false,
  directProductionMutation: false,
  directAuthorityExpansion: false,
  safeFallbackGeneration: 10,
  minimumDimensionScorePct: 95,
  automaticResearchPhases: Object.freeze([
    'observe', 'anticipate', 'discover', 'question', 'research', 'evaluate', 'recommend'
  ]),
  discoverySignals: Object.freeze([
    'forecast_capacity_risk',
    'repeated_error_pattern',
    'repeated_human_intervention',
    'cost_performance_drift',
    'security_or_privacy_risk',
    'architectural_complexity_growth',
    'capability_gap',
    'provider_or_standard_change',
    'user_friction_pattern',
    'cross_service_reuse_opportunity',
  ]),
  certificationDimensions: Object.freeze([
    'autonomous_problem_discovery',
    'research_question_generation',
    'hypothesis_and_experiment_design',
    'sandbox_isolation',
    'reproducibility',
    'evidence_quality',
    'cost_control',
    'security_authorization_integrity',
    'rollout_rollback_proof',
    'post_change_verification',
    'learning_loop_closure',
  ]),
  certificationChecks: Object.freeze([
    'stable_generation_10',
    'no_authority_expansion',
    'human_governed_production',
    'rollback_or_safe_degraded_path',
    'sustainable_cost_capacity',
    'provider_independence',
  ]),
});

const SIGNAL_RULES = Object.freeze({
  forecast_capacity_risk: signal => Number(signal.riskPct || 0) >= 60,
  repeated_error_pattern: signal => Number(signal.count || 0) >= 3,
  repeated_human_intervention: signal => Number(signal.count || 0) >= 3,
  cost_performance_drift: signal => Number(signal.driftPct || 0) >= 20,
  security_or_privacy_risk: signal => Boolean(signal.material),
  architectural_complexity_growth: signal => Number(signal.growthPct || 0) >= 20,
  capability_gap: signal => Number(signal.gapScore || 0) >= 60,
  provider_or_standard_change: signal => Boolean(signal.material),
  user_friction_pattern: signal => Number(signal.frictionScore || 0) >= 60,
  cross_service_reuse_opportunity: signal => Number(signal.reuseScore || 0) >= 60,
});

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  return value;
}

function slug(value) {
  return String(value || 'platform')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'platform';
}

function researchId(signal = {}) {
  const seed = `${signal.type || 'unknown'}:${signal.target || 'platform'}:${signal.detectedAt || ''}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `adr_${slug(signal.type)}_${(hash >>> 0).toString(36)}`;
}

export function qualifiesForAutonomousDiscovery(signal = {}) {
  const type = String(signal.type || '').trim();
  const rule = SIGNAL_RULES[type];
  return Boolean(rule && rule(signal));
}

export function formulateResearchQuestion(signal = {}) {
  const target = String(signal.target || 'the affected platform capability').trim();
  const type = String(signal.type || 'capability_gap').trim();
  const questions = {
    forecast_capacity_risk: `Which verified architectural or operational change can reduce the forecast capacity risk for ${target} before user impact occurs?`,
    repeated_error_pattern: `What root cause is producing the repeated error pattern in ${target}, and which reversible change removes it without creating a new boundary risk?`,
    repeated_human_intervention: `Why does ${target} repeatedly require human intervention, and which bounded automation can remove that toil while preserving human authority?`,
    cost_performance_drift: `Which change can improve the cost-to-performance ratio of ${target} without weakening reliability, security or provider independence?`,
    security_or_privacy_risk: `Which least-privilege change can reduce the emerging security or privacy risk in ${target} while preserving required service capability?`,
    architectural_complexity_growth: `Can ${target} be simplified or recomposed to reduce architectural complexity while preserving observable behavior and rollback safety?`,
    capability_gap: `What is the smallest reusable capability that closes the verified gap in ${target} without speculative infrastructure growth?`,
    provider_or_standard_change: `How should ${target} adapt to the material provider or standards change while preserving portability and safe degraded operation?`,
    user_friction_pattern: `Which verified change can reduce recurring user friction in ${target} without dark patterns or hidden high-impact automation?`,
    cross_service_reuse_opportunity: `Can the repeated need around ${target} become a shared capability without creating unnecessary coupling or authority expansion?`,
  };
  return questions[type] || questions.capability_gap;
}

export function buildResearchProgram(signal = {}) {
  if (!qualifiesForAutonomousDiscovery(signal)) return null;
  const question = formulateResearchQuestion(signal);
  return freeze({
    id: researchId(signal),
    status: 'research_candidate',
    signal: {
      type: String(signal.type || '').trim(),
      target: String(signal.target || 'platform').trim(),
      evidenceRefs: Array.isArray(signal.evidenceRefs) ? signal.evidenceRefs.filter(Boolean) : [],
      detectedAt: signal.detectedAt || null,
    },
    question,
    hypothesis: `A bounded, reversible improvement to ${String(signal.target || 'the target').trim()} can measurably reduce the detected risk or gap without expanding EKODI sovereign authority.`,
    experiment: {
      environment: 'isolated_sandbox',
      productionMutationAllowed: false,
      authorityExpansionAllowed: false,
      mustBeReversible: true,
      mustBeLogged: true,
      preflightVerificationRequired: true,
      budgetBoundRequired: true,
    },
    evaluation: {
      compareAgainstBaseline: true,
      requireReproducibleEvidence: true,
      requireSecurityAuthorizationIntegrity: true,
      requireRollbackOrSafeDegradedPath: true,
      requirePostExperimentVerification: true,
    },
    next: 'bounded_experiment_or_recommendation',
  });
}

export function governDiscoveryAction(action = {}) {
  const phase = String(action.phase || '').trim();
  const productionChange = Boolean(action.productionChange);
  const highImpactFlags = productionChange
    || Boolean(action.createsSharedCore)
    || Boolean(action.permissionExpansion)
    || Boolean(action.paidCostCommitment)
    || Boolean(action.dataMigration)
    || Boolean(action.destructive)
    || Boolean(action.securityBoundaryChange)
    || Boolean(action.productionDnsChange)
    || Boolean(action.providerLockIn)
    || Boolean(action.constitutionalChange)
    || Boolean(action.authorityExpansion);

  if (Boolean(action.authorityExpansion) || Boolean(action.selfModifiesConstitution)) {
    return freeze({
      mode: 'human_gate',
      allowedAutonomously: false,
      authority: EKODI_AUTONOMOUS_DISCOVERY_POLICY.finalAuthority,
      reason: 'sovereign_authority_cannot_self_expand',
    });
  }

  if (highImpactFlags) {
    const gate = approvalGate({
      productionChange,
      createsSharedCore: action.createsSharedCore,
      permissionExpansion: action.permissionExpansion,
      paidCostCommitment: action.paidCostCommitment,
      dataMigration: action.dataMigration,
      destructive: action.destructive,
      securityBoundaryChange: action.securityBoundaryChange,
      productionDnsChange: action.productionDnsChange,
      providerLockIn: action.providerLockIn,
      reversible: action.reversible,
      delegated: action.delegated,
      logged: action.logged,
      preflightVerified: action.preflightVerified,
    });
    return freeze({
      mode: 'human_gate',
      allowedAutonomously: false,
      authority: EKODI_AUTONOMOUS_DISCOVERY_POLICY.finalAuthority,
      reason: 'human_governed_deployment',
      gate,
    });
  }

  if (EKODI_AUTONOMOUS_DISCOVERY_POLICY.automaticResearchPhases.includes(phase)) {
    return freeze({
      mode: 'autonomous_research',
      allowedAutonomously: true,
      authority: 'delegated_research_scope',
      reason: 'low_risk_research_phase',
    });
  }

  if (phase === 'experiment') {
    const bounded = Boolean(action.isolated)
      && Boolean(action.reversible)
      && Boolean(action.delegated)
      && Boolean(action.logged)
      && Boolean(action.preflightVerified)
      && Boolean(action.withinBudget)
      && !Boolean(action.sensitiveDataExpansion);
    if (!bounded) {
      return freeze({
        mode: 'assist_only',
        allowedAutonomously: false,
        authority: EKODI_AUTONOMOUS_DISCOVERY_POLICY.finalAuthority,
        reason: 'sandbox_requirements_not_satisfied',
      });
    }
    const mission = evaluateMissionAction({
      agentId: 'platform',
      area: 'bounded_research_experiment',
      reversible: true,
      delegated: true,
      logged: true,
      preflightVerified: true,
    });
    return freeze({
      mode: mission.tier === 'execute_reversible' ? 'autonomous_sandbox_experiment' : 'assist_only',
      allowedAutonomously: mission.tier === 'execute_reversible',
      authority: 'delegated_research_scope',
      reason: mission.reason,
      mission,
    });
  }

  return freeze({
    mode: 'assist_only',
    allowedAutonomously: false,
    authority: EKODI_AUTONOMOUS_DISCOVERY_POLICY.finalAuthority,
    reason: 'no_implicit_execution_authority',
  });
}

function score(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

export function evaluateGeneration11Candidate(evidence = {}) {
  const threshold = EKODI_AUTONOMOUS_DISCOVERY_POLICY.minimumDimensionScorePct;
  const dimensions = Object.fromEntries(EKODI_AUTONOMOUS_DISCOVERY_POLICY.certificationDimensions.map(id => [id, score(evidence.dimensions?.[id])]));
  const checks = Object.fromEntries(EKODI_AUTONOMOUS_DISCOVERY_POLICY.certificationChecks.map(id => [id, evidence.checks?.[id] === true]));
  const dimensionsReady = Object.values(dimensions).every(value => value >= threshold);
  const checksReady = Object.values(checks).every(Boolean);
  const candidateReady = dimensionsReady && checksReady;
  return freeze({
    currentGeneration: 10,
    targetGeneration: 11,
    officialTargetName: null,
    candidateReady,
    status: candidateReady
      ? 'generation_11_candidate_ready_for_super_admin_review'
      : 'generation_10_safe_mode',
    promotionPerformed: false,
    finalAuthority: EKODI_AUTONOMOUS_DISCOVERY_POLICY.finalAuthority,
    threshold,
    dimensions,
    checks,
    failedDimensions: Object.entries(dimensions).filter(([, value]) => value < threshold).map(([id]) => id),
    failedChecks: Object.entries(checks).filter(([, value]) => !value).map(([id]) => id),
  });
}

export function runAutonomousDiscoveryCycle(input = {}) {
  const signals = Array.isArray(input.signals) ? input.signals : [];
  const researchPrograms = signals.map(buildResearchProgram).filter(Boolean);
  return freeze({
    engine: 'EKODI Autonomous Discovery Engine',
    policyVersion: EKODI_AUTONOMOUS_DISCOVERY_POLICY.version,
    currentGeneration: EKODI_AUTONOMOUS_DISCOVERY_POLICY.currentGeneration,
    discovered: researchPrograms.length,
    researchPrograms,
    productionMutationPerformed: false,
    authorityExpanded: false,
    next: researchPrograms.length ? 'run_bounded_research_governance' : 'continue_observation',
  });
}
