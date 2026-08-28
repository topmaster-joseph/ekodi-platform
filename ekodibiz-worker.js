const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const MAX_GOAL_LENGTH = 4000;
const PAYMENT_URL = 'https://pay.ekodi.kr';

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
  }
];

const HIGH_IMPACT = new Set(['payment', 'ad_spend', 'refund', 'contract', 'price_change', 'external_publish']);

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
  if (/창업|개업|시작|사업.*아이디어|홈페이지|브랜드|예약/.test(text)) return 'launch';
  if (/홍보|마케팅|매출|고객|손님|sns|인스타|페이스북|네이버|광고|유튜브/.test(text)) return 'growth';
  return 'discover';
}

function catalogFor(intent) {
  if (intent === 'event') return [CATALOG[2], CATALOG[0]];
  if (intent === 'launch') return [CATALOG[1], CATALOG[0]];
  if (intent === 'growth') return [CATALOG[0], CATALOG[1]];
  return [CATALOG[1], CATALOG[0], CATALOG[2]];
}

function consult(goal) {
  const intent = classify(goal);
  const suggested = catalogFor(intent);
  const diagnosis = intent === 'event'
    ? '행사의 목적과 참가자 경험을 먼저 고정한 뒤 모집과 홍보를 한 흐름으로 묶는 것이 좋습니다.'
    : intent === 'launch'
      ? '아이디어를 바로 크게 만들기보다 첫 고객이 이해하고 신청할 수 있는 최소 상품과 온라인 입구를 먼저 만드는 것이 좋습니다.'
      : intent === 'growth'
        ? '광고부터 늘리기보다 누구에게 어떤 약속을 팔 것인지 정리하고 무료 유입과 유료 전환을 함께 설계하는 것이 좋습니다.'
        : '말씀하신 목표를 실제 거래가 가능한 작은 결과 단위로 나누고, 가장 빨리 검증할 수 있는 첫 상품부터 만드는 것이 좋습니다.';
  return {
    intent,
    diagnosis,
    freeNextStep: intent === 'growth' ? '현재 고객이 가장 자주 묻는 질문 3개를 판매 메시지로 바꿔 무료 유입 실험을 시작합니다.' : '목표를 한 문장의 고객 약속으로 바꾸고 첫 실행 단위를 설계합니다.',
    suggestedOffers: suggested,
    safeguards: {
      humanApprovalRequired: ['최종 결제', '광고비 지출', '계약', '환불', '가격 변경', '외부 채널 실제 게시'],
      autonomousAllowed: ['진단', '상품 초안', '홍보 초안', '랜딩 메시지', '실행계획', '성과 분석 초안']
    }
  };
}

function buildOffer(goal, requestedId) {
  const insight = consult(goal);
  const selected = CATALOG.find((x) => x.id === requestedId) || insight.suggestedOffers[0];
  const orderId = `EB-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  return {
    orderId,
    goal,
    offer: selected,
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

async function handleApi(request, url) {
  if (url.pathname === '/api/health' && request.method === 'GET') {
    return json({ ok: true, service: 'ekodibiz-revenue-os', stage: 'production-safe-mvp', execution: 'approval-gated', payment: PAYMENT_URL });
  }
  if (url.pathname === '/api/runtime' && request.method === 'GET') {
    return json({ service: '에코디비즈', lifecycle: ['discover', 'create', 'promote', 'consult', 'sell', 'pay', 'deliver', 'grow'], highImpactHumanGate: [...HIGH_IMPACT], paymentService: PAYMENT_URL });
  }
  if (url.pathname === '/api/catalog' && request.method === 'GET') return json({ items: CATALOG });

  if (request.method === 'POST' && ['/api/consult', '/api/offers', '/api/execution-preview', '/api/checkout-intent'].includes(url.pathname)) {
    let body;
    try { body = await readBody(request); } catch { return json({ error: 'invalid_json' }, 400); }
    try {
      if (url.pathname === '/api/consult') {
        const goal = cleanGoal(body.goal);
        return json({ goal, ...consult(goal) });
      }
      if (url.pathname === '/api/offers') {
        const goal = cleanGoal(body.goal);
        return json(buildOffer(goal, body.offerId));
      }
      if (url.pathname === '/api/execution-preview') {
        const goal = cleanGoal(body.goal);
        return json(executionPlan(goal, body.offerId));
      }
      if (url.pathname === '/api/checkout-intent') return json(checkoutIntent(body));
    } catch (error) {
      const code = error?.message || 'invalid_request';
      return json({ error: code }, code === 'goal_too_long' ? 413 : 400);
    }
  }
  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method_not_allowed' }, 405);
    if (!env.ASSETS) return new Response('EKODIBIZ assets unavailable', { status: 503, headers: securityHeaders() });
    const response = await env.ASSETS.fetch(request);
    return withSecurity(response);
  }
};
