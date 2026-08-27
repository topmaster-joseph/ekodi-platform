// Minimal admin entry runtime: central-auth handoff + optimistic shell + background session validation.
(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const EMAIL_KEY = 'ekodi-admin-email';
  const ROUTE_KEY = 'ekodi-admin-target-route';
  const ASSET_VERSION = '__EKODI_ADMIN_ASSET_VERSION__';
  const CENTRAL_ADMIN_AUTH_URL = 'https://auth.ekodi.kr/?site=admin&direct=1&return_to=https%3A%2F%2Fadmin.ekodi.kr%2F';
  const app = document.querySelector('#app');
  const loginScreen = document.querySelector('#loginScreen');
  const apiState = document.querySelector('#apiState');
  const profileEmail = document.querySelector('#profileEmail');
  const profileName = document.querySelector('#profileName');
  const scopeBadge = document.querySelector('#scopeBadge');
  const sidebar = document.querySelector('.sidebar');
  const loginForm = document.querySelector('#loginForm');
  const legacyLink = document.querySelector('.login-screen .legacy-link');
  let loginLink = document.querySelector('#centralAdminLogin');
  const logoutButton = document.querySelector('#logoutButton');
  const menuButton = document.querySelector('#menuButton');
  const ROUTES = new Set(['operations','campus','ai-ops','ai-module-spec','ai-membership','health','storage','security','devices','work','marketing-ai','deployments','finance','organization','workspace','architecture','policies','clients','admins','community','books','social','affiliates']);
  const ALIASES = Object.freeze({ storige:'storage', overview:'operations', aiops:'ai-ops', release:'deployments', legacy:'ai-ops', domains:'ai-ops', activity:'ai-ops' });

  const safeSession = {
    get(key) { try { return sessionStorage.getItem(key) || ''; } catch { return ''; } },
    set(key, value) { try { sessionStorage.setItem(key, value); } catch {} },
    remove(key) { try { sessionStorage.removeItem(key); } catch {} },
  };

  function mark(name) { try { performance.mark(name); } catch {} }
  function token() { return safeSession.get(TOKEN_KEY); }
  function normalizeRoute(value) {
    const raw = String(value || '').replace(/^#/, '').trim().toLowerCase();
    if (!raw || raw.includes('=') || raw.includes('&')) return '';
    const route = ALIASES[raw] || raw;
    return ROUTES.has(route) ? route : '';
  }
  function routeFromLocation() {
    const queryRoute = normalizeRoute(new URLSearchParams(location.search).get('route'));
    if (queryRoute) return queryRoute;
    const hashRoute = normalizeRoute(location.hash);
    if (hashRoute) return hashRoute;
    return location.pathname.startsWith('/legacy') ? 'ai-ops' : '';
  }
  function rememberRoute(value) {
    const route = normalizeRoute(value);
    if (route) safeSession.set(ROUTE_KEY, route);
    return route;
  }
  function cleanRouteUrl(value) {
    const route = normalizeRoute(value);
    const url = new URL(location.href);
    if (url.pathname.startsWith('/legacy')) url.pathname = '/';
    url.searchParams.delete('route');
    url.hash = route ? `#${route}` : '';
    return `${url.pathname}${url.search}${url.hash}`;
  }
  function centralAdminAuthUrl(value) {
    const route = normalizeRoute(value);
    if (!route) return CENTRAL_ADMIN_AUTH_URL;
    const target = new URL('https://admin.ekodi.kr/');
    target.searchParams.set('route', route);
    const auth = new URL('https://auth.ekodi.kr/');
    auth.searchParams.set('site', 'admin');
    auth.searchParams.set('direct', '1');
    auth.searchParams.set('return_to', target.href);
    return auth.href;
  }
  function normalizeEntryRoute() {
    const route = rememberRoute(routeFromLocation());
    if (!route) return '';
    const queryRoute = new URLSearchParams(location.search).has('route');
    if (queryRoute || location.pathname.startsWith('/legacy') || location.hash !== `#${route}`) history.replaceState({}, document.title, cleanRouteUrl(route));
    return route;
  }
  function syncCentralLoginLink() {
    if (loginLink?.tagName !== 'A') return;
    loginLink.href = centralAdminAuthUrl(routeFromLocation() || safeSession.get(ROUTE_KEY));
  }
  function authHeaders() {
    const value = token();
    return value ? { authorization: `Bearer ${value}` } : {};
  }
  function hostScope() {
    const host = location.hostname.toLowerCase();
    if (host.startsWith('admin.biz.')) return 'BIZ';
    if (host.startsWith('admin.church.')) return 'CHURCH';
    if (host.startsWith('admin.lab.')) return 'LAB';
    if (host.startsWith('admin.trade.')) return 'TRADE';
    return 'ALL';
  }
  function applyScope() {
    const scope = hostScope();
    if (scopeBadge) scopeBadge.textContent = scope;
    document.body.dataset.scope = scope.toLowerCase();
  }
  function ensureCentralLoginFallback() {
    if (!loginScreen) return;
    if (!document.querySelector('#centralAdminLogin')) {
      const link=document.createElement('a');
      link.id='centralAdminLogin';
      link.className='primary-login';
      link.href=CENTRAL_ADMIN_AUTH_URL;
      link.textContent='Google 통합인증으로 계속';
      const form=document.querySelector('#loginForm');
      if (form) form.hidden=true;
      loginScreen.append(link);
      loginLink=link;
    }
  }
  function setProfile(email) {
    const safeEmail = String(email || '').trim();
    if (profileEmail) profileEmail.textContent = safeEmail;
    if (profileName) profileName.textContent = safeEmail ? safeEmail.split('@')[0] : '관리자';
    if (safeEmail) safeSession.set(EMAIL_KEY, safeEmail);
  }
  function showApp(email, state = '인증 세션 확인 중') {
    if (!app || !token()) return;
    const becameVisible = app.hidden;
    if (loginScreen) loginScreen.hidden = true;
    app.hidden = false;
    setProfile(email || safeSession.get(EMAIL_KEY));
    applyScope();
    if (apiState) apiState.textContent = state;
    if (!becameVisible) return;
    mark('ekodi-admin-app-visible');
    window.dispatchEvent(new CustomEvent('ekodi-authenticated', { detail: { optimistic: state.includes('확인 중') } }));
  }
  function updateSessionState(email, state) {
    setProfile(email || safeSession.get(EMAIL_KEY));
    if (apiState) apiState.textContent = state;
  }
  function showLogin(message = '') {
    if (app) app.hidden = true;
    if (loginScreen) loginScreen.hidden = false;
    if (apiState) apiState.textContent = message || '통합인증 필요';
    safeSession.remove(TOKEN_KEY);
    safeSession.remove(EMAIL_KEY);
    ensureCentralLoginFallback();
    syncCentralLoginLink();
  }
  function acceptCentralHandoff() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const value = hash.get('ekodi_admin_token');
    if (!value) return false;
    const route = rememberRoute(new URLSearchParams(location.search).get('route') || hash.get('ekodi_admin_route'));
    try { sessionStorage.setItem('ekodi-auth-token', value); }
    catch { safeSession.set(TOKEN_KEY, value); }
    history.replaceState({}, document.title, cleanRouteUrl(route));
    mark('ekodi-admin-token-handoff');
    return true;
  }
  function assetUrl(path) {
    return `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(ASSET_VERSION)}`;
  }
  function loadRouteContinuity() {
    if (!token() || !safeSession.get(ROUTE_KEY) || document.querySelector('script[data-ekodi-route-continuity]')) return;
    const script = document.createElement('script');
    script.src = assetUrl('admin-route-continuity.js');
    script.dataset.ekodiRouteContinuity = 'true';
    document.body.appendChild(script);
  }
  function loadPerfDiagnostics() {
    if (!new URLSearchParams(location.search).has('perf')) return;
    const script = document.createElement('script');
    script.src = assetUrl('admin-perf-diagnostics.js');
    script.dataset.ekodiPerfDiagnostics = 'true';
    document.body.appendChild(script);
  }
  async function validateSession() {
    const value = token();
    if (!value) return showLogin();
    showApp(safeSession.get(EMAIL_KEY), '인증 세션 확인 중');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${API}/api/session`, { headers: { authorization: `Bearer ${value}` }, cache: 'no-store', signal: controller.signal });
      if (response.status === 401 || response.status === 403) return showLogin('세션 만료 · 다시 로그인');
      if (!response.ok) throw new Error(`session ${response.status}`);
      const result = await response.json();
      updateSessionState(result.email || safeSession.get(EMAIL_KEY), '인증 세션 정상');
      mark('ekodi-admin-session-validated');
      window.dispatchEvent(new CustomEvent('ekodi-session-validated', { detail: result }));
    } catch (error) {
      if (token()) {
        updateSessionState(safeSession.get(EMAIL_KEY), error?.name === 'AbortError' ? '세션 확인 지연' : '네트워크 확인 필요');
        document.documentElement.dataset.ekodiSessionDegraded = 'true';
      } else showLogin('통합인증 필요');
    } finally { clearTimeout(timeout); }
  }
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const value = token();
    if (value && !headers.has('authorization')) headers.set('authorization', `Bearer ${value}`);
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: options.cache || 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `API 요청 실패 (${response.status})`);
    return data;
  }

  mark('ekodi-admin-entry-start');
  if (!acceptCentralHandoff()) normalizeEntryRoute();
  ensureCentralLoginFallback();
  if (loginLink?.tagName === 'A') loginLink.href = CENTRAL_ADMIN_AUTH_URL;
  syncCentralLoginLink();
  if (loginForm) loginForm.hidden = true;
  if (legacyLink) legacyLink.hidden = true;
  if (loginLink) loginLink.style.pointerEvents = 'auto';

  menuButton?.addEventListener('click', () => sidebar?.classList.toggle('open'));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') sidebar?.classList.remove('open'); });
  logoutButton?.addEventListener('click', () => {
    const value = token();
    showLogin('로그아웃 완료');
    if (value) fetch(`${API}/api/logout`, { method: 'POST', headers: { authorization: `Bearer ${value}` }, keepalive: true }).catch(() => {});
  });
  window.addEventListener('hashchange', () => {
    normalizeEntryRoute();
    syncCentralLoginLink();
    if (document.documentElement.dataset.ekodiAdminReady === 'true') loadRouteContinuity();
  });
  window.addEventListener('ekodi-admin-ready', loadRouteContinuity);

  window.EKODIAdminCore = Object.freeze({ token, authHeaders, request, showApp, showLogin, route: () => normalizeRoute(safeSession.get(ROUTE_KEY) || routeFromLocation()) });
  loadPerfDiagnostics();
  validateSession();
})();
