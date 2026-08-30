import {
  ADMIN_MENU_GROUPS,
  adminMenuOrder,
  getAdminMenuGroupDefault,
  getAdminMenuGroupForSection,
  getAdminMenuGroupLabel,
  getAdminMenuItem,
  getAdminMenuLabel,
  normalizeAdminLocale,
} from './admin-menu-registry.js';

const LOCALE_KEY = 'ekodi-admin-locale';
const LOCALE_COOKIE = 'ekodi_admin_locale';
const mounted = new WeakMap();
const RETIRED_MENU_SECTIONS = new Set(['overview']);
const GLOBAL_CLASS = 'admin-global-navs';
const SOURCE_CLASS = 'admin-context-source';
const TABS_SHELL_CLASS = 'admin-context-tabs-shell';
const TABS_CLASS = 'admin-context-tabs';

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

function visibleDefinition(id) {
  const definition = getAdminMenuItem(id);
  return definition && !definition.internal ? definition : null;
}

function menuRankMap() {
  return new Map(adminMenuOrder().map((id, index) => [id, (index + 1) * 10]));
}

function ensureStyle() {
  if (document.querySelector('#ekodi-admin-workbench-tabs-style')) return;
  const style = document.createElement('style');
  style.id = 'ekodi-admin-workbench-tabs-style';
  style.textContent = `
body.admin-compact{--admin-readable:#f4f8fc;--admin-secondary:#aebed0;--admin-border:rgba(148,163,184,.18);--admin-soft:rgba(148,163,184,.07);--admin-active:rgba(56,189,248,.13)}
body.admin-compact .sidebar nav{display:flex!important;flex-direction:column!important;gap:2px!important;overflow-y:auto!important;overflow-x:hidden!important}
body.admin-compact .${GLOBAL_CLASS}{display:grid;gap:3px;margin:2px 0 8px}
body.admin-compact .admin-global-nav{display:flex;align-items:center;gap:9px;width:100%;min-height:40px;padding:8px 10px;border:1px solid transparent;border-radius:9px;background:transparent;color:#40566d!important;font:inherit;font-size:14px;font-weight:780;line-height:1.25;text-align:left;cursor:pointer;box-shadow:none!important;transition:none!important;opacity:1!important}
body.admin-compact .admin-global-nav span{color:inherit!important;opacity:1!important}
body.admin-compact .admin-global-nav:hover{border-color:#d5e6ef;background:#eef7fb;color:#123c58!important}
body.admin-compact .admin-global-nav.active{border-color:#a8d7e9;background:#dff3fb;color:#07344f!important}
body.admin-compact .admin-global-nav b{display:inline-grid;place-items:center;min-width:22px;color:#52738a!important;font-size:12px;font-weight:850;letter-spacing:-.03em;opacity:1!important}
body.admin-compact .admin-global-nav.active b{color:#0876a8!important}
body.admin-compact .${SOURCE_CLASS}{display:none!important}
body.admin-compact .${TABS_SHELL_CLASS}{position:sticky;top:0;z-index:35;display:flex;align-items:center;gap:12px;min-height:50px;padding:7px 16px;border-bottom:1px solid var(--admin-border);background:rgba(7,21,34,.97);box-shadow:none!important;backdrop-filter:none!important}
body.admin-compact .admin-context-title{flex:0 0 auto;color:#b9c9d7;font-size:11px;font-weight:820;letter-spacing:.02em;white-space:nowrap}
body.admin-compact .${TABS_CLASS}{display:flex;align-items:center;gap:3px;min-width:0;overflow-x:auto;scrollbar-width:none}
body.admin-compact .${TABS_CLASS}::-webkit-scrollbar{display:none}
body.admin-compact .admin-context-tab{flex:0 0 auto;min-height:34px;padding:0 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:#c6d4df;font:inherit;font-size:13px;font-weight:760;white-space:nowrap;cursor:pointer;box-shadow:none!important;transition:none!important}
body.admin-compact .admin-context-tab:hover{background:var(--admin-soft);color:#fff}
body.admin-compact .admin-context-tab.active{border-color:rgba(56,189,248,.28);background:rgba(56,189,248,.16);color:#fff}
body.admin-compact .content{padding:14px 16px 28px!important}
body.admin-compact .content .hero{margin-bottom:12px!important;padding:14px 16px!important;box-shadow:none!important;backdrop-filter:none!important}
body.admin-compact .content .section,body.admin-compact .content .module,body.admin-compact .content .architecture,body.admin-compact .content .arch-zone{box-shadow:none!important;backdrop-filter:none!important}
body.admin-compact .content button,body.admin-compact .content .btn{box-shadow:none!important;transition:none!important}
body.admin-compact .content p,body.admin-compact .content small,body.admin-compact .content .muted{color:var(--admin-secondary)}
body.admin-compact .content h1,body.admin-compact .content h2,body.admin-compact .content h3,body.admin-compact .content strong{color:var(--admin-readable)}
body.admin-compact #campusPanel .campus-toolbar{padding:13px 15px!important}
body.admin-compact #campusPanel .campus-toolbar h2{font-size:20px!important}
body.admin-compact #campusPanel .campus-toolbar p:not(.kicker){font-size:12px!important;line-height:1.45!important}
body.admin-compact #campusPanel .campus-toolbar-actions{gap:6px!important}
body.admin-compact #campusPanel .campus-toolbar-actions button,body.admin-compact #campusPanel .campus-toolbar-actions a{min-height:34px!important;padding:7px 10px!important;font-size:12px!important}
body.admin-compact #campusPanel .campus-table-wrap.campus-groups-wrap{padding:10px!important}
body.admin-compact #campusSiteGroups .campus-groups-grid{gap:10px!important}
body.admin-compact #campusSiteGroups .campus-group-card{border-radius:11px!important;box-shadow:none!important;backdrop-filter:none!important}
body.admin-compact #campusSiteGroups .campus-group-head{min-height:48px!important;padding:9px 12px!important;gap:8px!important}
body.admin-compact #campusSiteGroups .campus-group-head h3{font-size:15px!important;line-height:1.25!important}
body.admin-compact #campusSiteGroups .campus-group-head p{margin-top:2px!important;font-size:11px!important;line-height:1.3!important}
body.admin-compact #campusSiteGroups .campus-group-count{min-width:26px!important;height:26px!important;padding:0 7px!important}
body.admin-compact #campusSiteGroups .campus-site-item{min-height:52px!important;padding:7px 10px!important;gap:7px 10px!important;box-shadow:none!important;backdrop-filter:none!important;transition:none!important}
body.admin-compact #campusSiteGroups .campus-site-identity{gap:6px!important}
body.admin-compact #campusSiteGroups .campus-site-identity strong{font-size:13px!important;line-height:1.3!important}
body.admin-compact #campusSiteGroups .campus-site-type,body.admin-compact #campusSiteGroups .campus-site-stage{min-height:21px!important;padding:3px 6px!important;font-size:10px!important}
body.admin-compact #campusSiteGroups .campus-site-domain{font-size:11px!important;line-height:1.3!important}
body.admin-compact #campusSiteGroups .campus-row-actions{gap:4px!important}
body.admin-compact #campusSiteGroups .campus-row-action{min-width:54px!important;min-height:32px!important;padding:6px 8px!important;border-radius:7px!important;font-size:11px!important}
body.admin-compact #campusSiteGroups .campus-row-action.primary{min-width:56px!important}
body.admin-compact #campusSiteGroups .campus-homepage-controls{padding:5px 7px!important;gap:5px 8px!important;border-radius:7px!important}
body.admin-compact #campusSiteGroups .campus-homepage-check,body.admin-compact #campusSiteGroups .campus-homepage-order,body.admin-compact #campusSiteGroups .campus-homepage-scope{font-size:10px!important}
body.admin-compact #campusSiteGroups .campus-homepage-check input{width:15px!important;height:15px!important}
body.admin-compact #campusSiteGroups .campus-homepage-order button{min-width:28px!important;width:28px!important;height:28px!important}
body.admin-compact #campusSiteGroups .campus-homepage-state b{font-size:10px!important}
body.admin-compact #campusSiteGroups .campus-homepage-state small{margin-top:1px!important;font-size:9px!important;line-height:1.25!important}
body.admin-compact #campusPanel .campus-homepage-notice{margin-bottom:9px!important;padding:9px 11px!important;border-radius:9px!important;gap:8px!important}
body.admin-compact #campusPanel .campus-homepage-notice>span{width:30px!important;height:30px!important;flex-basis:30px!important;font-size:14px!important}
body.admin-compact #campusPanel .campus-homepage-notice strong{font-size:11px!important}body.admin-compact #campusPanel .campus-homepage-notice small{font-size:10px!important;line-height:1.35!important}
@media(max-width:1480px){body.admin-compact #campusSiteGroups .campus-groups-grid{grid-template-columns:minmax(0,1fr)!important}}
@media(max-width:760px){body.admin-compact .admin-global-nav{min-height:42px;font-size:14px}body.admin-compact .${TABS_SHELL_CLASS}{top:0;min-height:46px;padding:6px 10px;gap:7px}body.admin-compact .admin-context-title{display:none}body.admin-compact .admin-context-tab{min-height:34px;padding:0 9px}body.admin-compact .content{padding:10px 10px 24px!important}body.admin-compact #campusPanel .campus-toolbar{padding:11px!important}body.admin-compact #campusSiteGroups .campus-site-item{padding:10px!important}body.admin-compact #campusSiteGroups .campus-row-action{min-height:40px!important;font-size:12px!important}}
`;
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

function ensureContainers(nav, root = document) {
  let globals = nav.querySelector(`:scope>.${GLOBAL_CLASS}`);
  if (!globals) {
    globals = document.createElement('div');
    globals.className = GLOBAL_CLASS;
    globals.setAttribute('aria-label', 'Admin work areas');
    nav.prepend(globals);
  }

  let source = nav.querySelector(`:scope>.${SOURCE_CLASS}`);
  if (!source) {
    source = document.createElement('div');
    source.className = SOURCE_CLASS;
    source.setAttribute('aria-hidden', 'true');
    nav.append(source);
  }

  for (const item of [...navItems(nav)]) if (item.parentElement !== source) source.append(item);
  for (const legacy of [...nav.querySelectorAll(':scope>.admin-context-nav,:scope>.admin-nav-assist')]) legacy.remove();

  const main = root.querySelector?.('#app main') || root.querySelector?.('main');
  let shell = main?.querySelector(`:scope>.${TABS_SHELL_CLASS}`) || null;
  if (main && !shell) {
    shell = document.createElement('div');
    shell.className = TABS_SHELL_CLASS;
    shell.dataset.adminContextHeader = 'true';
    const title = document.createElement('div');
    title.className = 'admin-context-title';
    const tabs = document.createElement('div');
    tabs.className = TABS_CLASS;
    tabs.setAttribute('role', 'tablist');
    shell.append(title, tabs);
    const topbar = main.querySelector(':scope>.topbar');
    if (topbar) topbar.insertAdjacentElement('afterend', shell);
    else main.prepend(shell);
  }
  return { globals, source, shell };
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
      const icon = document.createElement('b');
      icon.setAttribute('aria-hidden', 'true');
      const labelNode = document.createElement('span');
      button.append(icon, labelNode);
      globals.append(button);
    }
    const label = group.labels?.[locale] || group.labels?.ko || group.id;
    button.querySelector('b').textContent = group.icon || '·';
    button.querySelector('span').textContent = label;
    button.setAttribute('aria-label', label);
    existing.delete(group.id);
  }
  for (const button of existing.values()) button.remove();
}

