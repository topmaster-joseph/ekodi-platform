const ZERO_MARGINAL_COST_CLASSES = Object.freeze([
  'free-preferred',
  'chatgpt-plan-included',
  'google-free-quota',
  'claude-subscription',
  'account-managed',
  'core-only',
]);
const PAID_COST_CLASSES = Object.freeze(['paid-opt-in', 'metered-paid']);

export const AI_COST_POLICY = Object.freeze({
  version: '1.0.0',
  policyId: 'AI-COST-001',
  status: 'enforced',
  principle: 'free-first-never-free-only',
  automaticPaidBudgetKrw: 0,
  paidApiAutoEscalation: false,
  paidApiRequiresExplicitDelegatedBudget: true,
  paidProviderHealthChecksDefault: false,
  unknownCostRequiresExplicitDelegatedBudget: true,
  zeroMarginalCostClasses: ZERO_MARGINAL_COST_CLASSES,
  paidCostClasses: PAID_COST_CLASSES,
  freeExhaustedFallback: Object.freeze(['alternate-zero-cost', 'core-only', 'retry-later']),
});

const clean = value => String(value ?? '').trim().toLowerCase();

export function normalizeAiCostClass(value = '') {
  const normalized = clean(value);
  return normalized || 'unknown';
}
export function isZeroMarginalCostClass(value = '') {
  return ZERO_MARGINAL_COST_CLASSES.includes(normalizeAiCostClass(value));
}

export function isPaidOrUnclassifiedCostClass(value = '') {
  const costClass = normalizeAiCostClass(value);
  if (isZeroMarginalCostClass(costClass)) return false;
  return PAID_COST_CLASSES.includes(costClass) || AI_COST_POLICY.unknownCostRequiresExplicitDelegatedBudget;
}

export function paidAiExecutionAuthorized(context = {}) {
  const source = context?.governance && typeof context.governance === 'object' ? context.governance : context;
  return source?.paidCommitment === true && source?.explicitDelegatedBudget === true;
}

export function evaluateAiCostEligibility(candidate = {}, context = {}) {
  const costClass = normalizeAiCostClass(candidate.costClass);
  const quotaKnown = candidate.freeQuotaRemaining !== undefined && candidate.freeQuotaRemaining !== null;
  if (isZeroMarginalCostClass(costClass)) {
    if (quotaKnown && ['free-preferred', 'google-free-quota'].includes(costClass) && Number(candidate.freeQuotaRemaining) <= 0) {
      return Object.freeze({ eligible:false, costClass, blockedBy:'free_quota_exhausted' });
    }
    return Object.freeze({ eligible:true, costClass, blockedBy:'' });
  }
  if (paidAiExecutionAuthorized(context)) return Object.freeze({ eligible:true, costClass, blockedBy:'' });
  return Object.freeze({ eligible:false, costClass, blockedBy:'paid_or_unclassified_cost_requires_explicit_budget' });
}

export const AI_COST_CLASSES = Object.freeze({
  zeroMarginal: ZERO_MARGINAL_COST_CLASSES,
  paid: PAID_COST_CLASSES,
});
