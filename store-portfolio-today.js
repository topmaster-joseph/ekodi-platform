// CMPMYI "오늘의 3매장" — one screen for 자담치킨·피자마루·요거트퍼플 (design option A on PC,
// option B "할 일" list on phones). Read-mostly: it aggregates each store's own APIs with the
// signed-in owner's session; every store call is still authorized per store by the server.
// The only write is approving a weekly promo post, which goes through /v1/store-promo (owner approval).
import { CMPMYI_NAME_PRELUDE } from './store-portfolio-admin-page.js';

export const TODAY_STORES = Object.freeze([
  { slug:'jadam', short:'자담치킨', name:'자담치킨 목포대점', color:'#b4321f', soft:'#fbece9' },
  { slug:'pizzamaru', short:'피자마루', name:'피자마루 목포대점', color:'#a85a00', soft:'#fdf1e2' },
  { slug:'yogurt', short:'요거트퍼플', name:'요거트퍼플 목포대점', color:'#6b3fa0', soft:'#f2ecfa' },
]);

const SUPABASE_ORIGIN = 'https://renzehysxirjilvdxacv.supabase.co';

const STYLE = `:root{font-family:Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#14231b;background:#f4f6f3;word-break:keep-all;
--line:#dde3dd;--sub:#4a5a51;--brand:#1f5c3d;--brand2:#e8f2ec;--warn:#9a3412;--warnBg:#fff3e8}
*{box-sizing:border-box}body{margin:0;padding:12px 14px 24px;background:#f4f6f3}
button{font:inherit;cursor:pointer}a.btn{cursor:pointer}
.top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.top h1{margin:0;font-size:20px;letter-spacing:-.03em}.top .date{color:var(--sub);font-size:13px}
.chips{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:#fff;border-radius:99px;padding:7px 12px;font-size:13px;font-weight:700;color:#14231b;display:flex;align-items:center;gap:6px}
.chip[aria-pressed="true"]{background:#14231b;color:#fff;border-color:#14231b}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:13px;padding:12px 14px}
.kpi span{color:var(--sub);font-size:12px}.kpi b{display:block;font-size:22px;letter-spacing:-.03em;margin-top:3px}
.kpi.hot b{color:#b4321f}
.split{display:flex;gap:4px;margin-top:8px;height:5px;border-radius:4px;overflow:hidden;background:#eef2ee}
.alert{display:flex;align-items:center;gap:10px;background:var(--warnBg);border:1px solid #f3c9a8;color:var(--warn);border-radius:11px;padding:10px 12px;margin-bottom:12px;font-size:13px;font-weight:700}
.alert[hidden]{display:none}
.cols{display:grid;grid-template-columns:1.5fr 1fr;gap:12px}
.panel{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}
.panel h2{font-size:15px;margin:0 0 8px;display:flex;align-items:center;gap:8px}
.item{display:grid;grid-template-columns:84px 1fr auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.item:first-of-type{border-top:0}
.tag{font-size:11px;font-weight:800;border-radius:6px;padding:4px 6px;text-align:center}
.what{font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.meta{font-size:12px;color:var(--sub);margin-top:2px}
.btn{font-family:inherit;line-height:1.2;border:0;border-radius:9px;padding:9px 12px;font-weight:800;font-size:13px;text-decoration:none;display:inline-block;white-space:nowrap}
.btn.pri{background:var(--brand);color:#fff}.btn.ghost{background:var(--brand2);color:var(--brand)}
.btn[disabled]{opacity:.55;cursor:default}
.empty{color:var(--sub);font-size:13px;padding:14px 2px}
.store{border:1px solid var(--line);border-left:5px solid;border-radius:12px;padding:11px 12px;margin-bottom:9px}
.store .row1{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px}
.store .row1 b{margin-left:auto;font-size:16px}
.store .row2{font-size:12px;color:var(--sub);margin-top:3px}
.store .row3{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.pill{font-size:11px;border-radius:99px;padding:4px 9px;background:#eef2ee;color:#2f3e35;font-weight:700;text-decoration:none}
.pill.no{background:#fdecec;color:#9b1c1c}
.login{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;text-align:center}
.login p{color:var(--sub);font-size:14px}
.sec{font-size:12px;font-weight:800;color:var(--sub);margin:4px 2px 6px}
@media (max-width:760px), (pointer:coarse) and (max-width:1024px){
  body{padding:10px 10px 90px}
  .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cols{display:block}.cols>.panel{margin-bottom:10px}
  .chips{margin-left:0;width:100%}.chip{flex:1;justify-content:center;padding:9px 6px}
  .item{grid-template-columns:1fr auto;border-left:5px solid var(--c,#ccc);padding:10px 10px;border-top:0;margin-bottom:8px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px var(--line) inset}
  .item .tag{grid-column:1/-1;justify-self:start}
  .item .btn{padding:12px 14px;font-size:14px}
  .panel.todo{background:transparent;border:0;padding:0}
}`;

