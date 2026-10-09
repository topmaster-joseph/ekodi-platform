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
// LEFT-NAV-AUTHORITY-006: visible Admin navigation is left-side direct work only.
const DETAILS_CLASS = 'admin-global-details';
const MORE_CLASS = 'admin-detail-more';
const MOBILE_NAV_CLASS = 'admin-mobile-primary-nav';
const DRAWER_SCRIM_CLASS = 'admin-mobile-drawer-scrim';
const MOBILE_PRIMARY_GROUPS = Object.freeze([
  { id:'summary', icon:'◉', ko:'홈', en:'Home' },
  { id:'sites', icon:'▦', ko:'사이트', en:'Sites' },
  { id:'services', icon:'◇', ko:'서비스', en:'Services' },
  { id:'status', icon:'↑', ko:'운영', en:'Ops' },
]);
const FLAT_DETAIL_GROUPS = new Set(['services']);
const PRIMARY_SECTIONS = Object.freeze({
  summary: ['platform-overview'],
  sites: ['sites-all', 'sites-business', 'sites-clients', 'sites-community', 'sites-core', 'sites-preparing'],
  people: ['users-access', 'admins', 'ai-membership'],
  services: ['engine-all', 'engine-core', 'engine-common', 'engine-operations', 'engine-professional', 'engine-ai', 'engine-integration', 'engine-preview'],
  content: ['work', 'communication', 'community', 'books', 'social'],
  finance: ['finance', 'api-cost'],
  status: ['health', 'site-health', 'architecture', 'maturity'],
  releases: ['deployments', 'aiops'],
  'devices-agent': ['devices', 'pos-agent'],
  'settings-records': ['public-site-controls', 'language-status', 'ai-settings', 'storage', 'ai-module-spec'],
  'security-audit': ['security', 'audit-records'],
});

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
body.admin-compact{--admin-readable:#172033;--admin-secondary:#66768a;--admin-border:#d9e2ec;--admin-soft:#f4f7fb;--admin-active:#eaf3ff}
/* Primary-nav safety is independent of the compact class so lazy feature hydration can never leak technical menu rows. */
.sidebar nav[data-ekodi-admin-nav-mode="primary"]{display:flex!important;flex-direction:column!important;gap:2px!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-width:thin}
.sidebar nav[data-ekodi-admin-nav-mode="primary"] > .nav{display:none!important}
.sidebar nav[data-ekodi-admin-nav-mode="primary"] > .admin-context-source{display:none!important}
.sidebar nav[data-ekodi-admin-nav-mode="primary"] > .admin-global-navs{display:grid!important}
body.admin-compact .sidebar nav{display:flex!important;flex-direction:column!important;gap:2px!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-width:thin}
body.admin-compact .sidebar nav[data-ekodi-admin-nav-mode="primary"] > .nav{display:none!important}
body.admin-compact .${GLOBAL_CLASS}{display:grid;gap:2px;margin:3px 0 6px}
body.admin-compact .admin-global-nav{display:flex;align-items:center;gap:7px;width:100%;min-height:34px;padding:4px 8px;border:1px solid transparent;border-radius:9px;background:transparent;color:#dbe8f6!important;font:inherit;font-size:14px;font-weight:780;line-height:1.25;text-align:left;cursor:pointer;box-shadow:none!important;transition:background .12s ease,border-color .12s ease!important;opacity:1!important}
body.admin-compact .admin-global-nav span{color:inherit!important;opacity:1!important}
body.admin-compact .admin-global-nav:hover{border-color:#274d73;background:#102c49;color:#fff!important}
body.admin-compact .admin-global-nav.active{border-color:#2d6fac;background:#174b7b;color:#fff!important}
body.admin-compact .admin-global-nav b{display:inline-grid;place-items:center;min-width:22px;color:#8fb5d6!important;font-size:13px;font-weight:850;letter-spacing:-.03em;opacity:1!important}
body.admin-compact .admin-global-nav.active b{color:#d9ecff!important}
body.admin-compact .${DETAILS_CLASS}{display:grid!important;gap:1px;margin:0 1px 3px 22px;padding:1px 0 2px 4px;border-left:1px solid #294b6b}
body.admin-compact .admin-detail-item{display:flex;align-items:center;gap:6px;width:100%;min-height:28px;margin:0;padding:3px 6px;border:1px solid transparent;border-radius:8px;background:transparent;color:#506174;font:inherit;font-size:12.5px;font-weight:700;line-height:1.12;text-align:left;cursor:pointer}
body.admin-compact .admin-detail-item:hover{border-color:#dbe7ef;background:#f2f7fb;color:#173b57}
body.admin-compact .admin-detail-item.active{border-color:#bfd5ee;background:#edf4ff;color:#0b5cab}
body.admin-compact .admin-detail-item b{display:inline-grid;place-items:center;min-width:19px;color:#6d8194;font-size:10px;font-weight:850}
body.admin-compact .admin-detail-item.active b{color:#155eef}
body.admin-compact .${DETAILS_CLASS}[data-admin-flat-details="true"]{margin:0 0 6px!important;padding:0!important;border-left:0!important;gap:2px!important}
body.admin-compact .${DETAILS_CLASS}[data-admin-flat-details="true"] .admin-detail-item{min-height:38px!important;padding:6px 10px!important;border-radius:9px!important;font-weight:720!important}
body.admin-compact .${DETAILS_CLASS}[data-admin-flat-details="true"] .admin-detail-item b{min-width:22px!important}
body.admin-compact .${MORE_CLASS}{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:28px;margin:1px 0 0;padding:3px 6px;border:0;border-radius:8px;background:transparent;color:#748294;font:inherit;font-size:12px;font-weight:760;cursor:pointer}
body.admin-compact .${MORE_CLASS}:hover{background:#f2f7fb;color:#173b57}
body.admin-compact .${MORE_CLASS} b{font-size:11px;font-weight:800}
body.admin-compact .${SOURCE_CLASS}{display:none!important}
body.admin-compact .content{padding:12px 16px 28px!important;max-width:1680px!important;margin:0 auto!important}
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
@media(max-width:760px){body.admin-compact .admin-global-navs{gap:2px;margin:3px 0 5px}body.admin-compact .admin-global-nav{min-height:38px;padding:6px 8px;font-size:13px}body.admin-compact .content{padding:8px 8px 20px!important}body.admin-compact #campusPanel .campus-toolbar{padding:13px!important}body.admin-compact #campusSiteGroups .campus-site-item{padding:11px!important}body.admin-compact #campusSiteGroups .campus-row-action{min-height:44px!important;font-size:14px!important}}
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

  // Retired visible chrome must not survive hydration or partial page replacement.
  nav.querySelector(':scope>.admin-command-entry')?.remove();

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
  main?.querySelector(':scope>.admin-context-tabs-shell')?.remove();
  return { globals, source };
}

function isPlatformSuperAdminSurface(){
  return /^\/admin(?:\/|$)/.test(String(window.location?.pathname||''));
}

function ensureMobilePrimaryNav(root=document){
  const doc=root?.nodeType===9?root:(root?.ownerDocument||document);
  let mobile=doc.querySelector(`.${MOBILE_NAV_CLASS}`);
  if(!mobile){
    mobile=doc.createElement('nav');
    mobile.className=MOBILE_NAV_CLASS;
    mobile.dataset.adminMobilePrimary='true';
    mobile.setAttribute('aria-label','모바일 관리자 핵심 메뉴');
    for(const item of MOBILE_PRIMARY_GROUPS){
      const button=doc.createElement('button');
      button.type='button';
      button.dataset.adminMobileGroup=item.id;
      const icon=doc.createElement('b');
      icon.setAttribute('aria-hidden','true');
      icon.textContent=item.icon;
      const label=doc.createElement('span');
      button.append(icon,label);
      mobile.append(button);
    }
    const more=doc.createElement('button');
    more.type='button';
    more.dataset.adminMobileMore='true';
    more.setAttribute('aria-expanded','false');
    const moreIcon=doc.createElement('b');
    moreIcon.setAttribute('aria-hidden','true');
    moreIcon.textContent='☰';
    const moreLabel=doc.createElement('span');
    more.append(moreIcon,moreLabel);
    mobile.append(more);
    doc.body?.append(mobile);
  }
  return mobile;
}

function ensureDrawerScrim(root=document){
  const doc=root?.nodeType===9?root:(root?.ownerDocument||document);
  let scrim=doc.querySelector(`.${DRAWER_SCRIM_CLASS}`);
  if(!scrim){
    scrim=doc.createElement('div');
    scrim.className=DRAWER_SCRIM_CLASS;
    scrim.dataset.adminDrawerScrim='true';
    scrim.setAttribute('aria-hidden','true');
    scrim.hidden=true;
    doc.body?.append(scrim);
  }
  return scrim;
}

function syncMobilePrimaryNav(nav,locale,group,drawerOpen=false){
  const mobile=ensureMobilePrimaryNav(nav?.ownerDocument||document);
  const primaryIds=new Set(MOBILE_PRIMARY_GROUPS.map(item=>item.id));
  for(const item of MOBILE_PRIMARY_GROUPS){
    const button=mobile.querySelector(`[data-admin-mobile-group="${item.id}"]`);
    if(!button)continue;
    const label=item[locale]||item.ko;
    const span=button.querySelector('span');
    if(span)span.textContent=label;
    button.setAttribute('aria-label',label);
    const selected=!drawerOpen&&group===item.id;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-current',selected?'page':'false');
  }
  const more=mobile.querySelector('[data-admin-mobile-more]');
  if(more){
    const label=locale==='en'?'More':'더보기';
    const span=more.querySelector('span');
    if(span)span.textContent=label;
    more.setAttribute('aria-label',locale==='en'?'Open all administrator menus':'전체 관리자 메뉴 열기');
    more.setAttribute('aria-expanded',drawerOpen?'true':'false');
    const selected=drawerOpen||(!primaryIds.has(group)&&group!=='home');
    more.classList.toggle('active',selected);
    more.setAttribute('aria-current',selected&&!drawerOpen?'page':'false');
  }
  return mobile;
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
  if (!details) {
    details = document.createElement('div');
    details.className = DETAILS_CLASS;
    details.setAttribute('aria-label', locale === 'en' ? 'Admin submenu' : '관리자 하위 메뉴');
  }
  const ids = availableIds(nav, group);
  const flatDetails = FLAT_DETAIL_GROUPS.has(group);
  const primaryOrder = PRIMARY_SECTIONS[group] || [];
  const primarySet = new Set(primaryOrder);
  const primary = primaryOrder.filter(id => ids.includes(id));
  const extras = ids.filter(id => !primarySet.has(id));
  const expanded = nav.dataset.adminMoreGroup === group || extras.includes(section);
  const shown = expanded ? ids : primary;
  const nodes = shown.map(id => {
    const definition = getAdminMenuItem(id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-detail-item';
    button.dataset.adminDetailSection = id;
    const icon = document.createElement('b');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = definition?.icon || '·';
    const text = document.createElement('span');
    text.textContent = getAdminMenuLabel(id, locale);
    button.append(icon, text);
    button.classList.toggle('active', id === section);
    return button;
  });
  if (extras.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = MORE_CLASS;
    more.dataset.adminDetailMore = group;
    const label = document.createElement('span');
    label.textContent = expanded
      ? (locale === 'en' ? 'Show less' : '간단히 보기')
      : (locale === 'en' ? `More (${extras.length})` : `더보기 ${extras.length}`);
    const mark = document.createElement('b');
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = expanded ? '⌃' : '⌄';
    more.append(label, mark);
    nodes.push(more);
  }
  details.dataset.adminDetailGroup = group;
  details.dataset.adminFlatDetails = flatDetails ? 'true' : 'false';
  details.replaceChildren(...nodes);
  details.hidden = nodes.length === 0;
  const active = [...globals.querySelectorAll('[data-admin-global-group]')].find(button => button.dataset.adminGlobalGroup === group);
  if (active) active.insertAdjacentElement('afterend', details);
  else globals.append(details);
}

function activeSection(nav) {
  const panelSection = window.EKODIAdminPanels?.current?.();
  if (panelSection === 'command-home') return 'command-home';
  const routed = window.EKODIAdminRoutes?.sectionFromLocation?.(window.location);
  if (routed && getAdminMenuItem(routed)) return routed;
  const active = [...navItems(nav)].find(item => item.classList.contains('active'));
  const activeId = adminSidebarSectionOf(active);
  if (activeId && getAdminMenuItem(activeId)) return activeId;
  if (panelSection && getAdminMenuItem(panelSection)) return panelSection;
  return getAdminMenuGroupDefault('summary');
}

function availableIds(nav, group) {
  const present = new Set([...navItems(nav)].map(adminSidebarSectionOf).filter(Boolean));
  const defaultSection = getAdminMenuGroupDefault(group);
  return adminMenuOrder().filter(id => {
    const definition = visibleDefinition(id);
    if (!definition || definition.group !== group) return false;
    if (definition.superAdminOnly && !present.has(id)) return false;
    return present.has(id) || id === defaultSection || Boolean(definition.delegateSection) || Boolean(document.querySelector(`[data-panel~="${id}"]`));
  });
}

function syncWorkbenchState(nav, locale, preferredSection = '') {
  const { globals } = ensureContainers(nav);
  globalButtons(globals, locale);
  const section = preferredSection || activeSection(nav);
  const activeGroup = getAdminMenuGroupForSection(section);
  const focusedGroup = String(nav.dataset.adminFocusedGroup || '').trim();
  const group = ADMIN_MENU_GROUPS.some(item => item.id === focusedGroup) ? focusedGroup : activeGroup;
  const displayedSection = group === activeGroup ? section : '';
  for (const button of globals.querySelectorAll('[data-admin-global-group]')) {
    const selected = button.dataset.adminGlobalGroup === group && (section !== 'command-home' || Boolean(focusedGroup));
    button.classList.toggle('active', selected);
    button.setAttribute('aria-current', selected ? 'page' : 'false');
    button.setAttribute('aria-expanded', selected ? 'true' : 'false');
  }
  if (isPlatformSuperAdminSurface()) renderSidebarDetails(nav, globals, group, displayedSection || section, locale);
  else globals.querySelector(`:scope>.${DETAILS_CLASS}`)?.remove();
  nav.dataset.adminGlobalGroup = group;
  nav.dataset.adminRoleNavigation = isPlatformSuperAdminSurface() ? 'platform-super-admin' : 'delegated-manager';
  syncMobilePrimaryNav(nav, locale, group, Boolean(nav.closest('.sidebar')?.classList.contains('open')));
}

function activateSection(nav, section) {
  if (!section) return false;
  const definition = getAdminMenuItem(section);
  const fallback = [...navItems(nav)].find(item => adminSidebarSectionOf(item) === section);
  if (definition?.delegateSection) {
    window.EKODIAdminPanels?.activate?.(section);
    return true;
  }
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
  const demandTarget = [...navItems(nav)].find(item => item.dataset.demandFeature === section);
  if (demandTarget && window.EKODIAdminDemand?.activate) {
    Promise.resolve(window.EKODIAdminDemand.activate(section)).then(() => {
      if (window.EKODIAdminPanels?.activate) {
        window.EKODIAdminPanels.activate(section);
        return;
      }
      const installed = [...navItems(nav)].find(item => adminSidebarSectionOf(item) === section && !item.hasAttribute('data-demand-feature'));
      installed?.click?.();
    }).catch(error => console.warn(`[EKODI Admin] visible navigation demand activation failed: ${section}`, error));
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
    item.target = definition.adminHandoff === true ? '_self' : '_blank';
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
  const previousVisibility = nav.style.getPropertyValue('visibility');
  const previousPriority = nav.style.getPropertyPriority('visibility');
  nav.dataset.adminSidebarHydrating = 'true';
  nav.style.setProperty('visibility', 'hidden', 'important');
  try {
    const items = ids.map(id => createAdminSidebarItem(id, locale)).filter(Boolean);
    nav.replaceChildren(...items);
    nav.dataset.adminSidebarShared = 'true';
    nav.dataset.adminMenuGovernance = 'role-projected-sidebar-v4';
    nav.dataset.ekodiAdminNavMode = 'primary';
    syncAdminSidebar(nav.ownerDocument || document, { locale });
    return items;
  } finally {
    delete nav.dataset.adminSidebarHydrating;
    if (previousVisibility) nav.style.setProperty('visibility', previousVisibility, previousPriority);
    else nav.style.removeProperty('visibility');
  }
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
  nav.dataset.adminMenuGovernance = 'role-projected-sidebar-v4';
  nav.dataset.ekodiAdminNavMode = 'primary';

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

  const sidebar = nav.closest('.sidebar');
  const menuButton = root.querySelector?.('#menuButton') || document.querySelector('#menuButton');
  const mobilePrimary = ensureMobilePrimaryNav(root);
  const drawerScrim = ensureDrawerScrim(root);
  const mobileMedia = window.matchMedia?.('(max-width:760px)');
  const setDrawerOpen = open => {
    const allowed=Boolean(open&&mobileMedia?.matches);
    sidebar?.classList.toggle('open',allowed);
    document.body?.classList.toggle('admin-mobile-drawer-open',allowed);
    if(drawerScrim){
      drawerScrim.hidden=!allowed;
      drawerScrim.setAttribute('aria-hidden',allowed?'false':'true');
    }
    menuButton?.setAttribute('aria-expanded',allowed?'true':'false');
    syncMobilePrimaryNav(nav, readAdminSidebarLocale(), nav.dataset.adminGlobalGroup||getAdminMenuGroupForSection(activeSection(nav)), allowed);
    return allowed;
  };
  const closeDrawer = () => setDrawerOpen(false);
  const toggleDrawer = event => {
    event?.preventDefault?.();
    if(!sidebar)return;
    setDrawerOpen(!sidebar.classList.contains('open'));
  };
  if(menuButton){
    if(!sidebar?.id)sidebar.id='ekodiAdminSidebar';
    menuButton.setAttribute('aria-controls',sidebar?.id||'ekodiAdminSidebar');
    menuButton.setAttribute('aria-expanded','false');
    menuButton.setAttribute('aria-label',readAdminSidebarLocale()==='en'?'Open administrator menu':'관리자 메뉴 열기');
    menuButton.addEventListener('click',toggleDrawer);
  }
  const mobilePrimaryClick = event => {
    const more=event.target.closest?.('[data-admin-mobile-more]');
    if(more){
      event.preventDefault();
      setDrawerOpen(!sidebar?.classList.contains('open'));
      return;
    }
    const button=event.target.closest?.('[data-admin-mobile-group]');
    if(!button)return;
    event.preventDefault();
    delete nav.dataset.adminFocusedGroup;
    activateSection(nav,getAdminMenuGroupDefault(button.dataset.adminMobileGroup));
    closeDrawer();
  };
  const scrimClick = () => closeDrawer();
  const escapeDrawer = event => { if(event.key==='Escape'&&sidebar?.classList.contains('open'))closeDrawer(); };
  const viewportChanged = () => { if(!mobileMedia?.matches)closeDrawer(); };
  mobilePrimary?.addEventListener('click',mobilePrimaryClick);
  drawerScrim?.addEventListener('click',scrimClick);
  window.addEventListener('keydown',escapeDrawer);
  mobileMedia?.addEventListener?.('change',viewportChanged);

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
    const more = event.target.closest('[data-admin-detail-more]');
    if (more) {
      event.preventDefault();
      const group = more.dataset.adminDetailMore || '';
      if (nav.dataset.adminMoreGroup === group) delete nav.dataset.adminMoreGroup;
      else nav.dataset.adminMoreGroup = group;
      schedule();
      return;
    }
    const detail = event.target.closest('[data-admin-detail-section]');
    if (detail) {
      event.preventDefault();
      delete nav.dataset.adminFocusedGroup;
      activateSection(nav, detail.dataset.adminDetailSection);
      closeDrawer();
      schedule();
      return;
    }
    const global = event.target.closest('[data-admin-global-group]');
    if (!global) return;
    event.preventDefault();
    const group = global.dataset.adminGlobalGroup || '';
    nav.dataset.adminFocusedGroup = group;
    const currentSection = activeSection(nav);
    if (currentSection === 'command-home' || getAdminMenuGroupForSection(currentSection) !== group) {
      const defaultSection = getAdminMenuGroupDefault(group);
      const defaultDefinition = getAdminMenuItem(defaultSection);
      if (defaultDefinition?.adminHandoff !== true) {
        // Demand-loaded panels may take several seconds to mount. Keep the
        // selected work area visible immediately; sectionChanged clears this
        // temporary focus only after the target panel actually activates.
        const activationAccepted = activateSection(nav, defaultSection);
        if (!activationAccepted) delete nav.dataset.adminFocusedGroup;
      }
    }
    closeDrawer();
    schedule();
  }, true);

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
      menuButton?.removeEventListener('click',toggleDrawer);
      mobilePrimary?.removeEventListener('click',mobilePrimaryClick);
      drawerScrim?.removeEventListener('click',scrimClick);
      window.removeEventListener('keydown',escapeDrawer);
      mobileMedia?.removeEventListener?.('change',viewportChanged);
      window.removeEventListener('ekodi-admin-section-changed', sectionChanged);
      closeDrawer();
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