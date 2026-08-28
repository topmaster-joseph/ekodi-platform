import { adminMenuOrder, getAdminMenuItem, getAdminMenuLabel, normalizeAdminLocale } from './admin-menu-registry.js';

const LOCALE_KEY = 'ekodi-admin-locale';
const LOCALE_COOKIE = 'ekodi_admin_locale';
const mounted = new WeakMap();

export function adminSidebarSectionOf(item) {
  if (item?.dataset?.adminGatewaySection) return String(item.dataset.adminGatewaySection).trim();
  if (item?.dataset?.deviceControlNav === 'true') return 'devices';
  const raw = String(item?.dataset?.section || item?.dataset?.lazySection || '').trim();
  return raw === 'marketing' ? 'marketing-ai' : raw;
}

export function readAdminSidebarLocale() {
  try {
    const cookie = document.cookie
      .split(';')
      .map(value => value.trim())
      .find(value => value.startsWith(`${LOCALE_COOKIE}=`));
    if (cookie) return normalizeAdminLocale(decodeURIComponent(cookie.split('=').slice(1).join('=')));
    return normalizeAdminLocale(localStorage.getItem(LOCALE_KEY) || document.documentElement.lang || navigator.language);
  } catch {
    return 'ko';
  }
}

function navItems(nav) {
  return nav?.querySelectorAll('.nav[data-section], .nav[data-lazy-section], .nav[data-device-control-nav]') || [];
}

function ensureLabel(item) {
  let span = item.querySelector('span');
  if (!span) {
    span = document.createElement('span');
    item.append(span);
  }
  return span;
}

export function createAdminSidebarItem(id, locale = readAdminSidebarLocale()) {
  const definition = getAdminMenuItem(id);
  if (!definition || definition.internal) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nav';
  button.dataset.section = definition.id;
  button.append(document.createTextNode(`${definition.icon || '·'} `));
  const label = document.createElement('span');
  label.textContent = getAdminMenuLabel(definition.id, locale);
  button.append(label);
  button.dataset.adminSidebarShared = 'true';
  return button;
}

export function renderAdminSidebar(nav, { locale = readAdminSidebarLocale(), ids = adminMenuOrder() } = {}) {
  if (!nav) return [];
  const items = ids.map(id => createAdminSidebarItem(id, locale)).filter(Boolean);
  nav.replaceChildren(...items);
  nav.dataset.adminSidebarShared = 'true';
  return items;
}

export function syncAdminSidebar(root = document, options = {}) {
  const nav = root.querySelector?.('.sidebar nav') || (root.matches?.('.sidebar nav') ? root : null);
  if (!nav) return false;
  const locale = normalizeAdminLocale(options.locale || options.localeProvider?.() || window.EKODIAdminMenu?.locale?.() || readAdminSidebarLocale());
  const order = adminMenuOrder();
  const rank = new Map(order.map((id, index) => [id, index + 1]));
  let unknownRank = 500;

  for (const item of navItems(nav)) {
    const id = adminSidebarSectionOf(item);
    const definition = getAdminMenuItem(id);
    if (!definition) continue;
    const label = ensureLabel(item);
    const canonical = getAdminMenuLabel(id, locale);
    if (label.textContent !== canonical) label.textContent = canonical;
    item.dataset.adminSidebarShared = 'true';
    const menuRank = definition.internal ? 9999 : (rank.get(id) ?? unknownRank++);
    if (item.style.order !== String(menuRank)) item.style.order = String(menuRank);
    item.dataset.menuOrder = String(menuRank);
  }

  nav.dataset.adminSidebarShared = 'true';
  nav.dataset.adminSidebarLocale = locale;

  const active = [...navItems(nav)].find(item => item.classList.contains('active'));
  const activeId = adminSidebarSectionOf(active);
  const titleId = activeId === 'sites' ? 'campus' : activeId;
  const title = root.querySelector?.('#pageTitle');
  if (title && titleId && getAdminMenuItem(titleId)) {
    const canonicalTitle = getAdminMenuLabel(titleId, locale);
    if (title.textContent !== canonicalTitle) title.textContent = canonicalTitle;
  }
  return true;
}

export function mountAdminSidebar(root = document, options = {}) {
  const nav = root.querySelector?.('.sidebar nav');
  if (!nav) return null;
  const existing = mounted.get(nav);
  if (existing) { existing.sync(); return existing; }

  let queued = false;
  const sync = () => syncAdminSidebar(root, options);
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; sync(); });
  };
  const eventNames = ['ekodi-nav-changed', 'ekodi-feature-installed', 'ekodi-admin-section-changed', 'ekodi-admin-locale-changed'];
  for (const name of eventNames) window.addEventListener(name, schedule);

  const api = Object.freeze({
    sync,
    locale: () => normalizeAdminLocale(options.locale || options.localeProvider?.() || window.EKODIAdminMenu?.locale?.() || readAdminSidebarLocale()),
    order: () => adminMenuOrder(),
    destroy: () => {
      for (const name of eventNames) window.removeEventListener(name, schedule);
      mounted.delete(nav);
    }
  });
  mounted.set(nav, api);
  sync();
  return api;
}
if (typeof window !== 'undefined') {
  window.EKODIAdminSidebar = Object.freeze({
    mount: mountAdminSidebar,
    sync: syncAdminSidebar,
    render: renderAdminSidebar,
    createItem: createAdminSidebarItem,
    sectionOf: adminSidebarSectionOf,
    order: adminMenuOrder,
    locale: readAdminSidebarLocale
  });
}
