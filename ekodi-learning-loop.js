const TRUST_SCORE = Object.freeze({
  ekodi_canonical: 100,
  workspace_private: 90,
  official_primary: 92,
  authoritative_reference: 82,
  user_supplied: 68,
  secondary_reference: 52,
  model_generated: 20,
});

const SENSITIVE_KEY = /(secret|token|authorization|cookie|password|api[_-]?key|private[_-]?key|raw|prompt|content|message|email|phone)/i;

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}

function cleanText(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  return value;
}

export const EKODI_LEARNING_LOOP_POLICY = Object.freeze({
  version: '1.0.0',
  engine: 'EKODI Learning Loop',
  principle: 'collect_less_verify_more_learn_from_outcomes',
  externalContentRole: 'untrusted_reference_data_only',
  modelSelfTrainingByDefault: false,
  rawUserContentLearningByDefault: false,
  acquisitionOrder: Object.freeze([
    'official_connector_or_api',
    'webhook',
    'rss_atom',
    'sitemap_incremental_fetch',
    'bounded_html_fetch',
    'manual_reviewed_source',
  ]),
  stages: Object.freeze(['collect', 'verify', 'use', 'observe_outcome', 'evaluate', 'remember', 'improve']),
  memoryScopes: Object.freeze(['task', 'person_or_workspace', 'service', 'platform']),
  platformPromotion: Object.freeze({
    minimumScore: 90,
    minimumRepeatedVerifiedOutcomes: 3,
    humanApprovalRequired: true,
    authorityExpansionAllowed: false,
    productionMutationAllowed: false,
  }),
  safety: Object.freeze({
    promptInjectionExecutes: false,
    respectRobotsAndTerms: true,
    privateSourceRequiresAuthorization: true,
    sensitiveDataExpansionAllowed: false,
    rightsVerificationRequired: true,
  }),
});

export function selectKnowledgeAcquisitionLane(source = {}) {
  if (source.enabled === false) return freeze({ method: 'blocked', reason: 'source_disabled' });
  if (source.private === true && source.authorized !== true) return freeze({ method: 'blocked', reason: 'private_source_not_authorized' });
  if (source.rightsAllowed === false) return freeze({ method: 'blocked', reason: 'rights_not_allowed' });
  if (source.api === true || source.connector === true) return freeze({ method: 'official_connector_or_api', interval: source.interval || 'adaptive' });
  if (source.webhook === true) return freeze({ method: 'webhook', interval: 'event_driven' });
  if (source.rss === true || source.atom === true) return freeze({ method: 'rss_atom', interval: source.interval || 'adaptive' });
  if (source.sitemap === true) return freeze({ method: 'sitemap_incremental_fetch', interval: source.interval || 'adaptive' });
  if (source.html === true || source.url) {
    if (source.robotsAllowed !== true) return freeze({ method: 'blocked', reason: 'robots_permission_not_verified' });
    if (source.termsAllowed !== true) return freeze({ method: 'blocked', reason: 'terms_permission_not_verified' });
    return freeze({ method: 'bounded_html_fetch', interval: source.interval || 'adaptive', changedOnly: true });
  }
  return freeze({ method: 'manual_reviewed_source', interval: 'on_change' });
}

export function sanitizeLearningEvidence(value, depth = 0) {
  if (depth > 5 || value == null) return value == null ? null : undefined;
  if (typeof value === 'string') return cleanText(value, 240);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20)
      .map(item => sanitizeLearningEvidence(item, depth + 1))
      .filter(item => item !== undefined);
  }
  if (typeof value !== 'object') return undefined;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue;
    const sanitized = sanitizeLearningEvidence(child, depth + 1);
    if (sanitized !== undefined) result[cleanText(key, 80)] = sanitized;
  }
  return result;
}

export function buildTaskLearningEvent(event = {}) {
  const outcome = cleanText(event.outcome || 'unknown', 40).toLowerCase();
  const verified = ['verified', 'completed', 'complete', 'success', 'succeeded'].includes(outcome);
  const feedback = event.feedback && typeof event.feedback === 'object' ? event.feedback : {};
  const disposition = ['accepted', 'revised', 'rejected'].includes(feedback.disposition) ? feedback.disposition : 'unknown';
  const correctionRatio = clamp(feedback.correctionRatio, 0, 1);
  return freeze({
    taskId: cleanText(event.taskId, 120),
    capability: cleanText(event.capability || 'general', 120),
    outcome,
    verified,
    evidence: sanitizeLearningEvidence(event.evidence || {}),
    feedback: {
      disposition,
      correctionRatio,
      explicitApproval: feedback.explicitApproval === true,
      rawContentStored: false,
    },
    eligibleForLearningLedger: verified,
    eligibleForPlatformPromotion: false,
  });
}

