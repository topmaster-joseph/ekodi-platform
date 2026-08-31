import { adminMenuOrder, getAdminMenuItem, getAdminMenuLabel, normalizeAdminLocale } from './admin-menu-registry.js';

const API = 'https://api.ekodi.kr';
const LOCALE_KEY = 'ekodi-admin-locale';
const LOCALE_COOKIE = 'ekodi_admin_locale';
const CENTRAL_ADMIN_AUTH = 'https://auth.ekodi.kr/';
const ADMIN_HANDOFF_ALLOWED_TARGETS = new Set(['https://tax.ekodi.kr/']);
const ROLES = ['super_admin', 'operator', 'viewer'];
let locale = readLocale();
let panelInstalled = false;

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
  if (!response.ok) throw new Error(data.error || `API 요청 실패 (${response.status})`);
  return data;
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
  style.textContent = '.ekodi-admin-access{display:grid;gap:18px}.ekodi-admin-add{display:grid;grid-template-columns:minmax(220px,1fr) 180px auto;gap:10px;align-items:end}.ekodi-admin-add label{display:grid;gap:6px}.ekodi-admin-add input,.ekodi-admin-add select,.ekodi-admin-row select{min-height:38px;border-radius:9px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.55);color:inherit;padding:7px 10px}.ekodi-admin-add button,.ekodi-admin-row button{min-height:38px;border-radius:9px;padding:7px 12px}.ekodi-admin-list{display:grid;gap:9px}.ekodi-admin-row{display:grid;grid-template-columns:minmax(220px,1.4fr) 170px 150px auto;gap:10px;align-items:center;padding:13px;border:1px solid rgba(148,163,184,.2);border-radius:12px}.ekodi-admin-id{display:grid;gap:4px}.ekodi-admin-id small{opacity:.65}.ekodi-admin-msg.error{color:#fca5a5}@media(max-width:760px){.ekodi-admin-add,.ekodi-admin-row{grid-template-columns:1fr}}';
  document.head.append(style);
}
function bindAdminHandoff(link, definition) {
  if (!link || definition?.adminHandoff !== true) return false;
  link.dataset.adminHandoff = 'true';
  link.target = '_self';
  link.rel = 'noopener';
  if (link.dataset.adminHandoffBound === 'true') return true;
  link.dataset.adminHandoffBound = 'true';
  link.addEventListener('click', event => {
    event.preventDefault();
    const destination = adminSubserviceDestination(definition);
    if (!destination) {
      console.error(`Blocked untrusted admin handoff target: ${definition.href}`);
      return;
    }
    window.location.assign(destination);
  });
  return true;
}
function ensureExternalMenuItems() {
  const nav = document.querySelector('.sidebar nav');
  if (!nav) return;
  let changed = false;
  for (const id of adminMenuOrder()) {
    const definition = getAdminMenuItem(id);
    if (!definition?.href) continue;
    let link = nav.querySelector('.nav[data-section="'+id+'"]');
    if (!link) {
      link = document.createElement('a');
      link.className = 'nav';
      link.dataset.section = id;
      link.append(document.createTextNode((definition.icon || '·')+' '));
      const label = document.createElement('span');
      label.textContent = getAdminMenuLabel(id, locale);
      link.append(label);
      nav.append(link);
      changed = true;
    }
    if (link.tagName !== 'A') {
      console.error(`Admin external menu must be an anchor: ${id}`);
      continue;
    }
    link.href = definition.href;
    link.rel = 'noopener';
    if (definition.adminHandoff === true) bindAdminHandoff(link, definition);
    else link.target = '_blank';
  }
  if (changed) window.dispatchEvent(new Event('ekodi-nav-changed'));
}
function ensureAdminNav() {
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
function setMessage(text, error = false) {
  const node = document.querySelector('[data-admin-message]');
  if (!node) return; node.textContent = text || ''; node.classList.toggle('error', error);
}
function translateAdminPanel() {
  const panel = document.querySelector('[data-panel~="admins"]');
  if (!panel) return;
  panel.querySelector('[data-admin-title]').textContent = t('관리자 · 권한', 'Administrators & Access');
  panel.querySelector('[data-admin-copy]').textContent = t('플랫폼 전역 관리자만 관리합니다. 고객사이트의 목사·대표·직원 등 로컬 역할은 각 테넌트에서 별도로 관리합니다.', 'Manage platform-wide administrators only. Tenant-local roles remain inside each customer site.');
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
    const id = document.createElement('div'); id.className = 'ekodi-admin-id'; id.innerHTML = `<strong></strong><small></small>`;
    id.querySelector('strong').textContent = account.email;
    id.querySelector('small').textContent = account.googleBound ? t('Google 연결됨', 'Google linked') : t('첫 Google 로그인 대기', 'Awaiting first Google login');
    const role = document.createElement('select'); fillRoles(role, account.role);
    const status = document.createElement('select');
    for (const value of ['active','disabled']) { const option = document.createElement('option'); option.value = value; option.textContent = value === 'active' ? t('활성','Active') : t('비활성','Disabled'); option.selected = account.status === value; status.append(option); }
    const save = document.createElement('button'); save.type = 'button'; save.textContent = t('저장','Save');
    save.addEventListener('click', async () => { try { save.disabled = true; await api(`/api/admin-access/google-accounts/${account.id}`, { method:'PUT', body:JSON.stringify({ role:role.value, status:status.value }) }); setMessage(t('권한을 저장했습니다.','Access saved.')); await loadAccounts(); } catch (error) { setMessage(error.message, true); } finally { save.disabled = false; } });
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
  try { button.disabled = true; await api('/api/admin-access/google-accounts', { method:'POST', body:JSON.stringify({ email:String(data.get('email')).trim().toLowerCase(), role:String(data.get('role') || 'operator') }) }); form.reset(); fillRoles(form.elements.role); setMessage(t('관리자를 등록했습니다.','Administrator added.')); await loadAccounts(); }
  catch (error) { setMessage(error.message, true); } finally { button.disabled = false; }
}
function applyLocale() { updateLocaleControl(); applyMenuLabels(); translateAdminPanel(); }
async function install() {
  installLocaleControl(); ensureExternalMenuItems(); applyMenuLabels();
  if (!token()) return;
  try {
    const session = await api('/api/session');
    if (session.role === 'super_admin') { ensureAdminNav(); ensureAdminPanel(); applyMenuLabels(); }
    else document.querySelector('.sidebar nav .nav[data-section="admins"]')?.remove();
  } catch {}
}

saveLocale(locale);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true }); else install();
window.addEventListener('ekodi-admin-ready', install);
window.addEventListener('ekodi-nav-changed', applyMenuLabels);
window.addEventListener('ekodi-feature-installed', applyMenuLabels);
window.EKODIAdminMenu = Object.freeze({ locale: () => locale, setLocale: value => { saveLocale(value); applyLocale(); }, label: id => getAdminMenuLabel(id, locale), refreshAdminAccess: loadAccounts });
