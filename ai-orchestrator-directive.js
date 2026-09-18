const freezeList = values => Object.freeze([...(values || [])]);

export const AI_ORCHESTRATOR_DIRECTIVE = Object.freeze({
  schemaVersion: 1,
  version: '1.0.0',
  id: 'EKODI-AI-ORCHESTRATOR-DIRECTIVE-001',
  status: 'active',
  source: 'config/ai-orchestrator-operating-directive.json',
  sourceOfTruthPriority: freezeList([
    'verified_current_operating_state',
    'current_official_policy',
    'current_configuration_and_source_of_truth',
    'approved_architecture',
    'historical_instruction',
  ]),
  lifecycle: freezeList([
    'current_state',
    'root_cause_analysis',
    'design',
    'implementation',
    'test',
    'fix',
    'revalidation',
    'security_permission_performance_validation',
    'deployment',
    'production_verification',
    'prevention_automation',
  ]),
  mathAndCoding: Object.freeze({
    decompositionRequiredForComplexWork: true,
    validateEquationsAssumptionsUnitsAndBoundaries: true,
    independentCrossCheckWhenMaterial: true,
    optimizeTogether: freezeList(['correctness', 'performance', 'security', 'scalability', 'maintainability']),
    requiredTestClasses: freezeList(['unit', 'integration', 'failure', 'regression']),
    failedTestsRequireFixAndRevalidation: true,
    officialDocumentationFirstForFreshTechnicalFacts: true,
  }),
  orchestration: Object.freeze({
    criteria: freezeList(['accuracy', 'cost', 'latency', 'security', 'availability']),
    preferenceOrder: freezeList(['self_hosted', 'local_ai', 'free_tier', 'low_cost_api', 'high_performance_paid']),
    preferenceIsNonBinding: true,
    currentVerifiedPolicyOverridesStalePreference: true,
    importantResultsRequireIndependentVerificationWhenPractical: true,
    centralOrchestratorPreferredForExternalAi: true,
    sensitiveDataMinimizationRequired: true,
  }),
  recovery: Object.freeze({
    transientFailureSequence: freezeList(['retry', 'reconnect', 'fallback', 'failover', 'rollback']),
    repeatedFailureRequiresRootCauseRemoval: true,
    technologyAdoptionSequence: freezeList(['discover', 'evaluate', 'sandbox', 'benchmark', 'canary', 'monitor', 'progressive_rollout']),
  }),
  verificationRules: freezeList([
    'never_claim_unexecuted_work_complete',
    'code_pr_build_merge_or_deploy_alone_is_not_completion',
    'verify_real_url_api_ui_or_user_flow_when_applicable',
    'test_happy_path_failure_exception_permission_network_and_invalid_input_when_applicable',
    'compare_before_and_after_for_regression',
    'inspect_production_logs_error_logs_metrics_and_health_when_applicable',
    'never_lower_security_to_bypass_a_problem',
    'secure_rollback_path_before_risky_change',
    'independently_verify_material_results',
    'conflicting_verification_blocks_completion_until_resolved',
    'fresh_information_uses_primary_source_and_as_of_date',
    'unverifiable_claims_are_marked_needs_verification',
    'final_check_covers_goal_math_code_security_performance_regression_and_operations',
    'add_automated_test_monitoring_self_healing_or_guardrail_to_prevent_recurrence_when_justified',
  ]),
  futureCompatibility: Object.freeze({
    implementationNamesAreExamplesNotPermanentMandates: true,
    vendorLockInForbiddenByDefault: true,
    superiorVerifiedTechnologyMayReplaceImplementationProgressively: true,
    uncertaintyLabel: 'Needs Verification',
    transitionSequence: freezeList([
      'verify_current_state',
      'verify_current_policy',
      'detect_conflict',
      'design_compatible_transition',
      'test_and_benchmark',
      'canary',
      'progressive_rollout',
      'production_verify',
      'adopt_new_baseline',
    ]),
  }),
  completion: Object.freeze({
    productionImpactingRequiresProductionVerification: true,
    materialChangesRequireRegressionEvidence: true,
    completionRequiresNoUnresolvedConflictingEvidence: true,
    noFalseCompletion: true,
    defaultWhenEvidenceMissing: 'needs_verification',
  }),
  autonomyLoop: freezeList(['detect', 'decide', 'act', 'verify', 'recover', 'learn', 'evolve']),
  authority: Object.freeze({
    subordinateToConstitution: true,
    authorityExpansionForbidden: true,
    securityWeakeningForbidden: true,
  }),
});

