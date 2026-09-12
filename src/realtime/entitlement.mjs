import capabilityPolicy from '../../config/realtime-capabilities.json' with { type: 'json' };

const ADMIN_ROLES = new Set(['owner','admin','tenant_admin','manager','operator']);
const ACTIVE_PAID_STATUSES = new Set(['active','paid','trialing']);

export function tierPolicy(tier = capabilityPolicy.entitlements.freeTier) {
  const selected = capabilityPolicy.entitlements.tiers[tier];
  if (!selected) throw new Error(`unknown_realtime_tier:${tier}`);
  return structuredClone(selected);
}

export function resolveRealtimeTier({ authorizationRole = '', subscription = null, authenticated = false } = {}) {
  if (ADMIN_ROLES.has(String(authorizationRole).toLowerCase())) return capabilityPolicy.entitlements.adminTier;
  const planId = String(subscription?.plan_id || subscription?.planId || '').toLowerCase();
  const status = String(subscription?.status || '').toLowerCase();
  if (planId && planId !== 'free' && ACTIVE_PAID_STATUSES.has(status)) return capabilityPolicy.entitlements.paidTier;
  return authenticated ? capabilityPolicy.entitlements.freeTier : 'anonymous';
}

export function evaluateRealtimeRequest({ tier, interactiveParticipants = 1, languages = 0, durationMinutes = 0, recording = false, multistream = false } = {}) {
  const limits = tierPolicy(tier);
  const reasons = [];
  if (!limits.canHost) reasons.push('host_permission_required');
  if (interactiveParticipants > limits.maxInteractiveParticipants) reasons.push('interactive_participant_limit');
  if (languages > limits.maxLanguages) reasons.push('language_limit');  if (durationMinutes > limits.maxDurationMinutes) reasons.push('duration_limit');
  if (recording && !limits.recording) reasons.push('recording_not_included');
  if (multistream && !limits.multistream) reasons.push('multistream_not_included');
  return {
    allowed: reasons.length === 0,
    tier,
    limits,
    reasons,
    requiresSubscription: reasons.some(reason => reason !== 'host_permission_required') && tier !== capabilityPolicy.entitlements.adminTier,
  };
}

export function entitlementSnapshot(input = {}) {
  const tier = resolveRealtimeTier(input);
  const limits = tierPolicy(tier);
  return Object.freeze({
    tier,
    limits,
    canHost: Boolean(limits.canHost),
    loginRequired: tier === 'anonymous',
    subscriptionSite: capabilityPolicy.entitlements.subscriptionSite,
  });
}

export const REALTIME_ENTITLEMENT_CONTRACT = Object.freeze({
  version: 1,
  subscriptionSite: capabilityPolicy.entitlements.subscriptionSite,
  publicViewingDefault: true,
  adminImmediateHost: true,
});