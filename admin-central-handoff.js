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

    // Reveal only the static shell immediately. Privileged APIs still validate the bearer
    // token server-side, while a slow session endpoint never blocks first interaction.
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
  function installPerfDiagnostics() {
    if (!new URLSearchParams(location.search).has('perf')) return;
    const state = window.__EKODI_PERF__ = {
      longTasks: [], resources: [], paints: [], layoutShifts: [], events: [], navigation: null,
      snapshot() {
        const resources = this.resources;
        return {
          navigation: this.navigation,
          longTasks: [...this.longTasks],
          paints: [...this.paints],
          layoutShifts: [...this.layoutShifts],
          events: [...this.events],
          resourceCount: resources.length,
          transferBytes: resources.reduce((sum, item) => sum + Number(item.transferSize || 0), 0),
          resourceDurationMs: resources.reduce((sum, item) => sum + Number(item.duration || 0), 0),
          marks: performance.getEntriesByType('mark').map(entry => ({ name:entry.name, start:entry.startTime })),
        };
      },
    };
    try {
      state.navigation = performance.getEntriesByType('navigation')[0]?.toJSON?.() || null;
      for (const entry of performance.getEntriesByType('paint')) state.paints.push({ name:entry.name, start:entry.startTime });
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'longtask') state.longTasks.push({ start: entry.startTime, duration: entry.duration });
          if (entry.entryType === 'resource') state.resources.push({ name: entry.name, start: entry.startTime, duration: entry.duration, transferSize: entry.transferSize || 0 });
          if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) state.layoutShifts.push({ start:entry.startTime, value:entry.value });
          if (entry.entryType === 'event' && entry.duration >= 16) state.events.push({ name:entry.name, start:entry.startTime, duration:entry.duration, interactionId:entry.interactionId || 0 });
        }
      });
      const types = [];
      for (const type of ['longtask', 'resource', 'layout-shift', 'event']) {
        if (PerformanceObserver.supportedEntryTypes?.includes(type)) types.push(type);
      }
      if (types.length) observer.observe({ entryTypes: types, buffered:true, durationThreshold:16 });
      window.EKODIAdminPerf = Object.freeze({ snapshot: () => state.snapshot() });
      window.addEventListener('ekodi-admin-ready', () => queueMicrotask(() => console.info('[EKODI perf]', state.snapshot())), { once: true });
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
