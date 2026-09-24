function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  return value;
}

function readPath(source, selector) {
  const parts = String(selector || '').split('.').filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (current == null || typeof current !== 'object' || !(part in current)) return { found: false, value: undefined };
    current = current[part];
  }
  return { found: true, value: current };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).sort().join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${key}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function compare(operator, expected, observed) {
  switch (operator) {
    case 'equals': return stable(observed) === stable(expected);
    case 'in': return Array.isArray(expected) && expected.some(item => stable(item) === stable(observed));
    case 'not_in': return Array.isArray(expected) && !expected.some(item => stable(item) === stable(observed));
    case 'gte': return Number.isFinite(Number(observed)) && Number(observed) >= Number(expected);
    case 'lte': return Number.isFinite(Number(observed)) && Number(observed) <= Number(expected);
    case 'set_equals': {
      if (!Array.isArray(expected) || !Array.isArray(observed)) return false;
      return stable([...expected].map(String).sort()) === stable([...observed].map(String).sort());
    }
    case 'contains_all': {
      if (!Array.isArray(expected) || !Array.isArray(observed)) return false;
      const actual = new Set(observed.map(item => stable(item)));
      return expected.every(item => actual.has(stable(item)));
    }
    case 'present': return observed !== undefined && observed !== null && observed !== '';
    default: return stable(observed) === stable(expected);
  }
}

function driftFingerprint(rule, observed) {
  return `${rule.id}|${stable(rule.expected)}|${stable(observed)}`;
}

function priorState(rule, previousObserved) {
  if (!previousObserved) return null;
  const previous = readPath(previousObserved, rule.selector);
  if (!previous.found) return null;
  return {
    compliant: compare(rule.operator, rule.expected, previous.value),
    observed: previous.value,
    fingerprint: driftFingerprint(rule, previous.value),
  };
}

export function reconcileDesiredState(registry = {}, observed = {}, options = {}) {
  const rules = Array.isArray(registry.rules) ? registry.rules : [];
  const results = [];
  const drifts = [];
  const unknown = [];

  for (const rule of rules) {
    const actual = readPath(observed, rule.selector);
    if (!actual.found) {
      const item = freeze({ ruleId: rule.id, entityId: rule.entityId, selector: rule.selector, status: 'unknown', reason: 'observation_missing', eventEnabled: rule.eventEnabled !== false });
      results.push(item);
      unknown.push(item);
      continue;
    }
    const compliant = compare(rule.operator, rule.expected, actual.value);
    if (compliant) {
      results.push(freeze({ ruleId: rule.id, entityId: rule.entityId, selector: rule.selector, status: 'compliant', observed: actual.value, expected: rule.expected }));
      continue;
    }
    const prior = priorState(rule, options.previousObserved);
    const fingerprint = driftFingerprint(rule, actual.value);
    const transition = prior && !prior.compliant && prior.fingerprint === fingerprint ? 'persistent' : 'new';
    const item = freeze({
      ruleId: rule.id,
      entityId: rule.entityId,
      scope: rule.scope,
      selector: rule.selector,
      status: 'drift',
      expected: rule.expected,
      observed: actual.value,
      severity: rule.severity,
      changeClass: rule.changeClass,
      autoRepairPolicy: rule.autoRepairPolicy,
      eventEnabled: rule.eventEnabled !== false,
      source: rule.source,
      description: rule.description,
      fingerprint,
      transition,
      mutationPerformed: false,
    });
    results.push(item);
    drifts.push(item);
  }

  const known = results.filter(item => item.status !== 'unknown').length;
  const compliant = results.filter(item => item.status === 'compliant').length;
  const convergencePct = known ? Math.round((compliant / known) * 1000) / 10 : null;
  return freeze({
    schemaVersion: 1,
    reconcilerId: 'EKODI-AUTONOMIC-RECONCILER-001',
    registryId: registry.registryId || null,
    evaluatedAt: options.now || new Date().toISOString(),
    deterministic: true,
    aiInvoked: false,
    mutationPerformed: false,
    results,
    drifts,
    unknown,
    summary: {
      totalRules: rules.length,
      known,
      compliant,
      drift: drifts.length,
      unknown: unknown.length,
      newDrift: drifts.filter(item => item.transition === 'new').length,
      persistentDrift: drifts.filter(item => item.transition === 'persistent').length,
      convergencePct,
    },
  });
}

export const EKODI_AUTONOMIC_RECONCILER = Object.freeze({
  version: '1.0.0',
  owner: 'ekodi-orchestrator',
  model: 'desired-observed-diff',
  deterministicFirst: true,
  directMutation: false,
  persistentDriftPolicy: 'suppress_duplicate_event_until_state_transition',
});
