const MAINTENANCE_KINDS = new Set([
  'health_check',
  'stale_cache',
  'temporary_artifact',
  'worker_degraded',
  'provider_degraded',
  'queue_stall',
  'backup_verification',
]);

const MUTATING_ACTIONS = new Set(['quarantine', 'recover']);

export const EKODI_MAINTENANCE_RECOVERY_POLICY = Object.freeze({
  version: '1.0.0',
  system: 'ekodi-maintenance-recovery-engine',
  displayName: 'EKODI 자가정비·회복',
  internalNickname: 'EKODI Glymphatic',
  orchestratorOwned: true,
  lowActivityThreshold: 0.35,
  dryRunByDefault: true,
  noDirectDelete: true,
  quarantineBeforePurge: true,
  mutationRequiresExplicitEnable: true,
  mutationRequiresReversibleAction: true,
  mutationRequiresVerification: true,
  failedVerificationRequiresRollback: true,
  directProductionMutation: false,
  lifecycle: 'observe -> classify -> plan -> quarantine/recover -> verify -> rollback-if-needed -> record',
});

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function severity(value) {
  const normalized = text(value, 20).toLowerCase();
  return ['low', 'normal', 'high', 'critical'].includes(normalized) ? normalized : 'normal';
}

function normalizeSignal(value = {}, index = 0) {
  const kind = text(value.kind || 'health_check', 80).toLowerCase();
  const state = text(value.state || value.status || 'unknown', 80).toLowerCase();
  return Object.freeze({
    id: text(value.id || `maintenance_signal_${index + 1}`, 120),
    kind: MAINTENANCE_KINDS.has(kind) ? kind : 'health_check',
    state,
    severity: severity(value.severity),
    source: text(value.source || 'ekodi-runtime', 120),
    target: text(value.target || value.service || value.provider || 'core', 160),
    summary: text(value.summary || value.message || '', 500),
    reversible: value.reversible === true,
    verificationDefined: value.verificationDefined === true,
    rollbackDefined: value.rollbackDefined === true,
    metadata: value.metadata && typeof value.metadata === 'object' ? Object.freeze({ ...value.metadata }) : Object.freeze({}),
  });
}

export function classifyMaintenanceSignal(signal = {}) {
  const item = normalizeSignal(signal);
  if (['healthy', 'ok', 'verified', 'idle'].includes(item.state)) return 'observe';
  if (item.kind === 'stale_cache' || item.kind === 'temporary_artifact') return 'quarantine';
  if (item.kind === 'worker_degraded' || item.kind === 'provider_degraded' || item.kind === 'queue_stall') return 'recover';
  if (item.kind === 'backup_verification') return 'verify';
  return 'inspect';
}

