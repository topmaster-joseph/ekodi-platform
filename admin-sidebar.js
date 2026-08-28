import {
  adminMenuGroups,
  adminMenuOrder,
  getAdminMenuGroupLabel,
  getAdminMenuItem,
  getAdminMenuLabel,
  normalizeAdminLocale,
} from './admin-menu-registry.js';

const LOCALE_KEY = 'ekodi-admin-locale';
const LOCALE_COOKIE = 'ekodi_admin_locale';
const mounted = new WeakMap();
const RETIRED_MENU_SECTIONS = new Set(['overview']);
const GROUP_LABEL_CLASS = 'admin-menu-group-label';

export function adminSidebarSectionOf(item) {
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
  return nav?.querySelectorAll('.nav') || [];
}

function ensureLabel(item) {
  let span = item.querySelector('span');
  if (!span) {
    span = document.createElement('span');
    item.append(span);
  }
  return span;
}

function visibleDefinition(id) {
  const definition = getAdminMenuItem(id);
  return definition && !definition.internal ? definition : null;
}

function pruneNonRegistryItems(nav) {
  let changed = false;
  for (const item of [...navItems(nav)]) {
    const id = adminSidebarSectionOf(item);
    const definition = visibleDefinition(id);
    if (!id || RETIRED_MENU_SECTIONS.has(id) || !definition) {
      item.remove();
      changed = true;
    }
  }
  return changed;
}

function menuRankMap() {
  return new Map(adminMenuOrder().map((id, index) => [id, (index + 1) * 10]));
}

function ensureGroupLabels(nav, locale, rank) {
  const present = new Map();
  for (const item of navItems(nav)) {
    const id = adminSidebarSectionOf(item);
    const definition = visibleDefinition(id);
    if (!definition?.group) continue;
    if (!present.has(definition.group)) present.set(definition.group, []);
    present.get(definition.group).push(item);
  }

  const existing = new Map(
    [...nav.querySelectorAll(`.${GROUP_LABEL_CLASS}[data-admin-menu-group]`)]
      .map(node => [node.dataset.adminMenuGroup, node]),
  );

  for (const groupId of adminMenuGroups()) {
    const items = present.get(groupId) || [];
    let label = existing.get(groupId);
    if (!items.length) {
      label?.remove();
      continue;
    }
    if (!label) {
      label = document.createElement('div');
      label.className = GROUP_LABEL_CLASS;
      label.dataset.adminMenuGroup = groupId;
      label.setAttribute('role', 'presentation');
      nav.append(label);
    }
    const text = getAdminMenuGroupLabel(groupId, locale);
    if (label.textContent !== text) label.textContent = text;
    const firstRank = Math.min(...items.map(item => rank.get(adminSidebarSectionOf(item)) || 9000));
    label.style.order = String(Math.max(0, firstRank - 1));
    existing.delete(groupId);
  }

  for (const label of existing.values()) label.remove();
}

export function createAdminSidebarItem(id, locale = readAdminSidebarLocale()) {
  const definition = visibleDefinition(id);
  if (!definition) return null;
  const item = definition.href ? document.createElement('a') : document.createElement('button');
  if (item.tagName === 'BUTTON') item.type = 'button';
  else {
    item.href = definition.href;
    item.target = '_blank';
    item.rel = 'noopener';
  }
  item.className = 'nav';
  item.dataset.section = definition.id;
  item.append(document.createTextNode(`${definition.icon || '·'} `));
  const label = document.createElement('span');
  label.textContent = getAdminMenuLabel(definition.id, locale);
  item.append(label);
  item.dataset.adminSidebarShared = 'true';
  return item;
}

export function renderAdminSidebar(nav, { locale = readAdminSidebarLocale(), ids = adminMenuOrder() } = {}) {
  if (!nav) return [];
  const items = ids.map(id => createAdminSidebarItem(id, locale)).filter(Boolean);
  nav.replaceChildren(...items);
  nav.dataset.adminSidebarShared = 'true';
  nav.dataset.adminMenuGovernance = 'registry-v2';
  syncAdminSidebar(nav.ownerDocument || document, { locale });
  return items;
}

export function syncAdminSidebar(root = document, options = {}) {
  const nav = root.querySelector?.('.sidebar nav') || (root.matches?.('.sidebar nav') ? root : null);
  if (!nav) return false;
  const locale = normalizeAdminLocale(options.locale || options.localeProvider?.() || window.EKODIAdminMenu?.locale?.() || readAdminSidebarLocale());
  const rank = menuRankMap();

  pruneNonRegistryItems(nav);

  for (const item of navItems(nav)) {
    const id = adminSidebarSectionOf(item);
    const definition = visibleDefinition(id);
    if (!definition) continue;
    const label = ensureLabel(item);
    const canonical = getAdminMenuLabel(id, locale);
    if (label.textContent !== canonical) label.textContent = canonical;
    item.dataset.adminSidebarShared = 'true';
    item.dataset.adminMenuGroup = definition.group || '';
    const menuRank = rank.get(id) ?? 9000;
    if (item.style.order !== String(menuRank)) item.style.order = String(menuRank);
    if (item.dataset.menuOrder !== String(menuRank)) item.dataset.menuOrder = String(menuRank);
  }

  ensureGroupLabels(nav, locale, rank);
  nav.dataset.adminSidebarShared = 'true';
  nav.dataset.adminSidebarLocale = locale;
  nav.dataset.adminMenuGovernance = 'registry-v2';

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
  if (existing) {
    existing.sync();
    return existing;
  }

  let queued = false;
  let syncing = false;
  const sync = () => {
    if (syncing) return;
    syncing = true;
    try { syncAdminSidebar(root, options); }
    finally { syncing = false; }
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      sync();
    });
  };

  const navObserver = new MutationObserver(schedule);
  navObserver.observe(nav, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'data-section', 'data-lazy-section', 'data-device-control-nav'],
  });

  const title = root.querySelector?.('#pageTitle');
  const titleObserver = title ? new MutationObserver(schedule) : null;
  titleObserver?.observe(title, { childList: true, subtree: true, characterData: true });

  nav.addEventListener('click', () => {
    schedule();
    setTimeout(sync, 0);
    requestAnimationFrame(sync);
  }, true);

  window.addEventListener('ekodi-nav-changed', schedule);
  window.addEventListener('ekodi-feature-installed', schedule);
  window.addEventListener('ekodi-admin-section-changed', schedule);

  const api = Object.freeze({
    sync,
    locale: () => normalizeAdminLocale(options.locale || options.localeProvider?.() || window.EKODIAdminMenu?.locale?.() || readAdminSidebarLocale()),
    order: () => adminMenuOrder(),
    destroy: () => {
      navObserver.disconnect();
      titleObserver?.disconnect();
      mounted.delete(nav);
    },
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
    locale: readAdminSidebarLocale,
  });
}
