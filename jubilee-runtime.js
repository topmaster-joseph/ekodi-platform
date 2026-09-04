const POLICY_VERSION = '1.0.0';

const ALLOWED_NEED_SIGNALS = new Set([
  'affordability_constraint',
  'access_barrier',
  'language_support_required',
  'mobility_access_required',
  'digital_access_constraint',
  'time_access_constraint',
]);

const ALLOWED_SIGNAL_SOURCES = new Set([
  'user_provided',
  'consented',
  'program_eligibility_verified',
]);

const SUPPORT_ACTIONS = Object.freeze({
  affordability_constraint: Object.freeze([
    'consider_fee_waiver',
    'consider_jubilee_credit',
    'show_lower_cost_alternatives',
  ]),
  access_barrier: Object.freeze([
    'priority_access_review',
    'offer_assisted_channel',
  ]),
  language_support_required: Object.freeze(['offer_language_support']),
  mobility_access_required: Object.freeze(['offer_remote_or_accessible_option']),
  digital_access_constraint: Object.freeze(['offer_low_friction_or_assisted_channel']),
  time_access_constraint: Object.freeze(['offer_async_or_flexible_option']),
});

export const JUBILEE_RUNTIME = Object.freeze({
  version: POLICY_VERSION,
  principle: 'strong_inside_open_outside',
  authority: 'user_choice_preserved',
  recommendationRole: 'relationship_resource_not_final_authority',
  rules: Object.freeze({
    neverHideBetterExternalOption: true,
    commercialRelationshipRequiresDisclosure: true,
    sponsorshipMustNotSecretlyChangeRanking: true,
    sensitiveTraitInferenceForSupportOrRanking: false,
    supportMustNotCreatePublicVulnerabilityLabel: true,
    preferUserFitOverPlatformMargin: true,
    preserveMultipleViableOptions: true,
    preserveProviderChoiceDiversity: true,
  }),
});

/**
 * Evaluate a recommendation or connection request through the Jubilee policy.
 *
 * This runtime intentionally does not produce a single "moral score". It applies
 * hard boundaries first, keeps user-fit ranking provider-neutral, preserves viable
 * alternatives, and returns separate support/disclosure/audit outputs.
 */
export function evaluateJubileeRecommendation(input = {}) {
  const context = input.context && typeof input.context === 'object' ? input.context : {};
  const market = input.market && typeof input.market === 'object' ? input.market : {};
  const rawCandidates = Array.isArray(input.candidates) ? input.candidates : [];

  const audit = {
    policyVersion: POLICY_VERSION,
    rulesTriggered: [],
    warnings: [],
  };

  if (Boolean(context.sensitiveTraitInferenceUsed)) {
    audit.rulesTriggered.push('block_sensitive_trait_inference');
    return freezeResult({
      status: 'blocked',
      reason: 'sensitive_trait_inference_not_permitted',
      choiceSet: [],
      supportActions: [],
      disclosures: [],
      externalAlternativeLookupRequired: false,
      humanReviewRequired: true,
      audit,
    });
  }

  if (Boolean(context.publicVulnerabilityLabelRequested)) {
    audit.rulesTriggered.push('block_public_vulnerability_label');
    return freezeResult({
      status: 'blocked',
      reason: 'stigmatizing_support_label_not_permitted',
      choiceSet: [],
      supportActions: [],
      disclosures: [],
      externalAlternativeLookupRequired: false,
      humanReviewRequired: true,
      audit,
    });
  }

  const needSignals = normalizeNeedSignals(context.needSignals, audit);
  const supportActions = deriveSupportActions(needSignals);
  if (supportActions.length > 0) audit.rulesTriggered.push('non_stigmatizing_support_available');

  const evaluated = rawCandidates.map((candidate, index) => evaluateCandidate(candidate, index, audit));
  const eligible = evaluated.filter(candidate => candidate.eligible && candidate.viable);

  eligible.sort(compareCandidates);

  const externalAlternativeLookupRequired = Boolean(
    market.externalAlternativesKnown
    && eligible.length > 0
    && !eligible.some(candidate => candidate.source === 'external')
  );

  if (externalAlternativeLookupRequired) {
    audit.rulesTriggered.push('external_alternative_lookup_required');
  }

  const choiceSet = preserveChoiceSet(eligible, audit);
  if (choiceSet.some(candidate => candidate.source === 'external')) {
    audit.rulesTriggered.push('external_alternatives_preserved');
  }

  const disclosures = choiceSet
    .filter(candidate => candidate.commercialRelationship)
    .map(candidate => Object.freeze({
      candidateId: candidate.id,
      type: 'commercial_relationship',
      message: candidate.commercialDisclosure,
    }));

  const excludedCount = evaluated.filter(candidate => !candidate.eligible).length;
  if (excludedCount > 0) audit.rulesTriggered.push('conflicted_candidates_excluded');

  const status = choiceSet.length > 0 ? 'ready' : 'needs_more_options';

  return freezeResult({
    status,
    reason: status === 'ready' ? 'jubilee_policy_satisfied' : 'no_eligible_viable_candidates',
    choiceSet: choiceSet.map(toPublicCandidate),
    supportActions,
    disclosures,
    externalAlternativeLookupRequired,
    humanReviewRequired: externalAlternativeLookupRequired,
    audit,
  });
}