function activeSection(nav) {
  const active = [...navItems(nav)].find(item => item.classList.contains('active'));
  const activeId = adminSidebarSectionOf(active);
  if (activeId && getAdminMenuItem(activeId)) return activeId;
  const panelSection = window.EKODIAdminPanels?.current?.();
  if (panelSection && getAdminMenuItem(panelSection)) return panelSection;
  return 'campus';
}

function availableIds(nav, group) {
  const present = new Set([...navItems(nav)].map(adminSidebarSectionOf).filter(Boolean));
  const defaultSection = getAdminMenuGroupDefault(group);
  return adminMenuOrder().filter(id => {
    const definition = visibleDefinition(id);
    if (!definition || definition.group !== group) return false;
    if (definition.superAdminOnly && !present.has(id)) return false;
    return present.has(id) || id === defaultSection || Boolean(document.querySelector(`[data-panel~="${id}"]`));
  });
}

function renderContextTabs(nav, shell, group, section, locale) {
  if (!shell) return;
  const title = shell.querySelector('.admin-context-title');
  const tabs = shell.querySelector(`.${TABS_CLASS}`);
  if (!tabs) return;
  if (title) title.textContent = getAdminMenuGroupLabel(group, locale);
  const ids = availableIds(nav, group);
  const signature = `${locale}|${group}|${section}|${ids.join(',')}`;
  if (tabs.dataset.renderSignature === signature) return;
  tabs.dataset.renderSignature = signature;
  const nodes = ids.map(id => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-context-tab';
    button.dataset.adminContextSection = id;
    button.setAttribute('role', 'tab');
    const selected = id === section;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    button.textContent = getAdminMenuLabel(id, locale);
    return button;
  });
  tabs.replaceChildren(...nodes);
}

