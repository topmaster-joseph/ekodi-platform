import revenueWorker, { RevenueStore } from './ekodibiz-worker.js';

export { RevenueStore };

const PAYMENT_CORE_URL = 'https://pay.ekodi.kr';
const PAYMENT_GATEWAY_URL = 'https://ekodi.kr/ekodibiz/pay';

function paymentSecurityHeaders(headers) {
  const next = new Headers(headers);
  next.set('content-security-policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://ekodi.kr https://pay.ekodi.kr");
  return next;
}

async function normalizePaymentContract(response, pathname) {
  const headers = paymentSecurityHeaders(response.headers);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  if (pathname === '/api/health') {
    body.paymentCoreUrl = PAYMENT_CORE_URL;
    body.paymentGatewayUrl = PAYMENT_GATEWAY_URL;
    body.payment = PAYMENT_CORE_URL;
  }

  if (pathname === '/api/runtime') {
    body.paymentCoreUrl = PAYMENT_CORE_URL;
    body.paymentGatewayUrl = PAYMENT_GATEWAY_URL;
    body.paymentService = PAYMENT_CORE_URL;
  }

  if (pathname === '/api/checkout-intent') {
    body.paymentCoreUrl = PAYMENT_CORE_URL;
    body.paymentGatewayUrl = PAYMENT_GATEWAY_URL;
    body.paymentService = PAYMENT_CORE_URL;
    body.checkoutUrl = null;
    body.approvalRequired = true;
    body.status = 'approval_required';
    body.message = '에코디비즈 결제는 승인된 견적을 기준으로 ekodi.kr/ekodibiz/pay 계산대에서 시작하며, 실제 결제 처리는 공통 pay.ekodi.kr 결제코어가 담당합니다.';
  }

  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = await revenueWorker.fetch(request, env, ctx);
    return normalizePaymentContract(response, url.pathname);
  },

  async scheduled(event, env, ctx) {
    if (typeof revenueWorker.scheduled === 'function') return revenueWorker.scheduled(event, env, ctx);
  }
};
