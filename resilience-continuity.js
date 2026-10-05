const approvedHealthy = item =>
  Boolean(item && item.approved === true && item.healthy === true && item.securityEquivalentOrStronger !== false);

const choose = (alternatives = [], predicate = () => true) =>
  alternatives.find(item => approvedHealthy(item) && predicate(item)) || null;

export function planContinuity(input = {}) {
  const {
    capability = 'read',
    failed = true,
    outcome = 'failed',
    alternatives = [],
    cache = null,
    privileged = false,
  } = input;

  if (!failed || outcome === 'healthy') {
    return Object.freeze({ action: 'continue-primary', target: null, postRecoveryRequired: false });
  }

  if (capability === 'identity' || capability === 'security') {
    return Object.freeze({
      action: privileged ? 'fail-closed-privileged' : 'preserve-safe-public-read-only',
      target: null,
      postRecoveryRequired: true,
    });
  }

  if (capability === 'ai') {
    const target = choose(alternatives, item => item.role === 'ai-provider');
    return Object.freeze(target
      ? { action: 'switch-approved-ai-provider', target: target.id, postRecoveryRequired: true }
      : { action: 'continue-without-optional-ai', target: null, postRecoveryRequired: true });
  }

  if (capability === 'deployment') {
    return Object.freeze({ action: 'rollback-last-known-good', target: null, postRecoveryRequired: true });
  }

  if (capability === 'third-party-module') {
    return Object.freeze({ action: 'isolate-extension-use-canonical-core', target: null, postRecoveryRequired: true });
  }

  if (capability === 'write') {
    if (outcome === 'ambiguous') {
      return Object.freeze({
        action: 'queue-and-reconcile',
        target: null,
        blindReplayForbidden: true,
        postRecoveryRequired: true,
      });
    }

    const target = choose(
      alternatives,
      item => item.role === 'write-plane' &&
        item.sharedCanonicalOwnership === true &&
        item.idempotencyCompatible === true,
    );
    return Object.freeze(target
      ? { action: 'switch-compatible-write-plane', target: target.id, postRecoveryRequired: true }
      : { action: 'durable-queue-until-write-plane-recovers', target: null, postRecoveryRequired: true });
  }

  if (capability === 'storage') {
    const target = choose(
      alternatives,
      item => item.role === 'storage-adapter' && item.portableReferences === true,
    );
    return Object.freeze(target
      ? { action: 'switch-approved-storage-adapter', target: target.id, postRecoveryRequired: true }
      : { action: 'durable-queue-storage-write', target: null, postRecoveryRequired: true });
  }

  if (capability === 'worker') {
    const target = choose(
      alternatives,
      item => item.role === 'worker' && item.idempotencyCompatible === true,
    );
    return Object.freeze(target
      ? { action: 'switch-approved-worker', target: target.id, postRecoveryRequired: true }
      : { action: 'queue-task-for-reconcile', target: null, postRecoveryRequired: true });
  }

  if (capability === 'read' || capability === 'network') {
    const target = choose(alternatives, item => item.role === 'read-plane' || item.role === 'route');
    if (target) {
      return Object.freeze({ action: 'switch-approved-read-route', target: target.id, postRecoveryRequired: true });
    }
    if (cache?.available === true) {
      return Object.freeze({
        action: 'serve-marked-last-known-good-read',
        target: null,
        stale: cache.fresh !== true,
        postRecoveryRequired: true,
      });
    }
    return Object.freeze({ action: 'report-unavailable-truthfully', target: null, postRecoveryRequired: true });
  }

  return Object.freeze({ action: 'isolate-and-reconcile', target: null, postRecoveryRequired: true });
}

export function recoveryLifecycle(decision) {
  return Object.freeze({
    immediate: Object.freeze([
      'observe',
      'classify',
      'isolate',
      decision.action,
      'verify-continuity',
      'record-evidence',
    ]),
    postRecovery: Object.freeze([
      'repair-root-cause',
      'retest',
      'restore-or-permanently-replace',
      'production-reverify',
    ]),
  });
}
