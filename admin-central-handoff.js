// Minimal admin entry runtime: central-auth handoff + optimistic shell + background session validation.
(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const EMAIL_KEY = 'ekodi-admin-email';
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

  function mark(name) { try { performance.mark(name); } catch {} }
  function token() { return safeSession.get(TOKEN_KEY); }
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
      link.href='https://auth.ekodi.kr/?site=admin&return_to=https%3A%2F%2Fadmin.ekodi.kr%2F';
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
    if (loginScreen) loginScreen.hidden = true;
    app.hidden = false;
    setProfile(email || safeSession.get(EMAIL_KEY));
    applyScope();
    if (apiState) apiState.textContent = state;
    mark('ekodi-admin-app-visible');
    window.dispatchEvent(new CustomEvent('ekodi-authenticated', { detail: { optimistic: state.includes('확인 중') } }));
  }
  function showLogin(message = '') {
    if (app) app.hidden = true;
    if (loginScreen) loginScreen.hidden = false;
    if (apiState) apiState.textContent = message || '통합인증 필요';
    safeSession.remove(TOKEN_KEY);
    safeSession.remove(EMAIL_KEY);
    ensureCentralLoginFallback();
  }
  function acceptCentralHandoff() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const value = hash.get('ekodi_admin_token');
    if (!value) return false;
    try { sessionStorage.setItem('ekodi-auth-token', value); }
    catch { safeSession.set(TOKEN_KEY, value); }
    history.replaceState({}, document.title, location.pathname + location.search);
    mark('ekodi-admin-token-handoff');
    return true;
  }
  async function validateSession() {
    const value = token();
    if (!value) return showLogin();

    // The shell contains no privileged data. Reveal it immediately while the server validates
    // the token, so a slow network never blocks first interaction. Every data API still checks
    // the bearer token server-side.
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
      showApp(result.email || safeSession.get(EMAIL_KEY), '인증 세션 정상');
      mark('ekodi-admin-session-validated');
      window.dispatchEvent(new CustomEvent('ekodi-session-validated', { detail: result }));
    } catch (error) {
      if (token()) {
        showApp(safeSession.get(EMAIL_KEY), error?.name === 'AbortError' ? '세션 확인 지연' : '네트워크 확인 필요');
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
  function installPerfDiagnostics() {
    if (!new URLSearchParams(location.search).has('perf')) return;
    const state = window.__EKODI_PERF__ = { longTasks: [], resources: [], navigation: null };
    try {
      state.navigation = performance.getEntriesByType('navigation')[0]?.toJSON?.() || null;
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'longtask') state.longTasks.push({ start: entry.startTime, duration: entry.duration });
          if (entry.entryType === 'resource') state.resources.push({ name: entry.name, start: entry.startTime, duration: entry.duration, transferSize: entry.transferSize || 0 });
        }
      });
      const types = [];
      if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) types.push('longtask');
      if (PerformanceObserver.supportedEntryTypes?.includes('resource')) types.push('resource');
      if (types.length) observer.observe({ entryTypes: types });
      window.addEventListener('ekodi-admin-ready', () => queueMicrotask(() => console.info('[EKODI perf]', state)), { once: true });
    } catch {}
  }

  mark('ekodi-admin-entry-start');
  acceptCentralHandoff();
  ensureCentralLoginFallback();
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

  window.EKODIAdminCore = Object.freeze({ token, authHeaders, request, showApp, showLogin });
  installPerfDiagnostics();
  validateSession();
})();
