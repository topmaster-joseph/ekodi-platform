// BOOKS-DIRECT-COMMERCE-001 — shared client: EKODI Google sign-in session + commerce API.
(() => {
  'use strict';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  // 공용 게이트웨이(ekodi.kr/books)는 슬래시로 시작하는 문자열 앞에 /books를 덧붙인다. 그래서 경로는 항상 변수로 시작하는 템플릿으로 만든다.
  const IDENTITY = `${SUPABASE_URL}/functions/v1/identity-api`;
  const OWN_KEY = 'ekodi-books-buyer-session';
  const CENTRAL_KEY = 'sb-renzehysxirjilvdxacv-auth-token';
  const BASE = location.pathname === '/books' || location.pathname.startsWith('/books/') ? '/books' : '';
  const read = (store, key) => { try { return JSON.parse(store.getItem(key) || 'null'); } catch { return null; } };
  const normalize = (d, c = {}) => ({ accessToken: d.access_token || d.accessToken || '', refreshToken: d.refresh_token || d.refreshToken || c.refreshToken || '', expiresAt: Number(d.expires_at || d.expiresAt || 0) || Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600) });
  const save = v => { try { localStorage.setItem(OWN_KEY, JSON.stringify(v)); } catch {} };
  const forget = () => { try { localStorage.removeItem(OWN_KEY); } catch {} };
  function stored() {
    const own = read(localStorage, OWN_KEY);
    if (own?.accessToken) return own;
    const central = read(localStorage, CENTRAL_KEY);
    const s = central?.currentSession || central?.session || central;
    return s?.access_token ? normalize(s) : null;
  }
  async function bounded(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    catch (e) { throw new Error(e?.name === 'AbortError' ? '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' : '서버 연결에 실패했습니다. 네트워크를 확인해 주세요.'); }
    finally { clearTimeout(timer); }
  }
  async function post(url, body) {
    const r = await bounded(url, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error_description || d.msg || d.error || '인증에 실패했습니다.'); e.code = d.error || ''; throw e; }
    return d;
  }
  async function session() {
    let v = stored();
    if (!v?.accessToken) return null;
    if (!v.expiresAt || v.expiresAt > Math.floor(Date.now() / 1000) + 60) return v;
    if (!v.refreshToken) { forget(); return null; }
    try { v = normalize(await post(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { refresh_token: v.refreshToken }), v); save(v); return v; }
    catch { forget(); return null; }
  }
  async function api(path, { method = 'GET', body } = {}) {
    const s = await session();
    const headers = { accept: 'application/json' };
    if (s?.accessToken) headers.authorization = 'Bearer ' + s.accessToken;
    if (body) headers['content-type'] = 'application/json';
    const rel = String(path || '').replace(/^\/+/, '');
    const r = await bounded(`${BASE}/api/commerce/${rel}`, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && s) forget();
    if (!r.ok) { const e = new Error(d.error || '요청을 처리하지 못했습니다.'); e.status = r.status; e.code = d.code || ''; throw e; }
    return d;
  }
  function waitForGoogle() {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      (function poll() {
        if (window.google?.accounts?.id) return resolve();
        if (Date.now() - started > 10000) return reject(new Error('google_library_failed'));
        setTimeout(poll, 100);
      })();
    });
  }
  async function mountGoogle(host, onStatus, onSignedIn) {
    onStatus('구글 로그인을 준비하고 있습니다.');
    try {
      const [challenge] = await Promise.all([post(`${IDENTITY}/challenge`), waitForGoogle()]);
      window.google.accounts.id.initialize({ client_id: challenge.clientId, nonce: challenge.nonce, auto_select: false, use_fedcm_for_prompt: true, callback: async response => {
        if (!response?.credential) { onStatus('구글 인증이 완료되지 않았습니다. 다시 시도해 주세요.', true); return; }
        onStatus('구글 계정을 확인하고 있습니다.');
        try {
          const proof = await post(`${IDENTITY}/google/exchange`, { credential: response.credential, nonce: challenge.nonce });
          const verified = await post(`${SUPABASE_URL}/auth/v1/verify`, { token_hash: proof.tokenHash, type: 'email' });
          const s = normalize(verified);
          if (!s.accessToken) throw new Error('session_not_created');
          save(s); onStatus(''); onSignedIn();
        } catch (e) {
          onStatus(e.code === 'identity_conflict' ? '이 구글 계정은 다른 EKODI 사용자에 연결되어 있습니다.' : '구글 로그인에 실패했습니다. 다시 시도해 주세요.', true);
          mountGoogle(host, onStatus, onSignedIn);
        }
      } });
      host.replaceChildren();
      window.google.accounts.id.renderButton(host, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: Math.min(340, Math.max(220, host.clientWidth || 300)) });
      onStatus('');
    } catch { onStatus('구글 로그인을 준비하지 못했습니다. 새로고침 후 다시 시도해 주세요.', true); }
  }
  // 게이트웨이가 HTML·JSON 속 경로에 이미 /books를 붙여 줄 때가 있으므로, 아직 없을 때만 붙인다.
  const under = p => { const v = String(p || ''); if (!BASE || !/^\/(?!\/)/.test(v) || v === BASE || v.startsWith(`${BASE}/`) || v.startsWith(`${BASE}#`)) return v; return `${BASE}${v}`; };
  const won = n => Number.isFinite(Number(n)) ? new Intl.NumberFormat('ko-KR').format(Number(n)) + '원' : '-';
  function cover(book, alt) {
    if (book?.coverImage) { const img = document.createElement('img'); img.src = under(book.coverImage); img.alt = alt || `${book.title} 표지`; img.decoding = 'async'; return img; }
    const div = document.createElement('div'); div.className = 'cover-fallback'; div.textContent = book?.title || ''; return div;
  }
  window.EkodiBooksCommerce = { BASE, under, api, session, forget, mountGoogle, won, cover };
})();
