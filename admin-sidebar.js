import {
  ADMIN_MENU_GROUPS,
  adminMenuOrder,
  getAdminMenuGroupDefault,
  getAdminMenuGroupForSection,
  getAdminMenuItem,
  getAdminMenuLabel,
  normalizeAdminLocale,
} from './admin-menu-registry.js';

const LOCALE_KEY = 'ekodi-admin-locale';
const LOCALE_COOKIE = 'ekodi_admin_locale';
const RECENT_KEY = 'ekodi-admin-recent-sections';
const FAVORITES_KEY = 'ekodi-admin-favorite-sections';
const mounted = new WeakMap();
const RETIRED_MENU_SECTIONS = new Set(['overview']);
const GLOBAL_CLASS = 'admin-global-navs';
const CONTEXT_CLASS = 'admin-context-nav';
const ASSIST_CLASS = 'admin-nav-assist';

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

function readList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter(id => getAdminMenuItem(id) && !getAdminMenuItem(id).internal) : [];
  } catch {
    return [];
  }
}

function saveRecent(section) {
  if (!section || !getAdminMenuItem(section)?.group) return;
  try {
    const next = [section, ...readList(RECENT_KEY).filter(id => id !== section)].slice(0, 4);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

function ensureStyle() {
  if (document.querySelector('#ekodi-admin-five-axis-style')) return;
  const style = document.createElement('style');
  style.id = 'ekodi-admin-five-axis-style';
  style.textContent = `body.compact-control-center .sidebar nav{display:flex!important;flex-direction:column!important;gap:0!important;overflow:visible!important}body.compact-control-center .${GLOBAL_CLASS}{display:grid;gap:3px;margin:2px 0 10px}body.compact-control-center .admin-global-nav{display:flex;align-items:center;gap:9px;width:100%;min-height:38px;padding:7px 9px;border:1px solid transparent;border-radius:9px;background:transparent;color:rgba(226,232,240,.78);font:inherit;font-size:13px;font-weight:760;text-align:left;cursor:pointer}body.compact-control-center .admin-global-nav:hover{background:rgba(148,163,184,.1);color:#fff}body.compact-control-center .admin-global-nav.active{border-color:rgba(96,165,250,.22);background:rgba(59,130,246,.16);color:#fff}body.compact-control-center .admin-global-nav b{display:inline-grid;place-items:center;min-width:21px;font-size:12px}body.compact-control-center .${CONTEXT_CLASS}{display:grid;gap:1px;padding:9px 0;border-top:1px solid rgba(148,163,184,.14);border-bottom:1px solid rgba(148,163,184,.14)}body.compact-control-center .${CONTEXT_CLASS}::before{content:attr(data-context-label);padding:2px 9px 6px;color:rgba(148,163,184,.68);font-size:9px;font-weight:850;letter-spacing:.1em;text-transform:uppercase}body.compact-control-center .${CONTEXT_CLASS}>.nav{min-height:31px!important;padding:5px 9px!important;margin:0!important;border-radius:8px!important;line-height:1.15!important;gap:8px!important}body.compact-control-center .${CONTEXT_CLASS}>.nav span{font-size:12px!important;line-height:1.2!important}body.compact-control-center .${ASSIST_CLASS}{display:grid;gap:7px;padding:10px 0 2px}body.compact-control-center .admin-assist-block{display:grid;gap:3px}body.compact-control-center .admin-assist-title{padding:0 9px;color:rgba(148,163,184,.62);font-size:9px;font-weight:800;letter-spacing:.08em}body.compact-control-center .admin-assist-links{display:flex;gap:4px;flex-wrap:wrap;padding:0 7px}body.compact-control-center .admin-assist-link{max-width:100%;padding:4px 7px;border:0;border-radius:7px;background:rgba(148,163,184,.08);color:rgba(226,232,240,.72);font-size:10px;line-height:1.2;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}body.compact-control-center .admin-assist-empty{padding:1px 9px;color:rgba(148,163,184,.42);font-size:9px}@media(max-width:760px){body.compact-control-center .admin-global-nav{min-height:42px;font-size:14px}body.compact-control-center .${CONTEXT_CLASS}>.nav{min-height:40px!important;font-size:13px!important}}`;
  document.head.append(style);
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

function ensureContainers(nav) {
  let globals = nav.querySelector(`:scope>.${GLOBAL_CLASS}`);
  if (!globals) {
    globals = document.createElement('div');
    globals.className = GLOBAL_CLASS;
    globals.setAttribute('aria-label', 'Admin global navigation');
    nav.prepend(globals);
  }
  let context = nav.querySelector(`:scope>.${CONTEXT_CLASS}`);
  if (!context) {
    context = document.createElement('div');
    context.className = CONTEXT_CLASS;
    globals.insertAdjacentElement('afterend', context);
  }
  let assist = nav.querySelector(`:scope>.${ASSIST_CLASS}`);
  if (!assist) {
    assist = document.createElement('div');
    assist.className = ASSIST_CLASS;
    context.insertAdjacentElement('afterend', assist);
  }
  for (const item of [...navItems(nav)]) if (item.parentElement !== context) context.append(item);
  return { globals, context, assist };
}

function globalButtons(globals, locale) {
  const existing = new Map([...globals.querySelectorAll('[data-admin-global-group]')].map(node => [node.dataset.adminGlobalGroup, node]));
  for (const group of ADMIN_MENU_GROUPS) {
    let button = existing.get(group.id);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'admin-global-nav';
      button.dataset.adminGlobalGroup = group.id;
      globals.append(button);
    }
    const label = group.labels?.[locale] || group.labels?.ko || group.id;
    button.innerHTML = `<b aria-hidden="true"></b><span></span>`;
    button.querySelector('b').textContent = group.icon || '·';
    button.querySelector('span').textContent = label;
    button.setAttribute('aria-label', label);
    existing.delete(group.id);
  }
  for (const button of existing.values()) button.remove();
}

function activeSection(nav) {
  const active = [...navItems(nav)].find(item => item.classList.contains('active') && !item.hidden);
  return adminSidebarSectionOf(active) || window.EKODIAdminPanels?.current?.() || 'campus';
}

function renderAssist(host, locale) {
  const blocks = [
    { key: RECENT_KEY, ko: '최근', en: 'Recent' },
    { key: FAVORITES_KEY, ko: '즐겨찾기', en: 'Favorites' },
  ];
  host.replaceChildren(...blocks.map(block => {
    const wrap = document.createElement('div');
    wrap.className = 'admin-assist-block';
    const title = document.createElement('div');
    title.className = 'admin-assist-title';
    title.textContent = locale === 'en' ? block.en : block.ko;
    const ids = readList(block.key);
    if (!ids.length) {
      const empty = document.createElement('div');
      empty.className = 'admin-assist-empty';
      empty.textContent = locale === 'en' ? 'None yet' : '아직 없음';
      wrap.append(title, empty);
      return wrap;
    }
    const links = document.createElement('div');
    links.className = 'admin-assist-links';
    for (const id of ids) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'admin-assist-link';
      button.dataset.adminQuickSection = id;
      button.textContent = getAdminMenuLabel(id, locale);
      links.append(button);
    }
    wrap.append(title, links);
    return wrap;
  }));
}

function syncAxisState(nav, locale, preferredSection = '') {
  const { globals, context, assist } = ensureContainers(nav);
  globalButtons(globals, locale);
  const section = preferredSection || activeSection(nav);
  const group = getAdminMenuGroupForSection(section);
  for (const button of globals.querySelectorAll('[data-admin-global-group]')) {
    const active = button.dataset.adminGlobalGroup === group;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  }
  const groupDef = ADMIN_MENU_GROUPS.find(item => item.id === group);
  context.dataset.contextLabel = locale === 'en' ? `${groupDef?.labels?.en || 'Context'} tools` : `${groupDef?.labels?.ko || '현재'} 도구`;
  for (const item of navItems(nav)) {
    const id = adminSidebarSectionOf(item);
    item.hidden = getAdminMenuGroupForSection(id) !== group;
    item.setAttribute('aria-hidden', item.hidden ? 'true' : 'false');
    if (item.hidden) item.tabIndex = -1;
    else item.removeAttribute('tabindex');
  }
  renderAssist(assist, locale);
  nav.dataset.adminGlobalGroup = group;
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
  nav.dataset.adminMenuGovernance = 'five-axis-v1';
  syncAdminSidebar(nav.ownerDocument || document, { locale });
  return items;
}

export function syncAdminSidebar(root = document, options = {}) {
  const nav = root.querySelector?.('.sidebar nav') || (root.matches?.('.sidebar nav') ? root : null);
  if (!nav) return false;
  ensureStyle();
  const locale = normalizeAdminLocale(options.locale || options.localeProvider?.() || window.EKODIAdminMenu?.locale?.() || readAdminSidebarLocale());
  const rank = menuRankMap();
  pruneNonRegistryItems(nav);
  const { context } = ensureContainers(nav);

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
    if (item.parentElement !== context) context.append(item);
  }

  syncAxisState(nav, locale);
  nav.dataset.adminSidebarShared = 'true';
  nav.dataset.adminSidebarLocale = locale;
  nav.dataset.adminMenuGovernance = 'five-axis-v1';

  const id = activeSection(nav);
  const title = root.querySelector?.('#pageTitle');
  if (title && id && getAdminMenuItem(id)) {
    const canonicalTitle = getAdminMenuLabel(id, locale);
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
    if (queued || syncing) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      sync();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(nav, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'data-section', 'data-lazy-section', 'data-device-control-nav'],
  });

  nav.addEventListener('click', event => {
    const global = event.target.closest('[data-admin-global-group]');
    if (global) {
      event.preventDefault();
      const target = getAdminMenuGroupDefault(global.dataset.adminGlobalGroup);
      saveRecent(target);
      syncAxisState(nav, readAdminSidebarLocale(), target);
      window.EKODIAdminPanels?.activate?.(target);
      schedule();
      return;
    }
    const quick = event.target.closest('[data-admin-quick-section]');
    if (quick) {
      event.preventDefault();
      const target = quick.dataset.adminQuickSection;
      saveRecent(target);
      syncAxisState(nav, readAdminSidebarLocale(), target);
      window.EKODIAdminPanels?.activate?.(target);
      schedule();
      return;
    }
    const item = event.target.closest('.nav');
    if (item) saveRecent(adminSidebarSectionOf(item));
    schedule();
    setTimeout(sync, 0);
    requestAnimationFrame(sync);
  }, true);

  window.addEventListener('ekodi-nav-changed', schedule);
  window.addEventListener('ekodi-feature-installed', schedule);
  window.addEventListener('ekodi-admin-section-changed', event => {
    const section = event.detail?.section || '';
    if (section) saveRecent(section);
    schedule();
  });

  const api = Object.freeze({
    sync,
    locale: () => normalizeAdminLocale(options.locale || options.localeProvider?.() || window.EKODIAdminMenu?.locale?.() || readAdminSidebarLocale()),
    order: () => adminMenuOrder(),
    destroy: () => {
      observer.disconnect();
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
