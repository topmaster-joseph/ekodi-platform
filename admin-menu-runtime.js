import { adminMenuOrder, getAdminMenuItem, getAdminMenuLabel, normalizeAdminLocale } from './admin-menu-registry.js';

const API = 'https://api.ekodi.kr';
const LOCALE_KEY = 'ekodi-admin-locale';
const LOCALE_COOKIE = 'ekodi_admin_locale';
const CONTEXT_KEY = 'ekodi-admin-context-v1';
const CENTRAL_ADMIN_AUTH = 'https://auth.ekodi.kr/';
const ADMIN_HANDOFF_ALLOWED_TARGETS = new Set(['https://tax.ekodi.kr/']);
const ROLES = ['super_admin', 'operator', 'viewer'];
let locale = readLocale();
let panelInstalled = false;
let currentSession = null;
let sessionLoadPromise = null;
let contextOptions = [];
let currentContext = Object.freeze({ type:'platform', id:'global', label:'EKODI Platform' });
let contextInstallPromise = null;
let elevationPromise = null;

function token() { return sessionStorage.getItem('ekodi-auth-token') || ''; }
function adminHandoffTarget(value) {
  try {
    const target = new URL(String(value || ''));
    if (target.protocol !== 'https:' || target.username || target.password) return null;
    target.hash = '';
    return ADMIN_HANDOFF_ALLOWED_TARGETS.has(target.href) ? target : null;
  } catch {
    return null;
  }
}
function adminSubserviceDestination(definition) {
  const target = adminHandoffTarget(definition?.href);
  if (!target) return '';
  const currentToken = token();
  if (currentToken) {
    target.hash = new URLSearchParams({ ekodi_admin_token: currentToken }).toString();
    return target.href;
  }
  const auth = new URL(CENTRAL_ADMIN_AUTH);
  auth.searchParams.set('site', 'admin');
  auth.searchParams.set('direct', '1');
  auth.searchParams.set('return_to', target.href);
  return auth.href;
}
function t(ko, en) { return locale === 'en' ? en : ko; }
function sectionOf(item) {
  if (item?.dataset?.deviceControlNav === 'true') return 'devices';
  const raw = String(item?.dataset?.section || item?.dataset?.lazySection || '').trim();
  return raw === 'marketing' ? 'marketing-ai' : raw;
}
function readLocale() {
  const cookie = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(`${LOCALE_COOKIE}=`));
  if (cookie) return normalizeAdminLocale(decodeURIComponent(cookie.split('=').slice(1).join('=')));
  try { return normalizeAdminLocale(localStorage.getItem(LOCALE_KEY) || document.documentElement.lang || navigator.language); }
  catch { return 'ko'; }
}
function saveLocale(value) {
  locale = normalizeAdminLocale(value);
  try { localStorage.setItem(LOCALE_KEY, locale); } catch {}
  if (location.hostname === 'ekodi.kr' || location.hostname.endsWith('.ekodi.kr')) {
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Domain=.ekodi.kr; Max-Age=31536000; SameSite=Lax; Secure`;
  }
  document.documentElement.lang = locale;
}
async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token()) headers.set('authorization', `Bearer ${token()}`);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data.error || `API 요청 실패 (${response.status})`);
    error.code = data.code || '';
    error.status = response.status;
    throw error;
  }
  return data;
}
function loadCurrentSession() {
  if (currentSession) return Promise.resolve(currentSession);
  if (sessionLoadPromise) return sessionLoadPromise;
  sessionLoadPromise = api('/api/session')
    .then(session => { currentSession = session; return session; })
    .finally(() => { sessionLoadPromise = null; });
  return sessionLoadPromise;
}
function navItems() {
  return document.querySelectorAll('.sidebar nav .nav[data-section],.sidebar nav .nav[data-lazy-section],.sidebar nav .nav[data-device-control-nav]');
}
function applyMenuLabels() {
  document.documentElement.lang = locale;
  for (const item of navItems()) {
    const id = sectionOf(item);
    if (!getAdminMenuItem(id)) continue;
    let span = item.querySelector('span');
    if (!span) { span = document.createElement('span'); item.append(span); }
    span.textContent = getAdminMenuLabel(id, locale);
    item.dataset.adminMenuRegistry = 'true';
  }
  const active = [...navItems()].find(item => item.classList.contains('active'));
  const id = sectionOf(active);
  const title = document.querySelector('#pageTitle');
  if (title && id && getAdminMenuItem(id)) title.textContent = getAdminMenuLabel(id, locale);
  const logout = document.querySelector('#logoutButton');
  if (logout) logout.textContent = t('로그아웃', 'Logout');
  const menuButton = document.querySelector('#menuButton');
  if (menuButton) menuButton.setAttribute('aria-label', t('메뉴 열기', 'Open menu'));
}
function installLocaleControl() {
  if (document.querySelector('#ekodiAdminLocale')) return;
  const host = document.querySelector('.side-bottom') || document.querySelector('.sidebar');
  if (!host) return;
  const label = document.createElement('label');
  label.id = 'ekodiAdminLocaleWrap';
  label.style.cssText = 'display:flex;align-items:center;gap:7px;margin:8px 0;font-size:11px;opacity:.9';
  const caption = document.createElement('span');
  caption.dataset.adminLocaleCaption = 'true';
  const select = document.createElement('select');
  select.id = 'ekodiAdminLocale';
  select.style.cssText = 'min-width:92px;padding:5px 7px;border-radius:7px;background:transparent;color:inherit;border:1px solid rgba(148,163,184,.3)';
  select.innerHTML = '<option value="ko">한국어</option><option value="en">English</option>';
  select.value = locale;
  select.addEventListener('change', () => { saveLocale(select.value); applyLocale(); });
  label.append(caption, select);
  host.prepend(label);
  updateLocaleControl();
}
function updateLocaleControl() {
  const caption = document.querySelector('[data-admin-locale-caption]');
  if (caption) caption.textContent = t('관리자 언어', 'Admin language');
  const select = document.querySelector('#ekodiAdminLocale');
  if (select) select.value = locale;
}
function roleLabel(role) {
  return ({ super_admin: t('최고관리자', 'Super Admin'), operator: t('운영관리자', 'Operator'), viewer: t('조회관리자', 'Viewer') })[role] || role;
}
function fillRoles(select, selected = 'operator') {
  select.replaceChildren(...ROLES.map(role => {
    const option = document.createElement('option'); option.value = role; option.textContent = roleLabel(role); option.selected = role === selected; return option;
  }));
}
function installStyle() {
  if (document.querySelector('#ekodi-admin-access-style')) return;
  const style = document.createElement('style');
  style.id = 'ekodi-admin-access-style';
  style.textContent = `
.ekodi-admin-access{display:grid;gap:18px}.ekodi-admin-add{display:grid;grid-template-columns:minmax(220px,1fr) 180px auto;gap:10px;align-items:end}.ekodi-admin-add label{display:grid;gap:6px}.ekodi-admin-add input,.ekodi-admin-add select,.ekodi-admin-row select{min-height:38px;border-radius:9px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.55);color:inherit;padding:7px 10px}.ekodi-admin-add button,.ekodi-admin-row button{min-height:38px;border-radius:9px;padding:7px 12px}.ekodi-admin-list{display:grid;gap:9px}.ekodi-admin-row{display:grid;grid-template-columns:minmax(220px,1.4fr) 170px 150px auto;gap:10px;align-items:center;padding:13px;border:1px solid rgba(148,163,184,.2);border-radius:12px}.ekodi-admin-id{display:grid;gap:4px}.ekodi-admin-id small{opacity:.65}.ekodi-admin-msg.error{color:#fca5a5}
.ekodi-admin-context{position:sticky;top:0;z-index:38;display:flex;align-items:center;gap:9px;min-height:48px;padding:7px 16px;border-bottom:1px solid rgba(148,163,184,.18);background:rgba(7,21,34,.98)}.ekodi-admin-context label{display:flex;align-items:center;gap:8px;min-width:0}.ekodi-admin-context strong{font-size:11px;color:#aebed0;white-space:nowrap}.ekodi-admin-context select{min-width:230px;max-width:min(45vw,430px);min-height:34px;border:1px solid rgba(148,163,184,.26);border-radius:8px;background:#0b1d2e;color:#f4f8fc;padding:5px 30px 5px 9px;font:inherit;font-size:13px}.ekodi-admin-context-note{font-size:10px;color:#8498aa;white-space:nowrap}.ekodi-admin-context-badge{margin-left:auto;display:inline-flex;align-items:center;min-height:26px;padding:3px 8px;border:1px solid rgba(56,189,248,.22);border-radius:999px;color:#9edcff;font-size:10px;font-weight:800}
.ekodi-privilege-overlay{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:18px;background:rgba(2,8,23,.72)}.ekodi-privilege-card{width:min(92vw,440px);display:grid;gap:13px;padding:22px;border:1px solid rgba(148,163,184,.28);border-radius:16px;background:#0b1d2e;color:#f4f8fc;box-shadow:0 24px 70px rgba(0,0,0,.35)}.ekodi-privilege-card h3{margin:0;font-size:19px}.ekodi-privilege-card p{margin:0;color:#aebed0;line-height:1.55}.ekodi-privilege-google{min-height:42px}.ekodi-privilege-actions{display:flex;justify-content:flex-end}.ekodi-privilege-actions button{min-height:36px;padding:7px 12px;border-radius:8px}.ekodi-privilege-state{min-height:18px;font-size:12px;color:#9edcff}
@media(max-width:760px){.ekodi-admin-add,.ekodi-admin-row{grid-template-columns:1fr}.ekodi-admin-context{padding:6px 10px;gap:6px}.ekodi-admin-context strong,.ekodi-admin-context-note{display:none}.ekodi-admin-context label{flex:1}.ekodi-admin-context select{min-width:0;width:100%;max-width:none}.ekodi-admin-context-badge{font-size:9px}}
`;
  document.head.append(style);
}
function bindAdminHandoff(link, definition) {
  if (!link || definition?.adminHandoff !== true || link.dataset.adminHandoffBound === 'true') return link;
  link.dataset.adminHandoff = 'true';
  link.dataset.adminHandoffBound = 'true';
  link.removeAttribute('target');
  link.addEventListener('click', event => {
    event.preventDefault();
    const destination = adminSubserviceDestination(definition);
    if (!destination) {
      console.error(`Blocked untrusted admin handoff target: ${definition.href}`);
      return;
    }
    window.location.assign(destination);
  });
  return link;
}
function ensureExternalMenuItems() {
  const nav = document.querySelector('.sidebar nav');
  if (!nav) return;
  for (const id of adminMenuOrder()) {
    const definition = getAdminMenuItem(id);
    if (!definition?.href) continue;
    let link = nav.querySelector('.nav[data-section="'+id+'"]');
    if (!link) {
      link = document.createElement('a');
      link.className = 'nav'; link.dataset.section = id; link.href = definition.href; link.rel = 'noopener';
      link.append(document.createTextNode((definition.icon || '·')+' '));
      const label = document.createElement('span'); label.textContent = getAdminMenuLabel(id, locale); link.append(label);
      nav.append(link);
    }
    if (definition.adminHandoff === true) bindAdminHandoff(link, definition);
    else link.target = '_blank';
  }
  window.dispatchEvent(new Event('ekodi-nav-changed'));
}
function ensureAdminNav() {
  if (currentContext.type !== 'platform') return;
  const nav = document.querySelector('.sidebar nav');
  if (!nav) return;
  let button = nav.querySelector('.nav[data-section="admins"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button'; button.className = 'nav'; button.dataset.section = 'admins';
    button.innerHTML = '♜ <span></span>';
    button.addEventListener('click', () => { window.EKODIAdminPanels?.activate?.('admins'); loadAccounts(); });
    nav.append(button);
    window.dispatchEvent(new Event('ekodi-nav-changed'));
  }
  button.querySelector('span').textContent = getAdminMenuLabel('admins', locale);
}
function ensureAdminPanel() {
  if (panelInstalled) return document.querySelector('[data-panel~="admins"]');
  const content = document.querySelector('.content');
  if (!content) return null;
  installStyle();
  const section = document.createElement('section');
  section.className = 'section ekodi-admin-access hidden-panel'; section.dataset.panel = 'admins'; section.hidden = true;
  section.innerHTML = '<div><p class="kicker">PLATFORM ACCESS</p><h2 data-admin-title></h2><p data-admin-copy></p></div><form class="ekodi-admin-add" data-admin-form><label><span data-admin-email-label></span><input name="email" type="email" required placeholder="name@ekodi.kr"></label><label><span data-admin-role-label></span><select name="role"></select></label><button type="submit" data-admin-add-label></button></form><p class="ekodi-admin-msg" data-admin-message role="status"></p><div class="ekodi-admin-list" data-admin-list></div>';
  content.append(section);
  fillRoles(section.querySelector('select[name="role"]'));
  section.querySelector('[data-admin-form]').addEventListener('submit', addAccount);
  panelInstalled = true;
  translateAdminPanel();
  return section;
}
async function ensureAdminAccess() {
  const session = await loadCurrentSession();
  if (session?.role !== 'super_admin') return null;
  const requestedContext = readRequestedContext();
  if (currentContext.type !== 'platform' || (requestedContext && requestedContext !== 'platform:global')) return null;
  ensureAdminNav();
  const panel = ensureAdminPanel();
  applyMenuLabels();
  if (panel) void loadAccounts();
  return panel;
}
function setMessage(text, error = false) {
  const node = document.querySelector('[data-admin-message]');
  if (!node) return; node.textContent = text || ''; node.classList.toggle('error', error);
}
function translateAdminPanel() {
  const panel = document.querySelector('[data-panel~="admins"]');
  if (!panel) return;
  panel.querySelector('[data-admin-title]').textContent = t('관리자 · 권한', 'Administrators & Access');
  panel.querySelector('[data-admin-copy]').textContent = t('플랫폼 전역 관리자만 관리합니다. 고객사이트의 목사·대표·직원 등 로컬 역할은 각 공간에서 별도로 관리합니다.', 'Manage platform-wide administrators only. Workspace-local roles remain inside each space.');
  panel.querySelector('[data-admin-email-label]').textContent = t('Google 관리자 이메일', 'Google admin email');
  panel.querySelector('[data-admin-role-label]').textContent = t('플랫폼 권한', 'Platform role');
  panel.querySelector('[data-admin-add-label]').textContent = t('관리자 추가', 'Add administrator');
  const addRole = panel.querySelector('select[name="role"]'); if (addRole) fillRoles(addRole, addRole.value || 'operator');
  if (panel.dataset.accounts) renderAccounts(JSON.parse(panel.dataset.accounts));
}
function renderAccounts(accounts = []) {
  const panel = ensureAdminPanel(); const list = panel?.querySelector('[data-admin-list]'); if (!list) return;
  panel.dataset.accounts = JSON.stringify(accounts); list.replaceChildren();
  for (const account of accounts) {
    const row = document.createElement('article'); row.className = 'ekodi-admin-row';
    const id = document.createElement('div'); id.className = 'ekodi-admin-id'; id.innerHTML = '<strong></strong><small></small>';
    id.querySelector('strong').textContent = account.email;
    id.querySelector('small').textContent = account.googleBound ? t('Google 연결됨', 'Google linked') : t('첫 Google 로그인 대기', 'Awaiting first Google login');
    const role = document.createElement('select'); fillRoles(role, account.role);
    const status = document.createElement('select');
    for (const value of ['active','disabled']) { const option = document.createElement('option'); option.value = value; option.textContent = value === 'active' ? t('활성','Active') : t('비활성','Disabled'); option.selected = account.status === value; status.append(option); }
    const save = document.createElement('button'); save.type = 'button'; save.textContent = t('저장','Save');
    save.addEventListener('click', async () => {
      try {
        save.disabled = true;
        await withPrivilege(() => api(`/api/admin-access/google-accounts/${account.id}`, { method:'PUT', body:JSON.stringify({ role:role.value, status:status.value }) }));
        setMessage(t('권한을 저장했습니다.','Access saved.'));
        await loadAccounts();
      } catch (error) { setMessage(error.message, true); }
      finally { save.disabled = false; }
    });
    row.append(id, role, status, save); list.append(row);
  }
}
async function loadAccounts() {
  try { setMessage(t('관리자 목록 확인 중…','Loading administrators…')); const data = await api('/api/admin-access/google-accounts'); renderAccounts(data.accounts || []); setMessage(t(`관리자 ${data.accounts?.length || 0}명`, `${data.accounts?.length || 0} administrators`)); }
  catch (error) { setMessage(error.message, true); }
}
async function addAccount(event) {
  event.preventDefault(); const form = event.currentTarget; if (!form.checkValidity()) return form.reportValidity();
  const data = new FormData(form); const button = form.querySelector('button[type="submit"]');
  try {
    button.disabled = true;
    await withPrivilege(() => api('/api/admin-access/google-accounts', { method:'POST', body:JSON.stringify({ email:String(data.get('email')).trim().toLowerCase(), role:String(data.get('role') || 'operator') }) }));
    form.reset(); fillRoles(form.elements.role); setMessage(t('관리자를 등록했습니다.','Administrator added.')); await loadAccounts();
  } catch (error) { setMessage(error.message, true); }
  finally { button.disabled = false; }
}

function contextKey(context = currentContext) { return `${context.type}:${context.id}`; }
function contextFromKey(key) {
  const value = String(key || '').trim();
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const type = value.slice(0, separator);
  const id = value.slice(separator + 1);
  return contextOptions.find(item => item.type === type && item.id === id) || null;
}
function readRequestedContext() {
  const fromUrl = new URL(location.href).searchParams.get('context');
  if (fromUrl) return fromUrl;
  try { return sessionStorage.getItem(CONTEXT_KEY) || ''; } catch { return ''; }
}
function writeContextLocation(context) {
  try { sessionStorage.setItem(CONTEXT_KEY, contextKey(context)); } catch {}
  const url = new URL(location.href);
  if (context.type === 'platform') url.searchParams.delete('context');
  else url.searchParams.set('context', contextKey(context));
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
function contextDisplayLabel(context) {
  if (context.type === 'platform') return locale === 'en' ? '🌐 EKODI Platform' : '🌐 EKODI 플랫폼';
  const prefix = context.type === 'workspace' ? '▣' : '◇';
  return `${prefix} ${context.label}${context.meta ? ` · ${context.meta}` : ''}`;
}
function contextBadgeLabel(context) {
  if (context.type === 'platform') return t('플랫폼 범위', 'Platform context');
  if (context.type === 'workspace') return t('공간 범위', 'Workspace context');
  return t('서비스 범위', 'Service context');
}
function syncPlatformOnlyNavigation() {
  const admins = document.querySelector('.sidebar nav .nav[data-section="admins"]');
  if (currentContext.type !== 'platform') {
    const activeAdmins = admins?.classList.contains('active');
    admins?.remove();
    if (activeAdmins) window.EKODIAdminPanels?.activate?.(currentContext.type === 'workspace' ? 'workspace' : 'campus');
    return;
  }
  if (currentSession?.role === 'super_admin') ensureAdminNav();
}
function renderContextControl() {
  const host = document.querySelector('[data-ekodi-admin-context-control]');
  if (!host) return;
  const select = host.querySelector('select');
  const title = host.querySelector('strong');
  const note = host.querySelector('.ekodi-admin-context-note');
  const badge = host.querySelector('.ekodi-admin-context-badge');
  if (title) title.textContent = t('현재 관리 대상', 'Current context');
  if (note) note.textContent = t('전환은 권한을 추가하지 않습니다.', 'Switching never grants authority.');
  if (badge) badge.textContent = contextBadgeLabel(currentContext);
  if (!select) return;
  const value = contextKey(currentContext);
  select.replaceChildren(...contextOptions.map(context => {
    const option = document.createElement('option');
    option.value = contextKey(context);
    option.textContent = contextDisplayLabel(context);
    return option;
  }));
  select.value = contextOptions.some(item => contextKey(item) === value) ? value : 'platform:global';
  select.setAttribute('aria-label', t('현재 관리 대상 선택', 'Select current admin context'));
  select.title = t('관리 대상을 바꾸어도 서버 권한은 변하지 않습니다.', 'Changing context never changes server authority.');
}
function setContext(next, { persist = true, announce = true } = {}) {
  const context = typeof next === 'string' ? contextFromKey(next) : contextOptions.find(item => contextKey(item) === contextKey(next));
  if (!context) return false;
  currentContext = Object.freeze({ ...context });
  document.documentElement.dataset.ekodiAdminContextType = currentContext.type;
  document.documentElement.dataset.ekodiAdminContextId = currentContext.id;
  if (persist) writeContextLocation(currentContext);
  renderContextControl();
  syncPlatformOnlyNavigation();
  if (announce) window.dispatchEvent(new CustomEvent('ekodi-admin-context-changed', {
    detail: { context:currentContext, authority:currentSession?.authority || null },
  }));
  return true;
}
async function loadContextOptions() {
  const platform = { type:'platform', id:'global', label:'EKODI Platform', meta:'' };
  const [directoryResult, serviceResult] = await Promise.allSettled([
    api('/api/customers/directory'),
    fetch('/ecosystem-services.json', { cache:'no-store', credentials:'same-origin' }).then(response => response.ok ? response.json() : Promise.reject(new Error(`service registry ${response.status}`))),
  ]);
  const workspaces = directoryResult.status === 'fulfilled'
    ? (directoryResult.value.tenants || []).map(tenant => ({ type:'workspace', id:String(tenant.slug), label:String(tenant.name || tenant.slug), meta:String(tenant.domain || '') }))
    : [];
  const services = serviceResult.status === 'fulfilled'
    ? (serviceResult.value.services || []).filter(service => service?.id && service?.name).map(service => ({ type:'service', id:String(service.id), label:String(locale === 'en' ? (service.nameEn || service.name) : service.name), meta:String(service.status || '') }))
    : [];
  contextOptions = [platform, ...workspaces, ...services];
  return contextOptions;
}
async function installContextControl() {
  if (!token()) return;
  if (contextInstallPromise) return contextInstallPromise;
  contextInstallPromise = (async () => {
    installStyle();
    const main = document.querySelector('#app main') || document.querySelector('main');
    if (!main) return;
    let host = document.querySelector('[data-ekodi-admin-context-control]');
    if (!host) {
      host = document.createElement('div');
      host.className = 'ekodi-admin-context';
      host.dataset.ekodiAdminContextControl = 'true';
      const label = document.createElement('label');
      const title = document.createElement('strong');
      const select = document.createElement('select');
      const note = document.createElement('span'); note.className = 'ekodi-admin-context-note';
      const badge = document.createElement('span'); badge.className = 'ekodi-admin-context-badge';
      label.append(title, select); host.append(label, note, badge);
      const tabs = main.querySelector(':scope>.admin-context-tabs-shell');
      if (tabs) tabs.insertAdjacentElement('beforebegin', host);
      else {
        const topbar = main.querySelector(':scope>.topbar');
        if (topbar) topbar.insertAdjacentElement('afterend', host); else main.prepend(host);
      }
      select.addEventListener('change', () => setContext(select.value));
    }
    await loadContextOptions();
    const requested = contextFromKey(readRequestedContext()) || contextOptions[0];
    setContext(requested, { persist:true, announce:false });
    window.dispatchEvent(new CustomEvent('ekodi-admin-context-ready', { detail:{ context:currentContext, authority:currentSession?.authority || null } }));
  })().catch(error => {
    console.warn('[EKODI Admin] context runtime degraded', error);
    contextOptions = [{ type:'platform', id:'global', label:'EKODI Platform', meta:'' }];
    setContext(contextOptions[0], { persist:false, announce:false });
  });
  return contextInstallPromise;
}

function loadGoogleLibrary() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-ekodi-google-identity]');
    if (existing) {
      existing.addEventListener('load', resolve, { once:true });
      existing.addEventListener('error', reject, { once:true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.ekodiGoogleIdentity = 'true';
    script.addEventListener('load', resolve, { once:true });
    script.addEventListener('error', () => reject(new Error(t('Google 인증 라이브러리를 불러올 수 없습니다.', 'Could not load Google authentication.'))), { once:true });
    document.head.append(script);
  });
}
function closePrivilegeOverlay() { document.querySelector('[data-ekodi-privilege-overlay]')?.remove(); }
async function requestElevation() {
  if (elevationPromise) return elevationPromise;
  elevationPromise = (async () => {
    const status = await api('/api/admin-access/elevation').catch(() => ({ elevated:false }));
    if (status.elevated) { currentSession = { ...(currentSession || {}), authority:status.authority || currentSession?.authority }; return status; }
    const config = await api('/api/google/config');
    if (!config.enabled || !config.clientId) throw new Error(t('보호된 작업을 위한 Google 추가 인증이 아직 연결되지 않았습니다.', 'Google reauthentication is not configured for privileged actions.'));
    const challenge = await api('/api/google/challenge', { method:'POST' });
    await loadGoogleLibrary();
    closePrivilegeOverlay();
    const overlay = document.createElement('div'); overlay.className = 'ekodi-privilege-overlay'; overlay.dataset.ekodiPrivilegeOverlay = 'true';
    const card = document.createElement('section'); card.className = 'ekodi-privilege-card';
    const heading = document.createElement('h3'); heading.textContent = t('보호된 작업 추가 인증', 'Confirm privileged action');
    const copy = document.createElement('p'); copy.textContent = t('현재 로그인한 Google 계정으로 한 번 더 확인하면 15분 동안 보호된 관리자 작업을 수행할 수 있습니다. 인증 후 지금 화면에서 바로 이어집니다.', 'Verify once more with the current Google account. Privileged actions remain available for 15 minutes and continue on this screen.');
    const googleHost = document.createElement('div'); googleHost.className = 'ekodi-privilege-google';
    const state = document.createElement('div'); state.className = 'ekodi-privilege-state'; state.setAttribute('role','status');
    const actions = document.createElement('div'); actions.className = 'ekodi-privilege-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary'; cancel.textContent = t('취소','Cancel'); actions.append(cancel);
    card.append(heading, copy, googleHost, state, actions); overlay.append(card); document.body.append(overlay);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, value) => {
        if (settled) return; settled = true; closePrivilegeOverlay();
        if (error) reject(error); else resolve(value);
      };
      cancel.addEventListener('click', () => finish(new Error(t('추가 인증을 취소했습니다.', 'Reauthentication cancelled.'))));
      window.google.accounts.id.initialize({
        client_id: config.clientId,
        nonce: challenge.nonce,
        auto_select: false,
        callback: async response => {
          state.textContent = t('Google 계정을 확인하는 중입니다…', 'Verifying Google account…');
          try {
            const result = await api('/api/admin-access/elevation', { method:'POST', body:JSON.stringify({ credential:response.credential, nonce:challenge.nonce }) });
            currentSession = { ...(currentSession || {}), authority:result.authority || currentSession?.authority };
            window.dispatchEvent(new CustomEvent('ekodi-admin-elevation-changed', { detail:result }));
            finish(null, result);
          } catch (error) { state.textContent = error.message; }
        },
      });
      window.google.accounts.id.renderButton(googleHost, { type:'standard', theme:'outline', size:'large', text:'signin_with', shape:'rectangular', logo_alignment:'left', width:Math.min(360, Math.max(240, googleHost.clientWidth || 320)) });
      try { window.google.accounts.id.prompt?.(); } catch {}
    });
  })().finally(() => { elevationPromise = null; });
  return elevationPromise;
}
async function withPrivilege(operation) {
  try { return await operation(); }
  catch (error) {
    if (error?.code !== 'ELEVATION_REQUIRED') throw error;
    await requestElevation();
    return operation();
  }
}

function applyLocale() { updateLocaleControl(); applyMenuLabels(); translateAdminPanel(); renderContextControl(); }
async function install() {
  installStyle(); installLocaleControl(); ensureExternalMenuItems(); applyMenuLabels();
  if (!token()) return;
  try {
    currentSession = await loadCurrentSession();
    if (currentSession.role === 'super_admin') ensureAdminPanel();
    await installContextControl();
    if (currentSession.role === 'super_admin' && currentContext.type === 'platform') { ensureAdminNav(); ensureAdminPanel(); applyMenuLabels(); }
    else document.querySelector('.sidebar nav .nav[data-section="admins"]')?.remove();
  } catch (error) { console.warn('[EKODI Admin] Admin OS runtime degraded', error); }
}

saveLocale(locale);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true }); else install();
window.addEventListener('ekodi-admin-ready', install);
window.addEventListener('ekodi-nav-changed', applyMenuLabels);
window.addEventListener('ekodi-feature-installed', applyMenuLabels);
window.EKODIAdminMenu = Object.freeze({ locale: () => locale, setLocale: value => { saveLocale(value); applyLocale(); }, label: id => getAdminMenuLabel(id, locale), refreshAdminAccess: loadAccounts, ensureAdminAccess });
window.EKODIAdminContext = Object.freeze({
  current: () => currentContext,
  authority: () => currentSession?.authority || null,
  set: value => setContext(value),
  refresh: async () => { await loadContextOptions(); setContext(contextFromKey(contextKey(currentContext)) || contextOptions[0]); return currentContext; },
  elevate: requestElevation,
  revokeElevation: async () => { const result = await api('/api/admin-access/elevation', { method:'DELETE' }); currentSession = { ...(currentSession || {}), authority:{ ...(currentSession?.authority || {}), elevated:false, elevatedUntil:null } }; window.dispatchEvent(new CustomEvent('ekodi-admin-elevation-changed', { detail:result })); return result; },
});
