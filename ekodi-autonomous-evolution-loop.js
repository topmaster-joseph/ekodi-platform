import { governDiscoveryAction } from './ekodi-autonomous-discovery-engine.js';

export const EKODI_AUTONOMOUS_EVOLUTION_POLICY = Object.freeze({
  version: '1.0.0',
  principle: 'autonomous_research_human_governed_deployment',
  finalAuthority: 'ekodi_platform_super_administrator',
  currentGeneration: 10,
  productionMutationAllowed: false,
  authorityExpansionAllowed: false,
  automaticPromotionAllowed: false,
  researchEvidenceThresholdPct: 70,
  experimentPassThresholdPct: 85,
  postChangeVerificationThresholdPct: 90,
  loop: Object.freeze([
    'discover', 'research', 'experiment_design', 'experiment', 'evaluate',
    'candidate', 'governance_gate', 'deploy', 'verify', 'learn'
  ]),
});

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  return value;
}

function uniq(values = []) {
  return [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))];
}

function stableId(prefix, seed) {
  let hash = 2166136261;
  for (const character of String(seed || 'platform')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

export function evaluateResearchEvidence(program = {}, evidence = {}) {
  const failedRuns = Math.max(0, Number(evidence.failedRuns || evidence.failureCount || 0));
  const recoveredRuns = Math.max(0, Number(evidence.recoveredRuns || evidence.successCount || 0));
  const failedJobs = uniq(evidence.failedJobs);
  const failedSteps = uniq(evidence.failedSteps);
  const evidenceRefs = uniq([
    ...(program?.signal?.evidenceRefs || []),
    ...(evidence.evidenceRefs || []),
  ]);
  const recurrenceScore = clamp(failedRuns * 16, 0, 48);
  const localizationScore = failedJobs.length || failedSteps.length ? 22 : 0;
  const traceabilityScore = clamp(evidenceRefs.length * 6, 0, 18);
  const recoveryScore = recoveredRuns > 0 ? 7 : 0;
  const reproducibilityScore = evidence.reproducible === true ? 12 : 0;
  const confidence = clamp(recurrenceScore + localizationScore + traceabilityScore + recoveryScore + reproducibilityScore);
  const verified = failedRuns >= 3
    && evidenceRefs.length > 0
    && confidence >= EKODI_AUTONOMOUS_EVOLUTION_POLICY.researchEvidenceThresholdPct;

  return freeze({
    researchId: program.id || stableId('research', program?.question || program?.signal?.target),
    target: program?.signal?.target || evidence.target || 'platform',
    question: program?.question || '',
    status: verified ? 'research_verified' : 'research_evidence_required',
    verified,
    confidence,
    evidence: {
      failedRuns,
      recoveredRuns,
      failedJobs,
      failedSteps,
      evidenceRefs,
      reproducible: evidence.reproducible === true,
      observations: Math.max(0, Number(evidence.observations || failedRuns + recoveredRuns)),
    },
    productionMutationPerformed: false,
    authorityExpanded: false,
  });
}

export function designBoundedExperiment(research = {}) {
  if (research?.verified !== true) {
    return freeze({
      researchId: research?.researchId || null,
      status: 'experiment_blocked_unverified_research',
      executableAutonomously: false,
      reason: 'research_evidence_threshold_not_met',
      productionMutationAllowed: false,
      authorityExpansionAllowed: false,
    });
  }

  const governance = governDiscoveryAction({
    phase: 'experiment',
    isolated: true,
    reversible: true,
    delegated: true,
    logged: true,
    preflightVerified: true,
    withinBudget: true,
    sensitiveDataExpansion: false,
  });

  return freeze({
    id: stableId('experiment', research.researchId),
    researchId: research.researchId,
    target: research.target,
    status: governance.allowedAutonomously ? 'experiment_design_ready' : 'experiment_human_review_required',
    executableAutonomously: governance.allowedAutonomously === true,
    environment: 'isolated_task_branch_or_sandbox',
    hypothesis: `A reversible bounded change can address ${research.target} without expanding sovereign authority.`,
    controls: [
      'baseline_before_change',
      'isolated_environment',
      'reversible_change_only',
      'same_test_suite_before_and_after',
      'security_and_authorization_integrity',
      'cost_and_resource_budget',
      'rollback_proof',
    ],
    successCriteria: {
      minimumScorePct: EKODI_AUTONOMOUS_EVOLUTION_POLICY.experimentPassThresholdPct,
      regressionAllowed: false,
      authorityExpansionAllowed: false,
      productionMutationAllowed: false,
      reproducibilityRequired: true,
      rollbackProofRequired: true,
    },
    governance,
    productionMutationAllowed: false,
    authorityExpansionAllowed: false,
  });
}

export function evaluateBoundedExperiment(experiment = {}, outcome = {}) {
  const functional = clamp(outcome.functionalScorePct);
  const regression = clamp(outcome.regressionScorePct);
  const security = clamp(outcome.securityIntegrityPct);
  const reproducibility = clamp(outcome.reproducibilityPct);
  const rollback = outcome.rollbackVerified === true ? 100 : 0;
  const cost = clamp(outcome.costControlPct ?? 100);
  const dimensions = { functional, regression, security, reproducibility, rollback, cost };
  const score = Math.round((functional * 0.28 + regression * 0.18 + security * 0.2 + reproducibility * 0.14 + rollback * 0.12 + cost * 0.08) * 10) / 10;
  const boundarySafe = outcome.productionMutationPerformed !== true
    && outcome.authorityExpanded !== true
    && outcome.sensitiveDataExpansion !== true;
  const passed = experiment?.executableAutonomously === true
    && boundarySafe
    && score >= EKODI_AUTONOMOUS_EVOLUTION_POLICY.experimentPassThresholdPct
    && functional >= 85
    && regression >= 90
    && security >= 95
    && reproducibility >= 85
    && rollback === 100;

  return freeze({
    experimentId: experiment.id || null,
    researchId: experiment.researchId || null,
    target: experiment.target || 'platform',
    status: passed ? 'experiment_passed' : 'experiment_failed_or_incomplete',
    passed,
    score,
    dimensions,
    boundarySafe,
    evidenceRefs: uniq(outcome.evidenceRefs),
    productionMutationPerformed: Boolean(outcome.productionMutationPerformed),
    authorityExpanded: Boolean(outcome.authorityExpanded),
    next: passed ? 'build_evolution_candidate' : 'refine_research_or_experiment',
  });
}

export function buildEvolutionCandidate(research = {}, experimentEvaluation = {}) {
  if (research?.verified !== true || experimentEvaluation?.passed !== true) {
    return freeze({
      id: stableId('candidate', research?.researchId || experimentEvaluation?.researchId),
      researchId: research?.researchId || experimentEvaluation?.researchId || null,
      status: 'candidate_not_ready',
      readyForSuperAdminReview: false,
      productionMutationPerformed: false,
      authorityExpanded: false,
      reason: research?.verified !== true ? 'research_not_verified' : 'experiment_not_passed',
    });
  }

  return freeze({
    id: stableId('candidate', `${research.researchId}:${experimentEvaluation.experimentId}`),
    researchId: research.researchId,
    experimentId: experimentEvaluation.experimentId,
    target: research.target,
    title: `Verified evolution candidate for ${research.target}`,
    status: 'evolution_candidate_ready_for_super_admin_review',
    readyForSuperAdminReview: true,
    confidence: Math.round(((Number(research.confidence || 0) + Number(experimentEvaluation.score || 0)) / 2) * 10) / 10,
    evidenceRefs: uniq([
      ...(research?.evidence?.evidenceRefs || []),
      ...(experimentEvaluation?.evidenceRefs || []),
    ]),
    governance: {
      finalAuthority: EKODI_AUTONOMOUS_EVOLUTION_POLICY.finalAuthority,
      productionApprovalRequired: true,
      automaticPromotionAllowed: false,
      guardedReleaseRequired: true,
      postDeploymentVerificationRequired: true,
    },
    rollout: ['super_admin_review', 'guarded_pr', 'ci', 'staging', 'guarded_production', 'post_change_verification'],
    rollback: ['preserve_last_verified_state', 'automatic_abort_on_failed_verification', 'restore_last_verified_state'],
    productionMutationPerformed: false,
    authorityExpanded: false,
  });
}

export function verifyEvolutionOutcome(candidate = {}, outcome = {}) {
  const deployed = outcome.deployed === true;
  const health = clamp(outcome.healthScorePct);
  const objective = clamp(outcome.objectiveScorePct);
  const regression = clamp(outcome.regressionScorePct);
  const security = clamp(outcome.securityIntegrityPct);
  const rollbackReady = outcome.rollbackReady === true;
  const score = Math.round((health * 0.28 + objective * 0.3 + regression * 0.2 + security * 0.22) * 10) / 10;
  const verified = deployed
    && candidate?.readyForSuperAdminReview === true
    && outcome.superAdminApproved === true
    && score >= EKODI_AUTONOMOUS_EVOLUTION_POLICY.postChangeVerificationThresholdPct
    && regression >= 90
    && security >= 95;
  const rollbackRequired = deployed && (!verified || outcome.rollbackRequested === true);

  return freeze({
    candidateId: candidate.id || null,
    target: candidate.target || 'platform',
    status: rollbackRequired ? 'rollback_required' : verified ? 'post_change_verified' : 'post_change_verification_pending',
    verified,
    rollbackRequired,
    score,
    metrics: { health, objective, regression, security, rollbackReady },
    finalAuthority: EKODI_AUTONOMOUS_EVOLUTION_POLICY.finalAuthority,
    evidenceRefs: uniq(outcome.evidenceRefs),
    authorityExpanded: false,
  });
}

export function buildLearningRecord({ research, experimentEvaluation, candidate, verification } = {}) {
  const completed = verification?.verified === true;
  const rolledBack = verification?.rollbackRequired === true;
  return freeze({
    id: stableId('learning', candidate?.id || research?.researchId),
    researchId: research?.researchId || null,
    candidateId: candidate?.id || null,
    target: candidate?.target || research?.target || 'platform',
    status: completed ? 'learning_loop_closed' : rolledBack ? 'learning_from_rollback' : 'learning_pending',
    lesson: completed
      ? 'Verified change met post-deployment objectives without authority expansion.'
      : rolledBack
        ? 'Candidate did not sustain verification requirements; preserve rollback evidence and refine the next hypothesis.'
        : 'Await verified production outcome before treating this evolution as learned capability.',
    reusableEvidenceRefs: uniq([
      ...(research?.evidence?.evidenceRefs || []),
      ...(experimentEvaluation?.evidenceRefs || []),
      ...(candidate?.evidenceRefs || []),
      ...(verification?.evidenceRefs || []),
    ]),
    productionMutationPerformedByResearchLoop: false,
    authorityExpanded: false,
  });
}

export function lifecycleFromRecommendation(recommendation = {}) {
  const confidence = clamp(recommendation.confidence);
  const evidenceRefs = uniq((recommendation.references || []).map(source => source?.url));
  const verified = recommendation.publishable !== false && evidenceRefs.length > 0 && confidence >= 70;
  const researchId = stableId('research', recommendation.id || `${recommendation.type}:${recommendation.target}:${recommendation.title}`);
  const research = freeze({
    researchId,
    target: recommendation.target || 'platform',
    question: recommendation.title || 'How should this verified platform signal be improved?',
    status: verified ? 'research_verified' : 'research_evidence_required',
    verified,
    confidence,
    evidence: {
      evidenceRefs,
      evidenceGrade: recommendation.evidenceGrade || 'C',
      recommendationId: recommendation.id || null,
    },
    productionMutationPerformed: false,
    authorityExpanded: false,
  });
  const experiment = designBoundedExperiment(research);
  return freeze({
    research,
    experiment,
    experimentEvaluation: null,
    candidate: null,
    verification: null,
    learning: null,
    status: experiment.executableAutonomously ? 'awaiting_bounded_experiment_evidence' : research.status,
  });
}

export function runAutonomousEvolutionLoop(input = {}) {
  const programs = Array.isArray(input.researchPrograms) ? input.researchPrograms : [];
  const evidenceByResearchId = input.evidenceByResearchId || {};
  const experimentOutcomes = input.experimentOutcomes || {};
  const deploymentOutcomes = input.deploymentOutcomes || {};
  const records = [];

  for (const program of programs) {
    const research = evaluateResearchEvidence(program, evidenceByResearchId[program.id] || {});
    const experiment = designBoundedExperiment(research);
    const outcome = experimentOutcomes[experiment.id] || experimentOutcomes[program.id] || null;
    const experimentEvaluation = outcome ? evaluateBoundedExperiment(experiment, outcome) : null;
    const candidate = experimentEvaluation ? buildEvolutionCandidate(research, experimentEvaluation) : null;
    const deploymentOutcome = candidate ? deploymentOutcomes[candidate.id] : null;
    const verification = candidate && deploymentOutcome ? verifyEvolutionOutcome(candidate, deploymentOutcome) : null;
    const learning = candidate ? buildLearningRecord({ research, experimentEvaluation, candidate, verification }) : null;
    records.push(freeze({
      research,
      experiment,
      experimentEvaluation,
      candidate,
      verification,
      learning,
      status: verification?.status
        || candidate?.status
        || experimentEvaluation?.status
        || experiment?.status
        || research.status,
    }));
  }

  const recommendations = Array.isArray(input.recommendations) ? input.recommendations : [];
  const recommendationRecords = recommendations.map(lifecycleFromRecommendation);
  const allRecords = [...records, ...recommendationRecords];
  const summary = {
    total: allRecords.length,
    researchVerified: allRecords.filter(item => item.research?.verified).length,
    experimentsReady: allRecords.filter(item => item.experiment?.executableAutonomously).length,
    experimentsPassed: allRecords.filter(item => item.experimentEvaluation?.passed).length,
    candidatesReady: allRecords.filter(item => item.candidate?.readyForSuperAdminReview).length,
    postChangeVerified: allRecords.filter(item => item.verification?.verified).length,
    rollbackRequired: allRecords.filter(item => item.verification?.rollbackRequired).length,
    learningClosed: allRecords.filter(item => item.learning?.status === 'learning_loop_closed').length,
  };

  return freeze({
    engine: 'EKODI Autonomous Evolution Loop',
    policyVersion: EKODI_AUTONOMOUS_EVOLUTION_POLICY.version,
    generatedAt: input.generatedAt || new Date().toISOString(),
    currentGeneration: 10,
    summary,
    records: allRecords,
    productionMutationPerformed: false,
    authorityExpanded: false,
    automaticPromotionPerformed: false,
    finalAuthority: EKODI_AUTONOMOUS_EVOLUTION_POLICY.finalAuthority,
  });
}
