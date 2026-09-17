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

function resolveAdapter(adapters, capabilityId) {
  const adapter = adapters instanceof Map ? adapters.get(capabilityId) : adapters?.[capabilityId];
  if (!adapter || typeof adapter.execute !== 'function' || typeof adapter.verify !== 'function') return null;
  return adapter;
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

    const adapter = resolveAdapter(adapters, capabilityId);
    if (!adapter) {
      return freeze({ schemaVersion: 1, state: 'degraded', reason: 'execution_adapter_unavailable', capabilityId, executionRequired: true });
    }
    if (String(capability.actionTier).includes('reversible') && typeof adapter.rollback !== 'function') {
      return freeze({ schemaVersion: 1, state: 'degraded', reason: 'rollback_adapter_required', capabilityId, executionRequired: true });
    }

    const executionId = uuid('exec');
    const startedAt = new Date().toISOString();
    const executionContext = freeze({
      taskId: clean(input.taskId, 120) || null,
      executionId,
      capabilityId,
      capability,
      target: freeze({ ...(input.target || {}) }),
      authority,
      goal: clean(input.goal, 1200),
      payload: input.payload ?? input.context?.executionPayload ?? null,
    });

    let effect;
    try {
      effect = await adapter.execute(executionContext);
    } catch (error) {
      return freeze({
        schemaVersion: 1,
        state: 'failed',
        reason: 'capability_execution_failed',
        error: clean(error?.message || error, 500),
        capabilityId,
        executionRequired: true,
      });
    }

    const receipt = freeze({
      schemaVersion: 1,
      executionId,
      taskId: executionContext.taskId,
      capabilityId,
      actionTier: capability.actionTier,
      adapterId: clean(adapter.id || capabilityId, 160),
      target: executionContext.target,
      authority: freeze({ personId: authority.personId, workspaceId: authority.workspaceId, role: authority.role }),
      effectPerformed: effect?.effectPerformed === true,
      reversible: String(capability.actionTier).includes('reversible'),
      rollbackTarget: clean(effect?.rollbackTarget, 240) || null,
      resultDigest: await digest(effect),
      status: effect?.effectPerformed === true ? 'executed' : 'no_effect',
      startedAt,
      completedAt: new Date().toISOString(),
    });

    if (!receipt.effectPerformed) {
      return freeze({ schemaVersion: 1, state: 'failed', reason: 'execution_reported_no_effect', capabilityId, executionRequired: true, executionReceipt: receipt });
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
      return freeze({
        schemaVersion: 1,
        state: recovery.succeeded ? 'degraded' : 'failed',
        reason: 'post_execution_verification_failed',
        capabilityId,
        executionRequired: true,
        executionReceipt: receipt,
        verificationEvidence,
        recoveryEvidence: recovery,
      });
    }

    return freeze({
      schemaVersion: 1,
      state: 'verified',
      capabilityId,
      executionRequired: true,
      executionReceipt: receipt,
      verificationEvidence,
    });
  }

  return freeze({ schemaVersion: 1, id: 'ekodi-capability-executor', execute });
}

export const EKODI_CAPABILITY_EXECUTOR = freeze({
  version: '1.0.0',
  targetGeneration: 10,
  directArbitraryExecution: false,
  adapterPolicy: 'registered-capability-explicit-adapter-only',
  completionPolicy: 'side-effects-require-execution-receipt-and-verification-evidence',
});