function normalizeUtilization(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function actionAdapter(adapters = {}, signal) {
  if (!adapters || typeof adapters !== 'object') return null;
  return adapters[signal.target] || adapters[signal.kind] || adapters.default || null;
}

function publicSignal(signal) {
  return Object.freeze({
    id: signal.id,
    kind: signal.kind,
    state: signal.state,
    severity: signal.severity,
    source: signal.source,
    target: signal.target,
    summary: signal.summary,
  });
}

async function verifyAction(adapter, context) {
  if (typeof adapter?.verify !== 'function') return Object.freeze({ passed: false, reason: 'verification_adapter_missing' });
  try {
    const result = await adapter.verify(context);
    return Object.freeze({
      passed: result?.passed === true || result?.ok === true,
      reason: text(result?.reason || '', 160) || null,
      evidence: result?.evidence ?? result ?? null,
    });
  } catch (error) {
    return Object.freeze({ passed: false, reason: text(error?.message || error || 'verification_failed', 160), evidence: null });
  }
}

async function rollbackAction(adapter, context) {
  if (typeof adapter?.rollback !== 'function') return Object.freeze({ succeeded: false, reason: 'rollback_adapter_missing' });
  try {
    const result = await adapter.rollback(context);
    return Object.freeze({
      succeeded: result?.succeeded === true || result?.ok === true,
      reason: text(result?.reason || '', 160) || null,
      evidence: result?.evidence ?? result ?? null,
    });
  } catch (error) {
    return Object.freeze({ succeeded: false, reason: text(error?.message || error || 'rollback_failed', 160), evidence: null });
  }
}

async function runNonMutating(adapter, action, signal, context) {
  const method = action === 'verify' ? 'verify' : 'inspect';
  if (typeof adapter?.[method] !== 'function') {
    return Object.freeze({
      signal: publicSignal(signal),
      action,
      state: 'observed',
      mutated: false,
      reason: `${method}_adapter_missing`,
    });
  }
  try {
    const value = await adapter[method](context);
    return Object.freeze({
      signal: publicSignal(signal),
      action,
      state: action === 'verify' && (value?.passed === false || value?.ok === false) ? 'verification_failed' : 'verified',
      mutated: false,
      reason: null,
      evidence: value ?? null,
    });
  } catch (error) {
    return Object.freeze({
      signal: publicSignal(signal),
      action,
      state: 'inspection_failed',
      mutated: false,
      reason: text(error?.message || error || 'inspection_failed', 160),
    });
  }
}

async function runMutation(adapter, action, signal, context) {
  if (typeof adapter?.[action] !== 'function') {
    return Object.freeze({
      signal: publicSignal(signal),
      action,
      state: 'blocked',
      mutated: false,
      reason: `${action}_adapter_missing`,
    });
  }

  let effect;
  try {
    effect = await adapter[action](context);
  } catch (error) {
    return Object.freeze({
      signal: publicSignal(signal),
      action,
      state: 'failed',
      mutated: false,
      reason: text(error?.message || error || `${action}_failed`, 160),
    });
  }

  const verification = await verifyAction(adapter, Object.freeze({ ...context, effect }));
  if (verification.passed) {
    return Object.freeze({
      signal: publicSignal(signal),
      action,
      state: 'verified',
      mutated: true,
      reason: null,
      effect: effect ?? null,
      verification,
    });
  }

  const rollback = await rollbackAction(adapter, Object.freeze({ ...context, effect, verification }));
  return Object.freeze({
    signal: publicSignal(signal),
    action,
    state: rollback.succeeded ? 'rolled_back' : 'recovery_failed',
    mutated: true,
    reason: verification.reason || 'post_action_verification_failed',
    effect: effect ?? null,
    verification,
    rollback,
  });
}

export async function runEkodiMaintenanceRecoveryCycle(options = {}) {
  const signals = (Array.isArray(options.signals) ? options.signals : []).map(normalizeSignal);
  const utilization = normalizeUtilization(options.utilization);
  const threshold = normalizeUtilization(options.lowActivityThreshold)
    ?? EKODI_MAINTENANCE_RECOVERY_POLICY.lowActivityThreshold;
  const lowActivity = utilization !== null && utilization <= threshold;
  const mutationEnabled = options.mutationEnabled === true;
  const now = typeof options.now === 'function' ? options.now() : new Date().toISOString();
  const results = [];

  for (const signal of signals) {
    const action = classifyMaintenanceSignal(signal);
    const adapter = actionAdapter(options.adapters, signal);
    const context = Object.freeze({ signal, action, now, policy: EKODI_MAINTENANCE_RECOVERY_POLICY });

    if (!MUTATING_ACTIONS.has(action)) {
      results.push(await runNonMutating(adapter, action, signal, context));
      continue;
    }

    if (!mutationEnabled) {
      results.push(Object.freeze({
        signal: publicSignal(signal),
        action,
        state: 'planned',
        mutated: false,
        reason: 'maintenance_mutation_disabled',
      }));
      continue;
    }

    if (!lowActivity && signal.severity !== 'critical') {
      results.push(Object.freeze({
        signal: publicSignal(signal),
        action,
        state: 'deferred',
        mutated: false,
        reason: utilization === null ? 'activity_level_unknown' : 'system_busy',
      }));
      continue;
    }

    if (!signal.reversible || !signal.verificationDefined || !signal.rollbackDefined) {
      results.push(Object.freeze({
        signal: publicSignal(signal),
        action,
        state: 'blocked',
        mutated: false,
        reason: 'reversibility_or_verification_contract_missing',
      }));
      continue;
    }

    results.push(await runMutation(adapter, action, signal, context));
  }

  const counts = results.reduce((acc, result) => {
    acc[result.state] = (acc[result.state] || 0) + 1;
    return acc;
  }, {});

  return Object.freeze({
    schemaVersion: 1,
    system: EKODI_MAINTENANCE_RECOVERY_POLICY.system,
    generatedAt: now,
    policyVersion: EKODI_MAINTENANCE_RECOVERY_POLICY.version,
    mutationEnabled,
    utilization,
    lowActivity,
    noDirectDelete: true,
    summary: Object.freeze({
      signals: signals.length,
      mutated: results.filter(item => item.mutated).length,
      states: Object.freeze({ ...counts }),
    }),
    results: Object.freeze(results),
  });
}

export function buildRuntimeMaintenanceSignals(input = {}) {
  const signals = [];
  const readiness = input.readiness && typeof input.readiness === 'object' ? input.readiness : {};
  const providers = Array.isArray(readiness.providers) ? readiness.providers : [];

  for (const provider of providers) {
    const status = text(provider.health || (provider.operational === false ? 'degraded' : 'healthy'), 40).toLowerCase();
    if (!['degraded', 'failed', 'error', 'unhealthy'].includes(status) && provider.operational !== false) continue;
    signals.push(Object.freeze({
      id: `provider_${text(provider.id || 'unknown', 80)}_${status}`,
      kind: 'provider_degraded',
      state: status,
      severity: 'normal',
      source: 'ekodi-provider-readiness',
      target: text(provider.id || 'provider', 160),
      summary: text(provider.lastError || `Provider health is ${status}`, 500),
      reversible: false,
      verificationDefined: false,
      rollbackDefined: false,
    }));
  }

  const health = input.autonomousHealth && typeof input.autonomousHealth === 'object' ? input.autonomousHealth : {};
  const healthStatus = text(health.status || health.state || '', 40).toLowerCase();
  if (['degraded', 'failed', 'error', 'unhealthy'].includes(healthStatus)) {
    signals.push(Object.freeze({
      id: `autonomous_health_${healthStatus}`,
      kind: 'health_check',
      state: healthStatus,
      severity: healthStatus === 'failed' || healthStatus === 'error' ? 'high' : 'normal',
      source: 'ekodi-autonomous-health',
      target: 'core',
      summary: text(health.message || 'Autonomous health telemetry reports degradation.', 500),
      reversible: false,
      verificationDefined: true,
      rollbackDefined: false,
    }));
  }

  const ledger = input.ledger && typeof input.ledger === 'object' ? input.ledger : {};
  const queued = Number(ledger.queued ?? ledger.pending ?? ledger.queuedCount);
  if (Number.isFinite(queued) && queued > 10) {
    signals.push(Object.freeze({
      id: `command_queue_backlog_${Math.trunc(queued)}`,
      kind: 'queue_stall',
      state: 'degraded',
      severity: queued > 50 ? 'high' : 'normal',
      source: 'ekodi-command-ledger',
      target: 'command_queue',
      summary: `Command queue backlog detected: ${Math.trunc(queued)} queued tasks.`,
      reversible: false,
      verificationDefined: false,
      rollbackDefined: false,
    }));
  }

  return Object.freeze(signals);
}
