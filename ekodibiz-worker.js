import { DurableObject } from 'cloudflare:workers';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const MAX_GOAL_LENGTH = 4000;
const PAYMENT_URL = 'https://pay.ekodi.kr';
const STORE_NAME = 'ekodibiz-global';

const CATALOG = [
  {
    id: 'growth-30',
    name: '30일 자동홍보팩',
    summary: '사업과 고객을 진단해 30일 홍보 실행안을 만들고 채널별 콘텐츠를 구성합니다.',
    outcomes: ['30일 홍보 캘린더', '채널별 콘텐츠 초안', '랜딩페이지 메시지', '성과 측정 지표'],
    priceMode: 'quote',
    category: 'growth'
  },
  {
    id: 'launch-online',
    name: '온라인 개업팩',
    summary: '아이디어를 이름, 제안, 소개페이지, 문의·예약 흐름까지 하나의 온라인 사업으로 구성합니다.',
    outcomes: ['사업 제안 구조', '브랜드·소개 초안', '온라인 랜딩 구조', '첫 고객 유입 계획'],
    priceMode: 'quote',
    category: 'launch'
  },
  {
    id: 'event-complete',
    name: '행사 완성팩',
    summary: '행사 목적에서 계획, 모집, 홍보, 현장 운영, 결과 공유까지 한 흐름으로 구성합니다.',
    outcomes: ['행사 실행안', '모집·홍보 콘텐츠', '참가자 안내', '결과 공유 체크리스트'],
    priceMode: 'quote',
    category: 'event'
  },
  {
    id: 'repeat-loop',
    name: '단골·재방문 성장팩',
    summary: '기존 고객이 다시 찾을 이유와 후속 접점을 설계해 재방문과 재구매를 반복 가능한 흐름으로 만듭니다.',
    outcomes: ['재방문 고객군 설계', '후속 메시지 초안', '재구매 제안 구조', '재방문 측정 지표'],
    priceMode: 'quote',
    category: 'repeat'
  },
  {
    id: 'lead-conversion',
    name: '문의·예약 전환팩',
    summary: '관심 고객의 문의가 상담, 예약, 신청으로 이어지도록 질문과 제안, 후속 흐름을 정리합니다.',
    outcomes: ['문의 응대 시나리오', '상담 질문 구조', '예약·신청 흐름', '후속 안내 초안'],
    priceMode: 'quote',
    category: 'sales'
  },
  {
    id: 'recurring-revenue',
    name: '구독·멤버십 수익팩',
    summary: '한 번의 판매로 끝나지 않도록 정기 이용 이유와 혜택, 갱신 흐름을 포함한 반복수익 구조를 설계합니다.',
    outcomes: ['멤버십 가치제안', '등급·혜택 구조', '가입·갱신 흐름', '유지율 측정 지표'],
    priceMode: 'quote',
    category: 'recurring'
  },
  {
    id: 'content-revenue',
    name: '콘텐츠 수익화팩',
    summary: '지식과 경험을 반복 판매 가능한 콘텐츠, 교육, 자료 또는 디지털 상품의 형태로 정리합니다.',
    outcomes: ['콘텐츠 상품 구조', '판매 메시지 초안', '랜딩·신청 흐름', '후속 상품 확장안'],
    priceMode: 'quote',
    category: 'creator'
  }
];

const HIGH_IMPACT = new Set(['payment', 'ad_spend', 'refund', 'contract', 'price_change', 'external_publish']);
const OPS_ROLES = [
  { id: 'growth_scout', name: '성장진단 직원', scope: '목표 분류·수익기회·추천상품' },
  { id: 'offer_builder', name: '제안구성 직원', scope: '상품·실행계획·콘텐츠 초안' },
  { id: 'ops_coordinator', name: '운영조정 직원', scope: '작업 큐·납품 준비·후속 단계' },
  { id: 'finance_gatekeeper', name: '재무승인 직원', scope: '견적·결제·광고비 등 승인 경계' }
];

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...securityHeaders(), ...extra } });
}

