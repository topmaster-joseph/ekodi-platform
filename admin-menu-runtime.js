import {
  ADMIN_MENU_REGISTRY,
  getAdminMenuItem,
  getAdminMenuLabel,
  normalizeAdminLocale,
} from './admin-menu-registry.js';

const API = 'https://api.ekodi.kr';
const LOCALE_KEY = 'ekodi-admin-locale';
const LOCALE_COOKIE = 'ekodi_admin_locale';
const ADMIN_ROLES = Object.freeze(['super_admin', 'operator', 'viewer']);
let locale = readLocale();
let accountPanelInstalled = false;
let accountLoadPromise = null;

function token() {
  return sessionStorage.getItem('ekodi-auth-token') || '';
}

function authHeaders(json = false) {
  const headers = token() ? { authorization: `Bearer ${token()}` } : {};
  if (json) headers['content-type'] = 'application/json';
  return headers;
}

function readLocale() {
  const cookie = document.cookie.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${LOCALE_COOKIE}=`));
  if (cookie) return normalizeAdminLocale(decodeURIComponent(cookie.split('=').slice(1).join('=')));
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored) return normalizeAdminLocale(stored);
  } catch {}
  return normalizeAdminLocale(document.documentElement.lang || navigator.language || 'ko');
}

function persistLocale(nextLocale) {
  locale = normalizeAdminLocale(nextLocale);
  try { localStorage.setItem(LOCALE_KEY, locale); } catch {}
  if (location.hostname === 'ekodi.kr' || location.hostname.endsWith('.ekodi.kr')) {
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Domain=.ekodi.kr; Max-Age=31536000; SameSite=Lax; Secure`;
  }
  document.documentElement.lang = locale;
}

function t(ko, en) {
  return locale === 'en' ? en : ko;
}

function sectionOf(item) {
  if (item?.dataset?.deviceControlNav === 'true') return 'devices';
  const raw = String(item?.dataset?.section || item?.dataset?.lazySection || '').trim();
  return raw === 'marketing' ? 'marketing-ai' : raw;
}

function menuItems() {
  return document.querySelectorAll('.sidebar nav .nav[data-section], .sidebar nav .nav[data-lazy-section], .sidebar nav .nav[data-device-control-nav]');
}

function labelNavigation() {
  document.documentElement.lang = locale;
  for (const item of menuItems()) {
    const id = sectionOf(item);
    const config = getAdminMenuItem(id);
    if (!config) continue;
    let label = item.querySelector('span');
    if (!label) {
      label = document.createElement('span');
      item.append(label);
    }
    label.textContent = getAdminMenuLabel(id, locale);
    item.dataset.adminMenuRegistry = 'true';
  }
  const active = Array.from(menuItems()).find(item => item.classList.contains('active'));
  const activeId = sectionOf(active);
  const pageTitle = document.querySelector('#pageTitle');
  if (pageTitle && activeId && getAdminMenuItem(activeId)) pageTitle.textContent = getAdminMenuLabel(activeId, locale);
  document.dispatchEvent(new CustomEvent('ekodi-admin-locale-applied', { detail: { locale } }));
}