function syncWorkbenchState(nav, locale, preferredSection = '') {
  const { globals, shell } = ensureContainers(nav);
  globalButtons(globals, locale);
  const section = preferredSection || activeSection(nav);
  const group = getAdminMenuGroupForSection(section);
  for (const button of globals.querySelectorAll('[data-admin-global-group]')) {
    const selected = button.dataset.adminGlobalGroup === group;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-current', selected ? 'page' : 'false');
  }
  renderContextTabs(nav, shell, group, section, locale);
  nav.dataset.adminGlobalGroup = group;
}

function activateSection(nav, section) {
  if (!section) return false;
  const definition = getAdminMenuItem(section);
  const fallback = [...navItems(nav)].find(item => adminSidebarSectionOf(item) === section);
  if (definition?.href && fallback) {
    fallback.click();
    return true;
  }
  if (window.EKODIAdminPanels?.activate) {
    window.EKODIAdminPanels.activate(section);
    return true;
  }
  if (fallback?.click) {
    fallback.click();
    return true;
  }
  return false;
}

export function createAdminSidebarItem(id, locale = readAdminSidebarLocale()) {
  const definition = visibleDefinition(id);
  if (!definition) return null;
  const item = definition.href ? document.createElement('a') : document.createElement('button');
  if (item.tagName === 'BUTTON') item.type = 'button';
  else {
    item.href = definition.href;
    item.target = '_self';
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
  nav.dataset.adminMenuGovernance = 'workbench-tabs-v2';
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
  const { source } = ensureContainers(nav, root);

  for (const item of navItems(nav)) {
    const id = adminSidebarSectionOf(item);
    const definition = visibleDefinition(id);
    if (!definition) continue;
    const canonical = getAdminMenuLabel(id, locale);
    const label = ensureLabel(item);
    if (label.textContent !== canonical) label.textContent = canonical;
    item.dataset.adminSidebarShared = 'true';
    item.dataset.adminMenuGroup = definition.group || '';
    const menuRank = rank.get(id) ?? 9000;
    item.style.order = String(menuRank);
    item.dataset.menuOrder = String(menuRank);
    if (item.parentElement !== source) source.append(item);
  }

  syncWorkbenchState(nav, locale);
  nav.dataset.adminSidebarShared = 'true';
  nav.dataset.adminSidebarLocale = locale;
  nav.dataset.adminMenuGovernance = 'workbench-tabs-v2';

  const id = activeSection(nav);
  const title = root.querySelector?.('#pageTitle');
  if (title && id && getAdminMenuItem(id)) title.textContent = getAdminMenuLabel(id, locale);
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
  observer.observe(nav, { childList: true, subtree: false });

  nav.addEventListener('click', event => {
    const global = event.target.closest('[data-admin-global-group]');
    if (!global) return;
    event.preventDefault();
    activateSection(nav, getAdminMenuGroupDefault(global.dataset.adminGlobalGroup));
    schedule();
  }, true);

  const main = root.querySelector?.('#app main') || root.querySelector?.('main');
  main?.addEventListener('click', event => {
    const tab = event.target.closest('[data-admin-context-section]');
    if (!tab) return;
    event.preventDefault();
    activateSection(nav, tab.dataset.adminContextSection);
    schedule();
  }, true);

  window.addEventListener('ekodi-nav-changed', schedule);
  window.addEventListener('ekodi-feature-installed', schedule);
  window.addEventListener('ekodi-admin-section-changed', schedule);

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
  window.EKODIAdminSidebar = {
    mount: mountAdminSidebar,
    render: renderAdminSidebar,
    sync: syncAdminSidebar,
    createItem: createAdminSidebarItem,
    sectionOf: adminSidebarSectionOf,
    readLocale: readAdminSidebarLocale,
  };
}