function evaluateCandidate(rawCandidate, originalIndex, audit) {
  const candidate = rawCandidate && typeof rawCandidate === 'object' ? rawCandidate : {};
  const id = String(candidate.id || `candidate_${originalIndex + 1}`);
  const source = candidate.source === 'external' ? 'external' : 'ekodi';
  const commercialRelationship = Boolean(candidate.commercialRelationship);
  const commercialDisclosure = String(candidate.commercialDisclosure || '').trim();
  const sponsorshipAffectsRanking = Boolean(candidate.sponsorshipAffectsRanking);
  const viable = candidate.viable !== false;

  let eligible = true;
  const exclusionReasons = [];

  if (commercialRelationship && !commercialDisclosure) {
    eligible = false;
    exclusionReasons.push('undisclosed_commercial_relationship');
    audit.warnings.push(`${id}:undisclosed_commercial_relationship`);
  }

  if (sponsorshipAffectsRanking) {
    eligible = false;
    exclusionReasons.push('secret_sponsorship_ranking_effect');
    audit.warnings.push(`${id}:secret_sponsorship_ranking_effect`);
  }

  return {
    id,
    source,
    originalIndex,
    viable,
    eligible,
    exclusionReasons,
    userFit: boundedNumber(candidate.userFit, 0),
    affordability: boundedNumber(candidate.affordability, 0),
    accessibility: boundedNumber(candidate.accessibility, 0),
    serviceQuality: boundedNumber(candidate.serviceQuality, 0),
    continuity: boundedNumber(candidate.continuity, 0),
    communityBenefit: boundedNumber(candidate.communityBenefit, 0),
    providerIndependence: boundedNumber(candidate.providerIndependence, 0),
    commercialRelationship,
    commercialDisclosure,
    metadata: sanitizeMetadata(candidate.metadata),
  };
}

function compareCandidates(a, b) {
  if (b.userFit !== a.userFit) return b.userFit - a.userFit;
  if (b.serviceQuality !== a.serviceQuality) return b.serviceQuality - a.serviceQuality;
  return a.originalIndex - b.originalIndex;
}

function preserveChoiceSet(eligible, audit) {
  if (eligible.length <= 1) return eligible;

  const topFit = eligible[0].userFit;
  const nearTop = eligible.filter(candidate => candidate.userFit >= Math.max(0, topFit - 0.15));
  const selected = nearTop.slice(0, 5);

  // A Jubilee recommendation must not become a one-provider funnel merely because
  // the top candidates cluster tightly. When both EKODI and external viable options
  // exist, preserve the best candidate from each source while keeping the best-fit
  // option first. This provides meaningful choice without using platform margin.
  for (const source of ['external', 'ekodi']) {
    const bestForSource = eligible.find(candidate => candidate.source === source);
    if (!bestForSource || selected.some(candidate => candidate.source === source)) continue;

    if (selected.length < 5) {
      selected.push(bestForSource);
    } else {
      const replacementIndex = findReplaceableProviderDuplicate(selected, source);
      if (replacementIndex >= 0) selected[replacementIndex] = bestForSource;
    }
  }

  selected.sort(compareCandidates);

  if (
    selected.some(candidate => candidate.source === 'external')
    && selected.some(candidate => candidate.source === 'ekodi')
  ) {
    audit.rulesTriggered.push('provider_choice_diversity_preserved');
  }

  return selected;
}

function findReplaceableProviderDuplicate(selected, incomingSource) {
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const candidate = selected[index];
    if (candidate.source === incomingSource) continue;
    const sameSourceCount = selected.filter(item => item.source === candidate.source).length;
    if (sameSourceCount > 1) return index;
  }
  return -1;
}

function normalizeNeedSignals(rawSignals, audit) {
  if (!Array.isArray(rawSignals)) return [];

  const accepted = [];
  for (const rawSignal of rawSignals) {
    const signal = rawSignal && typeof rawSignal === 'object' ? rawSignal : {};
    const type = String(signal.type || '').trim();
    const source = String(signal.source || '').trim();

    if (!ALLOWED_NEED_SIGNALS.has(type)) {
      audit.warnings.push(`ignored_need_signal:${type || 'unknown'}`);
      continue;
    }
    if (!ALLOWED_SIGNAL_SOURCES.has(source)) {
      audit.warnings.push(`ignored_unconsented_need_signal:${type}`);
      continue;
    }
    accepted.push({ type, source });
  }

  return accepted;
}

function deriveSupportActions(needSignals) {
  const actions = new Set();
  for (const signal of needSignals) {
    for (const action of SUPPORT_ACTIONS[signal.type] || []) actions.add(action);
  }
  return Object.freeze([...actions]);
}

function toPublicCandidate(candidate) {
  return Object.freeze({
    id: candidate.id,
    source: candidate.source,
    dimensions: Object.freeze({
      userFit: candidate.userFit,
      affordability: candidate.affordability,
      accessibility: candidate.accessibility,
      serviceQuality: candidate.serviceQuality,
      continuity: candidate.continuity,
      communityBenefit: candidate.communityBenefit,
      providerIndependence: candidate.providerIndependence,
    }),
    commercialRelationship: candidate.commercialRelationship,
    metadata: candidate.metadata,
  });
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return Object.freeze({});
  const safe = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (['sensitiveTraits', 'vulnerabilityLabel', 'privateProfile', 'crossTenantProfile'].includes(key)) continue;
    if (['string', 'number', 'boolean'].includes(typeof value) || value === null) safe[key] = value;
  }
  return Object.freeze(safe);
}

function boundedNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function freezeResult(result) {
  return Object.freeze({
    ...result,
    choiceSet: Object.freeze([...(result.choiceSet || [])]),
    supportActions: Object.freeze([...(result.supportActions || [])]),
    disclosures: Object.freeze([...(result.disclosures || [])]),
    audit: Object.freeze({
      ...result.audit,
      rulesTriggered: Object.freeze([...(result.audit?.rulesTriggered || [])]),
      warnings: Object.freeze([...(result.audit?.warnings || [])]),
    }),
    policyVersion: POLICY_VERSION,
  });
}
