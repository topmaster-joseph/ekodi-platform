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
const DETAILS_CLASS = 'admin-global-details';

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
body.admin-compact{--admin-readable:#172033;--admin-secondary:#66768a;--admin-border:#d9e2ec;--admin-soft:#f1f5f9;--admin-active:#edf4ff}
body.admin-compact .sidebar nav{display:flex!important;flex-direction:column!important;gap:2px!important;overflow-y:hidden!important;overflow-x:hidden!important;overscroll-behavior:none!important}
body.admin-compact .${GLOBAL_CLASS}{display:grid;gap:3px;margin:2px 0 8px}
body.admin-compact .admin-global-nav{display:flex;align-items:center;gap:9px;width:100%;min-height:42px;padding:8px 10px;border:1px solid transparent;border-radius:9px;background:transparent;color:#40566d!important;font:inherit;font-size:14px;font-weight:780;line-height:1.25;text-align:left;cursor:pointer;box-shadow:none!important;transition:none!important;opacity:1!important}
body.admin-compact .admin-global-nav span{color:inherit!important;opacity:1!important}
body.admin-compact .admin-global-nav:hover{border-color:#d5e6ef;background:#eef7fb;color:#123c58!important}
body.admin-compact .admin-global-nav.active{border-color:#b7d4f6;background:#edf4ff;color:#0b4f8a!important}
body.admin-compact .admin-global-nav b{display:inline-grid;place-items:center;min-width:22px;color:#52738a!important;font-size:12px;font-weight:850;letter-spacing:-.03em;opacity:1!important}
body.admin-compact .admin-global-nav.active b{color:#155eef!important}
body.admin-compact .${DETAILS_CLASS}{display:grid;gap:2px;margin:-1px 0 5px;padding:2px 3px 7px 30px;border-left:1px solid #e1e8ef}
body.admin-compact .admin-detail-item{display:flex;align-items:center;gap:8px;width:100%;min-height:34px;margin:0;padding:6px 8px;border:1px solid transparent;border-radius:8px;background:transparent;color:#506174;font:inherit;font-size:13px;font-weight:700;text-align:left;cursor:pointer}
body.admin-compact .admin-detail-item:hover{border-color:#dbe7ef;background:#f2f7fb;color:#173b57}
body.admin-compact .admin-detail-item.active{border-color:#bfd5ee;background:#edf4ff;color:#0b5cab}
body.admin-compact .admin-detail-item b{display:inline-grid;place-items:center;min-width:19px;color:#6d8194;font-size:10px;font-weight:850}
body.admin-compact .admin-detail-item.active b{color:#155eef}
body.admin-compact .${SOURCE_CLASS}{display:none!important}
body.admin-compact .${TABS_SHELL_CLASS}{position:sticky;top:0;z-index:35;display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 16px;border-bottom:1px solid var(--admin-border);background:rgba(255,255,255,.98);color:#172033;box-shadow:none!important;backdrop-filter:none!important}
body.admin-compact .admin-context-title{flex:0 0 auto;color:#66768a;font-size:13px;font-weight:820;letter-spacing:.01em;white-space:nowrap}
body.admin-compact .${TABS_CLASS}{display:flex;align-items:center;gap:5px;min-width:0;overflow-x:auto;scrollbar-width:none}
body.admin-compact .${TABS_CLASS}::-webkit-scrollbar{display:none}
body.admin-compact .admin-context-tab{flex:0 0 auto;min-height:40px;padding:0 12px;border:1px solid transparent;border-radius:9px;background:transparent;color:#405269;font:inherit;font-size:14px;font-weight:760;line-height:1.35;white-space:nowrap;cursor:pointer;box-shadow:none!important;transition:none!important}
body.admin-compact .admin-context-tab:hover{border-color:#d5e6ef;background:#f2f7fb;color:#173b57}
body.admin-compact .admin-context-tab.active{border-color:#bfd5ee;background:#edf4ff;color:#0b5cab}
body.admin-compact .admin-capability-shortcut{margin-left:auto;flex:0 0 auto;min-height:40px;padding:0 12px;border:1px solid #bfd5ee;border-radius:9px;background:#f3f8ff;color:#0b5cab;font:inherit;font-size:14px;font-weight:800;cursor:pointer}
body.admin-compact .content{padding:14px 16px 28px!important}
body.admin-compact .content .hero{margin-bottom:12px!important;padding:14px 16px!important;box-shadow:none!important;backdrop-filter:none!important}
body.admin-compact .content .section,body.admin-compact .content .module,body.admin-compact .content .architecture,body.admin-compact .content .arch-zone{box-shadow:none!important;backdrop-filter:none!important}
body.admin-compact .content button,body.admin-compact .content .btn{box-shadow:none!important;transition:none!important}
body.admin-compact .content p,body.admin-compact .content small,body.admin-compact .content .muted{color:var(--admin-secondary)}
body.admin-compact .content h1,body.admin-compact .content h2,body.admin-compact .content h3,body.admin-compact .content strong{color:var(--admin-readable)}
body.admin-compact #campusPanel .campus-toolbar{padding:15px 17px!important}
body.admin-compact #campusPanel .campus-toolbar h2{font-size:22px!important}
body.admin-compact #campusPanel .campus-toolbar p:not(.kicker){font-size:14px!important;line-height:1.55!important}
body.admin-compact #campusPanel .campus-toolbar-actions{gap:8px!important}
body.admin-compact #campusPanel .campus-toolbar-actions button,body.admin-compact #campusPanel .campus-toolbar-actions a{min-height:40px!important;padding:8px 12px!important;font-size:14px!important}
body.admin-compact #campusPanel .campus-table-wrap.campus-groups-wrap{padding:10px!important}
body.admin-compact #campusSiteGroups .campus-groups-grid{gap:10px!important}
body.admin-compact #campusSiteGroups .campus-group-card{border-radius:11px!important;box-shadow:none!important;backdrop-filter:none!important}
body.admin-compact #campusSiteGroups .campus-group-head{min-height:48px!important;padding:9px 12px!important;gap:8px!important}
body.admin-compact #campusSiteGroups .campus-group-head h3{font-size:17px!important;line-height:1.35!important}
body.admin-compact #campusSiteGroups .campus-group-head p{margin-top:3px!important;font-size:13px!important;line-height:1.45!important}
body.admin-compact #campusSiteGroups .campus-group-count{min-width:28px!important;height:28px!important;padding:0 8px!important;font-size:12px!important}
body.admin-compact #campusSiteGroups .campus-site-item{min-height:58px!important;padding:9px 12px!important;gap:9px 12px!important;box-shadow:none!important;backdrop-filter:none!important;transition:none!important}
body.admin-compact #campusSiteGroups .campus-site-identity{gap:7px!important}
body.admin-compact #campusSiteGroups .campus-site-identity strong{font-size:15px!important;line-height:1.4!important}
body.admin-compact #campusSiteGroups .campus-site-type,body.admin-compact #campusSiteGroups .campus-site-stage{min-height:24px!important;padding:4px 7px!important;font-size:12px!important}
body.admin-compact #campusSiteGroups .campus-site-domain{font-size:13px!important;line-height:1.4!important}
body.admin-compact #campusSiteGroups .campus-row-actions{gap:6px!important}
body.admin-compact #campusSiteGroups .campus-row-action{min-width:60px!important;min-height:38px!important;padding:7px 10px!important;border-radius:8px!important;font-size:13px!important}
body.admin-compact #campusSiteGroups .campus-row-action.primary{min-width:62px!important}
body.admin-compact #campusSiteGroups .campus-homepage-controls{padding:7px 9px!important;gap:7px 10px!important;border-radius:8px!important}
body.admin-compact #campusSiteGroups .campus-homepage-check,body.admin-compact #campusSiteGroups .campus-homepage-order,body.admin-compact #campusSiteGroups .campus-homepage-scope{font-size:12px!important}
body.admin-compact #campusSiteGroups .campus-homepage-check input{width:16px!important;height:16px!important}
body.admin-compact #campusSiteGroups .campus-homepage-order button{min-width:32px!important;width:32px!important;height:32px!important}
body.admin-compact #campusSiteGroups .campus-homepage-state b{font-size:12px!important}
body.admin-compact #campusSiteGroups .campus-homepage-state small{margin-top:2px!important;font-size:11px!important;line-height:1.4!important}
body.admin-compact #campusPanel .campus-homepage-notice{margin-bottom:9px!important;padding:9px 11px!important;border-radius:9px!important;gap:8px!important}
body.admin-compact #campusPanel .campus-homepage-notice>span{width:30px!important;height:30px!important;flex-basis:30px!important;font-size:14px!important}
body.admin-compact #campusPanel .campus-homepage-notice strong{font-size:13px!important}body.admin-compact #campusPanel .campus-homepage-notice small{font-size:12px!important;line-height:1.45!important}
@media(max-width:1480px){body.admin-compact #campusSiteGroups .campus-groups-grid{grid-template-columns:minmax(0,1fr)!important}}
@media(max-width:760px){body.admin-compact .admin-global-nav{min-height:46px;font-size:15px}body.admin-compact .${TABS_SHELL_CLASS}{top:0;min-height:52px;padding:6px 10px;gap:7px}body.admin-compact .admin-context-title{display:none}body.admin-compact .admin-context-tab{min-height:42px;padding:0 10px;font-size:15px}body.admin-compact .admin-capability-shortcut{min-height:42px;font-size:15px}body.admin-compact .content{padding:10px 10px 24px!important}body.admin-compact #campusPanel .campus-toolbar{padding:13px!important}body.admin-compact #campusSiteGroups .campus-site-item{padding:11px!important}body.admin-compact #campusSiteGroups .campus-row-action{min-height:44px!important;font-size:14px!important}}
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

function renderSidebarDetails(nav, globals, group, section, locale) {
  let details = globals.querySelector(`:scope>.${DETAILS_CLASS}`);
  if (!details) { details = document.createElement('div'); details.className = DETAILS_CLASS; details.setAttribute('aria-label', locale === 'en' ? 'Admin submenu' : '관리자 하위 메뉴'); }
  const ids = availableIds(nav, group);
  const nodes = ids.map(id => {
    const definition = getAdminMenuItem(id); const button = document.createElement('button'); button.type = 'button'; button.className = 'admin-detail-item'; button.dataset.adminDetailSection = id;
    const icon = document.createElement('b'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = definition?.icon || '·'; const text = document.createElement('span'); text.textContent = getAdminMenuLabel(id, locale);
    button.append(icon, text); button.classList.toggle('active', id === section); return button;
  });
  details.dataset.adminDetailGroup = group; details.replaceChildren(...nodes); details.hidden = nodes.length === 0;
  const active = [...globals.querySelectorAll('[data-admin-global-group]')].find(button => button.dataset.adminGlobalGroup === group); if (active) active.insertAdjacentElement('afterend', details); else globals.append(details);
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
  const signature = `${locale}|${group}|${ids.join(',')}`;
  if (tabs.dataset.renderSignature !== signature) {
    tabs.dataset.renderSignature = signature;
    const nodes = ids.map(id => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'admin-context-tab';
      button.dataset.adminContextSection = id; button.setAttribute('role', 'tab');
      button.textContent = getAdminMenuLabel(id, locale); return button;
    });
    tabs.replaceChildren(...nodes);
  }
  for (const button of tabs.querySelectorAll('[data-admin-context-section]')) {
    const selected = button.dataset.adminContextSection === section;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
}

function syncWorkbenchState(nav, locale, preferredSection = '') {
  const { globals, shell } = ensureContainers(nav);
  globalButtons(globals, locale);
  if (shell && !shell.querySelector('[data-admin-capability-shortcut]')) {
    const shortcut = document.createElement('button');
    shortcut.type = 'button';
    shortcut.className = 'admin-capability-shortcut';
    shortcut.dataset.adminCapabilityShortcut = 'true';
    shortcut.textContent = locale === 'en' ? '⚡ Capabilities' : '⚡ 기능';
    shortcut.addEventListener('click', () => activateSection(nav, 'capabilities'));
    shell.append(shortcut);
  }
  const section = preferredSection || activeSection(nav);
  const activeGroup = getAdminMenuGroupForSection(section);
  const focusedGroup = String(nav.dataset.adminFocusedGroup || '').trim();
  const group = ADMIN_MENU_GROUPS.some(item => item.id === focusedGroup) ? focusedGroup : activeGroup;
  const displayedSection = group === activeGroup ? section : '';
  for (const button of globals.querySelectorAll('[data-admin-global-group]')) {
    const selected = button.dataset.adminGlobalGroup === group;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-current', selected ? 'page' : 'false');
    button.setAttribute('aria-expanded', selected ? 'true' : 'false');
  }
  renderContextTabs(nav, shell, group, displayedSection, locale);
  renderSidebarDetails(nav, globals, group, displayedSection, locale);
  nav.dataset.adminGlobalGroup = group;
}

function activateSection(nav, section) {
  if (!section) return false;
  const definition = getAdminMenuItem(section);
  const fallback = [...navItems(nav)].find(item => adminSidebarSectionOf(item) === section);
  if (definition?.href && definition.adminHandoff !== true) {
    const destination = new URL(definition.href, window.location.origin);
    if (destination.protocol !== 'https:') return false;
    window.open(destination.href, '_blank', 'noopener');
    return true;
  }
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
    const detail = event.target.closest('[data-admin-detail-section]');
    if (detail) { event.preventDefault(); delete nav.dataset.adminFocusedGroup; activateSection(nav, detail.dataset.adminDetailSection); schedule(); return; }
    const global = event.target.closest('[data-admin-global-group]');
    if (!global) return;
    event.preventDefault();
    nav.dataset.adminFocusedGroup = global.dataset.adminGlobalGroup || '';
    schedule();
  }, true);

  // Post-auth runtime may replace <main>. Delegate contextual-tab clicks from the
  // stable mount root so newly rendered tab strips never lose navigation handlers.
  const contextClick = event => {
    const tab = event.target.closest?.('[data-admin-context-section]');
    if (!tab) return;
    event.preventDefault();
    if (tab.dataset.adminContextSection === 'openai') {
      const source = activeSection(nav);
      if (source && source !== 'openai') try { sessionStorage.setItem('ekodi-openai-source-section', source); } catch {}
    }
    delete nav.dataset.adminFocusedGroup;
    activateSection(nav, tab.dataset.adminContextSection);
    schedule();
  };
  root.addEventListener?.('click', contextClick, true);

  window.addEventListener('ekodi-nav-changed', schedule);
  window.addEventListener('ekodi-feature-installed', schedule);
  const sectionChanged = () => { delete nav.dataset.adminFocusedGroup; schedule(); };
  window.addEventListener('ekodi-admin-section-changed', sectionChanged);

  const api = Object.freeze({
    sync,
    locale: () => normalizeAdminLocale(options.locale || options.localeProvider?.() || window.EKODIAdminMenu?.locale?.() || readAdminSidebarLocale()),
    order: () => adminMenuOrder(),
    destroy: () => {
      observer.disconnect();
      root.removeEventListener?.('click', contextClick, true);
      window.removeEventListener('ekodi-admin-section-changed', sectionChanged);
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