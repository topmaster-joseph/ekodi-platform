import {
  ADMIN_MENU_GROUPS,
  adminMenuOrder,
  adminMenusForGroup,
  getAdminMenuMenuLabel,
  getAdminMenuGroupDefault,
  getAdminMenuGroupForSection,
  getAdminMenuGroupLabel,
  getAdminMenuItem,
  getAdminMenuLabel,
  getAdminMenuForSection,
  isAdminRiskSection,
  normalizeAdminLocale,
  ADMIN_LAYOUT_MODEL,
} from './admin-menu-registry.js';

const LOCALE_KEY = 'ekodi-admin-locale';
const LOCALE_COOKIE = 'ekodi_admin_locale';
const mounted = new WeakMap();
const activationEpoch = new WeakMap();

function beginActivation(nav) {
  const next = (activationEpoch.get(nav) || 0) + 1;
  activationEpoch.set(nav, next);
  return next;
}

function isLatestActivation(nav, epoch) {
  return activationEpoch.get(nav) === epoch;
}
const RETIRED_MENU_SECTIONS = new Set(['overview']);
const GLOBAL_CLASS = 'admin-global-navs';
const SOURCE_CLASS = 'admin-context-source';
// LEFT-NAV-AUTHORITY-006: visible Admin navigation is left-side direct work only.
const DETAILS_CLASS = 'admin-global-details';
const MORE_CLASS = 'admin-detail-more';
const MOBILE_NAV_CLASS = 'admin-mobile-primary-nav';
const DRAWER_SCRIM_CLASS = 'admin-mobile-drawer-scrim';
const MOBILE_PRIMARY_GROUPS = Object.freeze([
  { id:'home', icon:'⌂', ko:'홈', en:'Home' },
  { id:'sites', icon:'▦', ko:'사이트', en:'Sites' },
  { id:'ai', icon:'AI', ko:'AI 운영', en:'AI Ops' },
  { id:'ops', icon:'◎', ko:'운영', en:'Ops' },
]);
// ADMIN-LAYOUT-3L-001 (owner decision 2026-10-25): the left navigation shows the
// 1차 group and its 2차 menus only. The active menu's 3차 detail routes render as a
// button strip at the top of the workspace (.admin-work-strip) and the selected
// detail's settings render below it. The retired .admin-context-tabs-shell stays
// retired; the strip is a different, registry-driven surface that never repeats a
// left-side entry (ADMIN-DIRECT-NAV-006).
const FLAT_DETAIL_GROUPS = new Set();
const TAB_CLASS = 'admin-detail-tab';
const STRIP_CLASS = 'admin-work-strip';
const STRIP_ITEM_CLASS = 'admin-work-strip-item';

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
body.admin-compact .${TAB_CLASS}{display:flex;align-items:center;gap:6px;width:calc(100% - 14px);min-height:28px;margin:0 0 0 14px;padding:3px 6px;border:1px solid transparent;border-radius:8px;background:transparent;color:#506174;font:inherit;font-size:12.5px;font-weight:600;line-height:1.2;text-align:left;cursor:pointer}
body.admin-compact .${TAB_CLASS}:hover{border-color:#dbe7ef;background:#f2f7fb;color:#173b57}
body.admin-compact .${TAB_CLASS}.active{border-color:#bfd5ee;background:#edf4ff;color:#0b5cab;font-weight:760}
body.admin-compact .${TAB_CLASS} b{display:inline-grid;place-items:center;min-width:12px;color:#8a9aab;font-size:10px}
body.admin-compact .admin-detail-item.open{font-weight:800}
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
body .${STRIP_CLASS}{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0;padding:10px 16px;border-bottom:1px solid #d9e2ec;background:#fff}
.${STRIP_CLASS}[hidden]{display:none!important}
.${STRIP_CLASS} .admin-work-strip-label{flex:0 0 auto;margin-right:4px;color:#66768a;font-size:13px;font-weight:700;white-space:nowrap;word-break:keep-all}
body .${STRIP_CLASS} .${STRIP_ITEM_CLASS}{display:inline-flex!important;flex:0 0 auto;align-items:center;gap:6px;width:auto!important;min-height:36px;margin:0!important;padding:6px 12px;border:1px solid #c9d6e3;border-radius:9px;background:#fff;color:#22374d;font:inherit;font-size:14px!important;font-weight:700!important;line-height:1.2;text-align:center;cursor:pointer;word-break:keep-all;white-space:nowrap}
.${STRIP_CLASS} .${STRIP_ITEM_CLASS}:hover{border-color:#8fb0d1;background:#f2f7fb}
body .${STRIP_CLASS} .${STRIP_ITEM_CLASS}.active{border:2px solid #155eef;padding:5px 11px;background:#edf4ff;color:#0b4fb3}
.${STRIP_CLASS} .${STRIP_ITEM_CLASS} small{color:#66768a;font-size:12px;font-weight:700}
.${STRIP_CLASS} .admin-work-strip-state{display:inline-block;width:8px;height:8px;border-radius:50%;background:#1f9d55}
.${STRIP_CLASS} .admin-work-strip-state[data-state="warn"]{background:#c98a00}.${STRIP_CLASS} .admin-work-strip-state[data-state="error"]{background:#d14343}.${STRIP_CLASS} .admin-work-strip-state[data-state="off"]{background:#9aa7b4}
.${STRIP_CLASS} .${STRIP_ITEM_CLASS} .risk{color:#a14a00;font-size:11px;font-weight:800}
.admin-risk-dialog{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(15,28,45,.45)}
.admin-risk-dialog>div{width:min(460px,100%);padding:20px;border-radius:14px;background:#fff;color:#172033;box-shadow:0 12px 40px rgba(0,0,0,.25)}
.admin-risk-dialog h2{margin:0 0 8px;font-size:18px}.admin-risk-dialog p{margin:0 0 6px;color:#44566b;font-size:14px;line-height:1.55;word-break:keep-all}
.admin-risk-dialog .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.admin-risk-dialog button{min-height:40px;padding:8px 14px;border:1px solid #c9d6e3;border-radius:9px;background:#fff;font:inherit;font-weight:700;cursor:pointer}
.admin-risk-dialog button[data-risk-confirm]{border-color:#b42318;background:#b42318;color:#fff}
.admin-risk-toast{position:fixed;right:16px;bottom:96px;z-index:2147482000;display:flex;align-items:center;gap:10px;max-width:min(520px,calc(100vw - 32px));padding:10px 12px;border-radius:12px;background:#172033;color:#fff;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.2)}
.admin-risk-toast button{min-height:34px;padding:4px 10px;border:1px solid #8fb5d6;border-radius:8px;background:transparent;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.admin-risk-history{display:grid;gap:6px;margin:0 0 12px;padding:10px 12px;border:1px solid #d9e2ec;border-radius:10px;background:#f8fafc;font-size:13px;color:#33475b}
.admin-risk-history[hidden]{display:none!important}
.admin-risk-history ol{margin:0;padding-left:18px}.admin-risk-history li{margin:2px 0;word-break:keep-all}
@media(max-width:760px){body .${STRIP_CLASS}{flex-wrap:nowrap;overflow-x:auto;padding:6px 8px;scrollbar-width:thin}body .${STRIP_CLASS} .${STRIP_ITEM_CLASS}{min-height:44px}body .${STRIP_CLASS} .admin-work-strip-label{display:none}}
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

function detailButton(id, label, className, active) {
  const definition = getAdminMenuItem(id);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.adminDetailSection = id;
  const icon = document.createElement('b');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = className === TAB_CLASS ? '·' : (definition?.icon || '·');
  const text = document.createElement('span');
  text.textContent = label;
  button.title = label;
  button.append(icon, text);
  button.classList.toggle('active', active);
  if (active) button.setAttribute('aria-current', 'page');
  return button;
}

// ADMIN-LEFT-FLAT-MENU-001 (owner decision 2026-10-27): the left shows every menu
// directly, without area captions. Choosing a menu puts its detail routes (or, for
// 사이트관리, the sites of a class) in the strip at the top right; choosing one of
// those opens it in the centre.
function renderGroupDetails(nav, globals, group, section, locale) {
  let details = globals.querySelector(`:scope>.${DETAILS_CLASS}[data-admin-detail-group="${group}"]`);
  if (!details) {
    details = document.createElement('div');
    details.className = DETAILS_CLASS;
    details.dataset.adminDetailGroup = group;
    details.setAttribute('aria-label', getAdminMenuGroupLabel(group, locale));
  }
  const ids = availableIds(nav, group);
  const available = new Set(ids);
  const covered = new Set();
  const nodes = [];
  let activeMenu = null;
  for (const menu of adminMenusForGroup(group)) {
    const tabs = menu.sections.filter(id => available.has(id));
    if (!tabs.length) continue;
    tabs.forEach(id => covered.add(id));
    const inMenu = tabs.includes(section);
    const target = inMenu ? section : tabs[0];
    const menuButton = detailButton(target, getAdminMenuMenuLabel(menu.id, locale), 'admin-detail-item', inMenu);
    menuButton.dataset.adminDetailMenu = menu.id;
    menuButton.classList.toggle('open', inMenu);
    if (menu.siteClass) menuButton.dataset.adminSiteClass = 'true';
    if (tabs.length > 1) menuButton.dataset.adminDetailCount = String(tabs.length);
    nodes.push(menuButton);
    if (inMenu) activeMenu = { menu, tabs };
  }
  for (const id of ids) {
    if (covered.has(id)) continue;
    nodes.push(detailButton(id, getAdminMenuLabel(id, locale), 'admin-detail-item', id === section));
  }
  details.dataset.adminFlatDetails = FLAT_DETAIL_GROUPS.has(group) ? 'true' : 'false';
  details.dataset.adminSiteClasses = group === 'sites' ? 'true' : 'false';
  details.dataset.adminMenuModel = 'flat-menu-top-detail-v5';
  details.dataset.adminLayoutModel = ADMIN_LAYOUT_MODEL;
  details.replaceChildren(...nodes);
  details.hidden = nodes.length === 0;
  const owner = [...globals.querySelectorAll('[data-admin-global-group]')].find(button => button.dataset.adminGlobalGroup === group);
  if (owner) owner.insertAdjacentElement('afterend', details);
  else globals.append(details);
  return activeMenu;
}

function renderSidebarDetails(nav, globals, group, section, locale) {
  let activeMenu = null;
  for (const area of ADMIN_MENU_GROUPS) {
    const menu = renderGroupDetails(nav, globals, area.id, area.id === group ? section : '', locale);
    if (area.id === group) activeMenu = menu;
  }
  renderDetailStrip(nav, activeMenu, section, locale);
}

// ── 3차 workspace strip ───────────────────────────────────────────────────
// One renderer for every admin area. Platform menus pass their registry
// detail routes; 사이트관리 passes the sites of the selected classification.
function workStripElement(doc = document) {
  const main = doc.querySelector('#app main') || doc.querySelector('main');
  if (!main) return null;
  let strip = main.querySelector(`:scope>.${STRIP_CLASS}`);
  if (!strip) {
    strip = doc.createElement('div');
    strip.className = STRIP_CLASS;
    strip.setAttribute('role', 'tablist');
    strip.hidden = true;
    const content = main.querySelector(':scope>.content');
    if (content) content.insertAdjacentElement('beforebegin', strip);
    else main.append(strip);
  }
  return strip;
}

export function renderAdminWorkStrip(items = [], { owner = 'menu', key = '', active = '', label = '', ariaLabel = '', onSelect = null, doc = document } = {}) {
  const strip = workStripElement(doc);
  if (!strip) return null;
  const list = Array.isArray(items) ? items.filter(item => item && item.id) : [];
  strip.dataset.adminStripOwner = owner;
  strip.dataset.adminStripKey = key;
  strip.setAttribute('aria-label', ariaLabel || label || '세부 메뉴');
  if (!list.length) {
    strip.replaceChildren();
    strip.hidden = true;
    return strip;
  }
  const nodes = [];
  if (label) {
    const caption = doc.createElement('span');
    caption.className = 'admin-work-strip-label';
    caption.textContent = label;
    nodes.push(caption);
  }
  for (const item of list) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `${STRIP_ITEM_CLASS}${item.className ? ` ${item.className}` : ''}`;
    button.setAttribute('role', 'tab');
    for (const [name, value] of Object.entries(item.dataset || {})) button.dataset[name] = value;
    button.dataset.adminStripItem = item.id;
    if (item.state) {
      const dot = doc.createElement('span');
      dot.className = 'admin-work-strip-state';
      dot.dataset.state = item.state;
      dot.setAttribute('aria-hidden', 'true');
      button.append(dot);
    }
    const text = doc.createElement('span');
    text.textContent = item.label || item.id;
    button.append(text);
    if (item.note) {
      const note = doc.createElement('small');
      note.textContent = item.note;
      button.append(note);
    }
    if (item.risk) {
      const risk = doc.createElement('span');
      risk.className = 'risk';
      risk.textContent = '주의';
      risk.title = '저장 전에 확인창이 열리고 변경 이력과 되돌리기가 남습니다.';
      button.append(risk);
    }
    const selected = item.id === active;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) button.setAttribute('aria-current', 'page');
    if (item.stateLabel) button.setAttribute('aria-label', `${item.label || item.id} · ${item.stateLabel}`);
    nodes.push(button);
  }
  strip.replaceChildren(...nodes);
  strip.hidden = false;
  strip.onclick = event => {
    const button = event.target.closest?.(`.${STRIP_ITEM_CLASS}`);
    if (!button || !strip.contains(button)) return;
    event.preventDefault();
    onSelect?.(button.dataset.adminStripItem, button);
  };
  return strip;
}

function renderDetailStrip(nav, activeMenu, section, locale) {
  const doc = nav.ownerDocument || document;
  const strip = workStripElement(doc);
  if (!strip) return;
  // 사이트관리 classifications hand the strip to the site manager, which lists the
  // sites of that class. Keep its content while the same classification is active.
  if (activeMenu?.menu?.siteClass) {
    if (strip.dataset.adminStripOwner === 'sites' && strip.dataset.adminStripKey === section) return;
    strip.dataset.adminStripOwner = 'sites';
    strip.dataset.adminStripKey = section;
    window.dispatchEvent(new CustomEvent('ekodi-admin-site-class-selected', { detail: { section, menu: activeMenu.menu.id } }));
    return;
  }
  const tabs = activeMenu?.tabs || [];
  if (tabs.length < 2) {
    renderAdminWorkStrip([], { owner: 'menu', key: section, doc });
    return;
  }
  renderAdminWorkStrip(tabs.map(id => ({
    id,
    label: getAdminMenuLabel(id, locale),
    className: TAB_CLASS,
    risk: isAdminRiskSection(id),
    dataset: { adminDetailSection: id },
  })), {
    owner: 'menu',
    key: activeMenu.menu.id,
    active: section,
    label: getAdminMenuMenuLabel(activeMenu.menu.id, locale),
    ariaLabel: locale === 'en' ? 'Detail menu' : '세부 메뉴',
    doc,
    onSelect: id => {
      delete nav.dataset.adminFocusedGroup;
      activateSection(nav, id);
      queueMicrotask(() => syncAdminSidebar(doc));
    },
  });
}

// ── ADMIN-RISK-GUARD-001 ──────────────────────────────────────────────────
// High-risk settings (registry risk:'high') are saved only after an explicit
// confirmation. Each save is recorded in this browser's change history and gets a
// one-step undo when the previous state was read from the same address with a
// compatible shape. Server-side authority, approvals and audit stay unchanged.
const RISK_HISTORY_KEY = 'ekodi-admin-risk-history';
const RISK_READ_ONLY_PATH = /\/(?:check|test|verify|preview|search|query|status|health|refresh|session|login|logout|token)(?:[/?#]|$)/i;
const riskSnapshots = new Map();
let riskGuardInstalled = false;

function riskSection() {
  const current = window.EKODIAdminPanels?.current?.();
  if (current && getAdminMenuItem(current)) return current;
  return window.EKODIAdminRoutes?.sectionFromLocation?.(window.location) || '';
}
function riskRequestUrl(input) {
  try { return new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, window.location.href); }
  catch { return null; }
}
function readRiskHistory() {
  try { const value = JSON.parse(localStorage.getItem(RISK_HISTORY_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function writeRiskHistory(entry) {
  const list = [entry, ...readRiskHistory()].slice(0, 50);
  try { localStorage.setItem(RISK_HISTORY_KEY, JSON.stringify(list)); } catch {}
  renderRiskHistory(entry.section);
  return list;
}
function parseJson(text) { try { return JSON.parse(text); } catch { return undefined; } }
export function undoBodyFor(snapshotText, bodyText) {
  const before = parseJson(snapshotText);
  const after = parseJson(bodyText);
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(after)) return null;
  const keys = Object.keys(after);
  if (!keys.length || !keys.every(key => Object.prototype.hasOwnProperty.call(before, key))) return null;
  return JSON.stringify(Object.fromEntries(keys.map(key => [key, before[key]])));
}
export function confirmAdminRiskChange({ title, lines = [], confirmLabel = '변경 저장', doc = document } = {}) {
  return new Promise(resolve => {
    const overlay = doc.createElement('div');
    overlay.className = 'admin-risk-dialog';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    const box = doc.createElement('div');
    const heading = doc.createElement('h2');
    heading.textContent = title || '중요 설정을 변경할까요?';
    box.append(heading);
    for (const line of lines) { const p = doc.createElement('p'); p.textContent = line; box.append(p); }
    const actions = doc.createElement('div');
    actions.className = 'actions';
    const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.textContent = '취소'; cancel.dataset.riskCancel = 'true';
    const ok = doc.createElement('button'); ok.type = 'button'; ok.textContent = confirmLabel; ok.dataset.riskConfirm = 'true';
    actions.append(cancel, ok); box.append(actions); overlay.append(box);
    const done = value => { overlay.remove(); doc.removeEventListener('keydown', onKey, true); resolve(value); };
    const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); done(false); } };
    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    overlay.addEventListener('click', event => { if (event.target === overlay) done(false); });
    doc.addEventListener('keydown', onKey, true);
    doc.body.append(overlay);
    cancel.focus();
  });
}
function showRiskToast(message, undo, doc = document) {
  doc.querySelector('.admin-risk-toast')?.remove();
  const toast = doc.createElement('div');
  toast.className = 'admin-risk-toast';
  toast.setAttribute('role', 'status');
  const text = doc.createElement('span'); text.textContent = message; toast.append(text);
  if (undo) {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = '되돌리기';
    button.addEventListener('click', () => { toast.remove(); undo(); });
    toast.append(button);
  }
  doc.body.append(toast);
  window.setTimeout(() => toast.remove(), undo ? 20000 : 6000);
}
function renderRiskHistory(section = riskSection(), doc = document) {
  if (!section || !isAdminRiskSection(section)) return;
  const panel = [...doc.querySelectorAll('.content [data-panel]')].find(node => !node.hidden && !node.classList.contains('hidden-panel') && String(node.dataset.panel || '').split(/\s+/).includes(section));
  if (!panel) return;
  const entries = readRiskHistory().filter(entry => entry.section === section).slice(0, 5);
  let box = panel.querySelector(':scope>.admin-risk-history');
  if (!entries.length) { if (box) box.hidden = true; return; }
  if (!box) { box = doc.createElement('details'); box.className = 'admin-risk-history'; panel.prepend(box); }
  box.hidden = false;
  const summary = doc.createElement('summary');
  summary.textContent = `이 메뉴의 변경 이력 ${entries.length}건 (이 브라우저 기록)`;
  const list = doc.createElement('ol');
  for (const entry of entries) {
    const li = doc.createElement('li');
    const when = new Date(entry.at).toLocaleString('ko-KR', { hour12: false });
    li.textContent = `${when} · ${entry.kind === 'undo' ? '되돌리기' : '변경'} · ${entry.method} ${entry.path} · ${entry.ok ? '완료' : `실패(${entry.status})`}`;
    list.append(li);
  }
  box.replaceChildren(summary, list);
}
export function installAdminRiskGuard(win = window) {
  if (riskGuardInstalled || typeof win.fetch !== 'function') return false;
  riskGuardInstalled = true;
  const original = win.fetch.bind(win);
  const guarded = async (input, init = {}) => {
    const url = riskRequestUrl(input);
    const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    const sameOriginApi = url && url.origin === win.location.origin && url.pathname.startsWith('/api/');
    const section = sameOriginApi ? riskSection() : '';
    if (!sameOriginApi || !isAdminRiskSection(section)) return original(input, init);
    const key = `${url.pathname}${url.search}`;
    if (method === 'GET') {
      const response = await original(input, init);
      if (response.ok && /json/i.test(response.headers.get('content-type') || '')) {
        response.clone().text().then(text => { if (text.length <= 200000) riskSnapshots.set(key, text); }).catch(() => {});
      }
      return response;
    }
    if (init?.ekodiRiskBypass === true || RISK_READ_ONLY_PATH.test(url.pathname)) return original(input, init);
    const label = getAdminMenuLabel(section, 'ko');
    const accepted = await confirmAdminRiskChange({
      title: `${label} 변경을 저장할까요?`,
      lines: [
        '결제·권한·보안·AI 정책·배포처럼 운영에 바로 영향을 주는 설정입니다.',
        `요청: ${method} ${url.pathname}`,
        '저장 후 변경 이력에 남고, 이전 상태를 알 수 있으면 되돌리기를 제공합니다.',
      ],
    });
    if (!accepted) throw new DOMException('관리자가 중요 설정 변경을 취소했습니다.', 'AbortError');
    const bodyText = typeof init?.body === 'string' ? init.body : '';
    const snapshot = riskSnapshots.get(key);
    const undoBody = ['PUT', 'PATCH'].includes(method) && snapshot && bodyText ? undoBodyFor(snapshot, bodyText) : null;
    const response = await original(input, init);
    const entry = { at: new Date().toISOString(), section, label, method, path: url.pathname, ok: response.ok, status: response.status, kind: 'change', undoAvailable: Boolean(undoBody && response.ok) };
    writeRiskHistory(entry);
    if (response.ok) {
      const undo = undoBody ? async () => {
        const sure = await confirmAdminRiskChange({ title: `${label} 변경을 되돌릴까요?`, lines: ['직전에 저장하기 전의 값으로 다시 저장합니다.'], confirmLabel: '되돌리기' });
        if (!sure) return;
        const headers = new Headers(init?.headers || {});
        headers.set('content-type', 'application/json');
        const result = await original(input, { ...init, headers, body: undoBody, ekodiRiskBypass: true }).catch(error => ({ ok: false, status: 0, error }));
        writeRiskHistory({ at: new Date().toISOString(), section, label, method, path: url.pathname, ok: Boolean(result.ok), status: result.status || 0, kind: 'undo', undoAvailable: false });
        showRiskToast(result.ok ? '이전 값으로 되돌렸습니다. 화면을 새로고침해 확인하세요.' : '되돌리기에 실패했습니다. 변경 이력을 확인하세요.');
      } : null;
      showRiskToast(undo ? `${label} 변경을 저장했습니다.` : `${label} 변경을 저장했습니다. 이 변경은 자동 되돌리기를 지원하지 않습니다.`, undo);
    }
    return response;
  };
  win.fetch = guarded;
  win.addEventListener('ekodi-admin-section-changed', () => queueMicrotask(() => renderRiskHistory()));
  win.EKODIAdminRiskGuard = Object.freeze({ version: '1.0.0', history: readRiskHistory, confirm: confirmAdminRiskChange });
  return true;
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
  return getAdminMenuGroupDefault('home');
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

function sidebarDetailsDrifted(nav) {
  if (!nav || !isPlatformSuperAdminSurface()) return false;
  const group = String(nav.dataset.adminFocusedGroup || nav.dataset.adminGlobalGroup || '').trim();
  if (!ADMIN_MENU_GROUPS.some(item => item.id === group)) return false;
  const globals = nav.querySelector(`:scope>.${GLOBAL_CLASS}`);
  const details = globals?.querySelector(`:scope>.${DETAILS_CLASS}`);
  const ids = availableIds(nav, group);
  const primaryOrder = PRIMARY_SECTIONS[group] || [];
  const primarySet = new Set(primaryOrder);
  const primary = primaryOrder.filter(id => ids.includes(id));
  const extras = ids.filter(id => !primarySet.has(id));
  const section = activeSection(nav);
  const expanded = nav.dataset.adminMoreGroup === group || extras.includes(section);
  const expected = expanded ? ids : primary;
  if (!expected.length) return false;
  if (!details || details.hidden || details.dataset.adminDetailGroup !== group) return true;
  const rendered = new Set([...details.querySelectorAll('[data-admin-detail-section]')]
    .map(node => node.dataset.adminDetailSection)
    .filter(Boolean));
  return expected.some(id => !rendered.has(id));
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
  else globals.querySelectorAll(`:scope>.${DETAILS_CLASS}`).forEach(node => node.remove());
  nav.dataset.adminGlobalGroup = group;
  nav.dataset.adminRoleNavigation = isPlatformSuperAdminSurface() ? 'platform-super-admin' : 'delegated-manager';
  syncMobilePrimaryNav(nav, locale, group, Boolean(nav.closest('.sidebar')?.classList.contains('open')));
}

function activateSection(nav, section) {
  if (!section) return false;
  const epoch = beginActivation(nav);
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
      // A newer submenu/work-area selection always wins. Never allow an
      // earlier lazy demand load (for example security) to overwrite a later
      // delegated selection (for example audit-records) after it finishes.
      if (!isLatestActivation(nav, epoch)) return;
      if (window.EKODIAdminPanels?.activate) {
        window.EKODIAdminPanels.activate(section);
        return;
      }
      const installed = [...navItems(nav)].find(item => adminSidebarSectionOf(item) === section && !item.hasAttribute('data-demand-feature'));
      if (!isLatestActivation(nav, epoch)) return;
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

  if (isPlatformSuperAdminSurface()) installAdminRiskGuard();
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

  const observer = new MutationObserver(mutations => {
    const directNavChanged = mutations.some(mutation => mutation.target === nav);
    const nestedDetailChanged = mutations.some(mutation =>
      mutation.type === 'childList'
      && mutation.target !== nav
      && Boolean(mutation.target.closest?.(`.${GLOBAL_CLASS}`))
    );
    if (directNavChanged || (nestedDetailChanged && sidebarDetailsDrifted(nav))) schedule();
  });
  observer.observe(nav, { childList: true, subtree: true });

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
    // Render the selected work area's real submenu immediately, before any
    // delegated/lazy panel activation can race with the sidebar state.
    syncWorkbenchState(nav, readAdminSidebarLocale(), currentSection);
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
    renderWorkStrip: renderAdminWorkStrip,
  };
  window.EKODIAdminWorkStrip = Object.freeze({ render: renderAdminWorkStrip });
}