const PRIMARY_ONLY = new Set([
  'production-release','production-domain','production-dns','auth','identity','authorization',
  'secrets','payments','finance','orders','production-admin-control','production-d1-migration','root-security'
]);
const AUXILIARY_PREFERRED = new Set([
  'development','staging','batch','backup','snapshot','diagnostics',
  'synthetic-verification','noncritical-analysis','nonproduction-ai'
]);

function clean(value){return String(value||'').trim()}

export function resolveCloudflareAccounts(env = {}) {
  const primary = Object.freeze({
    id: clean(env.CLOUDFLARE_ACCOUNT_ID),
    token: clean(env.CLOUDFLARE_API_TOKEN),
    source: 'primary'
  });
  const auxiliary = Object.freeze({
    id: clean(env.CLOUDFLARE_AUXILIARY_ACCOUNT_ID || env.CLOUDFLARE_DEVELOPMENT_ACCOUNT_ID),
    token: clean(env.CLOUDFLARE_AUXILIARY_API_TOKEN || env.CLOUDFLARE_DEVELOPMENT_API_TOKEN),
    source: env.CLOUDFLARE_AUXILIARY_ACCOUNT_ID || env.CLOUDFLARE_AUXILIARY_API_TOKEN ? 'auxiliary' : 'legacy-development'
  });
  if (primary.id && auxiliary.id && primary.id === auxiliary.id) {
    throw new Error('CLOUDFLARE_ACCOUNT_POOL_BOUNDARY_COLLISION');
  }
  return Object.freeze({primary, auxiliary});
}

export function classifyCloudflareWorkload(workload) {
  const id = clean(workload).toLowerCase();
  if (PRIMARY_ONLY.has(id)) return 'primary_only';
  if (AUXILIARY_PREFERRED.has(id)) return 'auxiliary_preferred';
  return 'primary_default';
}

export function selectCloudflareAccount({workload, env = {}, primaryBudgetAllowsFallback = true} = {}) {
  const accounts = resolveCloudflareAccounts(env);
  const policy = classifyCloudflareWorkload(workload);
  const primaryReady = Boolean(accounts.primary.id && accounts.primary.token);
  const auxiliaryReady = Boolean(accounts.auxiliary.id && accounts.auxiliary.token);

  if (policy === 'primary_only') {
    if (!primaryReady) throw new Error('CLOUDFLARE_PRIMARY_REQUIRED_FAIL_CLOSED');
    return Object.freeze({account: accounts.primary, policy, fallback: false});
  }
  if (policy === 'auxiliary_preferred') {
    if (auxiliaryReady) return Object.freeze({account: accounts.auxiliary, policy, fallback: false});
    if (primaryReady && primaryBudgetAllowsFallback) {
      return Object.freeze({account: accounts.primary, policy, fallback: true, reason: 'auxiliary-unavailable'});
    }
    throw new Error('CLOUDFLARE_NONCRITICAL_CAPACITY_UNAVAILABLE');
  }
  if (!primaryReady) throw new Error('CLOUDFLARE_PRIMARY_REQUIRED_FAIL_CLOSED');
  return Object.freeze({account: accounts.primary, policy, fallback: false});
}

export function assertAuxiliaryCannotOwnProduction({workload, accountSource} = {}) {
  if (classifyCloudflareWorkload(workload) === 'primary_only' && clean(accountSource).toLowerCase() !== 'primary') {
    throw new Error('CLOUDFLARE_AUXILIARY_PRODUCTION_OWNERSHIP_FORBIDDEN');
  }
  return true;
}

export const CLOUDFLARE_ACCOUNT_POOL_WORKLOADS = Object.freeze({
  primaryOnly: Object.freeze([...PRIMARY_ONLY]),
  auxiliaryPreferred: Object.freeze([...AUXILIARY_PREFERRED]),
});
