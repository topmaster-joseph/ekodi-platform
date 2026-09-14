import revenuePolicy from './config/revenue-engine.json' with { type: 'json' };

const FITNESS_KEYS = Object.freeze([
  'demand',
  'recurringRevenue',
  'automation',
  'scalability',
  'capabilityReuse',
  'lowInitialCost',
  'lowOperatingCost',
  'boundedRisk',
]);
const REVENUE_STATES = Object.freeze(['idea', 'experiment', 'validate', 'scale', 'hold', 'retire']);
const COMMERCIAL_SUBJECT = revenuePolicy.commercialSubjectPolicy?.subject || 'ekodibiz';
const ALLOWED_TRANSITIONS = Object.freeze({
  idea: new Set(['idea', 'experiment', 'hold', 'retire']),
  experiment: new Set(['experiment', 'validate', 'hold', 'retire']),
  validate: new Set(['validate', 'scale', 'experiment', 'hold', 'retire']),
  scale: new Set(['scale', 'hold', 'retire']),
  hold: new Set(['hold', 'experiment', 'validate', 'retire']),
  retire: new Set(['retire']),
});
const RESERVED_ROOTS = new Set([
  'admin', 'api', 'auth', 'my', 'dev', 'exp', 'try', 'status', 'mail', 'live', 'pay', 'security', 'control',
]);

const clean = (value, limit = 240) => String(value ?? '').trim().slice(0, limit);
const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
const unique = values => [...new Set(values.filter(Boolean))];
const freeze = value => Object.freeze(value);

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function normalizeFitnessSignals(input = {}) {
  return Object.fromEntries(FITNESS_KEYS.map(key => [key, clamp(input[key])]));
}

export function getRevenueEnginePolicy() {
  return freeze(structuredClone(revenuePolicy));
}

export function scoreRevenueOpportunity(input = {}) {
  const signals = normalizeFitnessSignals(input.signals || input);
  const weights = revenuePolicy.fitness.weights;
  const totalWeight = FITNESS_KEYS.reduce((sum, key) => sum + Number(weights[key] || 0), 0) || 1;
  const weighted = FITNESS_KEYS.reduce((sum, key) => sum + signals[key] * Number(weights[key] || 0), 0);
  const score = Number((weighted / totalWeight).toFixed(1));
  const maxLoss = Math.max(0, Number(input.maxLoss || input.riskLimit || 0));
  const stopConditions = unique((Array.isArray(input.stopConditions) ? input.stopConditions : [])
    .map(value => clean(value, 180)));
  const legalPolicyFit = input.legalPolicyFit !== false;
  const tenantIsolation = input.tenantIsolation !== false;
  const demandEvidence = Boolean(input.demandEvidence || signals.demand >= 60);
  const rollbackOrStopDefined = Boolean(input.rollbackDefined || stopConditions.length);
  const hardBlocks = [];
  if (!legalPolicyFit) hardBlocks.push('legal-or-policy-fit-not-established');
  if (!tenantIsolation) hardBlocks.push('tenant-isolation-not-established');
  const eligibleForBoundedExperiment = score >= revenuePolicy.fitness.autoExperimentThreshold
    && hardBlocks.length === 0
    && demandEvidence
    && rollbackOrStopDefined;
  return freeze({
    schemaVersion: 1,
    score,
    threshold: revenuePolicy.fitness.autoExperimentThreshold,
    signals: freeze(signals),
    demandEvidence,
    boundedDownside: freeze({ maxLoss, stopConditions: freeze(stopConditions) }),
    hardBlocks: freeze(hardBlocks),
    eligibleForBoundedExperiment,
    productionCommitmentAuthorized: false,
    principle: 'bounded-experiment-not-zero-risk',
  });
}

export function createRevenueCell(input = {}) {
  const workspaceId = clean(input.workspaceId, 160);
  const title = clean(input.title, 160);
  if (!workspaceId) throw new Error('REVENUE_WORKSPACE_REQUIRED');
  if (!title) throw new Error('REVENUE_TITLE_REQUIRED');
  const operator = COMMERCIAL_SUBJECT;
  const revenueOwner = COMMERCIAL_SUBJECT;
  const merchantOfRecord = COMMERCIAL_SUBJECT;
  const contractingEntity = COMMERCIAL_SUBJECT;
  const technologyProvider = revenuePolicy.defaultOperator.technologyProvider;
  const stopConditions = unique((Array.isArray(input.stopConditions) ? input.stopConditions : [])
    .map(value => clean(value, 180)));
  const riskLimit = Math.max(0, Number(input.riskLimit || 0));
  const seed = `${workspaceId}|${title}|${input.opportunityId || ''}`;
  return freeze({
    schemaVersion: 1,
    id: clean(input.id, 100) || `rev_${fnv1a(seed)}`,
    opportunityId: clean(input.opportunityId, 120) || null,
    title,
    workspaceId,
    tenantOrProject: clean(input.tenantOrProject, 120) || null,
    operator,
    revenueOwner,
    merchantOfRecord,
    contractingEntity,
    technologyProvider,
    state: 'idea',
    riskLimit,
    stopConditions: freeze(stopConditions),
    channels: freeze(unique((Array.isArray(input.channels) ? input.channels : []).map(value => clean(value, 60)))),
    metrics: freeze({ revenue: null, cost: null, roi: null, automationRatio: null }),
    authority: freeze({
      financialCommitment: 'human_gate',
      legalCommitment: 'human_gate',
      productionPromotion: 'human_gate',
      externalAccountAuthorization: 'human_gate',
    }),
    zeroRiskClaim: false,
  });
}

