(() => {
  const API = '/ekodimall/api';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  if (!window.supabase) return;
  const sb = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const status = document.querySelector('#fulfillmentStatus');
  const member = document.querySelector('#fulfillmentMember');
  const count = document.querySelector('#fulfillmentCount');
  const list = document.querySelector('#fulfillmentList');
  const login = document.querySelector('#fulfillmentLogin');
  const logout = document.querySelector('#fulfillmentLogout');
  const reload = document.querySelector('#reloadFulfillment');
  const gatePii = document.querySelector('#gatePii');
  const gateForward = document.querySelector('#gateForward');
  const total = document.querySelector('#fulfillmentTotal');
  let session = null;
  let sessionVersion = 0;

  const money = (value) => `${new Intl.NumberFormat('ko-KR').format(Number(value) || 0)}원`;
  const label = (value) => ({
    awaiting_pii: '배송정보 승인 대기', ready_to_forward: '발주 준비', forwarded: '공급자 전달', accepted: '공급자 접수',
    shipped: '배송중', delivered: '배송완료', cancel_requested: '취소 요청', cancelled: '취소', return_requested: '반품 요청',
    returned: '반품 입고', refund_pending: '환불 확인 대기', closed: '종료', failed: '확인 필요'
  }[value] || value || '확인 전');
  function setStatus(message, error = false) { if (status) { status.textContent = message; status.dataset.state = error ? 'error' : 'ok'; } }
  function node(tag, className = '', value = '') { const el = document.createElement(tag); if (className) el.className = className; if (value) el.textContent = value; return el; }
  async function token() { return (await sb.auth.getSession()).data.session?.access_token || ''; }
  async function api(path) {
    const access = await token();
    if (!access) throw new Error('Google 판매자 로그인이 필요합니다.');
    const response = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${access}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Mall API ${response.status}`);
    return body;
  }
  async function exchangeCentralToken() {
    const params = new URLSearchParams(location.hash.slice(1));
    const central = params.get('ekodi_token');
    if (!central) return;
    const type = params.get('ekodi_type') || 'email';
    const { error } = await sb.auth.verifyOtp({ token_hash: central, type });
    if (error) throw error;
    history.replaceState(null, '', location.pathname + location.search);
  }
  function render(items = [], signed = Boolean(session)) {
    list.replaceChildren();
    if (!items.length) {
      const card = node('article', 'fulfillment-empty');
      card.append(node('small', '', 'EMPTY'), node('h3', '', signed ? '아직 주문 이행 내역이 없습니다.' : '로그인 후 조회'), node('p', '', signed ? '결제 완료 주문이 계약 공급자에게 배정되면 이곳에 표시됩니다.' : '판매자 로그인 후 이행 현황을 확인할 수 있습니다.'));
      list.append(card); return;
    }
    for (const item of items) {
      const card = node('article', 'fulfillment-order');
      card.append(node('small', '', label(item.status).toUpperCase()), node('h3', '', item.productName || item.orderId));
      card.append(node('p', '', `주문 ${item.orderId} · 공급처 ${item.sourceLabel || item.sourceId}`));
      card.append(node('p', '', `공급원가 ${money(item.supplierCostAmount)} + 배송 ${money(item.supplierShippingAmount)} = ${money(item.supplierPayableAmount)}`));
      card.append(node('p', '', `PII Release ${item.piiReleaseStatus} · 발주 방식 ${item.executionMode}`));
      if (item.providerOrderRef) card.append(node('p', '', `공급자 주문참조 ${item.providerOrderRef}`));
      list.append(card);
    }
  }
  async function load() {
    if (!session) return;
    const version = sessionVersion, identity = session.user?.id;
    const result = await api('/api/fulfillment/orders');
    if (!session || version !== sessionVersion || session.user?.id !== identity) return;
    const items = Array.isArray(result.fulfillments) ? result.fulfillments : [];
    const gates = result.gates || {};
    if (gatePii) { gatePii.textContent = gates.buyerPiiReleaseEnabled ? 'ON' : 'OFF'; gatePii.dataset.state = gates.buyerPiiReleaseEnabled ? 'on' : 'off'; }
    if (gateForward) { gateForward.textContent = gates.supplierForwardEnabled ? 'ON' : 'OFF'; gateForward.dataset.state = gates.supplierForwardEnabled ? 'on' : 'off'; }
    if (total) total.textContent = String(items.length);
    if (count) count.textContent = `주문 이행 ${items.length}건 · 개인정보/발주 ${gates.buyerPiiReleaseEnabled || gates.supplierForwardEnabled ? '일부 승인' : 'OFF'}`;
    render(items, true);
    setStatus(`연결됨 · 주문 이행 ${items.length}건 · 구매자 개인정보 원문 미노출`);
  }
  function syncSessionUi() {
    const signed = Boolean(session);
    if (member) member.textContent = signed ? `${session.user.email || 'Google 회원'} · 판매자` : '로그인 필요';
    if (login) login.hidden = signed;
    if (logout) logout.hidden = !signed;
    if (reload) reload.disabled = !signed;
    if (!signed) {
      if (total) total.textContent = '—';
      if (count) count.textContent = '이행 원장을 불러오지 않았습니다.';
      if (gatePii) { gatePii.textContent = 'OFF'; gatePii.dataset.state = 'off'; }
      if (gateForward) { gateForward.textContent = 'OFF'; gateForward.dataset.state = 'off'; }
      render([], false);
    }
  }
  const tabs = [...document.querySelectorAll('[data-fulfillment-tab]')];
  const panels = [...document.querySelectorAll('[data-fulfillment-panel]')];
  const allowed = new Set(tabs.map(tab => tab.dataset.fulfillmentTab));
  function openTab(value, writeUrl = false) {
    const selected = allowed.has(value) ? value : 'orders';
    for (const tab of tabs) {
      const active = tab.dataset.fulfillmentTab === selected;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.fulfillmentPanel !== selected;
    if (writeUrl) {
      const url = new URL(location.href);
      if (selected === 'orders') url.searchParams.delete('tab'); else url.searchParams.set('tab', selected);
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => openTab(tab.dataset.fulfillmentTab, true));
    tab.addEventListener('keydown', event => {
      let next = -1;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next < 0) return;
      event.preventDefault(); openTab(tabs[next].dataset.fulfillmentTab, true); tabs[next].focus();
    });
  });
  openTab(new URLSearchParams(location.search).get('tab'));
  window.addEventListener('popstate', () => openTab(new URLSearchParams(location.search).get('tab')));
  login?.addEventListener('click', () => { location.href = 'https://ekodi.kr/auth/?site=mall-seller&return_to=' + encodeURIComponent(location.href.split('#')[0]); });
  logout?.addEventListener('click', async () => { sessionVersion++; session = null; syncSessionUi(); try { await sb.auth.signOut(); setStatus('로그아웃했습니다.'); } catch (error) { setStatus(`로그아웃 확인 실패: ${error.message}`, true); session = (await sb.auth.getSession()).data.session; sessionVersion++; syncSessionUi(); } });
  reload?.addEventListener('click', () => load().catch((error) => setStatus(error.message, true)));

  exchangeCentralToken().catch((error) => setStatus(`인증 연결 실패: ${error.message}`, true)).finally(async () => {
    session = (await sb.auth.getSession()).data.session;
    sessionVersion++; syncSessionUi();
    if (session) load().catch((error) => setStatus(error.message, true));
  });
  sb.auth.onAuthStateChange((_event, next) => { if (session?.access_token === next?.access_token) return; session = next; sessionVersion++; syncSessionUi(); if (session) load().catch(error => setStatus(error.message, true)); });
})();
