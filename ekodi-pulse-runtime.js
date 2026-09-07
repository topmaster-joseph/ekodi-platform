import { buildCoreAiGateway } from './core-ai-gateway.js';
import { getEkodiAiProviderRegistryStatus } from './ekodi-ai-provider-registry.js';
import {
  claimNextEkodiCommandTask,
  getEkodiCommandLedgerStatus,
  ingestEkodiPulse,
  settleEkodiCommandTask,
} from './ekodi-command-ledger.js';

function text(value, max = 1200) {
  return String(value ?? '').trim().slice(0, max);
}

function enabled(value) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value ?? '').trim().toLowerCase());
}

function pulseFromTask(task) {
  const source = task?.event || {};
  return Object.freeze({
    id: source.id || task?.pulseEventId || task?.id,
    kind: source.kind || source.event?.kind || 'system_event',
    source: source.source || source.event?.source || 'ekodi-pulse',
    summary: source.summary || source.event?.summary || task?.goal || task?.id,
    changeClass: source.changeClass || source.event?.changeClass || 'green',
    actionable: source.actionable !== false,
    requiresHumanDecision: source.requiresHumanDecision === true,
  });
}

export function getEkodiProviderReadiness(env = {}) {
  const providers = getEkodiAiProviderRegistryStatus(env);
  const configured = providers.filter(provider => provider.available);
  return Object.freeze({
    multiProviderEnabled: enabled(env.AI_MULTI_PROVIDER_ENABLED),
    configuredCount: configured.length,
    collaborationReady: enabled(env.AI_MULTI_PROVIDER_ENABLED) && configured.length >= 2,
    independentSentinelReady: enabled(env.AI_MULTI_PROVIDER_ENABLED) && configured.length >= 3,
    providers,
  });
}

export async function runEkodiCommandQueue(env = {}, options = {}) {
  if (!env.DB?.prepare) return Object.freeze({ ok: false, processed: 0, reason: 'command_ledger_db_unavailable' });
  const limit = Math.min(Math.max(Number(options.limit) || 1, 1), 3);
  const gateway = buildCoreAiGateway(env, []);
  const results = [];

  for (let index = 0; index < limit; index += 1) {
    const task = await claimNextEkodiCommandTask(env, { leaseMs: 180000 });
    if (!task) break;
    const startedAt = new Date().toISOString();
    let result;
    try {
      result = await gateway.handlePulse({
        taskId: task.id,
        taskName: task.goal,
        goal: task.goal,
        risk: task.risk,
        target: task.target,
        delegation: task.delegation,
        context: task.context,
        event: pulseFromTask(task),
        timeoutMs: Math.min(Math.max(Number(env.AI_COMMAND_TIMEOUT_MS) || 20000, 5000), 30000),
      });
    } catch (error) {
      result = Object.freeze({
        schemaVersion: 1,
        taskId: task.id,
        state: 'failed',
        error: text(error?.message || error || 'command_execution_failed', 1000),
        evidence: Object.freeze({ providerDiversity: 0, sentinelIndependent: false, verified: false }),
      });
    }
    const settled = await settleEkodiCommandTask(env, task, result, { startedAt });
    results.push(Object.freeze({ taskId: task.id, resultState: result.state, state: settled?.state || result.state }));
  }

  return Object.freeze({ ok: true, processed: results.length, results: Object.freeze(results) });
}

async function discoverSystemHealthPulse(env = {}) {
  if (!env.DB?.prepare) return null;
  let state = null;
  try {
    state = await env.DB.prepare(`SELECT source, status, last_attempt_at, last_success_at, message
      FROM system_usage_state WHERE source = 'cloudflare' LIMIT 1`).first();
  } catch {
    return null;
  }
  const status = text(state?.status, 40).toLowerCase();
  if (!['error', 'failed', 'degraded'].includes(status)) return null;
  const fingerprint = `${status}_${text(state?.last_attempt_at || state?.last_success_at || 'unknown', 40)}`.replace(/[^a-zA-Z0-9._:-]+/g, '_');
  return Object.freeze({
    taskId: `task_system_health_${fingerprint}`.slice(0, 120),
    goal: 'Analyze the EKODI system-health collection anomaly, identify likely causes, and produce a verified reversible recovery recommendation. Do not perform destructive, financial, permission-expanding, or DNS changes.',
    risk: 'low',
    target: Object.freeze({ service: 'core', capability: 'system_health', surface: 'admin' }),
    delegation: Object.freeze({
      allowed: true,
      reversible: true,
      audited: true,
      preflightVerified: true,
      verificationDefined: true,
    }),
    context: Object.freeze({ systemHealth: state }),
    event: Object.freeze({
      id: `pulse_system_health_${fingerprint}`.slice(0, 120),
      kind: 'service_health',
      source: 'cloudflare-system-usage-state',
      summary: `System Health state is ${status}: ${text(state?.message, 400)}`,
      changeClass: 'green',
      actionable: true,
      requiresHumanDecision: false,
    }),
  });
}

export async function runEkodiPulseSchedule(env = {}, options = {}) {
  if (!env.DB?.prepare) return Object.freeze({ ok: false, detected: 0, processed: 0, reason: 'command_ledger_db_unavailable' });
  let detected = 0;
  const healthPulse = await discoverSystemHealthPulse(env);
  if (healthPulse) {
    await ingestEkodiPulse(env, healthPulse);
    detected += 1;
  }
  const queue = await runEkodiCommandQueue(env, { limit: options.limit || 1 });
  return Object.freeze({
    ok: queue.ok,
    detected,
    processed: queue.processed,
    queue: queue.results,
    readiness: getEkodiProviderReadiness(env),
    ledger: await getEkodiCommandLedgerStatus(env),
  });
}

export const EKODI_PULSE_RUNTIME = Object.freeze({
  version: '1.0.0',
  schedule: 'existing-control-cron',
  autonomousBatchLimit: 1,
  automaticTriggers: Object.freeze(['queued-command-task', 'degraded-system-health']),
  principle: 'detect-first-execute-only-with-standing-delegation',
});