function freshnessScore(candidate = {}) {
  const age = Number(candidate.ageHours);
  const maxAge = Math.max(1, Number(candidate.maxAgeHours) || 168);
  if (!Number.isFinite(age) || age < 0) return 55;
  if (age <= maxAge) return 100;
  if (age >= maxAge * 4) return 10;
  return Math.round(100 - ((age - maxAge) / (maxAge * 3)) * 90);
}

export function evaluateKnowledgeCandidate(candidate = {}) {
  const sourceType = cleanText(candidate.sourceType || 'secondary_reference', 60);
  const provenance = TRUST_SCORE[sourceType] ?? 40;
  const freshness = freshnessScore(candidate);
  const corroboration = clamp(Number(candidate.corroboratingSources || 0) * 35);
  const outcomes = clamp(Number(candidate.repeatedVerifiedOutcomes || 0) * 25);
  const feedback = candidate.userAccepted === true ? 100 : candidate.userRevised === true ? 55 : 40;
  const score = Math.round((provenance * 0.30 + freshness * 0.20 + corroboration * 0.15 + outcomes * 0.25 + feedback * 0.10) * 10) / 10;

  const blocked = [];
  if (candidate.promptInjectionDetected === true) blocked.push('prompt_injection_detected');
  if (candidate.rightsAllowed !== true) blocked.push('rights_not_verified');
  if (candidate.sensitiveDataExpansion === true) blocked.push('sensitive_data_expansion');
  if (candidate.authorized === false) blocked.push('source_not_authorized');
  if (candidate.currentPrimaryConflict === true) blocked.push('conflicts_with_current_primary_source');

  let status = 'observation_only';
  if (blocked.length) status = 'rejected';
  else if (score >= 90 && provenance >= 82 && Number(candidate.repeatedVerifiedOutcomes || 0) >= 3) {
    status = candidate.humanApproved === true ? 'platform_knowledge_promoted' : 'platform_review_required';
  } else if (score >= 75) status = 'service_memory_candidate';
  else if (score >= 60) status = 'verified_candidate';

  return freeze({
    id: cleanText(candidate.id || candidate.sourceId || 'candidate', 160),
    sourceType,
    score,
    dimensions: { provenance, freshness, corroboration, outcomes, feedback },
    status,
    blocked,
    platformPromotionPerformed: status === 'platform_knowledge_promoted',
    humanApprovalRequired: status === 'platform_review_required',
    authorityExpanded: false,
    productionMutationPerformed: false,
  });
}

export function runEkodiLearningLoop(input = {}) {
  const tasks = (Array.isArray(input.tasks) ? input.tasks : []).map(buildTaskLearningEvent);
  const knowledge = (Array.isArray(input.knowledge) ? input.knowledge : []).map(evaluateKnowledgeCandidate);
  return freeze({
    engine: EKODI_LEARNING_LOOP_POLICY.engine,
    policyVersion: EKODI_LEARNING_LOOP_POLICY.version,
    generatedAt: input.generatedAt || new Date().toISOString(),
    summary: {
      taskEvents: tasks.length,
      verifiedTaskEvents: tasks.filter(item => item.eligibleForLearningLedger).length,
      knowledgeCandidates: knowledge.length,
      serviceMemoryCandidates: knowledge.filter(item => item.status === 'service_memory_candidate').length,
      platformReviewRequired: knowledge.filter(item => item.status === 'platform_review_required').length,
      platformPromoted: knowledge.filter(item => item.status === 'platform_knowledge_promoted').length,
      rejected: knowledge.filter(item => item.status === 'rejected').length,
    },
    tasks,
    knowledge,
    externalInstructionsExecuted: false,
    rawUserContentStoredByDefault: false,
    authorityExpanded: false,
    productionMutationPerformed: false,
  });
}