function securityHeaders() {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://pay.ekodi.kr"
  };
}

function withSecurity(response) {
  const headers = new Headers(response.headers);
  Object.entries(securityHeaders()).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('content_type');
  return request.json();
}

function cleanGoal(value) {
  const goal = String(value || '').trim().replace(/\s+/g, ' ');
  if (!goal) throw new Error('goal_required');
  if (goal.length > MAX_GOAL_LENGTH) throw new Error('goal_too_long');
  return goal;
}

function classify(goal) {
  const text = goal.toLowerCase();
  if (/행사|축제|모임|설명회|세미나|예배|캠프/.test(text)) return 'event';
  if (/구독|멤버십|정기|반복.?수익|월정액/.test(text)) return 'recurring';
  if (/콘텐츠|지식|강의|교육|전자책|출판|자료.*판매|디지털.?상품/.test(text)) return 'creator';
  if (/단골|재방문|재구매|휴면|다시.?오/.test(text)) return 'repeat';
  if (/문의|상담|예약|신청|전환/.test(text)) return 'sales';
  if (/창업|개업|시작|사업.*아이디어|홈페이지|브랜드/.test(text)) return 'launch';
  if (/홍보|마케팅|매출|고객|손님|sns|인스타|페이스북|네이버|광고|유튜브/.test(text)) return 'growth';
  return 'discover';
}

function offerById(id) {
  return CATALOG.find((item) => item.id === id);
}

function catalogFor(intent) {
  const ids = intent === 'event'
    ? ['event-complete', 'growth-30', 'lead-conversion', 'content-revenue']
    : intent === 'launch'
      ? ['launch-online', 'lead-conversion', 'growth-30', 'recurring-revenue']
      : intent === 'growth'
        ? ['growth-30', 'repeat-loop', 'lead-conversion', 'content-revenue']
        : intent === 'repeat'
          ? ['repeat-loop', 'growth-30', 'lead-conversion', 'recurring-revenue']
          : intent === 'sales'
            ? ['lead-conversion', 'growth-30', 'repeat-loop', 'launch-online']
            : intent === 'recurring'
              ? ['recurring-revenue', 'repeat-loop', 'content-revenue', 'growth-30']
              : intent === 'creator'
                ? ['content-revenue', 'recurring-revenue', 'growth-30', 'launch-online']
                : ['launch-online', 'growth-30', 'lead-conversion', 'recurring-revenue'];
  return ids.map(offerById).filter(Boolean);
}

function consult(goal) {
  const intent = classify(goal);
  const suggested = catalogFor(intent);
  const diagnosisByIntent = {
    event: '행사의 목적과 참가자 경험을 먼저 고정한 뒤 모집과 홍보를 한 흐름으로 묶는 것이 좋습니다.',
    launch: '아이디어를 바로 크게 만들기보다 첫 고객이 이해하고 신청할 수 있는 최소 상품과 온라인 입구를 먼저 만드는 것이 좋습니다.',
    growth: '광고부터 늘리기보다 누구에게 어떤 약속을 팔 것인지 정리하고 무료 유입과 유료 전환을 함께 설계하는 것이 좋습니다.',
    repeat: '새 고객을 계속 사는 것보다 기존 고객이 다시 올 이유와 적절한 후속 접점을 먼저 설계하는 것이 효율적입니다.',
    sales: '문의량 자체보다 문의가 상담과 예약으로 넘어가는 과정에서 어디서 멈추는지 먼저 좁히는 것이 좋습니다.',
    recurring: '단발 판매를 반복수익으로 바꾸려면 정기적으로 다시 지불할 이유와 유지되는 경험을 먼저 설계해야 합니다.',
    creator: '지식과 경험을 한 번 제공하는 데서 끝내지 말고 반복 전달 가능한 결과물과 다음 상품으로 이어지는 구조를 만드는 것이 좋습니다.',
    discover: '말씀하신 목표를 실제 거래가 가능한 작은 결과 단위로 나누고, 가장 빨리 검증할 수 있는 첫 상품부터 만드는 것이 좋습니다.'
  };
  const nextStepByIntent = {
    growth: '현재 고객이 가장 자주 묻는 질문 3개를 판매 메시지로 바꿔 무료 유입 실험을 시작합니다.',
    repeat: '기존 고객이 다시 찾는 이유와 떠나는 이유를 각각 3개씩 적고 가장 작은 후속 제안 하나를 만듭니다.',
    sales: '최근 문의 5건을 기준으로 고객이 결정 전에 가장 많이 멈추는 질문 한 가지를 찾습니다.',
    recurring: '고객이 매달 또는 정기적으로 다시 받을 가치 한 가지를 한 문장으로 정의합니다.',
    creator: '반복해서 설명하거나 제공하는 지식 하나를 선택해 첫 디지털 결과물의 범위를 정합니다.'
  };
  return {
    intent,
    diagnosis: diagnosisByIntent[intent] || diagnosisByIntent.discover,
    freeNextStep: nextStepByIntent[intent] || '목표를 한 문장의 고객 약속으로 바꾸고 첫 실행 단위를 설계합니다.',
    suggestedOffers: suggested,
    safeguards: {
      humanApprovalRequired: ['최종 결제', '광고비 지출', '계약', '환불', '가격 변경', '외부 채널 실제 게시'],
      autonomousAllowed: ['진단', '상품 초안', '홍보 초안', '랜딩 메시지', '실행계획', '성과 분석 초안']
    }
  };
}

