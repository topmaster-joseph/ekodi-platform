// EKODI Pay public entry. Money movement remains disabled until the official
// contracted PG, verified server-side confirmation and human launch gate exist.
export const CANONICAL_PAYMENT_ROOT = 'https://ekodi.kr/ekodipay';
const PREFIX = '/ekodipay';
const ORDER_ID = /^EB-[A-Z0-9-]{6,80}$/;
function baseHeaders(type = 'text/html; charset=utf-8') {
  return {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
  };
}
function htmlResponse(html, status = 200, method = 'GET', extra = {}) {
  return new Response(method === 'HEAD' ? null : html, {status, headers: {...baseHeaders(), ...extra}});
}
function esc(v) {return String(v || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function page(title, intro, content, status = 200, method = 'GET') {
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)} | EKODI Pay</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f6f7f8;color:#17212a;font-family:system-ui,-apple-system,Apple SD Gothic Neo,Malgun Gothic,sans-serif;line-height:1.65}
  header{background:#fff;border-bottom:1px solid #e6e9ed}nav,main,footer{max-width:1060px;margin:auto;padding:20px 22px}nav{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .logo{font-size:21px;letter-spacing:-.045em;font-weight:800}.link{color:#28517b;text-decoration:none}main{padding-top:52px;padding-bottom:60px}
  h1{font-size:clamp(27px,4vw,40px);letter-spacing:-.045em;margin:0 0 10px}.lead{font-size:16px;color:#495766;max-width:720px;margin:0 0 32px}
  .flag{display:inline-block;font-size:12px;padding:5px 10px;border:1px solid #d3dfec;color:#325e83;border-radius:99px;margin-bottom:15px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.tile,.notice{background:#fff;border:1px solid #e2e6eb;border-radius:14px;padding:22px}
  .tile h2{font-size:18px;margin:0 0 6px}.tile p{font-size:14px;color:#53606a;margin:0 0 16px}.tile a{font-size:14px;font-weight:700}
  .notice{margin-top:18px;background:#fdfefe}.notice h2{font-size:16px;margin:0 0 6px}.notice p{font-size:14px;color:#4a5763;margin:0}
  footer{font-size:13px;color:#697580;padding-top:0;padding-bottom:36px}
  </style></head><body><header><nav><div class="logo">EKODI <span style="font-weight:400">Pay</span></div><a class="link" href="https://ekodi.kr/">에코디 홈</a></nav></header>
  <main><div class="flag">공통 결제·정산 서비스</div><h1>${esc(title)}</h1><p class="lead">${esc(intro)}</p>${content}</main><footer>EKODI Pay · 결제는 해당 사업자와 계약된 금융기관을 통해 처리됩니다.</footer></body></html>`, status, method);
}
function home(method) {
  const cards = [
    ['에코디몰', '상품 주문·결제 및 주문 내역', '/ekodimall/'],
    ['에코디비즈', '승인된 견적·계약에 따른 결제', '/ekodibiz/'],
    ['에코디교육', '교육 신청과 수강료 관리', '/education/'],
  ].map(([name, description, path]) => `<article class="tile"><h2>${esc(name)}</h2><p>${esc(description)}</p><a class="link" href="${path}">서비스로 이동 →</a></article>`).join('');
  return page('모든 에코디 서비스를 위한 하나의 결제 창구',
    '결제·구독·환불·정산을 공통 정책으로 연결합니다. 실제 결제는 서비스별 주문 및 PG 계약이 준비된 경우에만 가능합니다.',
    `<div class="grid">${cards}</div><section class="notice"><h2>안전한 결제 운영 원칙</h2><p>결제 금액은 서버에서 확정합니다. 카드 정보는 에코디가 직접 수집하지 않으며, 운영 승인 전 실제 청구를 실행하지 않습니다. 거래 확인은 사업자별 원장과 PG 승인 내역을 대조합니다.</p></section>`,200,method);
}
function checkout(request,url) {
  if ([...url.searchParams.keys()].some(key => /amount|price|total|currency|paymentkey|billingkey/i.test(key))) {
    return page('요청하신 결제를 진행할 수 없습니다', '결제 금액이나 결제키를 주소에 넣을 수 없습니다.', '', 400, request.method);
  }
  const source=url.searchParams.get('service') || '';
  const orderId=url.searchParams.get('orderId') || '';
  if(source !== 'ekodibiz' || !ORDER_ID.test(orderId)) {
    return page('주문 확인이 필요합니다', '승인된 에코디비즈 주문번호가 있어야 합니다.', '', 400, request.method);
  }
  // Never accept user-supplied success status and never start a card charge here.
  const urlToBusiness = '/ekodibiz/pay?orderId=' + encodeURIComponent(orderId);
  return page('결제 승인 상태 확인', '지정된 주문은 에코디비즈의 서버 측 견적 승인 절차를 먼저 통과해야 합니다.',
    `<section class="notice"><h2>주문번호: ${esc(orderId)}</h2><p>이 화면은 결제 완료 증명이 아닙니다. <a class="link" href="${urlToBusiness}">에코디비즈 견적·결제 상태 확인</a></p></section>`, 200, request.method);
}
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if(url.hostname !== 'ekodi.kr') return new Response('Not Found', {status:404,headers:{...baseHeaders('text/plain; charset=utf-8'),'x-robots-tag':'noindex'}});
    if(!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405,headers:{...baseHeaders('text/plain; charset=utf-8'),allow:'GET, HEAD'}});
    if(path === PREFIX) return new Response(null,{status:308,headers:{location:PREFIX+'/','cache-control':'no-store'}});
    if(path === PREFIX+'/' || path === PREFIX+'/index.html') return home(request.method);
    if(path === PREFIX+'/api/health') {
      return new Response(request.method==='HEAD'?null:JSON.stringify({
        service:'ekodipay', canonical:CANONICAL_PAYMENT_ROOT, status:'public-entry-ready',
        realMoneyProcessing:'disabled-until-human-approved-pg-activation',
        paymentSecretsExposed:false
      }),{status:200,headers:baseHeaders('application/json; charset=utf-8')});
    }
    if(path === PREFIX+'/checkout') return checkout(request,url);
    return page('페이지를 찾을 수 없습니다', '요청하신 주소는 제공되지 않습니다.', '', 404, request.method);
  }
};
