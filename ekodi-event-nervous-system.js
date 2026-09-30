function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  return value;
}

function text(value, max = 400) {
  return String(value ?? '').trim().slice(0, max);
}

function hash(value) {
  let h = 2166136261;
  const input = String(value || '');
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function routeFor(drift) {
  if (drift.changeClass === 'red' || drift.autoRepairPolicy === 'human_gate') return 'human_gate';
  if (drift.autoRepairPolicy === 'bounded_reversible') return 'command_ledger';
  return 'attention';
}

function riskFor(drift) {
  if (drift.changeClass === 'red' || drift.severity === 'critical') return 'high';
  if (drift.changeClass === 'yellow' || drift.severity === 'high') return 'normal';
  return 'low';
}

export function eventsFromReconciliation(reconciliation = {}, options = {}) {
  const includePersistent = options.includePersistent === true;
  const occurrenceKey = text(options.occurrenceKey || reconciliation.evaluatedAt || 'cycle', 100);
  const drifts = Array.isArray(reconciliation.drifts) ? reconciliation.drifts : [];
  const events = [];
  const seen = new Set();
  for (const drift of drifts) {
    if (drift.eventEnabled === false) continue;
    if (!includePersistent && drift.transition === 'persistent') continue;
    const correlationKey = `desired-state:${hash(drift.fingerprint || drift.ruleId)}`;
    if (seen.has(correlationKey)) continue;
    seen.add(correlationKey);
    const route = routeFor(drift);
    events.push(freeze({
      schemaVersion: 1,
      id: `autonomic_${hash(`${correlationKey}|${drift.transition || 'new'}|${occurrenceKey}`)}`,
      occurrenceKey,
      correlationKey,
      kind: drift.scope === 'service' ? 'service_health' : 'system_event',
      source: 'ekodi-autonomic-control-plane',
      summary: `Desired-state drift: ${drift.ruleId} (${text(drift.observed, 120)} -> ${text(drift.expected, 120)})`,
      ruleId: drift.ruleId,
      entityId: drift.entityId,
      severity: drift.severity,
      changeClass: drift.changeClass,
      risk: riskFor(drift),
      route,
      actionable: route === 'command_ledger',
      requiresHumanDecision: route === 'human_gate',
      persistent: drift.transition === 'persistent',
      transition: drift.transition || 'new',
      fingerprint: drift.fingerprint,
      repairPolicy: drift.autoRepairPolicy,
      expected: drift.expected,
      observed: drift.observed,
      directProductionMutation: false,
      authorityExpanded: false,
    }));
  }
  return freeze(events);
}

export function autonomicEventToPulse(event = {}) {
  const allowed = event.route === 'command_ledger';
  return freeze({
    taskId: `task_${text(event.id, 110)}`,
    goal: allowed
      ? `Diagnose and reconcile ${event.ruleId} using existing EKODI capabilities. Apply only delegated reversible actions, verify the result, and use the guarded release path for any production-bound change.`
      : `Assess ${event.ruleId} and prepare evidence for the required authority without mutating production.`,
    risk: event.risk || 'normal',
    target: { service: String(event.entityId || '').startsWith('service:') ? String(event.entityId).slice(8) : 'core', capability: 'desired_state_reconciliation', surface: 'autonomic-control-plane', entityId: event.entityId || null },
    delegation: {
      allowed,
      reversible: allowed,
      audited: true,
      preflightVerified: allowed,
      verificationDefined: true,
      directProductionMutation: false,
      permissionExpansion: false,
    },
    context: {
      correlationKey: event.correlationKey,
      ruleId: event.ruleId,
      expected: event.expected,
      observed: event.observed,
      repairPolicy: event.repairPolicy,
      authorityExpanded: false,
    },
    event: {
      id: event.id,
      kind: event.kind || 'system_event',
      source: event.source || 'ekodi-autonomic-control-plane',
      summary: event.summary,
      changeClass: event.changeClass || 'yellow',
      risk: event.risk || 'normal',
      actionable: allowed,
      requiresHumanDecision: event.requiresHumanDecision === true,
      correlationKey: event.correlationKey,
    },
  });
}

export const EKODI_EVENT_NERVOUS_SYSTEM = Object.freeze({
  version: '1.0.0',
  owner: 'ekodi-orchestrator',
  providerNeutral: true,
  deterministicRouting: true,
  duplicatePolicy: 'state-transition-first',
  directMutation: false,
  commandTransport: 'existing-ai-pulse-events-and-command-ledger',
});