function buildOffer(goal, requestedId, leadId = null) {
  const insight = consult(goal);
  const selected = CATALOG.find((x) => x.id === requestedId) || insight.suggestedOffers[0];
  const orderId = `EB-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  return {
    orderId,
    leadId,
    goal,
    offer: selected,
    status: 'draft',
    pricing: { status: 'quote_required', amount: null, currency: 'KRW', message: '승인된 가격정책이 연결되기 전에는 임의 가격을 제시하지 않습니다.' },
    next: { action: 'approve_offer', approvalRequired: true },
    createdAt: new Date().toISOString()
  };
}

function executionPlan(goal, offerId) {
  const offer = CATALOG.find((x) => x.id === offerId) || catalogFor(classify(goal))[0];
  return {
    offer,
    stages: [
      { id: 'discover', label: '발견', status: 'ready', output: '목표·고객·문제 구조화' },
      { id: 'create', label: '상품화', status: 'ready', output: '고객 약속·구성·제안 초안' },
      { id: 'promote', label: '홍보', status: 'ready', output: '검색·SNS·랜딩 콘텐츠 초안' },
      { id: 'sell', label: '상담·판매', status: 'ready', output: '상담 흐름·맞춤 제안' },
      { id: 'pay', label: '결제', status: 'human_gate', output: '사용자 승인 후 공통 결제서비스 연결' },
      { id: 'deliver', label: '실행', status: 'ready_after_payment', output: offer.outcomes },
      { id: 'grow', label: '성장', status: 'ready_after_delivery', output: '성과 측정·재구매 제안' }
    ]
  };
}

function taskBundle(order) {
  const now = new Date().toISOString();
  const base = { orderId: order.orderId, leadId: order.leadId, createdAt: now, updatedAt: now };
  return [
    { ...base, id: `TASK-${crypto.randomUUID()}`, role: 'growth_scout', action: 'qualify_opportunity', impact: 'low', status: 'queued', input: { intent: classify(order.goal), offerId: order.offer.id } },
    { ...base, id: `TASK-${crypto.randomUUID()}`, role: 'offer_builder', action: 'prepare_execution_assets', impact: 'low', status: 'queued', input: { offerId: order.offer.id } },
    { ...base, id: `TASK-${crypto.randomUUID()}`, role: 'ops_coordinator', action: 'prepare_delivery_queue', impact: 'low', status: 'queued', input: { offerId: order.offer.id } },
    { ...base, id: `TASK-${crypto.randomUUID()}`, role: 'finance_gatekeeper', action: 'approve_quote_and_payment', impact: 'high', status: 'approval_required', input: { priceMode: order.offer.priceMode } }
  ];
}

function checkoutIntent(body) {
  const orderId = String(body.orderId || '').trim();
  if (!orderId.startsWith('EB-')) throw new Error('invalid_order');
  return {
    orderId,
    status: 'approval_required',
    approvalRequired: true,
    paymentService: PAYMENT_URL,
    checkoutUrl: null,
    message: '최종 금액과 공통 결제 API 연결이 확인된 뒤에만 결제창을 생성합니다. 에코디비즈가 임의로 결제를 실행하지 않습니다.'
  };
}

async function storeFetch(env, path, init = {}) {
  if (!env.REVENUE_STORE) throw new Error('store_unavailable');
  const id = env.REVENUE_STORE.idFromName(STORE_NAME);
  const stub = env.REVENUE_STORE.get(id);
  const response = await stub.fetch(`https://revenue-store.internal${path}`, init);
  if (!response.ok) throw new Error(`store_${response.status}`);
  return response.json();
}

