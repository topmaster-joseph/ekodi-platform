const RESOURCE_CLASSES = Object.freeze([
  'personal-subscription',
  'personal-api',
  'ekodi-shared-api',
  'hosted-ai',
  'core-only',
]);
const INTERACTIVE_ORDER = Object.freeze([...RESOURCE_CLASSES]);
const AUTONOMOUS_ORDER = Object.freeze(['personal-api','ekodi-shared-api','hosted-ai','core-only']);
const SCORE_WEIGHTS = Object.freeze({
  capability:25, taskFit:20, cost:15, subscription:10, availability:10,
  latency:5, reliability:5, privacy:5, context:5,
});
const HARD_GATES = Object.freeze([
  'officialPath','automationPermission','auth','dataPolicy','permission','budget',
]);
const CORE_STATES = Object.freeze([
  'REQUEST','ANALYZE','PLAN','EXECUTE','TEST','FIX','RETEST','DEPLOY',
  'PRODUCTION_VERIFY','LEARN','CORE_UPDATE','COMPLETE',
]);

function bool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return ['1','true','yes','on','enabled'].includes(String(value).trim().toLowerCase());
}
function bounded(value, fallback = 50) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : fallback;
}
function normalizePool(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  return { ...fallback, enabled:bool(source.enabled, fallback.enabled) };
}

export const DEFAULT_AI_RESOURCE_POLICY = Object.freeze({
  version:'1.0.0', strategy:'personal-first',
  interactiveOrder:INTERACTIVE_ORDER,
  autonomousOrder:AUTONOMOUS_ORDER,
  pools:Object.freeze({
    personalSubscription:Object.freeze({enabled:true,humanInteractive:true,officialAutomationOnly:true}),
    personalApi:Object.freeze({enabled:true,secretStorage:'server-secret-or-encrypted-vault'}),
    ekodiSharedApi:Object.freeze({enabled:false,budgetGated:true}),
    hostedAi:Object.freeze({enabled:false,mode:'cloud-gpu-on-demand'}),
    coreOnly:Object.freeze({enabled:true,deterministic:true}),
  }),
  router:Object.freeze({weights:SCORE_WEIGHTS,hardGates:HARD_GATES}),
  core:Object.freeze({
    learnAfterSuccess:true, promotionMode:'reviewed', productionVerificationRequired:true,
    retryReversibleFailures:true, stateLifecycle:CORE_STATES,
  }),
});
export function normalizeAiResourcePolicy(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const pools = source.pools && typeof source.pools === 'object' ? source.pools : {};
  const defaults = DEFAULT_AI_RESOURCE_POLICY;
  return {
    version:'1.0.0', strategy:'personal-first',
    interactiveOrder:[...INTERACTIVE_ORDER],
    autonomousOrder:[...AUTONOMOUS_ORDER],
    pools:{
      personalSubscription:normalizePool(pools.personalSubscription, defaults.pools.personalSubscription),
      personalApi:normalizePool(pools.personalApi, defaults.pools.personalApi),
      ekodiSharedApi:normalizePool(pools.ekodiSharedApi, defaults.pools.ekodiSharedApi),
      hostedAi:normalizePool(pools.hostedAi, defaults.pools.hostedAi),
      coreOnly:normalizePool(pools.coreOnly, defaults.pools.coreOnly),
    },
    router:{weights:{...SCORE_WEIGHTS},hardGates:[...HARD_GATES]},
    core:{
      learnAfterSuccess:bool(source.core?.learnAfterSuccess, true),
      promotionMode:'reviewed',
      productionVerificationRequired:true,
      retryReversibleFailures:bool(source.core?.retryReversibleFailures, true),
      stateLifecycle:[...CORE_STATES],
    },
  };
}
function gateCandidate(candidate = {}, context = {}, policy = DEFAULT_AI_RESOURCE_POLICY) {
  const resourceClass = String(candidate.resourceClass || '').trim();
  if (!RESOURCE_CLASSES.includes(resourceClass)) return 'unknown_resource_class';
  if (candidate.available === false) return 'unavailable';
  if (candidate.officialPath === false) return 'unofficial_path';
  if (candidate.authValid === false) return 'authentication_invalid';
  if (candidate.dataPolicyAllowed === false) return 'data_policy_blocked';
  if (candidate.permissionAllowed === false) return 'permission_blocked';
  if (candidate.budgetAllowed === false) return 'budget_blocked';
  const lane = context.lane === 'autonomous' ? 'autonomous' : 'interactive';
  if (lane === 'autonomous' && resourceClass === 'personal-subscription' && candidate.automationAllowed !== true) return 'subscription_not_automation_eligible';
  const poolKey = ({'personal-subscription':'personalSubscription','personal-api':'personalApi','ekodi-shared-api':'ekodiSharedApi','hosted-ai':'hostedAi','core-only':'coreOnly'})[resourceClass];
  if (poolKey && policy.pools?.[poolKey]?.enabled === false) return 'pool_disabled';
  return '';
}

export function scoreAiResourceCandidate(candidate = {}, context = {}, value = DEFAULT_AI_RESOURCE_POLICY) {
  const policy = normalizeAiResourcePolicy(value);
  const blockedBy = gateCandidate(candidate, context, policy);
  if (blockedBy) return Object.freeze({eligible:false,score:-1,blockedBy});
  const metrics = candidate.metrics || {};
  const weighted = Object.entries(policy.router.weights).reduce((sum,[key,weight]) => sum + bounded(metrics[key], key === 'subscription' && candidate.resourceClass === 'personal-subscription' ? 100 : 50) * weight, 0) / 100;
  return Object.freeze({eligible:true,score:Number(weighted.toFixed(2)),blockedBy:''});
}
export function rankAiResourceCandidates(candidates = [], context = {}, value = DEFAULT_AI_RESOURCE_POLICY) {
  const policy = normalizeAiResourcePolicy(value);
  const lane = context.lane === 'autonomous' ? 'autonomous' : 'interactive';
  const order = lane === 'autonomous' ? policy.autonomousOrder : policy.interactiveOrder;
  const rank = new Map(order.map((item,index)=>[item,index]));
  return Object.freeze((Array.isArray(candidates) ? candidates : []).map(candidate => {
    const result = scoreAiResourceCandidate(candidate, { ...context, lane }, policy);
    return Object.freeze({ ...candidate, ...result });
  }).filter(candidate=>candidate.eligible).sort((a,b) => {
    const score = b.score - a.score;
    if (score) return score;
    const resource = (rank.get(a.resourceClass) ?? 99) - (rank.get(b.resourceClass) ?? 99);
    if (resource) return resource;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }));
}

export const AI_RESOURCE_POLICY = Object.freeze({
  resourceClasses:RESOURCE_CLASSES,
  scoreWeights:SCORE_WEIGHTS,
  hardGates:HARD_GATES,
  coreStates:CORE_STATES,
});
