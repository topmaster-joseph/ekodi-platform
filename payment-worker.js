import { injectEkodiShell } from './ekodi-shell-injector.js';
import { paymentCapabilities, validatePaymentIntentInput } from './payment-core.js';

const SECURITY_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://shell.ekodi.kr; connect-src 'self' https://shell.ekodi.kr; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
});

function headers(extra = {}) {
  return { 'cache-control': 'no-store', ...SECURITY_HEADERS, ...extra };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: headers({ 'content-type': 'application/json; charset=utf-8' }),
  });
}

function html(body) {
  return new Response(body, {
    status: 200,
    headers: headers({ 'content-type': 'text/html; charset=utf-8' }),
  });
}

function landing() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EKODI Payment</title><style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f7f4;color:#171714}main{max-width:760px;margin:0 auto;padding:96px 24px 72px}.eyebrow{font-size:12px;font-weight:800;letter-spacing:.16em;color:#666}h1{font-size:clamp(38px,7vw,72px);line-height:1;margin:18px 0}p{font-size:18px;line-height:1.75;color:#4b4b46}.card{margin-top:34px;padding:24px;border:1px solid #deded6;border-radius:22px;background:#fff}.badge{display:inline-block;padding:7px 10px;border-radius:999px;background:#f0f0ea;font-size:12px;font-weight:800}a{color:inherit}</style></head><body><main><div class="eyebrow">EKODI · COMMON SERVICE</div><h1>EKODI Payment</h1><p>에코디몰, 회비, 강의료, 예약금, 구독료, 서비스 이용료와 승인된 후원 결제를 하나의 공통 결제 계약으로 연결하는 공급자 중립 결제 서비스입니다.</p><div class="card"><span class="badge">SHADOW FOUNDATION</span><p>현재 운영 경계와 검증 계층을 먼저 배포합니다. 실제 승인·청구·환불은 각 공간의 결제계정, 정산계좌, 공급자 심사와 운영 승인이 연결된 뒤 단계적으로 활성화됩니다.</p><p><a href="https://admin.ekodi.kr/payment">결제 관리</a></p></div></main></body></html>`;
}

function safeError(error) {
  const message = String(error?.message || 'invalid_payment_intent');
  if (message.startsWith('raw_payment_data_forbidden:')) return 'raw_payment_data_forbidden';
  return message.replace(/[^a-z0-9_:-]/gi, '').slice(0, 96) || 'invalid_payment_intent';
}

async function paymentIntent(request, env) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 16384) return json({ ok: false, error: 'payload_too_large' }, 413);
  let input;
  try { input = await request.json(); }
  catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  try {
    validatePaymentIntentInput(input, {
      donationApproved: String(env.ALLOW_DONATION_PAYMENTS || '').toLowerCase() === 'true',
    });
  } catch (error) {
    return json({ ok: false, error: safeError(error) }, 400);
  }

  return json({
    ok: false,
    error: 'payment_execution_not_activated',
    message: 'The common payment boundary is deployed in a non-transactional rollout stage.',
  }, 503);
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'GET' && path === '/health') {
      return json({ ok: true, ...paymentCapabilities(env), version: String(env.EKODI_PAYMENT_VERSION || '1.0.0') });
    }
    if (request.method === 'GET' && path === '/api/capabilities') return json({ ok: true, ...paymentCapabilities(env) });
    if (request.method === 'GET' && (path === '/admin' || path === '/admin/payment')) return Response.redirect('https://admin.ekodi.kr/payment', 307);
    if (request.method === 'POST' && path === '/api/payment-intents') return paymentIntent(request, env);
    if (request.method === 'GET' && path === '/') return injectEkodiShell(html(landing()), 'pay', 'public');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers() });
    return json({ ok: false, error: 'not_found' }, 404);
  },
};
