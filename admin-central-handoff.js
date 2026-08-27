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

  const safeSession = {
    get(key) { try { return sessionStorage.getItem(key) || ''; } catch { return ''; } },
    set(key, value) { try { sessionStorage.setItem(key, value); } catch {} },
    remove(key) { try { sessionStorage.removeItem(key); } catch {} },
  };

  const ROUTE_ALIASES = new Map([
    ['storige', 'storage'],
    ['overview', 'operations'],
    ['aiops', 'ai-ops'],
    ['release', 'deployments'],
    ['legacy', 'ai-ops'],
    ['domains', 'ai-ops'],
    ['activity', 'ai-ops'],
  ]);
  const ROUTES = new Map([
    ['operations', { section:'overview' }],
    ['campus', { section:'campus', demand:'campus' }],
    ['ai-ops', { section:'aiops', demand:'aiops' }],
    ['ai-module-spec', { section:'ai-module-spec', demand:'ai-module-spec' }],
    ['ai-membership', { section:'ai-membership', demand:'aimembers' }],
    ['health', { section:'health', demand:'health' }],
    ['storage', { section:'storage', demand:'storage' }],
    ['security', { section:'security', demand:'security' }],
    ['devices', { section:'devices', demand:'devices' }],
    ['work', { section:'work', demand:'work' }],
    ['marketing-ai', { section:'marketing-ai', demand:'marketing' }],
    ['deployments', { section:'deployments', demand:'deployments' }],
    ['finance', { section:'finance' }],
    ['organization', { section:'organization' }],
    ['workspace', { section:'workspace' }],
    ['architecture', { section:'architecture' }],
    ['policies', { section:'policies' }],
    ['clients', { section:'clients' }],
    ['admins', { section:'admins' }],
    ['community', { section:'community' }],
    ['books', { section:'books' }],
    ['social', { section:'social' }],
    ['affiliates', { section:'affiliates' }],
  ]);

  function mark(name) { try { performance.mark(name); } catch {} }
  function token() { return safeSession.get(TOKEN_KEY); }
  function authHeaders() {
    const value = token();
    return value ? { authorization: `Bearer ${value}` } : {};
  }
  function normalizeRoute(value) {
    const raw = String(value || '').replace(/^#/, '').trim().toLowerCase();
    if (!raw || raw.includes('=') || raw.includes('&')) return '';
    const route = ROUTE_ALIASES.get(raw) || raw;
    return ROUTES.has(route) ? route : '';
  }
  function routeFromLocation() {
    const params = new URLSearchParams(location.search);
    const queryRoute = normalizeRoute(params.get('route'));
    if (queryRoute) return queryRoute;
    const hashRoute = normalizeRoute(location.hash);
    if (hashRoute) return hashRoute;
    if (location.pathname.startsWith('/legacy')) return 'ai-ops';
    return '';
  }
  function rememberRoute(route) {
    const normalized = normalizeRoute(route);
    if (normalized) safeSession.set(ROUTE_KEY, normalized);
    return normalized;
  }
  function cleanRouteUrl(route) {
    const normalized = normalizeRoute(route);
    const url = new URL(location.href);
    url.searchParams.delete('route');
    url.hash = normalized ? `#${normalized}` : '';
    return `${url.pathname}${url.search}${url.hash}`;
  }
  function centralAdminAuthUrl(route = '') {
    const normalized = normalizeRoute(route);
    if (!normalized) return CENTRAL_ADMIN_AUTH_URL;
    const target = new URL('https://admin.ekodi.kr/');
    target.searchParams.set('route', normalized);
    const auth = new URL('https://auth.ekodi.kr/');
    auth.searchParams.set('site', 'admin');
    auth.searchParams.set('direct', '1');
    auth.searchParams.set('return_to', target.href);
    return auth.href;
  }
  function normalizeEntryRoute() {
    const route = routeFromLocation();
    if (!route) return '';
    rememberRoute(route);
    const shouldRewrite = location.pathname.startsWith('/legacy') || location.hash !== `#${route}` || new URLSearchParams(location.search).has('route');
    if (shouldRewrite) history.replaceState({}, document.title, cleanRouteUrl(route));
    return route;
  }
  function syncCentralLoginLink() {
    const route = routeFromLocation() || safeSession.get(ROUTE_KEY);
    if (route) rememberRoute(route);
    if (loginLink?.tagName === 'A') loginLink.href = centralAdminAuthUrl(route);
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
    const query = new URLSearchParams(location.search);
    const route = normalizeRoute(query.get('route')) || normalizeRoute(hash.get('ekodi_admin_route'));
    if (route) rememberRoute(route);
    try { sessionStorage.setItem('ekodi-auth-token', value); }
    catch { safeSession.set(TOKEN_KEY, value); }
    history.replaceState({}, document.title, cleanRouteUrl(route));
    mark('ekodi-admin-token-handoff');
    return true;
  }
  function repairAdminChrome() {
    const heroActions = document.querySelectorAll('.hero[data-panel~="overview"] .hero-actions a');
    if (heroActions[1]) {
      heroActions[1].setAttribute('href', '#ai-ops');
      heroActions[1].removeAttribute('target');
      heroActions[1].removeAttribute('rel');
      heroActions[1].dataset.adminRouteMigrated = 'ai-ops';
    }
    document.querySelectorAll('a[href="/legacy"],a[href="/legacy/"],a[href="/legacy#domains"],a[href="/legacy#activity"]').forEach(link => {
      link.setAttribute('href', '#ai-ops');
      link.dataset.adminRouteMigrated = 'ai-ops';
    });
    const profile = document.querySelector('.profile.side-profile');
    if (profile) {
      profile.style.setProperty('display', 'flex', 'important');
      profile.style.setProperty('grid-template-columns', 'none', 'important');
      profile.style.setProperty('align-items', 'center', 'important');
      profile.style.setProperty('gap', '8px', 'important');
      profile.style.setProperty('min-width', '0', 'important');
      profile.style.setProperty('width', '100%', 'important');
      const identity = profile.querySelector('div');
      if (identity) identity.style.setProperty('min-width', '0', 'important');
      if (profileEmail) {
        profileEmail.style.setProperty('display', 'block', 'important');
        profileEmail.style.setProperty('max-width', '145px', 'important');
        profileEmail.style.setProperty('overflow', 'hidden', 'important');
        profileEmail.style.setProperty('text-overflow', 'ellipsis', 'important');
        profileEmail.style.setProperty('white-space', 'nowrap', 'important');
        profileEmail.style.setProperty('word-break', 'normal', 'important');
      }
    }
  }
  let restoreTimer = 0;
  let restoreAttempts = 0;
  function restorePendingAdminRoute() {
    repairAdminChrome();
    const route = normalizeRoute(safeSession.get(ROUTE_KEY));
    if (!route || !token()) return;
    const config = ROUTES.get(route);
    if (!config) return safeSession.remove(ROUTE_KEY);
    if (location.hash !== `#${route}`) history.replaceState({}, document.title, cleanRouteUrl(route));

    let handled = false;
    if (config.demand && window.EKODIAdminDemand?.activate) {
      window.EKODIAdminDemand.activate(config.demand);
      handled = true;
    } else if (window.EKODIAdminPanels?.activate) {
      window.EKODIAdminPanels.activate(config.section);
      handled = true;
    } else {
      const target = document.querySelector(`.sidebar [data-section="${config.section}"],.sidebar [data-lazy-section="${config.section}"]`);
      if (target) {
        target.click();
        handled = true;
      }
    }

    if (handled) {
      safeSession.remove(ROUTE_KEY);
      restoreAttempts = 0;
      return;
    }
    if (restoreAttempts++ < 10) {
      clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(restorePendingAdminRoute, 180);
    }
  }
  function loadPerfDiagnostics() {
    if (!new URLSearchParams(location.search).has('perf')) return;
    const script = document.createElement('script');
    script.src = `admin-perf-diagnostics.js?v=${encodeURIComponent(ASSET_VERSION)}`;
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
      const response = await fetch(`${API}/api/session`, {
        headers: { authorization: `Bearer ${value}` },
        cache: 'no-store',
        signal: controller.signal,
      });
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
    } finally {
      clearTimeout(timeout);
    }
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
  const acceptedHandoff = acceptCentralHandoff();
  if (!acceptedHandoff) normalizeEntryRoute();
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
    const route = normalizeEntryRoute();
    syncCentralLoginLink();
    if (route && token()) restorePendingAdminRoute();
  });
  window.addEventListener('ekodi-admin-ready', restorePendingAdminRoute);
  window.addEventListener('ekodi-nav-changed', repairAdminChrome);
  window.addEventListener('ekodi-feature-installed', () => {
    repairAdminChrome();
    if (safeSession.get(ROUTE_KEY)) restorePendingAdminRoute();
  });

  window.EKODIAdminCore = Object.freeze({ token, authHeaders, request, showApp, showLogin, route: () => normalizeRoute(safeSession.get(ROUTE_KEY) || routeFromLocation()) });
  loadPerfDiagnostics();
  validateSession();
})();