export function getAiOrchestratorDirectiveSummary() {
  return Object.freeze({
    id: AI_ORCHESTRATOR_DIRECTIVE.id,
    version: AI_ORCHESTRATOR_DIRECTIVE.version,
    status: AI_ORCHESTRATOR_DIRECTIVE.status,
    source: AI_ORCHESTRATOR_DIRECTIVE.source,
    sourceOfTruthPriority: AI_ORCHESTRATOR_DIRECTIVE.sourceOfTruthPriority,
    lifecycle: AI_ORCHESTRATOR_DIRECTIVE.lifecycle,
    verificationRuleCount: AI_ORCHESTRATOR_DIRECTIVE.verificationRules.length,
    autonomyLoop: AI_ORCHESTRATOR_DIRECTIVE.autonomyLoop,
    noFalseCompletion: AI_ORCHESTRATOR_DIRECTIVE.completion.noFalseCompletion,
    uncertaintyLabel: AI_ORCHESTRATOR_DIRECTIVE.futureCompatibility.uncertaintyLabel,
  });
}

export function buildAiExecutionProtocol(input = {}) {
  const productionImpacting = input.productionImpacting === true || input.production === true;
  const material = input.material === true || input.risk === 'high' || input.risk === 'critical';
  const mathOrCoding = input.mathOrCoding === true || ['math', 'coding', 'software', 'algorithm'].includes(String(input.domain || '').toLowerCase());

  return Object.freeze({
    directiveId: AI_ORCHESTRATOR_DIRECTIVE.id,
    directiveVersion: AI_ORCHESTRATOR_DIRECTIVE.version,
    stages: AI_ORCHESTRATOR_DIRECTIVE.lifecycle,
    sourceOfTruthPriority: AI_ORCHESTRATOR_DIRECTIVE.sourceOfTruthPriority,
    requiredVerification: Object.freeze({
      productionVerification: productionImpacting,
      regressionEvidence: material || productionImpacting,
      independentCrossCheck: material,
      mathCodingCrossCheck: mathOrCoding,
      failurePathTesting: productionImpacting || material,
    }),
    missingEvidenceState: AI_ORCHESTRATOR_DIRECTIVE.completion.defaultWhenEvidenceMissing,
  });
}

export function evaluateAiCompletionEvidence(evidence = {}) {
  const reasons = [];
  const productionImpacting = evidence.productionImpacting === true;
  const material = evidence.material === true;

  if (evidence.executed !== true) reasons.push('execution_not_verified');
  if (evidence.tested !== true) reasons.push('tests_not_verified');
  if ((material || productionImpacting) && evidence.regressionChecked !== true) reasons.push('regression_not_verified');
  if (productionImpacting && evidence.productionVerified !== true) reasons.push('production_not_verified');
  if (productionImpacting && evidence.operationalHealthChecked !== true) reasons.push('operational_health_not_verified');
  if (evidence.securityWeakened === true) reasons.push('security_weakened');
  if (evidence.conflictingEvidence === true) reasons.push('conflicting_evidence_unresolved');

  const complete = reasons.length === 0;
  return Object.freeze({
    complete,
    state: complete ? 'verified_complete' : AI_ORCHESTRATOR_DIRECTIVE.completion.defaultWhenEvidenceMissing,
    reasons: Object.freeze(reasons),
    directiveVersion: AI_ORCHESTRATOR_DIRECTIVE.version,
  });
}
