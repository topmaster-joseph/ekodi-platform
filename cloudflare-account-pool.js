const PRIMARY_ONLY = new Set([
  'production-release','production-domain','production-dns','auth','identity','authorization',
  'secrets','payments','finance','orders','production-admin-control','production-d1-migration','root-security'
]);
const AUXILIARY_PREFERRED = new Set([
  'development','staging','batch','backup','snapshot','diagnostics',
  'synthetic-verification','noncritical-analysis','nonproduction-ai'
]);

function clean(value){return String(value||'').trim()}
function masked(value){
  const id=clean(value);
  if(!id)return '';
  if(id.length<=10)return `${id.slice(0,3)}…${id.slice(-2)}`;
  return `${id.slice(0,4)}…${id.slice(-4)}`;
}
function readiness(account){
  if(account.id&&account.token)return 'configured';
  if(account.id||account.token)return 'partial';
  return 'unavailable';
}

export const CLOUDFLARE_ACCOUNT_POOL_METADATA = Object.freeze({
  policyId:'EKODI-CF-ACCOUNT-POOL-001',
  primary:Object.freeze({
    label:'주계정',
    identityEmail:'topmaster.joseph@gmail.com',
    role:'production-critical-owner',
    planClass:'workers-paid',
    canonicalDomainAuthority:true,
    mutableRole:false,
    purposes:Object.freeze(['production','auth','identity','authorization','payments','finance','orders','secrets','canonical-domain'])
  }),
  auxiliary:Object.freeze({
    label:'보조계정',
    identityEmail:'joseph@ekodi.kr',
    role:'bounded-noncritical-execution',
    planClass:'free-preferred',
    canonicalDomainAuthority:false,
    mutableRole:false,
    purposes:Object.freeze(['development','staging','batch','backup','snapshot','diagnostics','synthetic-verification','nonproduction-ai'])
  }),
  secretPolicy:Object.freeze({
    revealSecrets:false,
    acceptPlaintextSecretsInAdmin:false,
    mutationBoundary:'provider-secret-store-and-ci-only'
  })
});

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

export function describeCloudflareAccountPool(env = {}) {
  const accounts=resolveCloudflareAccounts(env);
  const item=(kind,account)=>Object.freeze({
    kind,
    ...CLOUDFLARE_ACCOUNT_POOL_METADATA[kind],
    accountIdMasked:masked(account.id),
    runtimeCredentialState:readiness(account),
    runtimeCredentialSource:account.source,
    secretVisible:false
  });
  return Object.freeze({
    policyId:CLOUDFLARE_ACCOUNT_POOL_METADATA.policyId,
    secretPolicy:CLOUDFLARE_ACCOUNT_POOL_METADATA.secretPolicy,
    accounts:Object.freeze([
      item('primary',accounts.primary),
      item('auxiliary',accounts.auxiliary)
    ]),
    productionCriticalFailoverToAuxiliary:false,
    localOverrideAllowed:false
  });
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
