/* EKODI Mall account chrome. Identity is verified by canonical auth, never by a stored label. */
(() => {
  'use strict';
  const key = 'sb-renzehysxirjilvdxacv-auth-token';
  const authOrigin = 'https://renzehysxirjilvdxacv.supabase.co';
  const publishable = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const hosts = [...document.querySelectorAll('[data-mall-account]')];
  if (!hosts.length) return;
  let generation = 0;
  let signingOut = false;
  const read = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || 'null');
      const session = raw?.currentSession || raw?.session || raw;
      return { raw, session, token: session?.access_token || '' };
    } catch { return { raw: null, session: null, token: '' }; }
  };
  const loginHref = () => {
    const auth = new URL('/auth/', 'https://ekodi.kr');
    auth.searchParams.set('site', 'mall');
    const current = new URL(window.location.href);
    const safeReturn = current.origin === 'https://ekodi.kr' &&
      current.pathname.startsWith('/ekodimall')
      ? current.href : 'https://ekodi.kr/ekodimall/';
    auth.searchParams.set('return_to', safeReturn);
    return auth.href;
  };
  function showGuest() {
    for (const host of hosts) {
      host.querySelector('[data-mall-login]').hidden = false;
      host.querySelector('[data-mall-signed]').hidden = true;
      host.querySelector('[data-mall-id]').textContent = '';
    }
  }
  function userLabel(user) {
    const email = String(user?.email || '').trim();
    const linked = /^identity\+([a-z0-9_-]+)\.[^@]+@ekodi\.kr$/i.exec(email);
    if (linked) {
      const name = { kakao:'카카오', naver:'네이버', google:'구글', apple:'Apple', daum:'다음' }[linked[1].toLowerCase()];
      return (name || '연결') + ' 계정';
    }
    return email || String(user?.user_metadata?.user_name || user?.user_metadata?.preferred_username || '로그인 회원');
  }
  function showMember(user) {
    const id = userLabel(user);
    for (const host of hosts) {
      host.querySelector('[data-mall-id]').textContent = id;
      host.querySelector('[data-mall-id]').title = id;
      host.querySelector('[data-mall-login]').hidden = true;
      host.querySelector('[data-mall-signed]').hidden = false;
    }
  }
  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try { return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' }); }
    finally { clearTimeout(timeout); }
  }
  async function currentToken() {
    const stored = read();
    if (!stored.token) return '';
    const expiry = Number(stored.session?.expires_at || 0);
    if (!expiry || expiry > Date.now() / 1000 + 45 || !stored.session?.refresh_token) return stored.token;
    try {
      const response = await request(authOrigin + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { apikey: publishable, 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: stored.session.refresh_token })
      });
      if (!response.ok) return '';
      const result = await response.json();
      if (!result?.access_token) return '';
      const newer = read();
      // Another tab may have signed in/out while the old session was refreshing.
      if (newer.token !== stored.token) return newer.token;
      const updated = { ...stored.session, ...result,
        expires_at: Number(result.expires_at || 0) ||
          Math.floor(Date.now() / 1000) + Number(result.expires_in || 3600) };
      const merged = stored.raw?.currentSession
        ? { ...stored.raw, currentSession: updated }
        : stored.raw?.session ? { ...stored.raw, session: updated }
        : { ...stored.raw, ...updated };
      localStorage.setItem(key, JSON.stringify(merged));
      return updated.access_token;
    } catch { return ''; }
  }
  async function verify() {
    const version = ++generation;
    if (signingOut) return;
    let token = '';
    try { token = await currentToken(); } catch {}
    if (!token) { if (version === generation) showGuest(); return; }
    try {
      const response = await request(authOrigin + '/auth/v1/user', {
        headers: { apikey: publishable, authorization: 'Bearer ' + token, accept: 'application/json' }
      });
      if (!response.ok) throw new Error('session_unverified');
      const user = await response.json();
      if (version === generation && user?.id && read().token === token) showMember(user);
      else if (version === generation) showGuest();
    } catch {
      if (version === generation) showGuest();
    }
  }
  async function signOut() {
    if (signingOut) return;
    signingOut = true;
    ++generation;
    const previous = read();
    for (const host of hosts) {
      const button = host.querySelector('[data-mall-logout]');
      button.disabled = true;
      button.textContent = '로그아웃 중';
    }
    try {
      if (previous.token) await request(authOrigin + '/auth/v1/logout?scope=local', {
        method: 'POST', headers: { apikey: publishable, authorization: 'Bearer ' + previous.token }
      });
    } catch { /* Even when offline, the local session must be removed. */ }
    try {
      if (read().token === previous.token) {
        localStorage.removeItem(key);
        localStorage.removeItem('ekodi-books-buyer-session');
      }
    } catch {}
    showGuest();
    window.location.reload(); // Same URL, no arbitrary account-home redirect.
  }
  for (const host of hosts) {
    host.querySelector('[data-mall-login]').href = loginHref();
    host.querySelector('[data-mall-logout]').addEventListener('click', signOut);
  }
  window.addEventListener('pageshow', () => void verify());
  window.addEventListener('focus', () => void verify());
  window.addEventListener('storage', event => { if (event.key === key) void verify(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void verify();
  });
  void verify();
})();