async function persistLead(env, goal, insight) {
  const lead = {
    leadId: `LEAD-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    goal,
    intent: insight.intent,
    recommendedOfferId: insight.suggestedOffers[0]?.id || null,
    status: 'qualified',
    source: 'biz.ekodi.kr',
    containsContactData: false,
    createdAt: new Date().toISOString()
  };
  await storeFetch(env, '/lead', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(lead) });
  return lead;
}

async function persistOrder(env, order) {
  const tasks = taskBundle(order);
  await storeFetch(env, '/order', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ order, tasks }) });
  return tasks;
}

async function processSafeTasks(env) {
  return storeFetch(env, '/process-safe', { method: 'POST', headers: JSON_HEADERS, body: '{}' });
}

async function requestFinanceGate(env, orderId) {
  return storeFetch(env, '/finance-gate', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ orderId, requestedAt: new Date().toISOString() }) });
}

async function opsStatus(env) {
  return storeFetch(env, '/status');
}

async function handleApi(request, url, env, ctx) {
  if (url.pathname === '/api/health' && request.method === 'GET') {
    return json({ ok: true, service: 'ekodibiz-revenue-os', stage: 'operational-mvp', execution: 'approval-gated', persistence: 'durable-object-sqlite', aiOperations: 'rules-first-active', payment: PAYMENT_URL });
  }
  if (url.pathname === '/api/runtime' && request.method === 'GET') {
    return json({ service: '에코디비즈', lifecycle: ['discover', 'create', 'promote', 'consult', 'sell', 'pay', 'deliver', 'grow'], highImpactHumanGate: [...HIGH_IMPACT], paymentService: PAYMENT_URL, operationsRoles: OPS_ROLES, personalDataMode: 'anonymous-goal-only' });
  }
  if (url.pathname === '/api/catalog' && request.method === 'GET') return json({ items: CATALOG });
  if (url.pathname === '/api/ops/status' && request.method === 'GET') {
    try {
      const status = await opsStatus(env);
      return json({ ...status, roles: OPS_ROLES, mode: 'rules-first', highImpactHumanGate: true });
    } catch {
      return json({ ok: false, error: 'operations_store_unavailable' }, 503);
    }
  }

  if (request.method === 'POST' && ['/api/consult', '/api/offers', '/api/execution-preview', '/api/checkout-intent'].includes(url.pathname)) {
    let body;
    try { body = await readBody(request); } catch { return json({ error: 'invalid_json' }, 400); }
    try {
      if (url.pathname === '/api/consult') {
        const goal = cleanGoal(body.goal);
        const insight = consult(goal);
        const lead = await persistLead(env, goal, insight);
        return json({ goal, leadId: lead.leadId, operations: { status: 'received', aiStaff: 'active', personalDataStored: false }, ...insight });
      }
      if (url.pathname === '/api/offers') {
        const goal = cleanGoal(body.goal);
        const order = buildOffer(goal, body.offerId, body.leadId || null);
        const tasks = await persistOrder(env, order);
        ctx?.waitUntil(processSafeTasks(env));
        return json({ ...order, operations: { status: 'queued', taskCount: tasks.length, humanGateCount: tasks.filter((t) => t.status === 'approval_required').length } });
      }
      if (url.pathname === '/api/execution-preview') {
        const goal = cleanGoal(body.goal);
        return json(executionPlan(goal, body.offerId));
      }
      if (url.pathname === '/api/checkout-intent') {
        const intent = checkoutIntent(body);
        await requestFinanceGate(env, intent.orderId);
        return json(intent);
      }
    } catch (error) {
      const code = error?.message || 'invalid_request';
      const status = code === 'goal_too_long' ? 413 : code === 'store_unavailable' || code.startsWith('store_5') ? 503 : 400;
      return json({ error: code }, status);
    }
  }
  return json({ error: 'not_found' }, 404);
}

export class RevenueStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const storage = this.ctx.storage;

    if (url.pathname === '/lead' && request.method === 'POST') {
      const lead = await request.json();
      await storage.put(`lead:${lead.leadId}`, lead);
      return json({ ok: true, leadId: lead.leadId });
    }

    if (url.pathname === '/order' && request.method === 'POST') {
      const { order, tasks = [] } = await request.json();
      await storage.put(`order:${order.orderId}`, order);
      for (const task of tasks) await storage.put(`task:${task.id}`, task);
      return json({ ok: true, orderId: order.orderId, tasks: tasks.length });
    }

    if (url.pathname === '/finance-gate' && request.method === 'POST') {
      const { orderId, requestedAt } = await request.json();
      const order = await storage.get(`order:${orderId}`);
      if (!order) return json({ error: 'order_not_found' }, 404);
      order.status = 'approval_required';
      order.financeApprovalRequestedAt = requestedAt;
      await storage.put(`order:${orderId}`, order);
      return json({ ok: true, orderId, status: 'approval_required' });
    }

    if (url.pathname === '/process-safe' && request.method === 'POST') {
      const tasks = await storage.list({ prefix: 'task:' });
      let processed = 0;
      const now = new Date().toISOString();
      for (const [key, task] of tasks) {
        if (task.status !== 'queued' || task.impact !== 'low') continue;
        task.status = 'completed';
        task.updatedAt = now;
        task.completedAt = now;
        task.output = task.role === 'growth_scout'
          ? '목표 분류와 추천상품 검토 완료'
          : task.role === 'offer_builder'
            ? '실행 산출물 초안 큐 구성 완료'
            : '견적 승인 전 준비 가능한 운영 작업 정리 완료';
        await storage.put(key, task);
        processed += 1;
      }
      await storage.put('meta:lastProcessedAt', now);
      return json({ ok: true, processed, at: now });
    }

    if (url.pathname === '/status' && request.method === 'GET') {
      const [leads, orders, tasks, lastProcessedAt] = await Promise.all([
        storage.list({ prefix: 'lead:' }),
        storage.list({ prefix: 'order:' }),
        storage.list({ prefix: 'task:' }),
        storage.get('meta:lastProcessedAt')
      ]);
      const taskCounts = { queued: 0, completed: 0, approval_required: 0, other: 0 };
      const roleCounts = {};
      for (const task of tasks.values()) {
        if (taskCounts[task.status] === undefined) taskCounts.other += 1;
        else taskCounts[task.status] += 1;
        roleCounts[task.role] = (roleCounts[task.role] || 0) + 1;
      }
      return json({ ok: true, leads: leads.size, orders: orders.size, tasks: tasks.size, taskCounts, roleCounts, lastProcessedAt: lastProcessedAt || null });
    }

    return json({ error: 'not_found' }, 404);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, url, env, ctx);
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method_not_allowed' }, 405);
    if (!env.ASSETS) return new Response('EKODIBIZ assets unavailable', { status: 503, headers: securityHeaders() });
    const response = await env.ASSETS.fetch(request);
    return withSecurity(response);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(processSafeTasks(env));
  }
};
