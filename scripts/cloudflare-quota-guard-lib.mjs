export function assertProductionAccountBoundary({
  productionAccountId,
  developmentAccountId = '',
  knownDevelopmentAccountIds = []
}) {
  const prod = String(productionAccountId || '').trim();
  const dev = String(developmentAccountId || '').trim();
  if (!prod) throw new Error('Missing production Cloudflare account id');
  if (dev && prod === dev) throw new Error('Production and Development Cloudflare account IDs must differ');
  if (knownDevelopmentAccountIds.map(String).includes(prod)) {
    throw new Error('Production Cloudflare account resolved to a known Development account');
  }
  return prod;
}

export function classifyQuotaState({
  requests,
  limit,
  warningRatio,
  protectRatio
}) {
  const used = Number(requests);
  const cap = Number(limit);
  const warn = Number(warningRatio);
  const protect = Number(protectRatio);
  if (!Number.isFinite(used) || used < 0) throw new Error('requests must be a non-negative number');
  if (!Number.isFinite(cap) || cap <= 0) throw new Error('limit must be positive');
  if (!(warn > 0 && warn < protect && protect < 1)) throw new Error('quota ratios must satisfy 0 < warning < protect < 1');
  const ratio = used / cap;
  const state = used >= cap ? 'exhausted' : ratio >= protect ? 'protect' : ratio >= warn ? 'warning' : 'normal';
  return {
    requests: used,
    limit: cap,
    ratio,
    percent: Math.round(ratio * 1000) / 10,
    remaining: Math.max(0, cap - used),
    state,
    skipNonessential: state === 'protect' || state === 'exhausted'
  };
}

export function detectWorkersPaidPlan(subscriptions = []) {
  const activeStates = new Set(['paid','provisioned','trial']);
  for (const subscription of Array.isArray(subscriptions) ? subscriptions : []) {
    const state = String(subscription?.state || '').trim().toLowerCase();
    if (!activeStates.has(state)) continue;
    const ratePlan = subscription?.rate_plan || {};
    const haystack = [
      ratePlan.id,
      ratePlan.public_name,
      ratePlan.scope,
      ...(Array.isArray(ratePlan.sets) ? ratePlan.sets : []),
    ].map(value => String(value || '').toLowerCase()).join(' ');
    if (haystack.includes('worker') && !haystack.includes('free')) return true;
  }
  return false;
}

export function cloudflareUsageWindow({ paid = false, now = new Date() } = {}) {
  const end = new Date(now);
  const start = new Date(end);
  if (paid) {
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
  } else {
    start.setUTCHours(0, 0, 0, 0);
  }
  return Object.freeze({
    periodKind: paid ? 'month' : 'day',
    start: start.toISOString(),
    end: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  });
}

export function isQuotaCircuitBreak({ status, body = '', config = {} }) {
  const statuses = Array.isArray(config.statuses) ? config.statuses.map(Number) : [429];
  if (statuses.includes(Number(status))) return true;
  const haystack = String(body || '').toLowerCase();
  return (config.bodyMarkers || []).some(marker => haystack.includes(String(marker).toLowerCase()));
}
