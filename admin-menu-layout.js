window.EKODIAdminMenuLayoutReady = (async () => {
  'use strict';
  const [registry, sidebarModule, gatewayModule] = await Promise.all([
    import('./admin-menu-registry.js'),
    import('./admin-sidebar.js'),
    import('./admin-menu-gateway.js'),
  ]);
  const { adminMenuOrder, canonicalAdminHash, normalizeAdminSection, resolveAdminMenuLocation } = registry;
  const { mountAdminSidebar } = sidebarModule;
  const { mountAdminMenuGateway } = gatewayModule;
  const sidebar = document.querySelector('.sidebar');
  const nav = sidebar?.querySelector('nav');
  const content = document.querySelector('.content');
  if (!sidebar || !nav || !content) return null;

  const INTERNAL_ONLY_SECTIONS = new Set(['services', 'deployments', 'policies']);
  const INTERNAL_ONLY_HREFS = new Set(['/legacy#domains', '/legacy#activity']);
  const VISIBLE_NAV_ORDER = Object.freeze(adminMenuOrder());
  const VISIBLE_NAV_RANK = new Map(VISIBLE_NAV_ORDER.map((section, index) => [section, index + 1]));
  let requestedSection = '';
  let sitesLoading = null;
  let gateway = null;

  function installCompactNavigationStyle() {
    if (document.querySelector('#ekodi-admin-menu-density')) return;
    const style = document.createElement('style');
    style.id = 'ekodi-admin-menu-density';
    style.textContent = `body.compact-control-center .sidebar nav{display:flex!important;flex-direction:column!important;gap:0!important;row-gap:0!important;overflow:visible!important;max-height:none!important;padding-right:0!important;flex:0 0 auto!important}body.compact-control-center .sidebar nav>.nav{min-height:30px!important;padding:4px 9px!important;margin:0!important;border-radius:8px!important;line-height:1.1!important;gap:9px!important}body.compact-control-center .sidebar nav>.nav span{font-size:12px!important;line-height:1.1!important}body.compact-control-center .side-bottom{padding-top:8px!important}`;
    document.head.append(style);
  }
  function sectionOf(item) {
    if (window.EKODIAdminSidebar?.sectionOf) return normalizeAdminSection(window.EKODIAdminSidebar.sectionOf(item));
    if (item?.dataset?.adminGatewaySection) return normalizeAdminSection(item.dataset.adminGatewaySection);
    if (item?.dataset?.deviceControlNav === 'true') return 'devices';
    return normalizeAdminSection(item?.dataset?.section || item?.dataset?.lazySection || '');
  }

  function panelTargets(panel) {
    return String(panel?.dataset?.panel || '').split(/\s+/).map(normalizeAdminSection).filter(Boolean);
  }

  function hasPanel(section) {
    const id = normalizeAdminSection(section);
    return Boolean(id && [...content.querySelectorAll('[data-panel]')].some(panel => panelTargets(panel).includes(id)));
  }

  function isInternalSection(section) {
    return INTERNAL_ONLY_SECTIONS.has(normalizeAdminSection(section));
  }

  function isInternalNav(item) {
    const href = item?.getAttribute?.('href') || '';
    return isInternalSection(sectionOf(item)) || INTERNAL_ONLY_HREFS.has(href);
  }

  function allNavItems() {
    return nav.querySelectorAll('.nav[data-section], .nav[data-lazy-section], .nav[data-admin-gateway-section], .nav[data-device-control-nav], a.nav[href]');
  }

  function applyStableNavigationOrder() {
    if (window.EKODIAdminSidebar?.sync) return window.EKODIAdminSidebar.sync(document);
    let unknownRank = 500;
    for (const item of allNavItems()) {
      const rank = isInternalNav(item) ? 9999 : (VISIBLE_NAV_RANK.get(sectionOf(item)) ?? unknownRank++);
      item.style.order = String(rank);
      item.dataset.menuOrder = String(rank);
    }
    nav.dataset.stableMenuOrder = 'true';
  }
  function enforceInternalNavigationPolicy() {
    for (const item of allNavItems()) {
      if (!isInternalNav(item)) continue;
      item.hidden = true;
      item.dataset.aiInternal = sectionOf(item) || item.getAttribute('href') || 'internal';
      item.setAttribute('aria-hidden', 'true');
      item.tabIndex = -1;
      item.classList.remove('active');
    }
    applyStableNavigationOrder();
  }

  function navItemFor(section) {
    const id = normalizeAdminSection(section);
    return [...allNavItems()].find(item => sectionOf(item) === id && !isInternalNav(item)) || null;
  }

  function syncTitle(section) {
    const id = normalizeAdminSection(section);
    const title = document.querySelector('#pageTitle');
    const item = navItemFor(id);
    const label = item?.querySelector('span')?.textContent?.trim() || item?.textContent?.trim();
    if (title && label && title.textContent !== label) title.textContent = label;
    window.dispatchEvent(new CustomEvent('ekodi-admin-section-changed', { detail: { section: id } }));
  }

  function activatePanel(section) {
    const id = normalizeAdminSection(section);
    if (!id || !hasPanel(id)) return false;
    requestedSection = id;
    for (const panel of content.querySelectorAll('[data-panel]')) {
      const visible = panelTargets(panel).includes(id);
      panel.classList.toggle('hidden-panel', !visible);
      if (visible) panel.removeAttribute('hidden');
      else if (!panel.hidden) panel.hidden = true;
    }
    for (const item of allNavItems()) item.classList.toggle('active', !isInternalNav(item) && sectionOf(item) === id);
    syncTitle(id);
    if (id === 'architecture' && !window.EKODISystemMap) import('./system-health-admin.js').catch(console.error);
    sidebar.classList.remove('open');
    return true;
  }
  async function openSites() {
    requestedSection = 'campus';
    if (!sitesLoading) {
      sitesLoading = import('./homepage-admin.js')
        .then(module => {
          module.mountHomepageAdmin();
          window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail: { section: 'sites', gateway: true } }));
          return module;
        })
        .catch(error => {
          sitesLoading = null;
          throw error;
        });
    }
    await sitesLoading;
    applyStableNavigationOrder();
    const opened = activatePanel('sites');
    navItemFor('campus')?.classList.add('active');
    syncTitle('campus');
    return opened;
  }

  async function activateLocal(section, context = {}) {
    const id = normalizeAdminSection(section);
    if (isInternalSection(id)) return false;
    if (id === 'campus' && context.subservice === 'sites') return openSites();
    if (activatePanel(id)) return true;
    await Promise.resolve();
    return activatePanel(id);
  }

  function routeInternalToAiOps() {
    requestedSection = 'aiops';
    return gateway?.open('aiops', { source: 'internal-route' });
  }

  function reconcileNavigation() {
    enforceInternalNavigationPolicy();
    if (requestedSection && hasPanel(requestedSection)) activatePanel(requestedSection);
  }

  installCompactNavigationStyle();
  mountAdminSidebar(document);
  gateway = mountAdminMenuGateway(document, { activate: activateLocal });
  enforceInternalNavigationPolicy();
  nav.addEventListener('click', event => {
    const item = event.target.closest('.nav[data-section], .nav[data-lazy-section], .nav[data-admin-gateway-section], .nav[data-device-control-nav], a.nav[href]');
    if (!item) return;
    if (isInternalNav(item)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      routeInternalToAiOps();
      return;
    }
    const section = sectionOf(item);
    if (!section) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    gateway?.open(section, { source: 'sidebar' });
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
    const route = resolveAdminMenuLocation(location);
    if (route.section && isInternalSection(route.section)) {
      routeInternalToAiOps();
      return;
    }
    const section = route.section || 'campus';
    requestedSection = section;
    gateway?.open(section, { subservice: route.subservice, source: 'admin-ready', updateHistory: Boolean(route.section) });
  });

  window.EKODIAdminPanels = Object.freeze({
    activate: (section, options = {}) => {
      const id = normalizeAdminSection(section);
      if (isInternalSection(id)) return routeInternalToAiOps();
      requestedSection = id;
      return gateway?.open(id, { ...options, source: options.source || 'panels-api' });
    },
    activateLocal,
    current: () => requestedSection,
    internalSections: Object.freeze([...INTERNAL_ONLY_SECTIONS]),
    visibleMenuOrder: VISIBLE_NAV_ORDER,
    canonicalHash: section => canonicalAdminHash(section),
  });

  return Object.freeze({ gateway, activateLocal });
})();
