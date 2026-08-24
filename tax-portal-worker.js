const TAX_HTML = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#07111f">
  <title>EKODI Tax · 세금 · 증빙</title>
  <link rel="stylesheet" href="/control-center.css">
  <link rel="stylesheet" href="/control-center-finance.css">
  <link rel="stylesheet" href="/tax-portal.css">
</head>
<body class="tax-portal-body">
  <header class="tax-portal-topbar">
    <a class="tax-brand" href="/" aria-label="EKODI Tax 홈"><span>EKODI</span><strong>Tax</strong></a>
    <div class="tax-top-actions">
      <span class="tax-free-badge">FREE-FIRST</span>
      <a href="https://admin.ekodi.kr/#finance" class="ghost compact">관리자 ↗</a>
      <button type="button" class="ghost compact" id="taxLogout">로그아웃</button>
    </div>
  </header>
  <main class="tax-portal-shell">
    <section class="tax-portal-hero">
      <div>
        <p class="kicker">EKODI PROFESSIONAL SERVICE</p>
        <h1>세금 · 증빙</h1>
        <p>공급자를 선택해 전자세금계산서를 작성하고, 홈택스 무료 발행 결과를 한 원장에 남깁니다.</p>
      </div>
      <div class="tax-portal-policy">
        <strong>기본 비용 0원 경로</strong>
        <span>작성 → 승인 → 홈택스 발행 → 완료기록</span>
      </div>
    </section>

    <nav class="tax-service-nav" aria-label="세금 전문서비스">
      <button type="button" data-tax-nav="home" class="active">홈</button>
      <button type="button" data-tax-nav="invoice">세금계산서</button>
      <button type="button" data-tax-nav="suppliers">공급자</button>
      <button type="button" data-tax-nav="customers">거래처</button>
      <button type="button" data-tax-nav="ledger">발행대장</button>
    </nav>

    <section class="tax-quick-grid" aria-label="빠른 업무">
      <button type="button" class="tax-quick-card" data-tax-action="new-invoice"><small>전자세금계산서</small><strong>새로 작성</strong><span>공급자 선택 후 초안 작성</span></button>
      <button type="button" class="tax-quick-card" data-tax-action="suppliers"><small>공급자</small><strong>사업자 관리</strong><span>여러 공급자 · 기본 공급자</span></button>
      <button type="button" class="tax-quick-card" data-tax-action="customers"><small>거래처</small><strong>최근 거래처</strong><span>작성 과정에서 자동 저장·갱신</span></button>
      <button type="button" class="tax-quick-card" data-tax-action="ledger"><small>발행대장</small><strong>공급자별 조회</strong><span>상태 · 금액 · 처리이력</span></button>
    </section>

    <section class="section tax-core-section" aria-labelledby="financeTitle">
      <div class="tax-core-heading">
        <div><p class="kicker">SHARED FINANCE CORE</p><h2 id="financeTitle">전자세금계산서 업무</h2></div>
        <span id="taxSessionState" class="tax-session-state">인증 확인 중</span>
      </div>
      <div id="financeNotice" hidden></div>
    </section>

    <section class="section tax-customer-panel" id="taxCustomerPanel" hidden>
      <div class="tax-customer-head">
        <div><p class="kicker">CUSTOMERS</p><h2>거래처</h2><p>세금계산서 작성 시 입력한 거래처가 자동으로 저장·갱신됩니다.</p></div>
        <button type="button" class="ghost compact" id="taxCustomerRefresh">↻ 새로고침</button>
      </div>
      <div class="tax-customer-list" id="taxCustomerList"><p>거래처를 불러오는 중입니다.</p></div>
    </section>

    <footer class="tax-portal-footer">
      <span>EKODI Tax</span><span>기존 인증 · Finance API · D1 공유</span><span>유료 자동발행 기본 OFF</span>
    </footer>
  </main>
  <script src="/tax-portal.js" defer></script>
  <script src="/finance-monitor.js" defer></script>
