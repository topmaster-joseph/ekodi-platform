// EKODI-MALL-ORDER-OPS-001: 주문 · 발주 관리 화면.
(() => {
  const API = '/ekodimall/api';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  if (!window.supabase) return;
  const sb = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const $ = (s) => document.querySelector(s);
  const ui = { status: $('#opsStatus'), login: $('#opsLogin'), logout: $('#opsLogout'), reload: $('#opsReload'), filter: $('#opsFilter'), summary: $('#opsSummary'), supplier: $('#opsSupplier'), list: $('#opsList') };
  const won = (v) => `${new Intl.NumberFormat('ko-KR').format(Number(v) || 0)}원`;
  const when = (v) => (v ? new Date(v).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const ORDER = { paid: ['결제완료', ''], payment_pending: ['결제대기', 'wait'], cancelled: ['결제취소', 'mute'], refunded: ['환불완료', 'mute'], partially_refunded: ['부분환불', 'mute'] };
  const SUPPLY = { placing: ['발주중', 'wait'], placed: ['발주완료', ''], shipping: ['배송중', ''], delivered: ['배송완료', ''], cancel_requested: ['구매취소 요청', 'bad'], cancelled: ['공급처 취소', 'bad'], failed: ['발주실패', 'bad'], unknown: ['응답불명·확인필요', 'bad'] };
  let session = null;
  const setStatus = (m, bad = false) => { ui.status.textContent = m; ui.status.dataset.state = bad ? 'error' : 'ok'; };
  async function api(path, options = {}) {
    const token = (await sb.auth.getSession()).data.session?.access_token;
    if (!token) throw new Error('운영자 Google 로그인이 필요합니다.');
    const headers = new Headers(options.headers || {}); headers.set('authorization', `Bearer ${token}`);
    const res = await fetch(`${API}${path}`, { ...options, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `API ${res.status}`);
    return body;
  }
  async function exchangeCentralToken() { const p = new URLSearchParams(location.hash.slice(1)); const t = p.get('ekodi_token'); if (!t) return; const { error } = await sb.auth.verifyOtp({ token_hash: t, type: p.get('ekodi_type') || 'email' }); if (error) throw error; history.replaceState(null, '', location.pathname + location.search); }
  function login() { const a = new URL('https://ekodi.kr/auth/'); a.searchParams.set('site', 'mall-seller'); a.searchParams.set('return_to', location.href.split('#')[0]); location.assign(a.href); }
  function sync() { const on = Boolean(session); ui.login.hidden = on; ui.logout.hidden = !on; ui.reload.disabled = !on; ui.filter.disabled = !on; }
  function badge(map, key) { const [t, c] = map[key] || [key || '-', 'mute']; return el('span', `oo-badge ${c}`.trim(), t); }
  function render(data) {
    const s = data.summary || {};
    ui.summary.replaceChildren(...[['결제완료', s.paid], ['발주 대기', s.awaitingSupply], ['발주완료', s.placed], ['배송중', s.shipping], ['발주 문제', s.issues]].map(([k, v]) => {
      const a = el('article', k === '발주 문제' && v ? 'alert' : ''); a.append(el('small', '', k), el('strong', '', String(v || 0))); return a; }));
    const sup = data.supplier || {};
    ui.supplier.textContent = `도매꾹 자동로그인 ${sup.domeggookLogin === 'ok' ? '정상' : '확인필요'} · 이머니 잔액 ${sup.emoney == null ? '확인필요' : won(sup.emoney)}${sup.checkedAt ? ` (${when(sup.checkedAt)} 확인)` : ''}`;
    const orders = data.orders || [];
    if (!orders.length) { ui.list.replaceChildren(el('p', 'empty', '해당하는 주문이 없습니다.')); return; }
    ui.list.replaceChildren(...orders.map((o) => {
      const card = el('article', 'oo-card');
      const top = el('div', 'oo-row'); const title = el('h3', '', o.product?.name || '상품');
      top.append(title, el('strong', '', won(o.amount)));
      const meta = el('div', 'oo-meta'); meta.append(badge(ORDER, o.status), document.createTextNode(`${when(o.paidAt || o.createdAt)} · 수량 ${o.quantity} · 주문 ${o.id}${o.buyer ? ` · ${o.buyer.name} (${o.buyer.region})` : ''}`));
      card.append(top, meta);
      if (o.product?.supplier) {
        const box = el('div', 'oo-supply');
        if (o.supply) {
          box.append(badge(SUPPLY, o.supply.status), document.createTextNode(`도매꾹 #${o.product.supplierItemNo}${o.supply.orderNo ? ` · 도매꾹 주문 ${o.supply.orderNo}` : ''}${o.supply.supplierStatus ? ` · ${o.supply.supplierStatus}` : ''}${o.supply.trackingCode ? ` · ${o.supply.trackingCompany} ${o.supply.trackingCode}` : ''}${o.supply.expectedCost ? ` · 공급비 ${won(o.supply.expectedCost)}` : ''}`));
          if (o.supply.error && ['failed', 'unknown', 'cancel_requested', 'cancelled'].includes(o.supply.status)) box.append(el('div', 'oo-err', o.supply.error));
        } else box.append(el('span', 'oo-badge wait', o.status === 'paid' ? '자동발주 대기(10분 이내)' : '발주 없음'), document.createTextNode(`도매꾹 #${o.product.supplierItemNo}`));
        card.append(box);
      }
      const btns = el('div', 'oo-btns');
      if (o.buyer) { const b = el('button', 'smallbtn', '받는 분 보기'); b.type = 'button'; b.addEventListener('click', async () => { try { const r = await api(`/api/internal/operations/orders/${encodeURIComponent(o.id)}/buyer`); const x = r.buyer; const info = el('div', 'oo-buyer', `${x.name} · ${x.phone}${x.email ? ` · ${x.email}` : ''}\n(${x.postcode}) ${x.address1} ${x.address2 || ''}${x.memo ? `\n배송메모: ${x.memo}` : ''}`); b.replaceWith(info); } catch (e) { setStatus(e.message, true); } }); btns.append(b); }
      if (o.supply?.status === 'failed') { const r = el('button', 'smallbtn', '발주 다시 시도'); r.type = 'button'; r.addEventListener('click', async () => { try { const res = await api(`/api/internal/operations/orders/${encodeURIComponent(o.id)}/retry-supply`, { method: 'POST' }); setStatus(res.message); r.disabled = true; } catch (e) { setStatus(e.message, true); } }); btns.append(r); }
      if (o.product?.shareCode) { const a = el('a', 'smallbtn', '상품 보기'); a.href = `/ekodimall/p/${o.product.shareCode}`; a.target = '_blank'; a.rel = 'noopener'; btns.append(a); }
      card.append(btns);
      return card;
    }));
  }
  async function load() {
    try { setStatus('주문을 불러오는 중입니다...'); const q = ui.filter.value ? `?status=${encodeURIComponent(ui.filter.value)}` : ''; const data = await api(`/api/internal/operations/orders${q}`); render(data); setStatus(`불러왔습니다 · ${data.actor || ''}`); }
    catch (e) { setStatus(e.message, true); }
  }
  ui.login.addEventListener('click', login);
  ui.logout.addEventListener('click', async () => { await sb.auth.signOut(); session = null; sync(); ui.list.replaceChildren(el('p', 'empty', '로그아웃했습니다.')); });
  ui.reload.addEventListener('click', load);
  ui.filter.addEventListener('change', load);
  (async () => { try { await exchangeCentralToken(); } catch (e) { setStatus(e.message, true); } session = (await sb.auth.getSession()).data.session; sync(); if (session) load(); })();
  sb.auth.onAuthStateChange((_e, s) => { session = s; sync(); });
})();