export function storePortfolioTodayPage() {
  const chips = TODAY_STORES.map(s => `<button type="button" class="chip" data-today-filter="${s.slug}" aria-pressed="false"><span class="dot" style="background:${s.color}"></span>${s.short}</button>`).join('');
  const html = `<!doctype html><html lang="ko" data-ekodi-store-portfolio-panel="today" data-cmpmyi-today="v1">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>오늘의 3매장 · 통합 매장 운영</title><style>${STYLE}</style></head>
<body>
<div class="top"><h1>오늘의 3매장</h1><span class="date" id="todayDate"></span>
  <div class="chips" role="group" aria-label="매장 필터"><button type="button" class="chip" data-today-filter="all" aria-pressed="true">전체</button>${chips}</div></div>
<div id="todayRoot"><div class="empty">불러오는 중…</div></div>
<script src="/cmpmyi/admin/today.js" defer></script>
</body></html>`;
  return new Response(html, { headers:{
    'content-type':'text/html; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff',
    'x-frame-options':'SAMEORIGIN', 'referrer-policy':'strict-origin-when-cross-origin',
    'content-security-policy':`default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ${SUPABASE_ORIGIN}; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`,
    'x-ekodi-route':'cmpmyi-store-portfolio-today', 'x-ekodi-authority-scope':'platform-entry',
  } });
}

