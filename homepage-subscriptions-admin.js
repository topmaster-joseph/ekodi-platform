// ADMIN-HOMEPAGE-SUBSCRIPTIONS-001: 최고관리자 전용 '홈페이지 구독 신청' 패널.
// 신청 목록(homepage_subscription_admin_list)과 자동 개설된 hp- 사이트의 공개·비공개 전환
// (homepage_subscription_publish)을 한 화면에서 처리한다. 권한은 DB에서 다시 확인한다
// (public.is_platform_admin() = profiles.platform_admin). 관리자 로그인 때 저장된 같은 출처의
// Supabase 세션을 사용하며, 세션이 없으면 통합 로그인 링크를 보여준다.
const SECTION = 'homepage-subscriptions';
const MODULE_ID = 'ekodiHomepageSubscriptions';
const TOKEN_KEY = 'ekodi-auth-token';
const SESSION_URL = 'https://ekodi.kr/api/session';
const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const SB_STORAGE_KEY = 'sb-renzehysxirjilvdxacv-auth-token';

export const HOMEPAGE_SUBSCRIPTIONS_ADMIN_SECTION = SECTION;

export const AUDIENCE_LABELS = Object.freeze({ personal: '개인', business: '매장·기업', institution: '기관·학교', community: '단체', organization: '조직', event: '행사·프로젝트' });
export const STATUS_LABELS = Object.freeze({ received: '상담 접수', provisioned: '개설됨·비공개', published: '공개 중', cancelled: '취소' });

export function summarizeHomepageRequests(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    total: list.length,
    consult: list.filter((r) => r.mode === 'consult').length,
    waiting: list.filter((r) => r.site_slug && !r.published).length,
    published: list.filter((r) => r.published).length,
  };
}

