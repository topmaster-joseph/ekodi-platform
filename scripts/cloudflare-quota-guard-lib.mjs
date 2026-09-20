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

export function isQuotaCircuitBreak({ status, body = '', config = {} }) {
  const statuses = Array.isArray(config.statuses) ? config.statuses.map(Number) : [429];
  if (statuses.includes(Number(status))) return true;
  const haystack = String(body || '').toLowerCase();
  return (config.bodyMarkers || []).some(marker => haystack.includes(String(marker).toLowerCase()));
}