// Browser client (serialized with toString; keep it self-contained).
function todayClient(STORES) {
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const CENTRAL = 'ekodi-cmpmyi-admin-session';
  const FILTER_KEY = 'ekodi-cmpmyi-today-filter';
  const root = document.getElementById('todayRoot');
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const won = n => '₩' + Math.round(Number(n || 0)).toLocaleString('ko-KR');
  const kstDay = d => new Date(new Date(d).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const today = kstDay(Date.now());
  const ago = d => { const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000)); return m < 1 ? '방금' : m < 60 ? m + '분 전' : Math.floor(m / 60) + '시간 전'; };
  const storeOf = slug => STORES.find(s => s.slug === slug) || STORES[0];
  const consoleHref = (slug, tab) => '/' + slug + '/admin/mobile?embed=cmpmyi' + (tab ? '&tab=' + tab : '');
  let filter = 'all'; try { const f = localStorage.getItem(FILTER_KEY); if (f && (f === 'all' || STORES.some(s => s.slug === f))) filter = f; } catch {}
  let data = null;

  const dateEl = $('#todayDate');
  if (dateEl) dateEl.textContent = new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', month:'long', day:'numeric', weekday:'short' }).format(new Date());

  function readSession() {
    const keys = [CENTRAL, ...STORES.map(s => 'ekodi-store-admin-session:' + s.slug)];
    for (const k of keys) { try { const v = JSON.parse(localStorage.getItem(k) || sessionStorage.getItem(k) || 'null'); if (v && v.accessToken) return v; } catch {} }
    return null;
  }
  async function token() {
    const s = readSession(); if (!s) return '';
    const now = Math.floor(Date.now() / 1000);
    if (Number(s.expiresAt || 0) > now + 60) return s.accessToken;
    if (!s.refreshToken) return '';
    try {
      const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', { method:'POST', headers:{ apikey:SUPABASE_KEY, 'content-type':'application/json' }, body:JSON.stringify({ refresh_token:s.refreshToken }) });
      const d = await r.json(); if (!r.ok || !d.access_token) return '';
      const next = { ...s, accessToken:d.access_token, refreshToken:d.refresh_token || s.refreshToken, expiresAt:Number(d.expires_at || 0) || now + Number(d.expires_in || 3600) };
      try { localStorage.setItem(CENTRAL, JSON.stringify(next)); } catch {}
      return next.accessToken;
    } catch { return ''; }
  }
  async function api(slug, path, options = {}) {
    const t = await token(); if (!t) throw Object.assign(new Error('AUTH'), { status:401 });
    const u = new URL('/workspace-api' + path, location.origin);
    u.searchParams.set('subject_type', 'tenant'); u.searchParams.set('subject_key', slug);
    const r = await fetch(u.href, { ...options, cache:'no-store', headers:{ authorization:'Bearer ' + t, 'content-type':'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || ('HTTP_' + r.status)), { status:r.status });
    return d;
  }
  async function loadStore(store) {
    const [orders, pays, promo] = await Promise.allSettled([api(store.slug, '/v1/store-sms/orders'), api(store.slug, '/v1/store-terminal/payments'), api(store.slug, '/v1/store-promo/week')]);
    const auth = [orders, pays, promo].some(x => x.status === 'rejected' && x.reason?.status === 401);
    const all = orders.status === 'fulfilled' ? (orders.value.orders || []) : [];
    const todayOrders = all.filter(o => kstDay(o.created_at) === today && !['cancelled', 'rejected'].includes(o.status));
    const posts = promo.status === 'fulfilled' ? (promo.value.posts || []) : [];
    return {
      store, auth,
      ok:{ orders:orders.status === 'fulfilled', pays:pays.status === 'fulfilled', promo:promo.status === 'fulfilled' },
      fresh:all.filter(o => o.status === 'customer_confirmed'),
      waiting:all.filter(o => o.status === 'awaiting_customer_confirmation'),
      active:all.filter(o => o.status === 'store_accepted'),
      todayCount:todayOrders.length,
      paid:pays.status === 'fulfilled' ? Number(pays.value.summary?.total || 0) : 0,
      payPending:pays.status === 'fulfilled' ? Number(pays.value.summary?.pending || 0) : 0,
      promoPending:posts.filter(p => (p.variants || []).some(v => v.status === 'pending_review')),
    };
  }
  async function load() {
    if (!readSession()) return renderLogin();
    data = await Promise.all(STORES.map(loadStore));
    if (data.every(d => d.auth)) return renderLogin();
    render();
  }
  function renderLogin() {
    root.innerHTML = `<div class="login"><p>세 매장을 한 번에 보려면 EKODI 통합관리자 로그인이 필요합니다.</p><a class="btn pri" href="${consoleHref('jadam')}">로그인하기</a></div>`;
  }
  function firstLine(text) { return String(text || '').split(/\n/).map(x => x.trim()).filter(Boolean)[0] || '주문 내용 확인'; }
  function itemRow(store, what, meta, action) {
    return `<div class="item" style="--c:${store.color}"><span class="tag" style="background:${store.soft};color:${store.color}">${esc(store.short)}</span><div><div class="what">${esc(what)}</div><div class="meta">${esc(meta)}</div></div>${action}</div>`;
  }
  function render() {
    const view = data.filter(d => filter === 'all' || d.store.slug === filter);
    const sum = k => view.reduce((s, d) => s + (typeof k === 'function' ? k(d) : d[k]), 0);
    const paidTotal = sum('paid');
    const freshN = sum(d => d.fresh.length), promoN = sum(d => d.promoPending.length);
    const split = data.map(d => `<i style="flex:${Math.max(d.paid, 0) || 0.0001};background:${d.store.color}"></i>`).join('');
    const broken = view.filter(d => !d.ok.orders && !d.auth).map(d => d.store.short);
    const todo = [];
    for (const d of view) for (const o of d.fresh) todo.push({ t:o.created_at, html:itemRow(d.store, firstLine(o.raw_order_text), '새 주문 · 접수 필요 · ' + ago(o.created_at) + (o.customer_display ? ' · ' + o.customer_display : ''), `<a class="btn pri" href="${consoleHref(d.store.slug, 'new')}">접수</a>`) });
    for (const d of view) if (d.payPending) todo.push({ t:'', html:itemRow(d.store, '단말기 결제 대기 ' + d.payPending + '건', '결제 화면에서 승인번호를 확인하세요', `<a class="btn pri" href="${consoleHref(d.store.slug, 'pay')}">결제</a>`) });
    for (const d of view) for (const p of d.promoPending) todo.push({ t:'', html:itemRow(d.store, p.title || '이번 주 홍보글', '홍보 승인 대기' + (p.scheduledAt ? ' · ' + new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', weekday:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(p.scheduledAt)) + ' 게시 예정' : ''), `<button class="btn ghost" type="button" data-approve="${p.id}" data-store="${d.store.slug}">승인</button>`) });
    for (const d of view) for (const o of d.active) todo.push({ t:o.created_at, html:itemRow(d.store, firstLine(o.raw_order_text), '진행 중 · ' + ago(o.created_at), `<a class="btn ghost" href="${consoleHref(d.store.slug, 'active')}">보기</a>`) });
    const stores = view.map(d => `<div class="store" style="border-left-color:${d.store.color}">
      <div class="row1"><span class="dot" style="background:${d.store.color}"></span>${esc(d.store.short)}<b>${won(d.paid)}</b></div>
      <div class="row2">오늘 주문 ${d.todayCount}건 · 새 주문 ${d.fresh.length} · 진행 ${d.active.length} · 고객확인 대기 ${d.waiting.length}</div>
      <div class="row3">${d.ok.orders ? '' : '<span class="pill no">주문 확인 필요</span>'}<a class="pill" href="${consoleHref(d.store.slug)}">모바일 주문</a><a class="pill" href="/${d.store.slug}/admin/pos?embed=cmpmyi">POS 화면</a><a class="pill" href="/${d.store.slug}/admin/connections?embed=cmpmyi">연결관리</a></div></div>`).join('');
    root.innerHTML = `
      <section class="kpis" aria-label="오늘 요약">
        <div class="kpi"><span>오늘 결제 (단말기 기록)</span><b>${won(paidTotal)}</b><div class="split">${split}</div></div>
        <div class="kpi"><span>오늘 주문</span><b>${sum('todayCount')}건</b></div>
        <div class="kpi${freshN ? ' hot' : ''}"><span>새 주문 · 접수 필요</span><b>${freshN}건</b></div>
        <div class="kpi"><span>홍보 승인 대기</span><b>${promoN}건</b></div>
      </section>
      <div class="alert" role="status"${broken.length ? '' : ' hidden'}>${esc(broken.join(' · '))} 주문 데이터를 불러오지 못했습니다. 잠시 후 자동으로 다시 확인합니다.</div>
      <div class="cols">
        <section class="panel todo" aria-label="지금 할 일"><h2>지금 할 일 <span class="meta">${todo.length}건</span></h2>${todo.length ? todo.map(x => x.html).join('') : '<div class="empty">지금 처리할 일이 없습니다. 새 주문이 들어오면 여기에 바로 표시됩니다.</div>'}</section>
        <section class="panel" aria-label="매장별 상태"><h2>매장별 상태</h2>${stores}<p class="meta">매출은 휴대용 단말기 결제 기록 기준입니다. 배달앱 매출은 각 매장의 매출 메뉴에서 확인합니다.</p></section>
      </div>`;
  }
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-approve]'); if (!b) return;
    b.disabled = true; b.textContent = '승인 중…';
    try { await api(b.dataset.store, '/v1/store-promo/posts/' + encodeURIComponent(b.dataset.approve) + '/approve', { method:'POST', body:'{}' }); await load(); }
    catch (err) { b.disabled = false; b.textContent = '다시 시도'; }
  });
  document.querySelectorAll('[data-today-filter]').forEach(chip => {
    chip.setAttribute('aria-pressed', String(chip.dataset.todayFilter === filter));
    chip.addEventListener('click', () => {
      filter = chip.dataset.todayFilter; try { localStorage.setItem(FILTER_KEY, filter); } catch {}
      document.querySelectorAll('[data-today-filter]').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
      if (data) render();
    });
  });
  load().catch(() => { root.innerHTML = '<div class="empty">불러오지 못했습니다. 잠시 후 다시 시도합니다.</div>'; });
  setInterval(() => { if (document.visibilityState === 'visible') load().catch(() => {}); }, 30000);
}

export function storePortfolioTodayScript() {
  const stores = JSON.stringify(TODAY_STORES);
  return new Response(`${CMPMYI_NAME_PRELUDE}(${todayClient.toString()})(${stores});})();`, { headers:{
    'content-type':'text/javascript; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff',
  } });
}
