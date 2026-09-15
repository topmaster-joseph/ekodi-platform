const DECISION_STATUSES = new Set(['ready', 'needs_more_options', 'blocked']);
const SUPPORT_ACTIONS = new Set([
  'consider_fee_waiver',
  'consider_jubilee_credit',
  'show_lower_cost_alternatives',
  'priority_access_review',
  'offer_assisted_channel',
  'offer_language_support',
  'offer_remote_or_accessible_option',
  'offer_low_friction_or_assisted_channel',
  'offer_async_or_flexible_option',
]);
const SUPPORT_DELIVERY_STATUSES = new Set(['offered', 'accepted', 'delivered', 'declined', 'expired', 'cancelled']);
const POOL_ENTRY_TYPES = new Set([
  'platform_allocation',
  'voluntary_contribution',
  'partner_cofunding',
  'support_commitment',
  'support_release',
  'reversal',
]);
const POOL_PURPOSES = new Set(['access_support', 'fee_relief', 'community_reinvestment', 'connection_support']);

/**
 * Convert a Jubilee gate/API audit envelope into the exact privacy-minimized
 * operational event contract. Unknown fields are intentionally discarded.
 * Raw context, candidate bodies, need signals and beneficiary identifiers never
 * enter the returned object.
 */
export function buildJubileePolicyEvent(audit = {}) {
  const requestId = requiredText(audit.requestId, 'requestId', 200);
  const decisionStatus = String(audit.decisionStatus || audit.status || '').trim();
  if (!DECISION_STATUSES.has(decisionStatus)) throw new Error('invalid_jubilee_decision_status');

  return Object.freeze({
    request_id: requestId,
    workspace_id: safeId(audit.workspaceId),
    purpose: safePurpose(audit.purpose),
    policy_version: requiredText(audit.policyVersion, 'policyVersion', 80),
    decision_status: decisionStatus,
    candidate_count: nonNegativeInteger(audit.candidateCount),
    choice_count: nonNegativeInteger(audit.choiceCount),
    support_action_count: nonNegativeInteger(audit.supportActionCount),
    external_alternative_lookup_required: Boolean(audit.externalAlternativeLookupRequired),
    human_review_required: Boolean(audit.humanReviewRequired),
    rules_triggered: Object.freeze(normalizeRuleIds(audit.rulesTriggered)),
    warning_count: nonNegativeInteger(audit.warningCount),
    actor_ref_hash: safeHash(audit.actorRefHash),
  });
}

/**
 * Build support execution events from already-approved support actions.
 * `supportRef` is opaque and must not encode or contain beneficiary identity.
 */
export function buildJubileeSupportEvents(input = {}) {
  const requestId = optionalText(input.requestId, 200);
  const supportRef = safeUuid(input.supportRef);
  if (!supportRef) throw new Error('opaque_support_ref_required');
  const workspaceId = safeId(input.workspaceId);
  const policyVersion = requiredText(input.policyVersion, 'policyVersion', 80);
  const deliveryStatus = String(input.deliveryStatus || 'offered').trim();
  if (!SUPPORT_DELIVERY_STATUSES.has(deliveryStatus)) throw new Error('invalid_support_delivery_status');
  const executedBy = optionalText(input.executedBy, 160);
  const actions = Array.isArray(input.supportActions) ? input.supportActions : [];

  return Object.freeze([...new Set(actions)].map(action => {
    const actionCode = String(action || '').trim();
    if (!SUPPORT_ACTIONS.has(actionCode)) throw new Error(`unsupported_jubilee_support_action:${actionCode}`);
    return Object.freeze({
      request_id: requestId,
      workspace_id: workspaceId,
      support_ref: supportRef,
      action_code: actionCode,
      delivery_status: deliveryStatus,
      policy_version: policyVersion,
      executed_by: executedBy,
    });
  }));
}

export function buildJubileePoolEntry(input = {}) {
  const entryType = String(input.entryType || '').trim();
  const purpose = String(input.purpose || '').trim();
  if (!POOL_ENTRY_TYPES.has(entryType)) throw new Error('invalid_jubilee_pool_entry_type');
  if (!POOL_PURPOSES.has(purpose)) throw new Error('invalid_jubilee_pool_purpose');

  const amountMinor = Number(input.amountMinor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error('invalid_jubilee_pool_amount');

  const currency = String(input.currency || 'KRW').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('invalid_jubilee_pool_currency');

  const requiresSupportRef = ['support_commitment', 'support_release', 'reversal'].includes(entryType);
  const supportRef = input.supportRef ? safeUuid(input.supportRef) : null;
  if (requiresSupportRef && !supportRef) throw new Error('jubilee_pool_support_ref_required');

  return Object.freeze({
    workspace_id: safeId(input.workspaceId),
    entry_type: entryType,
    purpose,
    amount_minor: amountMinor,
    currency,
    support_ref: supportRef,
    reference: optionalText(input.reference, 240),
    policy_version: requiredText(input.policyVersion, 'policyVersion', 80),
    created_by: optionalText(input.createdBy, 160),
  });
}

/**
 * Vendor-neutral persistence boundary. The injected adapter can target Supabase,
 * Postgres, another durable store or a future replacement without changing the
 * Jubilee policy/runtime contract.
 */
export function createJubileeOperationalStore(adapter = {}) {
  const appendPolicyEvent = requireFunction(adapter.appendPolicyEvent, 'appendPolicyEvent');
  const appendSupportEvents = requireFunction(adapter.appendSupportEvents, 'appendSupportEvents');
  const appendPoolEntry = requireFunction(adapter.appendPoolEntry, 'appendPoolEntry');

  return Object.freeze({
    async recordPolicyEvent(audit) {
      const event = buildJubileePolicyEvent(audit);
      await appendPolicyEvent(event);
      return event;
    },

    async recordSupportEvents(input) {
      const events = buildJubileeSupportEvents(input);
      if (events.length > 0) await appendSupportEvents(events);
      return events;
    },

    async recordPoolEntry(input) {
      const entry = buildJubileePoolEntry(input);
      await appendPoolEntry(entry);
      return entry;
    },
  });
}

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new Error(`jubilee_store_adapter_required:${name}`);
  return value;
}

function requiredText(value, name, maxLength) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`jubilee_${name}_required`);
  return text.slice(0, maxLength);
}

function optionalText(value, maxLength) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function safeId(value) {
  const id = String(value || '').trim();
  if (!id) return null;
  return /^[A-Za-z0-9:_-]{1,160}$/.test(id) ? id : null;
}

function safePurpose(value) {
  const purpose = String(value || 'recommendation').trim().toLowerCase();
  return /^[a-z0-9:_-]{1,80}$/.test(purpose) ? purpose : 'recommendation';
}

function safeHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

function safeUuid(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : null;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function normalizeRuleIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(item => /^[a-z0-9:_-]{1,100}$/i.test(item)))].slice(0, 100);
}
