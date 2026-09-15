const ALLOWED_SIGNAL_TYPES = new Set([
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

/**
 * Convert a Benefit Radar assessment into the minimum Jubilee context.
 * Scores, labels, identity and sensitive eligibility facts are deliberately
 * outside this return contract.
 */
export function adaptBenefitRadarAssessment(assessment = {}) {
  const raw = Array.isArray(assessment.supportSignals)
    ? assessment.supportSignals
    : Array.isArray(assessment.support_signals)
      ? assessment.support_signals
      : [];

  const needSignals = [];
  const seen = new Set();
  for (const item of raw) {
    const signal = item && typeof item === 'object' ? item : {};
    const type = String(signal.type || '').trim();
    const source = String(signal.source || '').trim();
    if (!ALLOWED_SIGNAL_TYPES.has(type) || !ALLOWED_SIGNAL_SOURCES.has(source)) continue;

    const key = `${type}:${source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    needSignals.push(Object.freeze({ type, source }));
  }

  return Object.freeze({
    context: Object.freeze({ needSignals: Object.freeze(needSignals) }),
    supportRef: safeUuid(assessment.support_ref || assessment.supportRef),
  });
}

export async function recordBenefitRadarSupport(input = {}, store) {
  if (!store || typeof store.recordSupportEvents !== 'function') {
    throw new Error('jubilee_support_store_required');
  }

  const adapted = adaptBenefitRadarAssessment(input.assessment);
  const actions = Array.isArray(input.supportActions) ? input.supportActions : [];
  if (actions.length === 0) return Object.freeze([]);

  const supportRef = adapted.supportRef || newOpaqueSupportRef();
  return store.recordSupportEvents({
    requestId: input.requestId,
    workspaceId: safeId(input.workspaceId || input.workspace_id),
    supportRef,
    policyVersion: input.policyVersion,
    supportActions: actions,
    deliveryStatus: input.deliveryStatus || 'offered',
    executedBy: input.executedBy,
  });
}

function newOpaqueSupportRef() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('jubilee_support_ref_generator_required');
  }
  return globalThis.crypto.randomUUID();
}

function safeUuid(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
    ? id
    : null;
}

function safeId(value) {
  const id = String(value || '').trim();
  if (!id) return null;
  return /^[A-Za-z0-9:_-]{1,160}$/.test(id) ? id : null;
}

export async function recordBenefitRadarPoolCommitment(input = {}, store) {
  if (!store || typeof store.recordPoolEntry !== 'function') {
    throw new Error('jubilee_pool_store_required');
  }
  if (input.approvalStatus !== 'approved') {
    throw new Error('jubilee_pool_human_approval_required');
  }

  const approvedBy = String(input.approvedBy || '').trim();
  if (!approvedBy) throw new Error('jubilee_pool_approver_required');

  const adapted = adaptBenefitRadarAssessment(input.assessment);
  const supportRef = adapted.supportRef || newOpaqueSupportRef();

  return store.recordPoolEntry({
    workspaceId: safeId(input.workspaceId || input.workspace_id),
    entryType: 'support_commitment',
    purpose: input.purpose || 'fee_relief',
    amountMinor: input.amountMinor,
    currency: input.currency || 'KRW',
    supportRef,
    reference: input.reference,
    policyVersion: input.policyVersion,
    createdBy: approvedBy,
  });
}
