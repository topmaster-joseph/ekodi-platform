const freeze = value => Object.freeze(value);
const clean = (value, limit = 160) => String(value ?? '').trim().slice(0, limit);
const FORBIDDEN = new Set(['captcha_bypass', 'security_control_bypass']);
const SOVEREIGN = new Set(['permission_expansion', 'paid_commitment', 'destructive', 'irreversible', 'publish_external']);

export const WEB_EXECUTION_POLICY = freeze({
  contract: 'EKODI-WEB-COMPUTER-EXECUTION-001',
  providerNeutral: true,
  selfExecutionPreferred: true,
  actionSuccessIsCompletion: false,
  productionPromotion: 'central-release-gate-only',
});

export function classifyWebExecutionRisk(task = {}) {
  const requested = new Set((Array.isArray(task.risks) ? task.risks : []).map(v => clean(v, 60).toLowerCase()));
  if ([...requested].some(v => FORBIDDEN.has(v))) return freeze({ class: 'forbidden', gate: 'blocked' });
  if ([...requested].some(v => SOVEREIGN.has(v))) return freeze({ class: 'sovereign', gate: 'human_sovereign_gate' });
  if (task.authenticationConsent === true || task.mfa === true) return freeze({ class: 'consent', gate: 'human_or_provider_gate' });
  return freeze({ class: 'reversible', gate: 'automatic_preflight' });
}

export function rankWebExecutionAdapters(adapters = [], context = {}) {
  const allowExternal = context.allowExternalFailover !== false;
  const costRank = { free: 0, 'free-preferred': 0, low: 1, 'account-managed': 2, paid: 3, 'paid-opt-in': 4, unknown: 5 };
  return freeze(adapters.filter(a => a && a.available !== false && typeof a.invoke === 'function')
    .filter(a => allowExternal || a.trustClass === 'ekodi-owned')
    .map((a, index) => ({ ...a, _index: index }))
    .sort((a, b) => {
      const ownA = a.trustClass === 'ekodi-owned' ? 0 : 1, ownB = b.trustClass === 'ekodi-owned' ? 0 : 1;
      if (ownA !== ownB) return ownA - ownB;
      const costA = costRank[a.costClass] ?? 5, costB = costRank[b.costClass] ?? 5;
      if (costA !== costB) return costA - costB;
      const scoreA = Number(a.routerScore ?? 0), scoreB = Number(b.routerScore ?? 0);
      return scoreB - scoreA || a._index - b._index;
    }).map(({ _index, ...a }) => freeze(a)));
}

function evidence(adapter, result, startedAt, now, attempt, verified, failureClass = null) {
  return freeze({
    capability: 'web-computer-execution',
    adapter: clean(adapter?.id || 'unknown', 80),
    engine: clean(adapter?.engine || 'unknown', 80),
    siteClass: clean(result?.siteClass || 'unknown', 80),
    taskClass: clean(result?.taskClass || 'unknown', 80),
    success: result?.ok === true,
    verified,
    latencyMs: Math.max(0, now() - startedAt),
    retryCount: Math.max(0, attempt - 1),
    cost: Number.isFinite(Number(result?.cost)) ? Number(result.cost) : null,
    failureClass,
  });
}

export async function executeWebTask(task = {}, options = {}) {
  const risk = classifyWebExecutionRisk(task);
  if (risk.gate !== 'automatic_preflight') return freeze({ ok: false, state: risk.gate, verified: false, risk, evidence: [] });
  const now = options.now || Date.now;
  const verify = typeof options.verify === 'function' ? options.verify : async result => result?.verified === true;
  const adapters = rankWebExecutionAdapters(options.adapters || [], options);
  const records = [];
  for (let i = 0; i < adapters.length; i += 1) {
    const adapter = adapters[i], startedAt = now();
    try {
      const result = await adapter.invoke(task);
      const verified = result?.ok === true && await verify(result, task, adapter);
      records.push(evidence(adapter, result, startedAt, now, i + 1, verified, verified ? null : 'verification_failed'));
      if (verified) return freeze({ ok: true, state: 'verified', verified: true, adapter: adapter.id, result, evidence: freeze(records) });
    } catch (error) {
      records.push(evidence(adapter, {}, startedAt, now, i + 1, false, clean(error?.code || error?.message || 'adapter_failure', 100)));
    }
  }
  return freeze({ ok: false, state: 'unverified', verified: false, adapter: null, evidence: freeze(records) });
}