export function nextRevenueCellState(current, requested, evidence = {}) {
  const from = REVENUE_STATES.includes(clean(current, 20)) ? clean(current, 20) : 'idea';
  const to = REVENUE_STATES.includes(clean(requested, 20)) ? clean(requested, 20) : from;
  if (!ALLOWED_TRANSITIONS[from].has(to)) return from;
  if (to === 'scale') {
    const required = Boolean(evidence.realDemand)
      && Boolean(evidence.unitEconomicsVisible)
      && Boolean(evidence.legalPolicyFit)
      && Boolean(evidence.stopConditionDefined);
    return required ? to : from;
  }
  return to;
}

export function getRevenueCapabilityCatalog() {
  return freeze(revenuePolicy.capabilitySubscriptions.map(item => freeze({ ...item })));
}

export function resolveRevenueCapabilityAccess(input = {}) {
  const actorClass = clean(input.actorClass, 60) || 'ordinary-user';
  const operationalActor = actorClass === 'ekodibiz-operator';
  const subscribed = new Set((Array.isArray(input.subscribedCapabilities) ? input.subscribedCapabilities : []).map(value => clean(value, 80)));
  const approvedPriceCatalog = input.approvedPriceCatalog === true;
  const capabilities = revenuePolicy.capabilitySubscriptions.map(item => freeze({
    id: item.id, label: item.label,
    access: operationalActor ? (item.freePreview || subscribed.has(item.id) ? 'enabled' : 'preview_only') : 'information_only',
    freePreview: Boolean(item.freePreview), subscribed: operationalActor && subscribed.has(item.id),
    checkoutAvailable: operationalActor && !item.freePreview && !subscribed.has(item.id) && approvedPriceCatalog,
    checkoutBlockedReason: operationalActor ? (!item.freePreview && !subscribed.has(item.id) && !approvedPriceCatalog ? 'approved-price-catalog-required' : null) : 'ordinary-users-receive-information-only',
    operationalAccess: item.operationalAccess || 'ekodibiz_only',
  }));
  return freeze({membershipTier: clean(input.membershipTier, 40) || 'free',actorClass,model: revenuePolicy.myEkodi.subscriptionModel,ordinaryUserMode: revenuePolicy.myEkodi.ordinaryUserExperience.scope,commercialSubject: COMMERCIAL_SUBJECT,capabilities: freeze(capabilities),publicAccessUnaffected: true,directRevenueOperationAllowed: operationalActor,userOwnedResultsRetained: revenuePolicy.myEkodi.freeExperience.neverRemovesUserOwnedResultsAfterTrial});
}

function slugify(value) {
  return clean(value, 120).toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 63);
}

