(() => {
  const API = 'https://mall-api.ekodi.kr';
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
  let session = null;

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
  function render(items = []) {
    list.replaceChildren();
    if (!items.length) {
      const card = node('article', 'studio-preview-block');
      card.append(node('small', '', 'EMPTY'), node('h3', '', '아직 Fulfillment 원장이 없습니다.'), node('p', '', '결제 완료 주문이 계약 공급자에게 배정되면 여기에 이행 상태가 표시됩니다.'));
      list.append(card); return;
    }
    for (const item of items) {
      const card = node('article', 'studio-preview-block');
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
    const result = await api('/api/fulfillment/orders');
    const items = result.fulfillments || [];
    const gates = result.gates || {};
    if (gatePii) gatePii.textContent = gates.buyerPiiReleaseEnabled ? 'ON' : 'OFF';
    if (gateForward) gateForward.textContent = gates.supplierForwardEnabled ? 'ON' : 'OFF';
    if (count) count.textContent = `Fulfillment ${items.length}건 · PII/발주 게이트 ${gates.buyerPiiReleaseEnabled || gates.supplierForwardEnabled ? '부분 활성' : 'OFF'}`;
    render(items);
    setStatus(`연결됨 · 주문 이행 ${items.length}건 · 구매자 개인정보 원문 미노출`);
  }
  function syncSessionUi() {
    const signed = Boolean(session);
    if (member) member.textContent = signed ? `${session.user.email || 'Google 회원'} · Seller` : '로그인 필요';
    if (login) login.hidden = signed;
    if (logout) logout.hidden = !signed;
    if (reload) reload.disabled = !signed;
  }
  login?.addEventListener('click', () => { location.href = 'https://auth.ekodi.kr/?site=mall-seller&returnTo=https%3A%2F%2Fmall.ekodi.kr%2Ffulfillment'; });
  logout?.addEventListener('click', async () => { await sb.auth.signOut(); session = null; syncSessionUi(); render([]); setStatus('로그아웃했습니다.'); });
  reload?.addEventListener('click', () => load().catch((error) => setStatus(error.message, true)));

  exchangeCentralToken().catch((error) => setStatus(`인증 연결 실패: ${error.message}`, true)).finally(async () => {
    session = (await sb.auth.getSession()).data.session;
    syncSessionUi();
    if (session) load().catch((error) => setStatus(error.message, true));
  });
  sb.auth.onAuthStateChange((_event, next) => { session = next; syncSessionUi(); if (session) load().catch(() => {}); });
})();