function installLocaleControl() {
  if (document.querySelector('#ekodiAdminLocale')) return;
  const host = document.querySelector('.side-bottom') || document.querySelector('.sidebar');
  if (!host) return;
  const wrap = document.createElement('label');
  wrap.id = 'ekodiAdminLocaleWrap';
  wrap.style.cssText = 'display:flex;align-items:center;gap:7px;margin:8px 0;font-size:11px;opacity:.9';
  const text = document.createElement('span');
  text.dataset.localeCaption = 'true';
  const select = document.createElement('select');
  select.id = 'ekodiAdminLocale';
  select.setAttribute('aria-label', 'Admin language');
  select.style.cssText = 'min-width:92px;padding:5px 7px;border-radius:7px;background:transparent;color:inherit;border:1px solid rgba(148,163,184,.3)';
  for (const [value, label] of [['ko', '한국어'], ['en', 'English']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = locale;
  select.addEventListener('change', () => {
    persistLocale(select.value);
    applyLocale();
  });
  wrap.append(text, select);
  host.prepend(wrap);
  updateLocaleControl();
}

function updateLocaleControl() {
  const caption = document.querySelector('[data-locale-caption="true"]');
  if (caption) caption.textContent = t('관리자 언어', 'Admin language');
  const select = document.querySelector('#ekodiAdminLocale');
  if (select) select.value = locale;
}

function applyLocale() {
  updateLocaleControl();
  labelNavigation();
  translateAdminPanel();
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  for (const [key, value] of Object.entries(authHeaders(Boolean(options.body)))) {
    if (!headers.has(key)) headers.set(key, value);
  }
  const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data.error || `API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function currentSession() {
  if (!token()) return null;
  try { return await apiRequest('/api/session'); } catch { return null; }
}

function installAdminPanelStyle() {
  if (document.querySelector('#ekodi-admin-access-style')) return;
  const style = document.createElement('style');
  style.id = 'ekodi-admin-access-style';
  style.textContent = `
    .ekodi-admin-access{display:grid;gap:18px}.ekodi-admin-access-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
    .ekodi-admin-access-head p{margin:.45rem 0 0;max-width:760px;opacity:.72;line-height:1.55}.ekodi-admin-add{display:grid;grid-template-columns:minmax(220px,1fr) 180px auto;gap:10px;align-items:end}
    .ekodi-admin-add label{display:grid;gap:6px;font-size:12px}.ekodi-admin-add input,.ekodi-admin-add select,.ekodi-admin-row select{min-height:38px;border-radius:9px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.55);color:inherit;padding:7px 10px}
    .ekodi-admin-add button,.ekodi-admin-row button{min-height:38px;border-radius:9px;border:1px solid rgba(125,211,252,.35);background:rgba(14,116,144,.18);color:inherit;padding:7px 12px;cursor:pointer}
    .ekodi-admin-list{display:grid;gap:9px}.ekodi-admin-row{display:grid;grid-template-columns:minmax(220px,1.4fr) 170px 150px auto;gap:10px;align-items:center;padding:13px;border:1px solid rgba(148,163,184,.2);border-radius:12px;background:rgba(15,23,42,.28)}
    .ekodi-admin-identity{display:grid;gap:4px;min-width:0}.ekodi-admin-identity strong{overflow:hidden;text-overflow:ellipsis}.ekodi-admin-identity small{opacity:.65}.ekodi-admin-message{min-height:20px;font-size:12px;opacity:.8}.ekodi-admin-message.error{color:#fca5a5;opacity:1}
    @media(max-width:760px){.ekodi-admin-add,.ekodi-admin-row{grid-template-columns:1fr}.ekodi-admin-row{align-items:stretch}}
  `;
  document.head.append(style);
}

function ensureAdminNavigation() {
  const nav = document.querySelector('.sidebar nav');
  if (!nav) return null;
  let item = nav.querySelector('.nav[data-section="admins"]');
  if (item) return item;
  const config = getAdminMenuItem('admins');
  item = document.createElement('button');
  item.type = 'button';
  item.className = 'nav';
  item.dataset.section = 'admins';
  item.dataset.adminMenuRegistry = 'true';
  item.innerHTML = `${config?.icon || '♜'} <span></span>`;
  item.querySelector('span').textContent = getAdminMenuLabel('admins', locale);
  nav.append(item);
  item.addEventListener('click', () => {
    window.EKODIAdminPanels?.activate?.('admins');
    loadAccounts();
  });
  window.dispatchEvent(new Event('ekodi-nav-changed'));
  return item;
}

function ensureAdminPanel() {
  if (accountPanelInstalled) return document.querySelector('[data-panel~="admins"]');
  const content = document.querySelector('.content');
  if (!content) return null;
  installAdminPanelStyle();
  const section = document.createElement('section');
  section.className = 'section ekodi-admin-access hidden-panel';
  section.dataset.panel = 'admins';
  section.hidden = true;
  section.innerHTML = `
    <div class="ekodi-admin-access-head">
      <div><p class="kicker" data-i18n="adminKicker"></p><h2 data-i18n="adminTitle"></h2><p data-i18n="adminCopy"></p></div>
      <button type="button" class="secondary" data-admin-refresh>↻</button>
    </div>
    <form class="ekodi-admin-add" data-admin-add-form>
      <label><span data-i18n="email"></span><input name="email" type="email" autocomplete="off" required placeholder="name@ekodi.kr"></label>
      <label><span data-i18n="role"></span><select name="role"></select></label>
      <button type="submit" data-i18n="addAdmin"></button>
    </form>
    <p class="ekodi-admin-message" data-admin-message role="status"></p>
    <div class="ekodi-admin-list" data-admin-list></div>
  `;
  content.append(section);
  section.querySelector('[data-admin-refresh]').addEventListener('click', () => loadAccounts(true));
  section.querySelector('[data-admin-add-form]').addEventListener('submit', addAccount);
  accountPanelInstalled = true;
  translateAdminPanel();
  return section;
}

function roleLabel(role) {
  return ({
    super_admin: t('최고관리자', 'Super Admin'),
    operator: t('운영관리자', 'Operator'),
    viewer: t('조회관리자', 'Viewer'),
  })[role] || role;
}

function statusLabel(status) {
  return status === 'active' ? t('활성', 'Active') : t('비활성', 'Disabled');
}

function fillRoleSelect(select, selected) {
  select.replaceChildren();
  for (const role of ADMIN_ROLES) {
    const option = document.createElement('option');
    option.value = role;
    option.textContent = roleLabel(role);
    option.selected = role === selected;
    select.append(option);
  }
}

function translateAdminPanel() {
  const panel = document.querySelector('[data-panel~="admins"]');
  if (!panel) return;
  const copy = {
    adminKicker: t('PLATFORM ACCESS', 'PLATFORM ACCESS'),
    adminTitle: t('관리자 · 권한', 'Administrators & Access'),
    adminCopy: t('플랫폼 최고관리자와 운영관리자 권한을 관리합니다. 고객사이트의 목사·대표·직원 등 로컬 역할은 각 테넌트에서 별도로 관리합니다.', 'Manage platform-wide administrators here. Tenant-local roles such as pastor, representative, or staff remain inside each customer site.'),
    email: t('Google 관리자 이메일', 'Google admin email'),
    role: t('플랫폼 권한', 'Platform role'),
    addAdmin: t('관리자 추가', 'Add administrator'),
  };
  for (const element of panel.querySelectorAll('[data-i18n]')) element.textContent = copy[element.dataset.i18n] || '';
  const addRole = panel.querySelector('[data-admin-add-form] select[name="role"]');
  if (addRole) fillRoleSelect(addRole, addRole.value || 'operator');
  const refresh = panel.querySelector('[data-admin-refresh]');
  if (refresh) refresh.textContent = t('↻ 새로고침', '↻ Refresh');
  if (panel.dataset.accounts) renderAccounts(JSON.parse(panel.dataset.accounts));
}

function renderAccounts(accounts) {
  const panel = document.querySelector('[data-panel~="admins"]');
  const list = panel?.querySelector('[data-admin-list]');
  if (!list) return;
  panel.dataset.accounts = JSON.stringify(accounts || []);
  list.replaceChildren();
  if (!accounts?.length) {
    const empty = document.createElement('p');
    empty.textContent = t('등록된 관리자가 없습니다.', 'No administrators are registered.');
    list.append(empty);
    return;
  }
  for (const account of accounts) {
    const row = document.createElement('article');
    row.className = 'ekodi-admin-row';
    const identity = document.createElement('div');
    identity.className = 'ekodi-admin-identity';
    const email = document.createElement('strong');
    email.textContent = account.email;
    const meta = document.createElement('small');
    meta.textContent = account.googleBound
      ? `${t('Google 연결됨', 'Google linked')} · ${account.last_login_at ? new Date(account.last_login_at).toLocaleString(locale === 'en' ? 'en-US' : 'ko-KR') : t('로그인 기록 없음', 'No login yet')}`
      : t('사전등록 · 첫 Google 로그인 대기', 'Pre-registered · awaiting first Google login');
    identity.append(email, meta);

    const role = document.createElement('select');
    role.setAttribute('aria-label', `${account.email} role`);
    fillRoleSelect(role, account.role);
    const status = document.createElement('select');
    status.setAttribute('aria-label', `${account.email} status`);
    for (const value of ['active', 'disabled']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = statusLabel(value);
      option.selected = value === account.status;
      status.append(option);
    }
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = t('저장', 'Save');
    save.addEventListener('click', async () => {
      save.disabled = true;
      setMessage(t('권한을 저장하고 있습니다…', 'Saving access…'));
      try {
        await apiRequest(`/api/admin-access/google-accounts/${account.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role: role.value, status: status.value }),
        });
        setMessage(t('관리자 권한을 저장했습니다.', 'Administrator access saved.'));
        await loadAccounts(true);
      } catch (error) {
        setMessage(error.message, true);
      } finally { save.disabled = false; }
    });
    row.append(identity, role, status, save);
    list.append(row);
  }
}