export function buildVerticalLaunchPlan(input = {}) {
  const title = clean(input.title, 160);
  if (!title) throw new Error('LAUNCH_TITLE_REQUIRED');
  const explicitSlug = clean(input.slug, 120);
  const normalizedSlug = slugify(explicitSlug || title);
  const requestedSlug = normalizedSlug || (!explicitSlug ? `project-${fnv1a(title)}` : '');
  if (!requestedSlug || RESERVED_ROOTS.has(requestedSlug)) throw new Error('LAUNCH_SLUG_INVALID_OR_RESERVED');
  const service = slugify(input.service || 'business');
  const requestedChannels = unique((Array.isArray(input.externalChannels) ? input.externalChannels : [])
    .map(value => clean(value, 40).toLowerCase()));
  const youtubeConnected = input.authorizedConnections?.youtube === true;
  const externalChannels = requestedChannels.map(channel => {
    if (channel !== 'youtube') {
      return freeze({ channel, mode: 'prepare_only', authorization: 'provider-contract-required', publishing: 'blocked' });
    }
    return freeze({
      channel: 'youtube',
      mode: youtubeConnected ? 'connected_operation' : 'prepare_only',
      authorization: youtubeConnected ? 'connected-account-authorized' : 'provider-authorization-required',
      publishing: youtubeConnected ? 'entitlement-and-policy-gated' : 'blocked-until-authorized',
      contentPreparation: 'allowed-within-delegated-boundary',
    });
  });
  return freeze({
    schemaVersion: 1,
    kind: 'ekodi.vertical-launch.plan',
    title,
    slug: requestedSlug,
    workspaceId: clean(input.workspaceId, 160) || null,
    internalSite: freeze({
      canonicalUrl: `https://ekodi.kr/${requestedSlug}`,
      serviceUrl: `https://ekodi.kr/${requestedSlug}/${service}`,
      implementation: revenuePolicy.verticalLaunchFactory.internalSite.implementation,
      copyApplicationCode: false,
      activation: revenuePolicy.verticalLaunchFactory.internalSite.activation,
      productionPromotion: 'human-governed-guarded-release',
    }),
    provisioningCapabilities: freeze([...revenuePolicy.verticalLaunchFactory.provisioningCapabilities]),
    externalChannels: freeze(externalChannels),
    requiredCapabilities: freeze(unique([
      'core.public-site',
      'core.automation',
      'core.analytics',
      'business.marketing',
      'business.crm',
      'business.sales',
      'creator.writing',
      'creator.visual',
      'creator.media',
      ...(requestedChannels.length ? ['creator.publish'] : []),
    ])),
    commercialSubject: COMMERCIAL_SUBJECT,
    ordinaryUserMode: 'information-only',
    commercialExecution: 'ekodibiz-only',
    directProductionMutation: false,
    financialCommitmentAuthorized: false,
  });
}

const IDEA_LIBRARY = Object.freeze([
  {
    id: 'digital-knowledge-product',
    title: '지식·경험 디지털 상품',
    signals: ['글', '강의', '교육', '연구', '자료', '지식', '콘텐츠'],
    summary: '이미 가진 지식과 자료를 작은 디지털 상품으로 검증합니다.',
    capabilities: ['creator.writing', 'creator.visual', 'core.public-site', 'core.analytics'],
  },
  {
    id: 'managed-content-service',
    title: 'AI 콘텐츠 운영 서비스',
    signals: ['사업', '가게', '매장', '홍보', '마케팅', 'sns', '유튜브', '쇼츠'],
    summary: '콘텐츠 생산·게시·분석을 반복 서비스로 묶어 수요를 검증합니다.',
    capabilities: ['creator.media', 'business.marketing', 'core.automation', 'core.analytics'],
  },
  {
    id: 'vertical-micro-saas',
    title: '업종 특화 작은 SaaS',
    signals: ['반복', '관리', '자동화', '고객', '예약', '회원', '업무'],
    summary: '반복되는 한 가지 업무를 작은 구독형 기능으로 먼저 해결합니다.',
    capabilities: ['core.automation', 'business.crm', 'business.operations', 'core.analytics'],
  },
  {
    id: 'local-demand-connector',
    title: '지역 수요 연결 서비스',
    signals: ['지역', '상인', '상권', '관광', '예약', '연결', '소개'],
    summary: '재고를 보유하지 않고 지역의 수요와 공급을 연결하는 모델을 검증합니다.',
    capabilities: ['business.sales', 'business.marketing', 'core.public-site', 'core.analytics'],
  },
]);

export function recommendRevenueIdeas(input = {}) {
  const text = clean([input.goal, input.context, ...(Array.isArray(input.interests) ? input.interests : [])].join(' '), 1800).toLowerCase();
  const scored = IDEA_LIBRARY.map(idea => {
    const matches = idea.signals.filter(signal => text.includes(signal));
    return { idea, score: matches.length * 10, matches };
  }).sort((a, b) => b.score - a.score || a.idea.id.localeCompare(b.idea.id));
  return freeze(scored.slice(0, 3).map((item, index) => freeze({
    rank: index + 1,
    id: item.idea.id,
    title: item.idea.title,
    summary: item.idea.summary,
    matchedSignals: freeze(item.matches),
    capabilities: freeze([...item.idea.capabilities]),
    status: 'idea-not-market-validated',
    nextStep: 'ekodibiz-information-or-managed-service-request',
  })));
}

export function getRevenueEngineSummary() {
  return freeze({
    engineId: revenuePolicy.engineId,
    status: revenuePolicy.status,
    defaultRevenueOwner: revenuePolicy.defaultOperator.revenueOwner,
    defaultOperator: revenuePolicy.defaultOperator.operator,
    commercialSubject: COMMERCIAL_SUBJECT,
    ordinaryUserMode: revenuePolicy.myEkodi.ordinaryUserExperience.scope,
    capabilitySubscriptionCount: revenuePolicy.capabilitySubscriptions.length,
    closedLoop: freeze([...revenuePolicy.closedLoop]),
    productionAuthority: 'human-governed-guarded-release',
    zeroRiskClaimForbidden: true,
  });
}
