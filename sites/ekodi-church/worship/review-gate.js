// EKODI Church worship review gate.
// Every dated worship page is merged and deployed as soon as it is prepared,
// but it is shown to the public only after a worship manager confirms the
// final review (church_worship_materials.is_published = true). Managers see
// the page with a review bar and can publish it from here or from My Page.
// Note: this is a presentation gate on a static site; it never handles
// stream keys or private member data.
(() => {
  'use strict';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const API = SUPABASE_URL + '/rest/v1/church_worship_materials';
  const PERMISSION = SUPABASE_URL + '/functions/v1/church-pastor-api?scope=worship-access';
  const ACCESS_RPC = SUPABASE_URL + '/rest/v1/rpc/current_site_access';
  const script = document.currentScript;
  const match = location.pathname.match(/\/worship\/(\d{4}-\d{2}-\d{2})\//);
  const date = (script && script.dataset.date) || (match && match[1]) || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const root = document.documentElement;
  const view = new URLSearchParams(location.search).get('view') || 'bulletin';
  const style = document.createElement('style');
  style.textContent = 'html.ekodi-review-pending body{visibility:hidden}'
    + '.ekodi-review-bar{position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center;padding:10px 14px;background:#7a4b00;color:#fff;font:600 14px/1.5 "Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif}'
    + '.ekodi-review-bar button,.ekodi-review-bar a{border:0;border-radius:9px;padding:8px 13px;font:inherit;font-weight:800;cursor:pointer;text-decoration:none}'
    + '.ekodi-review-bar button{background:#fff;color:#5a3700}.ekodi-review-bar a{background:#ffffff26;color:#fff}'
    + '.ekodi-review-bar[data-state=done]{background:#183c33}'
    + '.ekodi-review-hold{max-width:640px;margin:12vh auto;padding:28px;text-align:center;font-family:"Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;color:#183c33}'
    + '.ekodi-review-hold h1{font-size:26px;margin:0 0 12px}.ekodi-review-hold p{line-height:1.7;color:#4c6158}'
    + '.ekodi-review-hold a{display:inline-block;margin:6px;padding:11px 16px;border-radius:10px;border:1px solid #c9d6cd;color:#183c33;text-decoration:none;font-weight:700}';
  document.head.appendChild(style);
  root.classList.add('ekodi-review-pending');

  const reveal = () => root.classList.remove('ekodi-review-pending');
  const headers = token => ({ apikey: PUBLISHABLE_KEY, authorization: 'Bearer ' + (token || PUBLISHABLE_KEY), accept: 'application/json' });
  const timeout = ms => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

  function token() {
    const now = Math.floor(Date.now() / 1000) + 15;
    try {
      const pastor = JSON.parse(sessionStorage.getItem('ekodi-church-pastor-session') || 'null');
      if (pastor && pastor.accessToken && Number(pastor.expiresAt) > now) return pastor.accessToken;
    } catch { /* blocked storage */ }
    try {
      const shared = sessionStorage.getItem('ekodi-auth-token');
      if (shared) return shared;
    } catch { /* blocked storage */ }
    try {
      {
        const stored = JSON.parse(localStorage.getItem('sb-renzehysxirjilvdxacv-auth-token') || 'null');
        const session = stored && (stored.currentSession || stored.session || stored);
        if (session && session.access_token && Number(session.expires_at || 0) > now) return session.access_token;
      }
    } catch { /* blocked storage */ }
    return '';
  }

  async function published() {
    const url = API + '?select=service_date&service_type=eq.sunday&service_date=eq.' + date + '&is_published=eq.true&limit=1';
    const response = await fetch(url, { headers: headers(), cache: 'no-store', signal: timeout(8000) });
    if (!response.ok) throw new Error('status_' + response.status);
    const rows = await response.json();
    return Array.isArray(rows) && rows.length > 0;
  }

  async function canReview(key) {
    if (!key) return false;
    try {
      const response = await fetch(PERMISSION, { headers: headers(key), cache: 'no-store', signal: timeout(8000) });
      const body = response.ok ? await response.json().catch(() => null) : null;
      if (body && body.permissions && body.permissions.worship === true) return true;
    } catch { /* fall through to site role */ }
    try {
      const response = await fetch(ACCESS_RPC, { method: 'POST', headers: { ...headers(key), 'content-type': 'application/json' }, body: JSON.stringify({ p_site_key: 'church' }), cache: 'no-store', signal: timeout(8000) });
      const access = response.ok ? await response.json().catch(() => null) : null;
      return !!access && access.status === 'active' && access.role === 'tenant_admin';
    } catch { return false; }
  }

  async function publish(key) {
    const stamp = new Date().toISOString();
    const filter = '?service_type=eq.sunday&service_date=eq.' + date;
    const patched = await fetch(API + filter, { method: 'PATCH', headers: { ...headers(key), 'content-type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ is_published: true, updated_at: stamp }), cache: 'no-store' });
    if (!patched.ok) throw new Error('공개 처리가 거부되었습니다 (' + patched.status + ').');
    const rows = await patched.json().catch(() => []);
    if (Array.isArray(rows) && rows.length) return;
    const packet = await fetch(new URL('materials.json', location.href.replace(/(sermon|prayer)\/.*$/, '')), { cache: 'no-store' }).then(r => r.json());
    const row = { service_type: 'sunday', service_date: date, service_name: '에코디 주일모임', service_time: packet.time || '11:00', scripture: packet.scripture || '', title: packet.title || '', preacher: packet.preacher || '', is_published: true, updated_at: stamp };
    const created = await fetch(API + '?on_conflict=service_type,service_date', { method: 'POST', headers: { ...headers(key), 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row), cache: 'no-store' });
    if (!created.ok) throw new Error('공개 처리가 거부되었습니다 (' + created.status + ').');
  }

  function reviewBar(key) {
    if (view === 'stage' || view === 'vertical') return;
    const bar = document.createElement('div');
    bar.className = 'ekodi-review-bar';
    bar.setAttribute('role', 'status');
    const label = document.createElement('span');
    label.textContent = date + ' 예배자료 · 검토 모드 (아직 일반 공개 전)';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '최종 검토 완료 · 공개하기';
    const back = document.createElement('a');
    back.href = '/ekodichurch/mypage/';
    back.textContent = '마이페이지';
    button.addEventListener('click', async () => {
      if (!window.confirm(date + ' 예배자료(주보·PPT·말씀나눔)를 최종 검토했고 일반에 공개합니다.')) return;
      button.disabled = true;
      label.textContent = '공개 처리 중…';
      try {
        await publish(key);
        bar.dataset.state = 'done';
        label.textContent = date + ' 예배자료가 공개되었습니다.';
        button.remove();
      } catch (error) {
        button.disabled = false;
        label.textContent = error.message || '공개 처리에 실패했습니다.';
      }
    });
    bar.append(label, button, back);
    document.body.prepend(bar);
  }

  async function latestPublished() {
    const response = await fetch('/ekodichurch/worship/weekly.json', { cache: 'no-store', signal: timeout(8000) });
    if (!response.ok) return null;
    const list = ((await response.json()).services || []).filter(v => v.date < date).sort((a, b) => b.date.localeCompare(a.date));
    for (const item of list) {
      const url = API + '?select=service_date&service_type=eq.sunday&service_date=eq.' + item.date + '&is_published=eq.true&limit=1';
      const rows = await fetch(url, { headers: headers(), cache: 'no-store', signal: timeout(8000) }).then(r => r.ok ? r.json() : []);
      if (Array.isArray(rows) && rows.length) return item;
    }
    return null;
  }

  function hold() {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);
    const main = document.createElement('main');
    main.className = 'ekodi-review-hold';
    main.innerHTML = '<h1>예배자료를 준비하고 있습니다</h1>'
      + '<p>' + date + ' 주일모임 주보·PPT·말씀나눔은 최종 검토 후 이 주소에서 공개됩니다.</p>'
      + '<p><a href="/ekodichurch/">에코디교회 홈</a><a href="/ekodichurch/mypage/">운영자 로그인 후 검토</a></p>';
    document.body.replaceChildren(main);
  }

  async function run() {
    let isPublic;
    try { isPublic = await published(); } catch { reveal(); return; }  // fail open: never hide Sunday materials on an outage
    if (isPublic) { reveal(); return; }
    const key = token();
    if (await canReview(key)) { reviewBar(key); reveal(); return; }
    try {
      const latest = await latestPublished();
      if (latest && latest.page) {
        const rest = location.pathname.split('/worship/' + date + '/')[1] || '';
        location.replace(latest.page + rest + location.search + location.hash);
        return;
      }
    } catch { /* fall back to the notice */ }
    hold();
    reveal();
  }

  const start = () => { run().catch(reveal); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
