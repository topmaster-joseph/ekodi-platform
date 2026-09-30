import { getCapabilityNode } from './ekodi-capability-ecosystem.js';

const HIGH_RISKS = new Set(['high', 'critical']);
const RED_CHANGE_CLASSES = new Set(['red', 'constitutional_change', 'production_dns', 'permission_expansion', 'destructive_data', 'secrets']);
const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const freeze = value => Object.freeze(value);

function uuid(prefix) {
  const value = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${value}`;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

async function digest(value) {
  const source = canonical(value);
  if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
    const bytes = new TextEncoder().encode(source);
    const hashed = await crypto.subtle.digest('SHA-256', bytes);
    return `sha256:${[...new Uint8Array(hashed)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  let hash = 0x811c9dc5;
  for (const char of source) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function capabilityRequiresExecution(capabilityId) {
  const capability = getCapabilityNode(clean(capabilityId, 160));
  return Boolean(capability && String(capability.actionTier || '').startsWith('execute'));
}

export function executionEvidenceSatisfied(task = {}, result = {}) {
  const capabilityId = clean(task?.target?.capability || result?.plan?.target?.capability, 160);
  const required = capabilityRequiresExecution(capabilityId);
  if (!required) return freeze({ required: false, satisfied: true, capabilityId: capabilityId || null });
  const receipt = result?.evidence?.executionReceipt;
  const verification = result?.evidence?.verificationEvidence;
  const satisfied = Boolean(
    receipt?.effectPerformed === true
    && receipt?.status === 'executed'
    && receipt?.capabilityId === capabilityId
    && verification?.passed === true
    && verification?.executionId === receipt?.executionId,
  );
  return freeze({ required: true, satisfied, capabilityId, receipt: receipt || null, verification: verification || null });
}

function normalizeAuthority(authority = {}) {
  const capabilityGrants = Array.isArray(authority.capabilityGrants)
    ? authority.capabilityGrants.map(item => clean(item, 160)).filter(Boolean)
    : [];
  return freeze({
    personId: clean(authority.personId || authority.person?.id, 120) || null,
    workspaceId: clean(authority.workspaceId || authority.workspace?.id, 120) || null,
    role: clean(authority.role || authority.roleId, 120) || null,
    capabilityGrants: freeze([...new Set(capabilityGrants)]),
  });
}

function authorityAllows(authority, capabilityId, target = {}) {
  if (!authority.personId || !authority.role) return false;
  if (target.workspaceId && authority.workspaceId !== target.workspaceId) return false;
  return authority.capabilityGrants.includes('*') || authority.capabilityGrants.includes(capabilityId);
}

function requiresHumanGate(input = {}) {
  const risk = clean(input.risk, 20).toLowerCase();
  const changeClass = clean(input.event?.changeClass || input.changeClass, 80).toLowerCase();
  return HIGH_RISKS.has(risk)
    || RED_CHANGE_CLASSES.has(changeClass)
    || input.event?.requiresHumanDecision === true;
}

function adapterId(adapter, index = 0) {
  return clean(adapter?.id || adapter?.lane || `adapter_${index + 1}`, 160) || `adapter_${index + 1}`;
}

function resolveAdapters(adapters, capabilityId) {
  const entry = adapters instanceof Map ? adapters.get(capabilityId) : adapters?.[capabilityId];
  if (!entry) return [];
  const source = Array.isArray(entry)
    ? entry
    : entry && typeof entry === 'object' && typeof entry.execute !== 'function' && (entry.primary || entry.fallbacks)
      ? [entry.primary, ...(Array.isArray(entry.fallbacks) ? entry.fallbacks : [])]
      : [entry];
  return source
    .filter(Boolean)
    .map((adapter, index) => {
      const priority = Number(adapter?.priority);
      return {
        adapter,
        index,
        priority: Number.isFinite(priority) ? priority : index + 1,
      };
    })
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(item => item.adapter);
}

function staticAdapterBlockReason(adapter) {
  if (!adapter || typeof adapter.execute !== 'function' || typeof adapter.verify !== 'function') return 'adapter_contract_invalid';
  if (adapter.bypassOrchestrationGate === true) return 'orchestration_gate_bypass_forbidden';
  if (adapter.available === false) return 'adapter_unavailable';
  if (adapter.quotaExhausted === true || Number(adapter.monthlyQuotaRemaining) === 0) return 'quota_exhausted';
  const status = clean(adapter.status, 80).toLowerCase();
  if (['unavailable', 'disabled', 'suspended', 'quota_exhausted', 'monthly_limit_reached', 'offline'].includes(status)) return status;
  const health = clean(adapter.health, 80).toLowerCase();
  if (['failed', 'unavailable', 'offline', 'quota_exhausted'].includes(health)) return `health_${health}`;
  return '';
}

async function preflightAdapter(adapter, context) {
  const staticReason = staticAdapterBlockReason(adapter);
  if (staticReason) return freeze({ ok: false, reason: staticReason });
  if (typeof adapter.preflight !== 'function') return freeze({ ok: true, reason: null });
  try {
    const result = await adapter.preflight(context);
    if (result === false || result?.ok === false || result?.available === false) {
      return freeze({ ok: false, reason: clean(result?.reason || result?.code || 'adapter_preflight_rejected', 240) });
    }
    if (result?.quotaExhausted === true || Number(result?.monthlyQuotaRemaining) === 0) {
      return freeze({ ok: false, reason: 'quota_exhausted' });
    }
    return freeze({ ok: true, reason: null });
  } catch (error) {
    return freeze({ ok: false, reason: clean(error?.message || error, 240) || 'adapter_preflight_failed' });
  }
}

function executionAttempt(adapter, index, state, reason, extra = {}) {
  return freeze({
    adapterId: adapterId(adapter, index),
    lane: clean(adapter?.lane, 80) || null,
    priority: Number.isFinite(Number(adapter?.priority)) ? Number(adapter.priority) : index + 1,
    state,
    reason: clean(reason, 240) || null,
    ...extra,
  });
}

function safeToFallbackAfterError(adapter, error) {
  return error?.safeToFallback === true || adapter?.executionFailureSafeToFallback === true;
}

async function recoveryEvidence(adapter, context, receipt, reason) {
  if (typeof adapter.rollback !== 'function') {
    return freeze({ attempted: false, succeeded: false, reason: 'rollback_adapter_unavailable' });
  }
  try {
    const rollbackResult = await adapter.rollback(freeze({ ...context, receipt, reason }));
    const succeeded = rollbackResult?.succeeded !== false;
    return freeze({
      attempted: true,
      succeeded,
      rollbackId: clean(rollbackResult?.rollbackId || uuid('rollback'), 160),
      resultDigest: await digest(rollbackResult),
    });
  } catch (error) {
    return freeze({ attempted: true, succeeded: false, reason: clean(error?.message || error, 300) || 'rollback_failed' });
  }
}

export function buildEkodiCapabilityExecutor(options = {}) {
  const adapters = options.adapters || {};

  async function execute(input = {}) {
    const capabilityId = clean(input.capabilityId || input.target?.capability, 160);
    const capability = getCapabilityNode(capabilityId);
    if (!capability) {
      return freeze({ schemaVersion: 1, state: 'failed', reason: 'capability_not_registered', capabilityId: capabilityId || null });
    }
    if (!String(capability.actionTier || '').startsWith('execute')) {
      return freeze({ schemaVersion: 1, state: 'not_required', capabilityId, actionTier: capability.actionTier, executionRequired: false });
    }
    if (requiresHumanGate(input)) {
      return freeze({ schemaVersion: 1, state: 'human_gate', reason: 'sovereign_or_high_impact_gate', capabilityId, executionRequired: true });
    }

    const delegation = input.delegation || {};
    const delegated = delegation.allowed === true
      && delegation.reversible === true
      && delegation.audited === true
      && delegation.preflightVerified === true
      && delegation.verificationDefined === true;
    if (!delegated) {
      return freeze({ schemaVersion: 1, state: 'human_gate', reason: 'standing_delegation_not_satisfied', capabilityId, executionRequired: true });
    }

    const authority = normalizeAuthority(input.authority || input.context?.authority || {});
    if (!authorityAllows(authority, capabilityId, input.target || {})) {
      return freeze({ schemaVersion: 1, state: 'human_gate', reason: 'authority_context_incomplete_or_denied', capabilityId, executionRequired: true });
    }

    const candidates = resolveAdapters(adapters, capabilityId);
    if (!candidates.length) {
      return freeze({ schemaVersion: 1, state: 'degraded', reason: 'execution_adapter_unavailable', capabilityId, executionRequired: true, executionAttempts: freeze([]), fallbackUsed: false });
    }

    const attempts = [];
    let lastFailure = null;
    let executionStarted = false;
    const reversible = String(capability.actionTier).includes('reversible');

    for (let index = 0; index < candidates.length; index += 1) {
      const adapter = candidates[index];
      const baseContext = freeze({
        taskId: clean(input.taskId, 120) || null,
        capabilityId,
        capability,
        target: freeze({ ...(input.target || {}) }),
        authority,
        goal: clean(input.goal, 1200),
        payload: input.payload ?? input.context?.executionPayload ?? null,
      });

      const preflight = await preflightAdapter(adapter, baseContext);
      if (!preflight.ok) {
        attempts.push(executionAttempt(adapter, index, 'skipped', preflight.reason));
        continue;
      }
      if (reversible && typeof adapter.rollback !== 'function') {
        attempts.push(executionAttempt(adapter, index, 'skipped', 'rollback_adapter_required'));
        continue;
      }

      const executionId = uuid('exec');
      const startedAt = new Date().toISOString();
      const executionContext = freeze({ ...baseContext, executionId });
      executionStarted = true;

      let effect;
      try {
        effect = await adapter.execute(executionContext);
      } catch (error) {
        const reason = clean(error?.message || error, 500) || 'capability_execution_failed';
        const fallbackSafe = safeToFallbackAfterError(adapter, error);
        attempts.push(executionAttempt(adapter, index, fallbackSafe ? 'failed_safe_to_fallback' : 'failed', reason));
        lastFailure = freeze({
          schemaVersion: 1,
          state: 'failed',
          reason: 'capability_execution_failed',
          error: reason,
          capabilityId,
          executionRequired: true,
        });
        if (fallbackSafe) continue;
        return freeze({ ...lastFailure, executionAttempts: freeze([...attempts]), fallbackUsed: attempts.length > 1 });
      }

      const receipt = freeze({
        schemaVersion: 1,
        executionId,
        taskId: executionContext.taskId,
        capabilityId,
        actionTier: capability.actionTier,
        adapterId: adapterId(adapter, index),
        target: executionContext.target,
        authority: freeze({ personId: authority.personId, workspaceId: authority.workspaceId, role: authority.role }),
        effectPerformed: effect?.effectPerformed === true,
        reversible,
        rollbackTarget: clean(effect?.rollbackTarget, 240) || null,
        resultDigest: await digest(effect),
        status: effect?.effectPerformed === true ? 'executed' : 'no_effect',
        startedAt,
        completedAt: new Date().toISOString(),
      });

      if (!receipt.effectPerformed) {
        attempts.push(executionAttempt(adapter, index, 'no_effect', 'execution_reported_no_effect', { executionId }));
        lastFailure = freeze({
          schemaVersion: 1,
          state: 'failed',
          reason: 'execution_reported_no_effect',
          capabilityId,
          executionRequired: true,
          executionReceipt: receipt,
        });
        continue;
      }

      let verification;
      try {
        verification = await adapter.verify(freeze({ ...executionContext, receipt, effect }));
      } catch (error) {
        verification = { passed: false, reason: clean(error?.message || error, 500) || 'verification_failed' };
      }
      const verificationEvidence = freeze({
        schemaVersion: 1,
        verificationId: clean(verification?.verificationId || uuid('verify'), 160),
        executionId,
        capabilityId,
        passed: verification?.passed === true,
        method: clean(verification?.method || 'adapter-verification', 160),
        observedDigest: await digest(verification),
        verifiedAt: new Date().toISOString(),
        reason: clean(verification?.reason, 300) || null,
      });

      if (!verificationEvidence.passed) {
        const recovery = await recoveryEvidence(adapter, executionContext, receipt, verificationEvidence.reason || 'verification_failed');
        attempts.push(executionAttempt(adapter, index, recovery.succeeded ? 'rolled_back' : 'verification_failed', verificationEvidence.reason || 'post_execution_verification_failed', { executionId }));
        lastFailure = freeze({
          schemaVersion: 1,
          state: recovery.succeeded ? 'degraded' : 'failed',
          reason: 'post_execution_verification_failed',
          capabilityId,
          executionRequired: true,
          executionReceipt: receipt,
          verificationEvidence,
          recoveryEvidence: recovery,
        });
        if (recovery.succeeded) continue;
        return freeze({ ...lastFailure, executionAttempts: freeze([...attempts]), fallbackUsed: attempts.length > 1 });
      }

      attempts.push(executionAttempt(adapter, index, 'verified', null, { executionId }));
      return freeze({
        schemaVersion: 1,
        state: 'verified',
        capabilityId,
        executionRequired: true,
        executionReceipt: receipt,
        verificationEvidence,
        executionAttempts: freeze([...attempts]),
        selectedAdapterId: receipt.adapterId,
        fallbackUsed: attempts.length > 1,
      });
    }

    if (lastFailure) {
      return freeze({
        ...lastFailure,
        executionAttempts: freeze([...attempts]),
        fallbackUsed: attempts.length > 1,
      });
    }

    return freeze({
      schemaVersion: 1,
      state: 'degraded',
      reason: executionStarted ? 'all_execution_adapters_exhausted' : 'all_execution_adapters_unavailable_or_exhausted',
      capabilityId,
      executionRequired: true,
      executionAttempts: freeze([...attempts]),
      fallbackUsed: attempts.length > 1,
    });
  }

  return freeze({ schemaVersion: 1, id: 'ekodi-capability-executor', execute });
}

export const EKODI_EXECUTION_FALLBACK_POLICY = freeze({
  version: '1.0.0',
  strategy: 'ordered-registered-adapter-fallback',
  cloudFirst: true,
  preserveOrchestrationGate: true,
  skipUnavailableOrQuotaExhaustedAdaptersBeforeExecution: true,
  continueAfterNoEffect: true,
  continueAfterVerifiedRollback: true,
  continueAfterExecutionErrorOnlyWhenExplicitlySafe: true,
  unsafeFailureStopsFanout: true,
  humanInterruption: 'only_when_authority_safety_or_all_registered_lanes_require_it',
  recommendedLaneOrder: freeze([
    'github_connector',
    'github_actions',
    'managed_cloud_runner',
    'service_connector',
    'device_agent',
    'self_hosted_runner',
    'remote_desktop',
  ]),
});

export const EKODI_CAPABILITY_EXECUTOR = freeze({
  version: '1.1.0',
  targetGeneration: 10,
  directArbitraryExecution: false,
  adapterPolicy: 'registered-capability-ordered-fallback-adapters-only',
  completionPolicy: 'side-effects-require-execution-receipt-and-verification-evidence',
  fallbackPolicy: EKODI_EXECUTION_FALLBACK_POLICY,
});