</body>
</html>`;

const TAX_CSS = `
:root{color-scheme:dark}.tax-portal-body{margin:0;min-height:100vh;background:#07111f;color:#e8f0fb}.tax-portal-topbar{position:fixed;z-index:50;top:0;left:0;right:0;min-height:64px;padding:env(safe-area-inset-top) max(18px,env(safe-area-inset-right)) 0 max(18px,env(safe-area-inset-left));display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(148,163,184,.14);background:rgba(7,17,31,.96)}.tax-brand{display:flex;align-items:baseline;gap:8px;color:inherit;text-decoration:none;letter-spacing:.02em}.tax-brand span{font-size:12px;font-weight:800;opacity:.62}.tax-brand strong{font-size:22px}.tax-top-actions{display:flex;align-items:center;gap:8px}.tax-free-badge{font-size:11px;font-weight:800;letter-spacing:.08em;padding:6px 9px;border:1px solid rgba(52,211,153,.28);border-radius:999px;background:rgba(16,185,129,.09);color:#a7f3d0}.tax-portal-shell{width:min(1280px,calc(100% - 32px));margin:0 auto;padding:96px 0 48px}.tax-portal-hero{display:flex;gap:24px;align-items:flex-end;justify-content:space-between;margin-bottom:20px}.tax-portal-hero h1{margin:4px 0 8px;font-size:clamp(30px,5vw,54px)}.tax-portal-hero p{margin:0;max-width:720px;color:#9fb0c6;line-height:1.6}.tax-portal-policy{min-width:250px;padding:16px 18px;border:1px solid rgba(52,211,153,.2);border-radius:16px;background:rgba(16,185,129,.06);display:grid;gap:5px}.tax-portal-policy span{font-size:12px;color:#9fb0c6}.tax-service-nav{display:flex;gap:8px;overflow:auto;padding:6px 0 16px;scrollbar-width:none}.tax-service-nav button{white-space:nowrap;border:1px solid rgba(148,163,184,.18);border-radius:999px;background:#0b1829;color:#cbd5e1;padding:9px 14px;cursor:pointer}.tax-service-nav button.active{background:#16314f;border-color:#3b82f6;color:#fff}.tax-quick-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}.tax-quick-card{text-align:left;min-height:116px;padding:16px;border:1px solid rgba(148,163,184,.14);border-radius:16px;background:#0a1727;color:inherit;cursor:pointer;display:grid;align-content:start;gap:5px}.tax-quick-card:hover{border-color:rgba(96,165,250,.45);transform:translateY(-1px)}.tax-quick-card small,.tax-quick-card span{color:#8fa3bb}.tax-quick-card strong{font-size:17px}.tax-core-section,.tax-customer-panel{margin-top:0}.tax-core-heading,.tax-customer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.tax-core-heading h2,.tax-customer-head h2{margin:3px 0}.tax-customer-head p{margin:4px 0;color:#8fa3bb}.tax-session-state{font-size:12px;padding:6px 9px;border-radius:999px;background:rgba(59,130,246,.1);color:#bfdbfe}.tax-customer-panel{margin-top:14px}.tax-customer-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:9px;margin-top:14px}.tax-customer-card{padding:13px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.46);display:grid;gap:4px}.tax-customer-card small{color:#8fa3bb}.tax-portal-footer{display:flex;flex-wrap:wrap;gap:8px 18px;color:#71839a;font-size:11px;padding:20px 4px}.tax-invoice-workspace{margin-top:14px!important}.tax-core-section>.tax-invoice-workspace{border-top:1px solid rgba(148,163,184,.1);padding-top:18px}.tax-portal-body .sidebar,.tax-portal-body .topbar{display:none!important}@media(max-width:850px){.tax-quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tax-portal-hero{align-items:flex-start;flex-direction:column}.tax-portal-policy{width:100%;box-sizing:border-box}}@media(max-width:560px){.tax-portal-shell{width:min(100% - 22px,1280px);padding-top:88px}.tax-portal-topbar{min-height:58px}.tax-free-badge{display:none}.tax-top-actions .ghost{padding-left:9px;padding-right:9px}.tax-quick-grid{grid-template-columns:1fr 1fr}.tax-quick-card{min-height:108px;padding:13px}.tax-core-heading,.tax-customer-head{flex-direction:column}.tax-portal-footer{padding-bottom:calc(24px + env(safe-area-inset-bottom))}}
`;

const TAX_JS = `(() => {
  'use strict';
  const AUTH_URL = 'https://auth.ekodi.kr/?site=admin&return_to=' + encodeURIComponent('https://tax.ekodi.kr/');
  const TOKEN_KEY = 'ekodi-auth-token';
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const handoffToken = hash.get('ekodi_admin_token');
  if (handoffToken) {
    sessionStorage.setItem(TOKEN_KEY, handoffToken);
    history.replaceState(null, '', location.pathname + location.search);
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('https://finance-api.ekodi.kr/api/finance/tax-')) {
      input = input.slice('https://finance-api.ekodi.kr'.length);
    } else if (input instanceof Request && input.url.startsWith('https://finance-api.ekodi.kr/api/finance/tax-')) {
      const next = new URL(input.url); next.protocol = location.protocol; next.host = location.host;
      input = new Request(next, input);
    }
    return nativeFetch(input, init);
  };

  function token(){ return sessionStorage.getItem(TOKEN_KEY) || ''; }
  if (!token()) { location.replace(AUTH_URL); return; }

  function byId(id){ return document.getElementById(id); }
  function waitFor(selector, timeout = 5000){
    const existing = document.querySelector(selector); if (existing) return Promise.resolve(existing);
    return new Promise(resolve => {
      const observer = new MutationObserver(() => { const node = document.querySelector(selector); if (node) { observer.disconnect(); resolve(node); } });
      observer.observe(document.body, { childList:true, subtree:true });
      setTimeout(() => { observer.disconnect(); resolve(document.querySelector(selector)); }, timeout);
    });
  }
  async function api(path){
    const response = await nativeFetch(path, { cache:'no-store', headers:{ authorization:'Bearer ' + token() } });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || '세금 서비스 연결을 확인해 주세요.');
    return data;
  }
  function setActive(name){ document.querySelectorAll('[data-tax-nav]').forEach(button => button.classList.toggle('active', button.dataset.taxNav === name)); }
  async function showCustomers(){
    setActive('customers');
    const panel = byId('taxCustomerPanel'); panel.hidden = false; panel.scrollIntoView({ behavior:'smooth', block:'start' });
    const list = byId('taxCustomerList'); list.innerHTML = '<p>거래처를 불러오는 중입니다.</p>';
    try {
      const data = await api('/api/finance/tax-customers?organizationId=EKODIBIZ&limit=100');
      const customers = data.customers || [];
      if (!customers.length) { list.innerHTML = '<p>아직 저장된 거래처가 없습니다. 새 세금계산서 작성 시 자동으로 등록됩니다.</p>'; return; }
      list.replaceChildren(...customers.map(customer => {
        const card = document.createElement('article'); card.className = 'tax-customer-card';
        const name = document.createElement('strong'); name.textContent = customer.corpName || '상호 미입력';
        const corp = document.createElement('small'); corp.textContent = customer.corpNum || '사업자번호 미입력';
        const contact = document.createElement('small'); contact.textContent = [customer.contactName, customer.email || customer.tel].filter(Boolean).join(' · ') || '담당자 정보 없음';
        card.append(name, corp, contact); return card;
      }));
    } catch (error) { list.innerHTML = '<p>' + error.message + '</p>'; }
  }
  async function perform(action){
    if (action === 'new-invoice') { setActive('invoice'); (await waitFor('#taxDraftButton'))?.click(); return; }
    if (action === 'suppliers') { setActive('suppliers'); (await waitFor('#taxSupplierManage'))?.click(); return; }
    if (action === 'customers') { await showCustomers(); return; }
    if (action === 'ledger') { setActive('ledger'); (await waitFor('#taxInvoiceWorkspace'))?.scrollIntoView({ behavior:'smooth', block:'start' }); return; }
    setActive('home'); scrollTo({ top:0, behavior:'smooth' });
  }
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-tax-action]')?.dataset.taxAction || event.target.closest('[data-tax-nav]')?.dataset.taxNav;
    if (action) perform(action === 'invoice' ? 'new-invoice' : action);
  });
  byId('taxCustomerRefresh')?.addEventListener('click', showCustomers);
  byId('taxLogout')?.addEventListener('click', () => { sessionStorage.removeItem(TOKEN_KEY); location.replace(AUTH_URL); });
  byId('taxSessionState').textContent = 'EKODI 관리자 인증';
})();`;

function secured(body, type, cache = 'no-store') {
  return new Response(body, { headers: {
    'content-type': `${type}; charset=utf-8`,
    'cache-control': cache,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), usb=()',
    'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
  }});
}

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status:405, headers:{ allow:'GET, HEAD' } });
    if (url.pathname === '/' || url.pathname === '/index.html') return secured(TAX_HTML, 'text/html');
    if (url.pathname === '/tax-portal.css') return secured(TAX_CSS, 'text/css', 'public, max-age=300');
    if (url.pathname === '/tax-portal.js') return secured(TAX_JS, 'application/javascript', 'public, max-age=300');
    return null;
  }
};
