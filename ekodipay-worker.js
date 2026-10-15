import {paymentRoute, paymentMode} from './ekodipay-provider-toss.js';
export { PayOrderStore } from './ekodipay-order-store.js';
// EKODI Pay public entry and non-financial experience demo.
// This Worker NEVER makes PG requests, stores transactions, or confirms payment.
export const CANONICAL_PAYMENT_ROOT = 'https://ekodi.kr/ekodipay';
const PREFIX = '/ekodipay';
const ORDER_ID = /^EB-[A-Z0-9-]{6,80}$/;
const DEMO_CATALOG = Object.freeze({
  mall: Object.freeze({name:'에코디몰', title:'상품 주문 예시', amount:27000, tag:'쇼핑', detail:'실제 상품이나 주문에 연결되지 않는 가상 구매 사례입니다.'}),
  biz: Object.freeze({name:'에코디비즈', title:'개발·컨설팅 견적 예시', amount:150000, tag:'사업', detail:'견적 승인이나 계약 체결을 대신하지 않는 시연 자료입니다.'}),
  edu: Object.freeze({name:'에코디교육', title:'AI 활용 교육 예시', amount:50000, tag:'교육', detail:'실제 수강 신청이나 교육비 청구를 하지 않는 시연 자료입니다.'}),
  together: Object.freeze({name:'동행 프로그램', title:'프로그램 참가 예시', amount:20000, tag:'참여', detail:'참여 신청이나 참가비 납부로 처리되지 않는 시연 자료입니다.'}),
});
const DEMO_METHODS = Object.freeze({card:'카드 결제',easy:'간편결제',bank:'계좌이체'});
const STYLES = [
  ':root{color-scheme:light;font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}',
  '*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f5f8fa;color:#102538;line-height:1.6}',
  'a{color:#147a61;text-decoration:none}a:hover{text-decoration:underline}a:focus-visible,button:focus-visible{outline:3px solid #1b75d0;outline-offset:3px}',
  '.wrap{max-width:1200px;margin:0 auto;padding:0 28px}.top{background:#fff;border-bottom:1px solid #e2e9ec}',
  '.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:18px;min-height:74px}',
  '.brand{font-weight:850;font-size:25px;letter-spacing:-.05em;color:#142638;white-space:nowrap}.brand b{color:#059667}',
  '.toplinks{display:flex;gap:22px;align-items:center;font-size:14px}.toplinks a{color:#334d59}',
  '.pill-link{border-radius:9px;background:#078a61;padding:10px 16px!important;color:#fff!important;font-weight:700}',
  '.eyebrow{font-size:12px;font-weight:850;letter-spacing:.05em;text-transform:uppercase;color:#067a61}',
  '.hero{padding:62px 0 56px;background:radial-gradient(circle at 90% 0%,#e3f7ef,transparent 43%),linear-gradient(130deg,#fff 0%,#eff9f7 100%)}',
  '.hero-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(310px,.95fr);gap:48px;align-items:center}',
  '.hero h1{font-size:clamp(35px,4.3vw,58px);line-height:1.15;letter-spacing:-.065em;margin:16px 0}',
  '.hero p.lead{font-size:17px;color:#4b6370;max-width:530px;margin:0 0 28px}',
  '.actions{display:flex;gap:11px;flex-wrap:wrap;align-items:center}.primary,.secondary{display:inline-block;border-radius:11px;padding:13px 20px;font-weight:800}',
  '.primary{background:#0a976d;color:#fff;box-shadow:0 8px 20px #087a4d20}.primary:hover{color:#fff;background:#087b59}',
  '.secondary{background:#fff;color:#19624f;border:1px solid #b8d7cb}',
  '.state{background:#fff;border:1px solid #d8e6e1;border-radius:20px;padding:28px;box-shadow:0 16px 40px #143c2810}',
  '.status-mark{color:#8b5a10;background:#fff2d6;display:inline-flex;border-radius:25px;padding:6px 12px;font-size:12px;font-weight:850}',
  '.state h2{font-size:23px;letter-spacing:-.04em;margin:15px 0 8px}.muted{color:#5a6c77}.state p{font-size:14px;margin:0 0 16px}',
  '.state ul{margin:0;padding:0;list-style:none}.state li{border-top:1px solid #e8eeea;padding:10px 0;font-size:14px}.dot{color:#13986e;font-weight:bold;margin-right:9px}',
  '.section{padding:50px 0 60px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:22px}',
  '.section h2{font-size:clamp(25px,3vw,32px);letter-spacing:-.055em;line-height:1.3;margin:4px 0}',
  '.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}',
  '.card{background:#fff;border:1px solid #e2eaf0;border-radius:17px;padding:23px;min-width:0}',
  '.card:hover{border-color:#b8d9ce}.card h3{font-size:17px;letter-spacing:-.035em;margin:8px 0}.card p{color:#5d6e77;font-size:14px;margin:0 0 14px}',
  '.label{display:inline-block;background:#e6f6f0;color:#138060;border-radius:7px;font-size:12px;padding:4px 8px;font-weight:750}',
  '.cta{font-size:14px;font-weight:750}.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}',
  '.step{padding:22px;background:#fff;border:1px solid #e2eaf0;border-radius:15px}',
  '.num{font-weight:850;color:#087d5b;font-size:13px}.step strong{display:block;font-size:16px;margin:5px 0}',
  '.notice{margin:26px 0 0;border-radius:14px;padding:16px 19px;background:#fff6e6;border:1px solid #f0d7a4;color:#65491b;font-size:14px}',
  '.foot{border-top:1px solid #e1e7eb;padding:24px 0;color:#667983;background:#fff;font-size:13px}',
  '.demo{padding:42px 0 76px;min-height:62vh}.breadcrumbs{font-size:13px;color:#638075;margin-bottom:16px}',
  '.demo h1{font-size:clamp(29px,4vw,43px);margin:0 0 10px;letter-spacing:-.06em}',
  '.demo-lead{max-width:760px;color:#5a6f7a;margin:0 0 24px}',
  '.demo-layout{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(290px,.6fr);gap:18px;align-items:start}',
  '.detail h2{font-size:24px;margin:10px 0 5px}.detail p{color:#586c77}.price{font-size:29px;font-weight:850;margin:8px 0;color:#122a37}',
  '.row{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid #e6edf0;padding:12px 0;font-size:14px}',
  '.row:last-child{border-bottom:0}.methods{display:grid;gap:10px;margin-top:15px}',
  '.method{display:flex;align-items:center;justify-content:space-between;padding:14px;border:1px solid #d2e2e1;border-radius:10px;font-weight:750}',
  '.method:hover{background:#eef9f4;text-decoration:none}.pass{display:inline-block;color:#0a805d;background:#e9f8f1;padding:7px 10px;border-radius:8px;font-weight:800}',
  '@media(max-width:850px){.hero-grid,.demo-layout{grid-template-columns:1fr;gap:20px}.grid{grid-template-columns:repeat(2,1fr)}.toplinks{gap:10px}.hero{padding:40px 0}}',
  '@media(max-width:540px){.wrap{padding:0 18px}.top .wrap{min-height:65px}.brand{font-size:23px}.toplinks a:not(.pill-link){display:none}',
  '.hero h1{font-size:37px}.grid,.steps{grid-template-columns:1fr}.section{padding:35px 0}.state{padding:21px}.card{padding:19px}}',
].join('');
function headers(type='text/html; charset=utf-8') {
  return {
    'content-type':type,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'strict-transport-security':'max-age=31536000; includeSubDomains',
  };
}
function htmlResponse(html,status=200,method='GET',extra={}) {
  return new Response(method==='HEAD'?null:html,{status,headers:{...headers(),...extra}});
}
function esc(value) { return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function shell(title,main,method='GET',status=200) {
  const body=['<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light"><title>',esc(title),' | EKODI Pay</title><style>',STYLES,'</style></head><body>',
    '<header class="top"><div class="wrap"><a class="brand" href="/ekodipay/" aria-label="에코디페이 홈">EKODI <b>Pay</b></a>',
    '<nav class="toplinks" aria-label="사이트 메뉴"><a href="/ekodipay/#services">서비스</a><a href="/ekodipay/#flow">이용방법</a>',
    '<a href="/ekodipay/demo" class="pill-link">테스트 체험</a></nav></div></header>',
    main,
    '<footer class="foot"><div class="wrap">EKODI Pay · 공식 주소 ekodi.kr/ekodipay · 실제 결제는 별도 PG 계약·운영 승인 후 제공됩니다.</div></footer>',
    '</body></html>'].join('');
  return htmlResponse(body,status,method);
}
function demoUrl(service,step,method='') {
  return PREFIX+'/demo?service='+encodeURIComponent(service)+'&step='+encodeURIComponent(step)+(method?'&method='+encodeURIComponent(method):'');
}
function home(method) {
  const cards=Object.entries(DEMO_CATALOG).map(([id,item])=>[
    '<article class="card"><span class="label">',esc(item.tag),'</span><h3>',esc(item.name),'</h3><p>',esc(item.title),
    ' · 서비스별 주문과 별도로 결제 화면을 미리 체험합니다.</p><a class="cta" href="',demoUrl(id,'review'),'">시연하기 →</a></article>'
  ].join('')).join('');
  const main=[
    '<main><section class="hero"><div class="wrap hero-grid"><div><span class="eyebrow">ONE PAYMENT EXPERIENCE · EKODI</span>',
    '<h1>에코디의 모든 서비스를<br>하나의 결제 경험으로</h1>',
    '<p class="lead">에코디몰·에코디비즈·에코디교육·동행 서비스를 위한 공통 결제 창구입니다. ',
    '현재는 안전한 화면 시연을 제공하며, 실제 카드 청구나 입금은 발생하지 않습니다.</p>',
    '<div class="actions"><a class="primary" href="/ekodipay/demo">테스트 결제 체험</a>',
    '<a class="secondary" href="#services">연결 서비스 보기</a></div></div>',
    '<aside class="state"><span class="status-mark">TEST EXPERIENCE · 실결제 미사용</span><h2>안전한 테스트 환경</h2>',
    '<p class="muted">서비스 선택부터 결제수단 선택·결과 화면까지 직접 확인할 수 있습니다.</p>',
    '<ul><li><span class="dot">✓</span>가상 금액만 표시하며 실제 청구하지 않습니다.</li>',
    '<li><span class="dot">✓</span>카드번호·계좌번호·개인정보를 입력받지 않습니다.</li>',
    '<li><span class="dot">✓</span>승인·환불·정산 내역을 생성하지 않습니다.</li>',
    '<li><span class="dot">✓</span>PG 계약 및 별도 금융 승인 전 실제 결제는 차단됩니다.</li></ul></aside></div></section>',
    '<section id="services" class="section"><div class="wrap"><div class="section-head"><div>',
    '<span class="eyebrow">CONNECTED SERVICES</span><h2>서비스별 결제 시연</h2>',
    '<p class="muted">아래 금액·상품은 실제 판매·계약과 무관한 가상 예시입니다.</p></div></div>',
    '<div class="grid">',cards,'</div></div></section>',
    '<section id="flow" class="section"><div class="wrap"><span class="eyebrow">HOW IT WORKS</span>',
    '<h2>결제 흐름은 간단하게, 검증은 확실하게</h2><div class="steps">',
    '<div class="step"><span class="num">01 / SERVICE</span><strong>서비스 선택</strong><span class="muted">시연할 상품·교육·사업 유형을 고릅니다.</span></div>',
    '<div class="step"><span class="num">02 / REVIEW</span><strong>가상 주문 확인</strong><span class="muted">실제 주문과 분리된 예시 금액·수단을 살펴봅니다.</span></div>',
    '<div class="step"><span class="num">03 / RESULT</span><strong>시연 종료 확인</strong><span class="muted">실제 결제 없이 흐름 종료 화면만 보여줍니다.</span></div>',
    '</div><div class="notice"><strong>현재 운영 원칙</strong> · 테스트 시연은 PG사 샌드박스 승인이나 실제 결제 성공을 뜻하지 않습니다. ',
    'PG 연동은 서버 원장·결제 승인 검증·환불 정책을 갖춘 뒤 별도 활성화합니다.</div></div></section></main>'
  ].join('');
  return shell('모든 에코디 서비스를 위한 하나의 결제 창구',main,method);
}
function demo(request,url) {
  const keys=[...url.searchParams.keys()];
  if(keys.some(k=>!['service','step','method'].includes(k))||new Set(keys).size!==keys.length)
    return shell('테스트 요청을 확인할 수 없습니다','<main class="wrap demo"><h1>올바르지 않은 테스트 요청</h1><p>금액·주문번호·결제키 등은 테스트 화면 주소로 전달할 수 없습니다.</p><a href="/ekodipay/demo">체험 화면으로 돌아가기</a></main>',request.method,400);
  const service=url.searchParams.get('service')||'';
  const step=url.searchParams.get('step')||'select';
  const method=url.searchParams.get('method')||'';
  if(!['select','review','result'].includes(step)||
    (step!=='select'&&!Object.hasOwn(DEMO_CATALOG,service))||
    (step==='select'&&(service!==''||method!==''))||
    (step==='review'&&method!=='')||
    (step==='result'&&!Object.hasOwn(DEMO_METHODS,method))) {
      return shell('시연 요청을 확인할 수 없습니다','<main class="wrap demo"><h1>시연 주소를 확인해주세요</h1><a href="/ekodipay/demo">처음부터 다시 시작</a></main>',request.method,400);
    }
  if(step==='select') {
    const items=Object.entries(DEMO_CATALOG).map(([id,item])=>
      '<article class="card"><span class="label">'+esc(item.tag)+'</span><h3>'+esc(item.name)+'</h3><p>'+esc(item.detail)+'</p><a class="cta" href="'+demoUrl(id,'review')+'">선택하기 →</a></article>').join('');
    return shell('테스트 체험 · 서비스 선택',
      '<main class="wrap demo"><div class="breadcrumbs">EKODI Pay / 테스트 시연 / 1단계</div><span class="eyebrow">STEP 1 / 3</span><h1>시연할 서비스를 선택하세요</h1>'+
      '<p class="demo-lead">실제 주문이나 수강 신청을 만들지 않는 공개 화면 시연입니다.</p><div class="grid">'+items+'</div>'+
      '<div class="notice">테스트 체험에서는 어떠한 카드번호·계좌정보·개인정보도 요구하지 않습니다.</div></main>',request.method);
  }
  const item=DEMO_CATALOG[service];
  const amount='₩'+item.amount.toLocaleString('ko-KR');
  if(step==='review') {
    const links=Object.entries(DEMO_METHODS).map(([id,label])=>
      '<a class="method" href="'+demoUrl(service,'result',id)+'"><span>'+esc(label)+'</span><span>시연 진행 →</span></a>').join('');
    return shell('테스트 체험 · 주문 확인',
      '<main class="wrap demo"><div class="breadcrumbs"><a href="/ekodipay/demo">서비스 선택</a> / 가상 주문 확인</div>'+
      '<span class="eyebrow">STEP 2 / 3</span><h1>가상 결제 정보 확인</h1><p class="demo-lead">아래 금액은 시연용으로만 정해진 가상 금액입니다. 실제 계약금·상품 가격이 아닙니다.</p>'+
      '<div class="demo-layout"><section class="card detail"><span class="label">TEST ONLY · 가상 주문</span><h2>'+esc(item.title)+'</h2>'+
      '<p>'+esc(item.detail)+'</p><div class="price">'+esc(amount)+'</div>'+
      '<div class="row"><span>서비스</span><strong>'+esc(item.name)+'</strong></div>'+
      '<div class="row"><span>청구 여부</span><strong>청구 안 함</strong></div><div class="row"><span>실제 주문번호</span><strong>발급 안 함</strong></div>'+
      '<h3>화면 시연할 결제수단 선택</h3><div class="methods">'+links+'</div></section>'+
      '<aside class="card"><h3>안전한 시연</h3><p>결제수단을 눌러도 PG나 은행으로 요청이 전송되지 않습니다. 실제 승인번호·영수증·정산내역은 만들지 않습니다.</p>'+
      '<a class="secondary" href="/ekodipay/demo">다른 서비스 선택</a></aside></div></main>',request.method);
  }
  return shell('테스트 체험 · 종료',
    '<main class="wrap demo"><div class="breadcrumbs"><a href="/ekodipay/demo">서비스 선택</a> / <a href="'+demoUrl(service,'review')+'">가상 주문</a> / 시연 종료</div>'+
    '<span class="eyebrow">STEP 3 / 3</span><h1>결제 화면 시연이 끝났습니다</h1><p class="demo-lead">이 화면은 테스트 인터페이스의 마지막 단계일 뿐, 결제 완료나 입금 확인이 아닙니다.</p>'+
    '<div class="demo-layout"><section class="card detail"><span class="pass">실제 금전 거래 0건 · 결제 요청 미전송</span>'+
    '<h2>실제 결제는 실행되지 않았습니다</h2>'+
    '<div class="row"><span>서비스</span><strong>'+esc(item.name)+'</strong></div>'+
    '<div class="row"><span>가상 금액</span><strong>'+esc(amount)+'</strong></div>'+
    '<div class="row"><span>선택한 시연 수단</span><strong>'+esc(DEMO_METHODS[method])+'</strong></div>'+
    '<div class="row"><span>PG 승인번호 / 영수증</span><strong>없음</strong></div>'+
    '<div class="actions" style="margin-top:20px"><a class="primary" href="/ekodipay/demo">다시 체험하기</a>'+
    '<a class="secondary" href="/ekodipay/">홈으로</a></div></section>'+
    '<aside class="card"><h3>정식 결제 서비스는 준비 중입니다</h3><p>PG 가맹점 계약, 인증키·웹훅 검증, 서버 측 원장과 금액 확정, 환불·정산 및 최종 운영 승인이 별도로 필요합니다.</p></aside></div>'+
    '<div class="notice">이 화면을 캡처하거나 공유하더라도 상품 구매·계약금 납부·교육 신청을 증명할 수 없습니다.</div></main>',request.method);
}
function checkout(request,url) {
  if ([...url.searchParams.keys()].some(key=>/amount|price|total|currency|paymentkey|billingkey/i.test(key))) {
    return shell('결제를 진행할 수 없습니다','<main class="wrap demo"><h1>결제를 진행할 수 없습니다</h1><p>결제 금액이나 결제키를 주소에 넣을 수 없습니다.</p></main>',request.method,400);
  }
  const source=url.searchParams.get('service')||'';
  const orderId=url.searchParams.get('orderId')||'';
  if(source!=='ekodibiz'||!ORDER_ID.test(orderId)) {
    return shell('주문 확인이 필요합니다','<main class="wrap demo"><h1>승인된 주문번호가 필요합니다</h1><p>에코디비즈의 서버 측 견적 승인 절차를 먼저 완료해야 합니다.</p></main>',request.method,400);
  }
  const back='/ekodibiz/pay?orderId='+encodeURIComponent(orderId);
  return shell('결제 승인 상태 확인',
    '<main class="wrap demo"><h1>결제 승인 상태 확인</h1><p class="demo-lead">서버 측 견적 승인 절차를 먼저 통과해야 합니다.</p>'+
    '<section class="card"><h2>주문번호: '+esc(orderId)+'</h2><p>이 화면은 결제 완료 증명이 아닙니다.</p>'+
    '<a href="'+back+'">에코디비즈 견적·결제 상태 확인</a></section></main>',request.method);
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    const path=url.pathname;
    if(url.hostname!=='ekodi.kr')return new Response('Not Found',{status:404,headers:{...headers('text/plain; charset=utf-8'),'x-robots-tag':'noindex'}});
    const payment=await paymentRoute(request,env,shell);
    if(payment)return payment;
    if(!['GET','HEAD'].includes(request.method))
      return new Response(null,{status:405,headers:{...headers('text/plain; charset=utf-8'),allow:'GET, HEAD'}});
    if(path===PREFIX)return new Response(null,{status:308,headers:{location:PREFIX+'/','cache-control':'no-store'}});
    if(path===PREFIX+'/'||path===PREFIX+'/index.html')return home(request.method);
    if(path===PREFIX+'/api/health')return new Response(request.method==='HEAD'?null:JSON.stringify({
      service:'ekodipay',canonical:CANONICAL_PAYMENT_ROOT,status:'public-entry-ready',
      realMoneyProcessing:'disabled-until-human-approved-pg-activation',
      demoMode:'read-only-no-transactions',paymentSecretsExposed:false,
      paymentGatewayMode:paymentMode(env).requested,paymentGatewayReady:paymentMode(env).ready
    }),{status:200,headers:headers('application/json; charset=utf-8')});
    if(path===PREFIX+'/demo')return demo(request,url);
    if(path===PREFIX+'/checkout')return checkout(request,url);
    return shell('페이지를 찾을 수 없습니다','<main class="wrap demo"><h1>페이지를 찾을 수 없습니다</h1><a href="/ekodipay/">EKODI Pay 홈</a></main>',request.method,404);
  }
};
