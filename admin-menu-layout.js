(async () => {
'use strict';
const [{ adminMenuOrder, getAdminMenuItem }, { mountAdminSidebar }] = await Promise.all([
  import('./admin-menu-registry.js'),
  import('./admin-sidebar.js'),
]);
const sidebar = document.querySelector('.sidebar');
const nav = sidebar?.querySelector('nav');
const content = document.querySelector('.content');
if (!sidebar || !nav || !content) return;
const INTERNAL_ONLY_SECTIONS = new Set(['services', 'deployments', 'policies']);
const INTERNAL_ONLY_HREFS = new Set(['/legacy#domains', '/legacy#activity']);
const VISIBLE_NAV_ORDER = Object.freeze(adminMenuOrder());
const VISIBLE_NAV_RANK = new Map(VISIBLE_NAV_ORDER.map((section, index) => [section, index + 1]));
const pairMap=value=>new Map(value.split(' ').map(pair=>pair.split(':')));
const HASH_SECTIONS = pairMap('#sites:sites #ai-ops:aiops #aiops:aiops #ai-module-spec:ai-module-spec #ai-membership:ai-membership #health:health #api-cost:api-cost #storage:storage #storige:storage #security:security #architecture:architecture #devices:devices #campus:campus #work:work #marketing-ai:marketing-ai #finance:finance #organization:organization #workspace:workspace #clients:clients #admins:admins #community:community #books:books #social:social #affiliates:affiliates #policies:policies #operations:overview #services:services #deployments:deployments #release:deployments');
const CANONICAL_HASH = pairMap('overview:#operations sites:#sites aiops:#ai-ops ai-module-spec:#ai-module-spec ai-membership:#ai-membership health:#health api-cost:#api-cost storage:#storage security:#security architecture:#architecture devices:#devices campus:#campus work:#work marketing-ai:#marketing-ai finance:#finance organization:#organization workspace:#workspace clients:#clients admins:#admins community:#community books:#books social:#social affiliates:#affiliates');
let requestedSection = '';
let sitesLoading = null;
function installCompactNavigationStyle() {
  if (document.querySelector('#ekodi-admin-menu-density')) return;
  const style = document.createElement('style');
  style.id = 'ekodi-admin-menu-density';
  style.textContent = `body.compact-control-center .side-caption{margin-bottom:10px!important}body.compact-control-center .sidebar nav{display:flex!important;flex-direction:column!important;gap:0!important;row-gap:0!important;overflow:visible!important;max-height:none!important;padding-right:0!important;flex:0 0 auto!important}body.compact-control-center .sidebar nav>.nav{min-height:30px!important;padding:4px 9px!important;margin:0!important;border-radius:8px!important;line-height:1.1!important;gap:9px!important}body.compact-control-center .sidebar nav>.nav span{font-size:12px!important;line-height:1.1!important}body.compact-control-center .side-bottom{padding-top:8px!important}`;
  document.head.append(style);
}
function sectionOf(item) {
  if (window.EKODIAdminSidebar?.sectionOf) return window.EKODIAdminSidebar.sectionOf(item);
  if (item?.dataset?.deviceControlNav === 'true') return 'devices';
  const raw = String(item?.dataset?.section || item?.dataset?.lazySection || '').trim();
  return raw === 'marketing' ? 'marketing-ai' : raw;
}
function panelTargets(panel) {
  return String(panel?.dataset?.panel || '').split(/\s+/).filter(Boolean);
}
function hasPanel(section) {
  return Boolean(section && Array.from(content.querySelectorAll('[data-panel]')).some(panel => panelTargets(panel).includes(section)));
}
function isInternalSection(section) {
  return INTERNAL_ONLY_SECTIONS.has(String(section || '').trim());
}
function isInternalNav(item) {
  const href = item?.getAttribute?.('href') || '';
  return isInternalSection(sectionOf(item)) || INTERNAL_ONLY_HREFS.has(href);
}
function allNavItems() {
  return nav.querySelectorAll('.nav[data-section], .nav[data-lazy-section], .nav[data-device-control-nav], a.nav[href]');
}
function applyStableNavigationOrder() {
  if (window.EKODIAdminSidebar?.sync) {
    window.EKODIAdminSidebar.sync(document);
    return;
  }
  let unknownRank = 500;
  for (const item of allNavItems()) {
    if (isInternalNav(item)) {
      item.style.order = '9999';
      continue;
    }
    const rank = VISIBLE_NAV_RANK.get(sectionOf(item)) ?? unknownRank++;
    if (item.style.order !== String(rank)) item.style.order = String(rank);
    if (item.dataset.menuOrder !== String(rank)) item.dataset.menuOrder = String(rank);
  }
  nav.dataset.stableMenuOrder = 'true';
}
function enforceInternalNavigationPolicy() {
  for (const item of allNavItems()) {
    if (!isInternalNav(item)) continue;
    if (!item.hidden) item.hidden = true;
    item.dataset.aiInternal = sectionOf(item) || item.getAttribute('href') || 'internal';
    if (item.getAttribute('aria-hidden') !== 'true') item.setAttribute('aria-hidden', 'true');
    if (item.tabIndex !== -1) item.tabIndex = -1;
    item.classList.remove('active');
  }
  applyStableNavigationOrder();
}
function navItemFor(section) {
  return Array.from(allNavItems()).find(item => sectionOf(item) === section && !isInternalNav(item)) || null;
}
function syncTitle(section) {
  const title = document.querySelector('#pageTitle');
  const item = navItemFor(section);
  const label = item?.querySelector('span')?.textContent?.trim() || item?.textContent?.trim();
  if (title && label && title.textContent !== label) title.textContent = label;
  window.dispatchEvent(new CustomEvent('ekodi-admin-section-changed', { detail: { section } }));
}
function activatePanel(section) {
  if (!section || !hasPanel(section)) return false;
  requestedSection = section;
  for (const panel of content.querySelectorAll('[data-panel]')) {
    const visible = panelTargets(panel).includes(section);
    panel.classList.toggle('hidden-panel', !visible);
    if (visible) panel.removeAttribute('hidden');
    else if (!panel.hidden) panel.hidden = true;
  }
  for (const item of allNavItems()) item.classList.toggle('active', !isInternalNav(item) && sectionOf(item) === section);
  const parentSection = getAdminMenuItem(section)?.mergedInto || '';
  if (parentSection) navItemFor(parentSection)?.classList.add('active');
  syncTitle(section);
  const hash = CANONICAL_HASH.get(section);
  if (hash && location.hash !== hash) history.replaceState(null, '', hash);
  if (section === 'architecture' && !window.EKODISystemMap) import('./system-health-admin.js').catch(console.error);
  sidebar.classList.remove('open');
  return true;
}
async function openSites() {
  requestedSection = 'sites';
  if (!sitesLoading) {
    sitesLoading = import('./homepage-admin.js')
      .then(module => {
        module.mountHomepageAdmin();
        window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail: { section: 'sites' } }));
        return module;
      })
      .catch(error => {
        sitesLoading = null;
        console.error(error);
        throw error;
      });
  }
  await sitesLoading;
  applyStableNavigationOrder();
  activatePanel('sites');
  navItemFor('campus')?.classList.add('active');
  syncTitle('campus');
}
function openDemand(section) {
  const selector = section === 'aiops'
    ? '[data-demand-feature="aiops"], [data-section="aiops"]'
    : `[data-demand-feature="${section}"], [data-lazy-section="${section}"], [data-section="${section}"]`;
  nav.querySelector(selector)?.click();
}
function routeInternalToAiOps() {
  requestedSection = 'aiops';
  if (location.hash !== '#ai-ops') history.replaceState(null, '', '#ai-ops');
  openDemand('aiops');
}
function explicitHashSection() {
  return HASH_SECTIONS.get(location.hash.toLowerCase()) || '';
}
function reconcileNavigation() {
  enforceInternalNavigationPolicy();
  if (!requestedSection) return;
  if (requestedSection === 'sites' && !hasPanel('sites')) openSites();
  else if (!activatePanel(requestedSection)) openDemand(requestedSection);
}
nav.addEventListener('click', event => {
  const item = event.target.closest('.nav[data-section], .nav[data-lazy-section], .nav[data-device-control-nav], a.nav[href]');
  if (!item) return;
  if (isInternalNav(item)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    routeInternalToAiOps();
    return;
  }
  const section = sectionOf(item);
  if (!section) return;
  if (section === 'sites') {
    event.preventDefault();
    event.stopImmediatePropagation();
    openSites();
    return;
  }
  requestedSection = section;
  queueMicrotask(() => activatePanel(section));
}, true);
content.addEventListener('click', event => {
  const control = event.target.closest('[data-campus-section]');
  if (!control || !isInternalSection(control.dataset.campusSection)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  routeInternalToAiOps();
}, true);
window.addEventListener('ekodi-nav-changed', reconcileNavigation);
window.addEventListener('ekodi-feature-installed', reconcileNavigation);
window.addEventListener('ekodi-admin-ready', () => {
  enforceInternalNavigationPolicy();
  const explicit = explicitHashSection();
  if (explicit && isInternalSection(explicit)) routeInternalToAiOps();
  else if (explicit === 'sites') openSites();
  else if (explicit) {
    requestedSection = explicit;
    if (!activatePanel(explicit)) openDemand(explicit);
  } else {
    requestedSection = 'campus';
    window.EKODIAdminDemand?.activate('campus');
  }
});
window.addEventListener('hashchange', () => {
  const explicit = explicitHashSection();
  if (!explicit) return;
  if (isInternalSection(explicit)) return routeInternalToAiOps();
  if (explicit === 'sites') return openSites();
  requestedSection = explicit;
  if (!activatePanel(explicit)) openDemand(explicit);
});
installCompactNavigationStyle();
mountAdminSidebar(document);
enforceInternalNavigationPolicy();
const initialHash = explicitHashSection();
if (initialHash && isInternalSection(initialHash)) routeInternalToAiOps();
else if (initialHash === 'sites') openSites();
else if (initialHash) requestedSection = initialHash;
else requestedSection = 'campus';
window.EKODIAdminPanels = Object.freeze({
  activate: section => {
    if (isInternalSection(section)) return routeInternalToAiOps();
    if (section === 'sites') return openSites();
    requestedSection = section;
    if (!activatePanel(section)) openDemand(section);
  },
  current: () => requestedSection,
  internalSections: Object.freeze([...INTERNAL_ONLY_SECTIONS]),
  visibleMenuOrder: VISIBLE_NAV_ORDER,
});
import('./admin-menu-runtime.js').catch(error => {
  console.error(error);
});
})();