function setMessage(message, error = false) {
  const element = document.querySelector('[data-admin-message]');
  if (!element) return;
  element.textContent = message || '';
  element.classList.toggle('error', Boolean(error));
}

async function loadAccounts(force = false) {
  ensureAdminPanel();
  if (accountLoadPromise && !force) return accountLoadPromise;
  setMessage(t('관리자 목록을 확인하고 있습니다…', 'Loading administrators…'));
  accountLoadPromise = apiRequest('/api/admin-access/google-accounts')
    .then(data => {
      renderAccounts(data.accounts || []);
      setMessage(t(`관리자 ${data.accounts?.length || 0}명`, `${data.accounts?.length || 0} administrators`));
      return data;
    })
    .catch(error => {
      setMessage(error.message, true);
      throw error;
    })
    .finally(() => { accountLoadPromise = null; });
  return accountLoadPromise;
}

async function addAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  const submit = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  submit.disabled = true;
  setMessage(t('관리자를 등록하고 있습니다…', 'Adding administrator…'));
  try {
    await apiRequest('/api/admin-access/google-accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: String(data.get('email') || '').trim().toLowerCase(), role: String(data.get('role') || 'operator') }),
    });
    form.reset();
    fillRoleSelect(form.elements.role, 'operator');
    setMessage(t('관리자를 등록했습니다. 해당 Google 계정은 다음 로그인부터 권한을 사용할 수 있습니다.', 'Administrator added. The Google account can use this access on its next login.'));
    await loadAccounts(true);
  } catch (error) {
    setMessage(error.message, true);
  } finally { submit.disabled = false; }
}

async function installAdminAccessForSuperAdmin() {
  const session = await currentSession();
  if (!session || session.role !== 'super_admin') {
    document.querySelector('.sidebar nav .nav[data-section="admins"]')?.remove();
    return;
  }
  ensureAdminNavigation();
  ensureAdminPanel();
  labelNavigation();
}

async function install() {
  installLocaleControl();
  labelNavigation();
  await installAdminAccessForSuperAdmin();
}

persistLocale(locale);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
window.addEventListener('ekodi-admin-ready', install);
window.addEventListener('ekodi-nav-changed', labelNavigation);
window.addEventListener('ekodi-feature-installed', labelNavigation);

window.EKODIAdminMenu = Object.freeze({
  registry: ADMIN_MENU_REGISTRY,
  locale: () => locale,
  setLocale: next => { persistLocale(next); applyLocale(); },
  label: id => getAdminMenuLabel(id, locale),
  refreshAdminAccess: () => loadAccounts(true),
});
