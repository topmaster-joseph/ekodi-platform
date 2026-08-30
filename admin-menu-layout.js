(async () => {
'use strict';
const [{ adminMenuOrder }, { mountAdminSidebar, renderAdminSidebar }] = await Promise.all([
  import('./admin-menu-registry.js'),
  import('./admin-sidebar.js'),
]);
const sidebar = document.querySelector('.sidebar');
const nav = sidebar?.querySelector('nav');
const content = document.querySelector('.content');
if (!sidebar || !nav || !content) return;
renderAdminSidebar(nav);
const INTERNAL_ONLY_SECTIONS = new Set(['services', 'deployments', 'policies']);
const INTERNAL_ONLY_HREFS = new Set();
const VISIBLE_NAV_ORDER = Object.freeze(adminMenuOrder());
const VISIBLE_NAV_RANK = new Map(VISIBLE_NAV_ORDER.map((section, index) => [section, index + 1]));
const DEMAND_KEYS = new Map([
  ['campus','campus'],['aiops','aiops'],['ai-module-spec','ai-module-spec'],['ai-membership','aimembers'],
  ['health','health'],['api-cost','api-cost'],['storage','storage'],['security','security'],['work','work'],
  ['clients','clients'],['community','community'],['books','books'],['social','social'],['affiliates','affiliates'],
  ['marketing-ai','marketing'],['devices','devices'],['life-ai','life-ai'],
]);
const pairMap=value=>new Map(value.split(' ').map(pair=>pair.split(':')));
const HASH_SECTIONS = pairMap('#sites:sites #ai-ops:aiops #aiops:aiops #ai-module-spec:ai-module-spec #ai-membership:ai-membership #health:health #api-cost:api-cost #storage:storage #storige:storage #security:security #architecture:architecture #devices:devices #campus:campus #work:work #marketing-ai:marketing-ai #finance:finance #organization:organization #workspace:workspace #clients:clients #admins:admins #community:community #books:books #social:social #affiliates:affiliates #policies:policies #services:services #deployments:deployments #release:deployments');
const CANONICAL_HASH = pairMap('sites:#sites aiops:#ai-ops ai-module-spec:#ai-module-spec ai-membership:#ai-membership health:#health api-cost:#api-cost storage:#storage security:#security architecture:#architecture devices:#devices campus:#campus work:#work marketing-ai:#marketing-ai finance:#finance organization:#organization workspace:#workspace clients:#clients admins:#admins community:#community books:#books social:#social affiliates:#affiliates');
let requestedSection = '';
let activeSectionState = '';
let sitesLoading = null;
const demandLoading = new Map();
function installCompactNavigationStyle() {
  if (document.querySelector('#ekodi-admin-menu-density')) return;
  const style = document.createElement('style');
  style.id = 'ekodi-admin-menu-density';
  style.textContent = `body.admin-compact .side-caption{margin-bottom:10px!important}body.admin-compact .sidebar nav{display:flex!important;flex-direction:column!important;gap:0!important;row-gap:0!important;overflow:visible!important;max-height:none!important;padding-right:0!important;flex:0 0 auto!important}body.admin-compact .sidebar nav>.nav{min-height:30px!important;padding:4px 9px!important;margin:0!important;border-radius:8px!important;line-height:1.1!important;gap:9px!important}body.admin-compact .sidebar nav>.nav span{font-size:12px!important;line-height:1.1!important}body.admin-compact .side-bottom{padding-top:8px!important}`;
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
  activeSectionState = section;
  for (const panel of content.querySelectorAll('[data-panel]')) {
    const visible = panelTargets(panel).includes(section);
    panel.classList.toggle('hidden-panel', !visible);
    if (visible) panel.removeAttribute('hidden');
    else if (!panel.hidden) panel.hidden = true;
  }
  for (const item of allNavItems()) item.classList.toggle('active', !isInternalNav(item) && sectionOf(item) === section);
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
function clickDemandFallback(section) {
  const selector = section === 'aiops'
    ? '[data-demand-feature="aiops"], [data-section="aiops"]'
    : `[data-demand-feature="${section}"], [data-lazy-section="${section}"], [data-section="${section}"]`;
  nav.querySelector(selector)?.click();
}
function requestDemand(section) {
  const demandKey = DEMAND_KEYS.get(section);
  if (!demandKey || !window.EKODIAdminDemand?.activate) {
    clickDemandFallback(section);
    return null;
  }
  if (demandLoading.has(section)) return demandLoading.get(section);
  const task = Promise.resolve(window.EKODIAdminDemand.activate(demandKey))
    .then(() => {
      applyStableNavigationOrder();
      if (!activatePanel(section)) {
        const real = navItemFor(section);
        if (real && !real.dataset.demandFeature) real.click();
        queueMicrotask(() => activatePanel(section));
      }
    })
    .catch(error => {
      console.error(`[EKODI Admin] ${section} demand activation failed`, error);
      clickDemandFallback(section);
    })
    .finally(() => demandLoading.delete(section));
  demandLoading.set(section, task);
  return task;
}
function routeInternalToAiOps() {
  requestedSection = 'aiops';
  if (location.hash !== '#ai-ops') history.replaceState(null, '', '#ai-ops');
  requestDemand('aiops');
}
function explicitHashSection() {
  return HASH_SECTIONS.get(location.hash.toLowerCase()) || '';
}
function reconcileNavigation() {
  enforceInternalNavigationPolicy();
  if (!requestedSection) return;
  if (requestedSection === 'sites' && !hasPanel('sites')) openSites();
  else if (!activatePanel(requestedSection)) requestDemand(requestedSection);
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
  queueMicrotask(() => {
    if (!activatePanel(section)) requestDemand(section);
  });
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
    if (!activatePanel(explicit)) requestDemand(explicit);
  } else {
    requestedSection = 'campus';
    requestDemand('campus');
  }
});
window.addEventListener('hashchange', () => {
  const explicit = explicitHashSection();
  if (!explicit) return;
  if (isInternalSection(explicit)) return routeInternalToAiOps();
  if (explicit === 'sites') return openSites();
  requestedSection = explicit;
  if (!activatePanel(explicit)) requestDemand(explicit);
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
    if (!activatePanel(section)) return requestDemand(section);
    return true;
  },
  current: () => activeSectionState || requestedSection,
  internalSections: Object.freeze([...INTERNAL_ONLY_SECTIONS]),
  visibleMenuOrder: VISIBLE_NAV_ORDER,
});
import('./admin-menu-runtime.js').catch(error => {
  console.error(error);
});
})();