const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const EMERGENCY_REASONS = new Set(['security-patch', 'legal-notice', 'incident-recovery']);

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function truthy(value) {
  return TRUE_VALUES.has(normalized(value));
}

export function resolvePublicationDecision(env = process.env) {
  const eventName = normalized(env.GITHUB_EVENT_NAME || 'local');
  const actor = String(env.GITHUB_ACTOR || '').trim() || 'unknown';
  const emergencyRequested = truthy(env.EKODI_EMERGENCY_PUBLISH);
  const emergencyReason = normalized(env.EKODI_EMERGENCY_REASON);

  if (emergencyRequested) {
    if (!EMERGENCY_REASONS.has(emergencyReason)) {
      return Object.freeze({
        state: 'private',
        approved: false,
        mode: 'emergency-denied',
        eventName,
        actor,
        reason: 'Emergency publication requires EKODI_EMERGENCY_REASON=security-patch|legal-notice|incident-recovery.',
      });
    }
    return Object.freeze({
      state: 'published',
      approved: true,
      mode: 'emergency',
      eventName,
      actor,
      reason: emergencyReason,
    });
  }

  if (eventName === 'workflow_dispatch') {
    return Object.freeze({
      state: 'published',
      approved: true,
      mode: 'administrator-review',
      eventName,
      actor,
      reason: 'Manual guarded release after administrator review.',
    });
  }

  return Object.freeze({
    state: 'private',
    approved: false,
    mode: 'private-by-default',
    eventName,
    actor,
    reason: 'Automatic releases deploy to a private review candidate and never promote public traffic.',
  });
}

export function publicationDecisionSummary(decision) {
  const state = decision?.approved ? 'PUBLICATION APPROVED' : 'PRIVATE REVIEW';
  return `${state} · mode=${decision?.mode || 'unknown'} · event=${decision?.eventName || 'unknown'} · actor=${decision?.actor || 'unknown'} · ${decision?.reason || ''}`;
}

export function isPublicPromotionApproved(env = process.env) {
  return resolvePublicationDecision(env).approved === true;
}
