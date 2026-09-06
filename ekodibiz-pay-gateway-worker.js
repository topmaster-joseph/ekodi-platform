const REVENUE_OS_URL = 'https://biz.ekodi.kr';
const PAYMENT_CORE_ORIGIN = 'https://pay.ekodi.kr';
const CANONICAL_GATEWAY = 'https://ekodi.kr/ekodibiz/pay';

function headers(contentType = 'text/html; charset=utf-8') {
  return {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
  };
}

function page({ title, message, orderId = '', detail = '', status = 200 }) {
  const safe = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(title)}</title><style>body{margin:0;background:#f7f7f5;color:#171717;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:640px;margin:0 auto;padding:64px 20px}.card{background:#fff;border:1px solid #e8e8e4;border-radius:22px;padding:28px;box-shadow:0 10px 35px rgba(0,0,0,.05)}h1{font-size:28px;margin:0 0 14px}p{line-height:1.65;margin:8px 0}.muted{color:#6b6b67;font-size:14px}.tag{display:inline-block;padding:7px 10px;border-radius:999px;background:#f0f0ec;font-size:13px;margin-bottom:18px}a{color:#171717;font-weight:700}</style></head><body><main class="wrap"><section class="card"><div class="tag">에코디비즈 결제</div><h1>${safe(title)}</h1><p>${safe(message)}</p>${orderId ? `<p class="muted">주문번호: ${safe(orderId)}</p>` : ''}${detail ? `<p class="muted">${safe(detail)}</p>` : ''}<p class="muted">실제 결제 처리는 에코디 공통 결제코어(pay.ekodi.kr)가 담당합니다.</p><p><a href="https://biz.ekodi.kr/">에코디비즈로 돌아가기</a></p></section></main></body></html>`;
  return new Response(html, { status, headers: headers() });
}

function validOrderId(value) {
  return /^EB-[A-Z0-9-]{6,80}$/.test(String(value || ''));
}

async function inspectOrder(orderId) {
  const response = await fetch(`${REVENUE_OS_URL}/api/checkout-intent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orderId })
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function approvedCoreCheckout(data) {
  if (data?.approvalRequired !== false || data?.status !== 'approved' || !data?.checkoutUrl) return null;
  try {
    const target = new URL(data.checkoutUrl);
    if (target.origin !== PAYMENT_CORE_ORIGIN) return null;
    return target.toString();
  } catch {
    return null;
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/ekodibiz/pay')) return new Response('Not found', { status: 404, headers: headers('text/plain; charset=utf-8') });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: headers('text/plain; charset=utf-8') });

    if ([...url.searchParams.keys()].some((key) => /amount|price|total|currency/i.test(key))) {
      return page({ title: '금액 입력이 차단되었습니다', message: '결제 금액은 주소나 브라우저에서 직접 받지 않습니다. 승인된 서버 견적만 사용할 수 있습니다.', status: 400 });
    }

    const orderId = url.searchParams.get('orderId') || '';
    if (!orderId) {
      return page({ title: '견적 승인 후 결제가 가능합니다', message: '에코디비즈에서 상담과 견적 승인을 완료하면 이 계산대로 안전하게 연결됩니다.' });
    }
    if (!validOrderId(orderId)) {
      return page({ title: '주문 정보를 확인할 수 없습니다', message: '유효한 에코디비즈 주문번호가 아닙니다.', status: 400 });
    }

    try {
      const { response, data } = await inspectOrder(orderId);
      if (!response.ok) return page({ title: '주문 확인이 필요합니다', message: '에코디비즈 주문 상태를 확인하지 못했습니다.', orderId, status: response.status >= 500 ? 503 : 400 });
      const checkout = approvedCoreCheckout(data);
      if (checkout) return Response.redirect(checkout, 303);
      return page({ title: '견적 승인 후 결제가 가능합니다', message: '현재 주문은 결제 승인 대기 상태입니다. AI 운영직원은 준비 작업을 계속 진행하고, 금액과 결제 승인만 사람의 승인선에서 처리합니다.', orderId, detail: `상태: ${data.status || 'approval_required'}` });
    } catch {
      return page({ title: '결제 준비 상태를 확인 중입니다', message: '공통 결제코어로 넘기기 전 주문 상태 확인에 실패했습니다. 임의 결제는 실행하지 않습니다.', orderId, status: 503 });
    }
  }
};

export { CANONICAL_GATEWAY, PAYMENT_CORE_ORIGIN };
