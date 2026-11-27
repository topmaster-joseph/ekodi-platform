import { WEB_PAY_CLIENT } from './ekodipay-web-client.js';

const CSS = [
  ':root{color-scheme:light;font:16px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#162c3d;background:#f3f7fa}*{box-sizing:border-box}body{margin:0}a{color:#076d53;text-decoration:none}a:hover{text-decoration:underline}button,input,select{font:inherit}button,a,input,select{touch-action:manipulation}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #2475b9;outline-offset:3px}[hidden]{display:none!important}',
  '.wrap{max-width:1120px;margin:auto;padding:0 22px}.top{background:white;border-bottom:1px solid #dce5eb}.top .wrap{min-height:76px;display:flex;justify-content:space-between;align-items:center;gap:16px}.brand{font-size:25px;font-weight:850;color:#133b35}.brand span{color:#078b66}.auth{border:1px solid #a3c7bb;border-radius:10px;padding:9px 15px;font-weight:700}main{padding-top:32px!important;padding-bottom:70px!important}.tabs{display:flex;gap:8px;overflow:auto;padding:2px 0 20px}.tabs a{padding:10px 17px;white-space:nowrap;border:1px solid #d4e0e6;border-radius:11px;background:white;color:#48616e;font-weight:700}.tabs a[aria-current]{color:white;background:#126c58;border-color:#126c58}',
  '.eyebrow{font-size:14px;color:#23725e;font-weight:800}h1{font-size:clamp(30px,4vw,43px);line-height:1.25;letter-spacing:-.05em;margin:10px 0 14px}h2{font-size:21px;letter-spacing:-.03em;margin:0 0 12px}p{margin:8px 0 18px;color:#4b6473}.lead{max-width:720px;font-size:18px}.status{padding:14px 18px;background:#e6f1ee;color:#225f50;border:1px solid #bbd9d0;border-radius:12px;margin:24px 0}.columns{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr);gap:20px;align-items:start}.panel{padding:26px;border:1px solid #dce5ec;border-radius:18px;background:white;min-width:0}.panel+.panel{margin-top:18px}.badge{font-size:14px;color:#775619;background:#fff4d7;border-radius:20px;padding:5px 12px}.bar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}',
  'button,.button{display:inline-block;cursor:pointer;border:1px solid #b9d1c8;background:white;border-radius:10px;padding:11px 17px;font-weight:750;color:#21644e}.primary{background:#116d58;border-color:#116d58;color:white}button:disabled{cursor:not-allowed;opacity:.55}.empty{padding:30px 18px;border:1px dashed #c6d7df;border-radius:12px;text-align:center;color:#5a707b}.saved-card{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:1px solid #e4ebef;padding:16px 0}.saved-card span{color:#536e7b}label{display:block;font-size:15px;font-weight:700;margin:16px 0 6px}input,select{width:100%;border:1px solid #bdcdd6;border-radius:9px;padding:11px 12px;background:#fff;color:#162c3d;min-width:0}.field-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.check{display:flex;align-items:flex-start;gap:10px;font-weight:500}.check input{width:20px;height:20px;flex:none}.amount{font-size:36px;font-weight:850;letter-spacing:-.04em;color:#0d614c}.details{display:grid;grid-template-columns:100px minmax(0,1fr);gap:12px;margin:22px 0}.details dt{color:#627785}.details dd{margin:0;overflow-wrap:anywhere}.hint{font-size:14px;color:#647a87}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:24px 0}.stat{padding:20px;background:#fff;border:1px solid #dce5ec;border-radius:14px}.stat strong{font-size:25px;display:block;margin-top:7px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px;white-space:nowrap}th,td{padding:14px 12px;text-align:left;border-bottom:1px solid #e4ebef}th{color:#4b6573;background:#f5f9fb}.foot{background:#fff;border-top:1px solid #dce5ec;padding:22px 0;color:#526b78;font-size:14px}',
  '@media(max-width:720px){.columns{grid-template-columns:1fr}.panel{padding:21px}.stats{grid-template-columns:1fr}.stat{display:flex;align-items:center;justify-content:space-between;gap:12px}.stat strong{margin:0;font-size:23px}.wrap{padding:0 16px}.top .wrap{min-height:66px}.field-row{grid-template-columns:1fr;gap:0}.actions button{flex:1}.brand{font-size:23px}}',
].join('');
const pages = {
  wallet: {
    title: '내 카드',
    heading: '한 번 등록하고, 가볍게 결제하세요',
    lead: '별도 에코디페이 앱 없이 웹에서 시작하세요. 본인 확인과 카드 등록은 결제사의 보안창에서 진행합니다.',
    main: '<div class="columns"><section class="panel"><div class="bar"><h2>내 결제수단</h2><span class="badge" id="connection">연결 확인 중</span></div><div id="cards" class="empty">로그인과 서비스 연결 후 내 카드를 확인할 수 있습니다.</div><div class="actions"><button class="primary" id="addCard" data-requires-connection disabled>본인 카드 등록</button><button id="manageCards" data-requires-connection disabled>카드 관리·삭제</button></div><p class="hint">카드사에 따라 본인 확인을 위한 추가 절차가 있을 수 있습니다.</p></section><aside class="panel"><h2>다른 분이 결제하시나요?</h2><p>주문에 대한 요청 링크를 전달하면 카드 명의자가 직접 확인하고 결제할 수 있습니다.</p><a class="button" href="/ekodipay/send">대신 결제 요청</a><p class="hint">타인의 카드번호를 내 계정에 입력하거나 저장하지 않습니다.</p></aside></div>',
  },
  send: {
    title: '대신 결제 요청',
    heading: '주문은 내가, 결제는 동의한 분이',
    lead: '가족·지인에게 주문의 결제를 요청하세요. 받는 분이 판매자와 금액을 확인하고 본인의 결제수단으로 진행합니다.',
    main: '<div class="columns"><section class="panel"><div class="bar"><h2>결제 요청 만들기</h2><span class="badge" id="connection">연결 확인 중</span></div><form id="requestForm"><label for="service">주문한 서비스</label><select id="service"><option value="mall">에코디몰</option><option value="books">에코디서점</option><option value="biz">에코디비즈</option><option value="edu">에코디교육</option><option value="qtin">큐티인</option></select><label for="orderId">기존 주문번호</label><input id="orderId" required maxlength="100" autocomplete="off" placeholder="주문내역에 표시된 번호"><p class="hint">결제 가능한 주문과 금액은 서버에서 확인합니다.</p><button class="primary" data-requires-connection disabled>요청 링크 만들기</button></form><div id="requestResult" hidden><label for="requestLink">전달할 링크</label><input id="requestLink" readonly><p id="expiry" class="hint"></p><div class="actions"><button id="copyLink">링크 복사</button><button id="cancelLink">요청 취소</button></div></div></section><aside class="panel"><h2>받는 분이 직접 결정합니다</h2><p>링크를 여는 것만으로 결제되지 않습니다. 요청은 15분 동안 유효하며, 카드 명의자가 금액 확인과 결제 인증을 마쳐야 합니다.</p><p>결제자에게 다른 사람의 저장된 카드나 배송정보를 보여주지 않습니다.</p></aside></div>',
  },
  request: {
    title: '받은 결제 요청',
    heading: '결제할 내용을 먼저 확인하세요',
    lead: '본인이 동의한 주문인지 확인해 주세요. 본인 명의 결제수단의 인증은 원래 서비스의 결제창에서 진행합니다.',
    main: '<section class="panel"><div class="bar"><h2>받은 요청</h2><span class="badge" id="connection">연결 확인 중</span></div><dl class="details"><dt>판매자</dt><dd id="requestMerchant">로그인 후 확인</dd><dt>결제금액</dt><dd id="requestAmount" class="amount">확인 전</dd><dt>요청 만료</dt><dd id="requestExpiry">확인 전</dd></dl><label class="check"><input type="checkbox" id="payerConsent"><span>판매자와 금액을 확인했으며, 내 결제수단으로 결제를 진행하는 데 동의합니다.</span></label><button id="acceptRequest" class="primary" disabled>확인하고 결제창 열기</button><p class="hint">이 버튼은 결제창을 엽니다. 실제 승인 여부는 해당 주문의 결제 결과로 확인하세요.</p></section>',
  },
  seller: {
    title: '판매·정산',
    heading: '판매부터 입금까지, 한눈에',
    lead: '매출·환불·수수료와 정산 예정일을 함께 확인하세요. 실제 지급이 확인된 거래만 지급 완료로 표시합니다.',
    main: '<section class="panel"><div class="bar"><h2>판매·정산 조회</h2><span class="badge" id="connection">연결 확인 중</span></div><form id="sellerForm"><label for="workspaceId">내 매장</label><select id="workspaceId" required><option value="">로그인 후 매장 선택</option></select><div class="field-row"><div><label for="start">시작일</label><input type="date" id="start" required></div><div><label for="end">종료일</label><input type="date" id="end" required></div></div><div class="actions"><button class="primary" data-requires-connection disabled>내역 조회</button><button type="button" id="export" disabled>조회 내역 CSV</button></div></form></section><div class="stats"><div class="stat"><span>조회된 총매출</span><strong id="gross">확인 전</strong></div><div class="stat"><span>조회된 예상 정산액</span><strong id="net">확인 전</strong></div><div class="stat"><span>지급 확인액</span><strong id="paid">확인 전</strong></div></div><section class="panel"><h2>주문별 내역</h2><p id="terms">정산 주기와 빠른 정산 가능 여부는 가맹 계약에 따라 달라집니다.</p><p class="hint">당일 매출과 결제사의 정산 자료 반영 시점은 다를 수 있습니다.</p><div class="table-wrap" tabindex="0" role="region" aria-label="주문별 정산 내역"><table><thead><tr><th>주문</th><th>판매일</th><th>매출</th><th>환불</th><th>수수료</th><th>예상 정산</th><th>예정일</th><th>지급 확인</th><th>상태</th></tr></thead><tbody id="reportRows"><tr><td colspan="9">조회 후 실제 연결된 자료가 표시됩니다.</td></tr></tbody></table></div><button id="more" hidden>더 보기</button><p id="source" class="hint"></p><div class="actions"><a class="button" href="/ekodimall/seller-studio/">에코디몰 판매자 스튜디오</a></div></section>',
  },
};
export function webPayClientSource() { return WEB_PAY_CLIENT; }
export function webPayPage(view, method = 'GET') {
  const p = pages[view];
  if (!p) return null;
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const tabs = [['wallet', '내 카드'], ['send', '대신 결제 요청'], ['seller', '판매·정산']].map(([key, label]) =>
    '<a href="/ekodipay/' + key + '"' + (view === key ? ' aria-current="page"' : '') + '>' + label + '</a>').join('');
  const html = '<!doctype html><html lang="ko" data-ekodi-service="pay"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' + p.title + ' | EKODI Pay</title><link rel="stylesheet" href="/ekodipay/web.css"><script src="/ekodipay/web.js" defer></script></head><body data-pay-view="' + view + '"><header class="top"><div class="wrap"><a class="brand" href="/ekodipay/">EKODI <span>Pay</span></a><a id="login" class="auth" href="/auth/?site=portal&amp;return_to=https%3A%2F%2Fekodi.kr%2Fekodipay%2F' + view + '">로그인하고 이어서 이용</a></div></header><main class="wrap"><nav class="tabs" aria-label="에코디페이 메뉴">' + tabs + '</nav><span class="eyebrow">EKODI PAY</span><h1>' + p.heading + '</h1><p class="lead">' + p.lead + '</p><div id="notice" class="status" role="status" aria-live="polite">서비스 연결 상태를 확인하고 있습니다.</div>' + p.main + '</main><footer class="foot"><div class="wrap">에코디페이 · 카드 등록은 결제사 보안창에서 · 주문과 결제 결과는 이용한 서비스에서 확인</div></footer></body></html>';
  return new Response(method === 'HEAD' ? null : html, { headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'none'; script-src 'self' 'nonce-" + nonce + "' https://js.tosspayments.com; style-src 'self'; connect-src 'self' https://*.tosspayments.com; frame-src https://*.tosspayments.com; img-src 'self' data: https://*.tosspayments.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  } });
}
export function webPayAsset(path, method = 'GET') {
  const css = path === '/ekodipay/web.css';
  return new Response(method === 'HEAD' ? null : css ? CSS : webPayClientSource(), { headers: {
    'content-type': css ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
  } });
}