if (typeof document !== 'undefined' && !document.getElementById(MODULE_ID)) {
  const content = document.querySelector('.content');
  const nav = document.querySelector('.sidebar nav');
  const root = document.documentElement;
  root.dataset.ekodiHpsubAuthorized = 'pending';

  const style = document.createElement('style');
  style.id = 'ekodi-hpsub-style';
  style.textContent = `
html:not([data-ekodi-hpsub-authorized="true"]) .sidebar [data-section="homepage-subscriptions"]{display:none!important}
.ekodi-hpsub{display:grid;gap:14px;padding-bottom:88px}
.ekodi-hpsub-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.ekodi-hpsub-head h2{margin:2px 0 4px;font-size:23px}.ekodi-hpsub-head p{margin:0}
.ekodi-hpsub-kicker{font-size:11px;font-weight:850;letter-spacing:.08em;color:var(--ekodi-ui-accent,#155eef)}
.ekodi-hpsub-actions{display:flex;gap:8px;flex-wrap:wrap}.ekodi-hpsub-actions a,.ekodi-hpsub-actions button{min-height:38px;padding:7px 12px;border-radius:9px;font-size:13px;font-weight:650;display:inline-flex;align-items:center;text-decoration:none;cursor:pointer;border:1px solid var(--admin-border,#d9e2ec);background:var(--ekodi-ui-surface,#fff);color:inherit}
.ekodi-hpsub-summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px}
.ekodi-hpsub-card{border:1px solid var(--admin-border,#d9e2ec);border-radius:13px;background:var(--ekodi-ui-surface,#fff);padding:12px 14px;display:grid;gap:4px}.ekodi-hpsub-card small{font-size:11px;font-weight:800;color:var(--admin-secondary,#66768a)}.ekodi-hpsub-card strong{font-size:26px;line-height:1.1}.ekodi-hpsub-card.warn strong{color:#b4690e}
.ekodi-hpsub-filters{display:flex;gap:6px;flex-wrap:wrap}.ekodi-hpsub-filters button{min-height:34px;padding:5px 12px;border-radius:999px;border:1px solid var(--admin-border,#d9e2ec);background:var(--ekodi-ui-surface,#fff);font-size:13px;font-weight:650;cursor:pointer;color:inherit}.ekodi-hpsub-filters button[aria-pressed="true"]{background:var(--ekodi-ui-accent,#155eef);border-color:var(--ekodi-ui-accent,#155eef);color:#fff}
.ekodi-hpsub-list{display:grid;gap:10px}
.ekodi-hpsub-row{border:1px solid var(--admin-border,#d9e2ec);border-left:3px solid var(--admin-border,#d9e2ec);border-radius:12px;background:var(--ekodi-ui-surface,#fff);padding:12px 14px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}
.ekodi-hpsub-row.st-waiting{border-left-color:#e0a93b}.ekodi-hpsub-row.st-published{border-left-color:#1f9d6b}
.ekodi-hpsub-name{font-size:16px;font-weight:750;word-break:break-all}.ekodi-hpsub-meta{display:flex;flex-wrap:wrap;gap:5px 10px;margin-top:5px;font-size:12px;color:var(--admin-secondary,#66768a)}
.ekodi-hpsub-tag{display:inline-flex;padding:2px 8px;border-radius:999px;border:1px solid var(--admin-border,#d9e2ec);background:var(--ekodi-ui-surface-raised,#f8fafc)}
.ekodi-hpsub-side{display:flex;flex-direction:column;gap:6px;align-items:flex-end}.ekodi-hpsub-side a{font-size:13px}
.ekodi-hpsub-side button{min-height:36px;padding:6px 14px;border-radius:9px;font-size:13px;font-weight:750;cursor:pointer;border:1px solid var(--ekodi-ui-accent,#155eef);background:var(--ekodi-ui-accent,#155eef);color:#fff}
.ekodi-hpsub-side button.secondary{background:transparent;color:var(--ekodi-ui-accent,#155eef)}
.ekodi-hpsub-empty,.ekodi-hpsub-error{border:1px dashed var(--admin-border,#d9e2ec);border-radius:12px;padding:16px;font-size:14px}.ekodi-hpsub-error{border-color:#d9695a;color:#a3302a}
@media(max-width:760px){.ekodi-hpsub-summary{grid-template-columns:1fr 1fr}.ekodi-hpsub-row{grid-template-columns:1fr}.ekodi-hpsub-side{flex-direction:row;align-items:center;justify-content:space-between}}
`;
  document.head.append(style);

  const panel = document.createElement('section');
  panel.id = MODULE_ID;
  panel.className = 'section ekodi-hpsub hidden-panel';
  panel.dataset.panel = SECTION;
  panel.hidden = true;
  panel.innerHTML = `
    <div class="ekodi-hpsub-head">
      <div>
        <p class="ekodi-hpsub-kicker">EKODIBIZ HOMEPAGE SUBSCRIPTIONS</p>
        <h2>홈페이지 구독 신청</h2>
        <p>상담·바로 구독 신청 목록입니다. 바로 구독 신청은 홈페이지 주소가 자동으로 만들어져 비공개로 기다리며, 첫 결제를 확인한 뒤 [공개]를 누르면 바로 열립니다.</p>
      </div>
      <div class="ekodi-hpsub-actions">
        <a href="https://ekodi.kr/homepage" target="_blank" rel="noopener">신청 페이지</a><a href="https://ekodi.kr/homepage/admin" target="_blank" rel="noopener">관리자 페이지</a>
        <button type="button" data-hpsub-refresh>새로고침</button>
      </div>
    </div>
    <div class="ekodi-hpsub-summary" data-hpsub-summary></div>
    <div class="ekodi-hpsub-filters" role="group" aria-label="신청 상태 필터">
      <button type="button" data-hpsub-filter="all" aria-pressed="true">전체</button>
      <button type="button" data-hpsub-filter="waiting" aria-pressed="false">공개 대기</button>
      <button type="button" data-hpsub-filter="published" aria-pressed="false">공개 중</button>
      <button type="button" data-hpsub-filter="consult" aria-pressed="false">상담 신청</button>
    </div>
    <div data-hpsub-status class="ekodi-hpsub-empty" hidden></div>
    <div class="ekodi-hpsub-list" data-hpsub-list></div>`;
  content?.append(panel);

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = (n) => (Number.isFinite(Number(n)) && n !== null ? `${Number(n).toLocaleString('ko-KR')}원` : '-');
  const when = (v) => { try { return new Date(v).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
  const statusBox = panel.querySelector('[data-hpsub-status]');
  const listBox = panel.querySelector('[data-hpsub-list]');
  const summaryBox = panel.querySelector('[data-hpsub-summary]');
  let authorized = false; let authorizationInFlight = null; let loading = null; let rows = []; let filter = 'all';

  function adminToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
  function storedSupabase() { try { const d = JSON.parse(localStorage.getItem(SB_STORAGE_KEY) || 'null'); return d?.access_token ? d : null; } catch { return null; } }
  async function supabaseToken() {
    const s = storedSupabase(); if (!s) return '';
    const now = Math.floor(Date.now() / 1000);
    if (Number(s.expires_at || 0) > now + 60) return s.access_token;
    if (!s.refresh_token) return '';
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.access_token) return '';
    try { localStorage.setItem(SB_STORAGE_KEY, JSON.stringify({ ...s, ...d, expires_at: d.expires_at || now + Number(d.expires_in || 3600) })); } catch {}
    return d.access_token;
  }
  async function rpc(name, body) {
    const token = await supabaseToken();
    if (!token) throw Object.assign(new Error('통합 로그인 세션이 없습니다.'), { code: 'AUTH' });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || `요청 실패 (${r.status})`);
    if (d && d.ok === false) throw Object.assign(new Error(d.error === 'forbidden' ? '플랫폼 관리자 권한이 필요합니다.' : (d.error || '처리 실패')), { code: d.error });
    return d;
  }
  function setStatus(html, error = false) { statusBox.hidden = !html; statusBox.className = error ? 'ekodi-hpsub-error' : 'ekodi-hpsub-empty'; statusBox.innerHTML = html || ''; }

  function render() {
    const s = summarizeHomepageRequests(rows);
    summaryBox.innerHTML = `<div class="ekodi-hpsub-card"><small>전체 신청</small><strong>${s.total}</strong></div><div class="ekodi-hpsub-card warn"><small>공개 대기</small><strong>${s.waiting}</strong></div><div class="ekodi-hpsub-card"><small>공개 중</small><strong>${s.published}</strong></div><div class="ekodi-hpsub-card"><small>상담 신청</small><strong>${s.consult}</strong></div>`;
    const shown = rows.filter((r) => filter === 'all' || (filter === 'waiting' && r.site_slug && !r.published) || (filter === 'published' && r.published) || (filter === 'consult' && r.mode === 'consult'));
    if (!shown.length) { listBox.innerHTML = ''; setStatus(rows.length ? '이 조건의 신청이 없습니다.' : '아직 접수된 신청이 없습니다.'); return; }
    setStatus('');
    listBox.innerHTML = shown.map((r) => {
      const url = r.site_slug ? `https://ekodi.kr/${encodeURIComponent(r.site_slug)}` : '';
      const st = r.published ? 'published' : (r.site_slug ? 'waiting' : 'consult');
      const action = r.site_slug ? (r.published
        ? `<button type="button" class="secondary" data-hpsub-publish="${esc(r.site_slug)}" data-hpsub-value="false">비공개로 전환</button>`
        : `<button type="button" data-hpsub-publish="${esc(r.site_slug)}" data-hpsub-value="true">공개</button>`) : '';
      return `<article class="ekodi-hpsub-row st-${st}">
        <div><div class="ekodi-hpsub-name">${esc(r.display_name)}</div>
        <div class="ekodi-hpsub-meta"><span class="ekodi-hpsub-tag">${r.mode === 'subscribe' ? '바로 구독' : '상담'}</span><span class="ekodi-hpsub-tag">${esc(STATUS_LABELS[r.status] || r.status)}</span><span>${esc(AUDIENCE_LABELS[r.audience] || r.audience)}</span><span>${esc(r.plan)} · ${r.contract === 'annual' ? '연납' : '월납'} · 월 ${won(r.monthly_estimate)}</span><span>${esc(r.email)}</span>${r.phone ? `<span>${esc(r.phone)}</span>` : ''}<span>${esc(when(r.created_at))}</span></div></div>
        <div class="ekodi-hpsub-side">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.site_slug)}</a>` : ''}${action}</div></article>`;
    }).join('');
  }

  async function loadData(force = false) {
    if (loading && !force) return loading;
    loading = (async () => {
      setStatus('신청 목록을 불러오는 중입니다.');
      try {
        const d = await rpc('homepage_subscription_admin_list', { p_limit: 200 });
        rows = Array.isArray(d.requests) ? d.requests : [];
        render();
      } catch (error) {
        listBox.innerHTML = '';
        if (error.code === 'AUTH') setStatus(`통합 로그인 세션이 필요합니다. <a href="https://ekodi.kr/auth/?return_to=${encodeURIComponent('https://ekodi.kr/admin/#homepage-subscriptions')}">에코디 통합 로그인</a> 후 다시 열어 주세요.`, true);
        else setStatus(`신청 목록을 불러오지 못했습니다. ${esc(error.message)}`, true);
      }
    })().finally(() => { loading = null; });
    return loading;
  }

  listBox.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-hpsub-publish]');
    if (!button) return;
    const slug = button.dataset.hpsubPublish; const value = button.dataset.hpsubValue === 'true';
    if (!window.confirm(value ? `${slug} 홈페이지를 공개할까요? 첫 결제를 확인한 뒤 공개해 주세요.` : `${slug} 홈페이지를 비공개로 전환할까요?`)) return;
    button.disabled = true;
    try { await rpc('homepage_subscription_publish', { p_slug: slug, p_published: value }); await loadData(true); }
    catch (error) { button.disabled = false; window.alert(`처리하지 못했습니다: ${error.message}`); }
  });
  panel.querySelector('[data-hpsub-refresh]')?.addEventListener('click', () => loadData(true));
  panel.querySelectorAll('[data-hpsub-filter]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.hpsubFilter; panel.querySelectorAll('[data-hpsub-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render();
  }));

  async function readSession() {
    const headers = new Headers(); if (adminToken()) headers.set('authorization', `Bearer ${adminToken()}`);
    const r = await fetch(SESSION_URL, { headers, cache: 'no-store' });
    if (!r.ok) throw new Error(`관리자 세션 확인 실패 (${r.status})`);
    return r.json();
  }
  function ensureNav() {
    if (!authorized || !nav) return;
    let button = nav.querySelector(`[data-section="${SECTION}"]`);
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.className = 'nav'; button.dataset.section = SECTION;
      button.append(document.createTextNode('▦ ')); const label = document.createElement('span'); label.textContent = '홈페이지 구독 신청'; button.append(label); nav.append(button);
    }
    button.hidden = false; button.removeAttribute('aria-hidden'); button.disabled = false;
    window.dispatchEvent(new CustomEvent('ekodi-nav-changed', { detail: { section: SECTION } }));
  }
  function deny() {
    authorized = false; root.dataset.ekodiHpsubAuthorized = 'false';
    nav?.querySelector(`[data-section="${SECTION}"]`)?.remove();
    panel.hidden = true; panel.classList.add('hidden-panel');
    if (location.hash.toLowerCase() === `#${SECTION}`) { history.replaceState(history.state, '', `${location.pathname}${location.search}#campus`); window.EKODIAdminPanels?.activate?.('campus'); }
  }
  function authorize() {
    if (authorizationInFlight) return authorizationInFlight;
    authorizationInFlight = (async () => {
      try {
        const session = await readSession();
        if (session?.role !== 'super_admin') return deny();
        authorized = true; root.dataset.ekodiHpsubAuthorized = 'true'; ensureNav();
        if (location.hash.toLowerCase() === `#${SECTION}` || window.EKODIAdminPanels?.current?.() === SECTION) await loadData();
      } catch (error) { console.warn('[EKODI Homepage Subscriptions] authorization check failed', error); deny(); }
    })().finally(() => { authorizationInFlight = null; });
    return authorizationInFlight;
  }
  window.addEventListener('ekodi-admin-section-changed', (event) => {
    if (event.detail?.section !== SECTION) return;
    if (!authorized) { void authorize(); return; }
    if (location.hash.toLowerCase() !== `#${SECTION}`) history.replaceState(history.state, '', `${location.pathname}${location.search}#${SECTION}`);
    void loadData();
  });
  window.addEventListener('ekodi-admin-context-changed', (event) => {
    if (!authorized) return;
    if (event.detail?.context?.type !== 'platform') { nav?.querySelector(`[data-section="${SECTION}"]`)?.remove(); if (window.EKODIAdminPanels?.current?.() === SECTION) window.EKODIAdminPanels.activate('campus'); }
    else ensureNav();
  });
  void authorize();
}
