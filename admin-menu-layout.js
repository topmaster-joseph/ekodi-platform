(() => {
  'use strict';

  const sidebar = document.querySelector('.sidebar');
  const nav = sidebar?.querySelector('nav');
  const content = document.querySelector('.content');
  if (!sidebar || !nav || !content) return;

  const INTERNAL_ONLY_SECTIONS = new Set(['overview', 'services', 'deployments', 'policies']);
  const INTERNAL_ONLY_HREFS = new Set(['/legacy#domains', '/legacy#activity']);
  const VISIBLE_NAV_ORDER = Object.freeze([
    'campus', 'aiops', 'health', 'security', 'marketing-ai', 'work', 'clients', 'admins', 'community', 'books',
    'finance', 'communication', 'social', 'workspace', 'devices', 'organization', 'affiliates',
  ]);
  const VISIBLE_NAV_RANK = new Map(VISIBLE_NAV_ORDER.map((section, index) => [section, index + 1]));
  const HASH_SECTIONS = new Map([
    ['#ai-ops', 'aiops'], ['#health', 'health'], ['#security', 'security'], ['#devices', 'devices'], ['#campus', 'campus'],
    ['#policies', 'policies'], ['#operations', 'overview'], ['#services', 'services'], ['#deployments', 'deployments'],
  ]);
  const CANONICAL_HASH = new Map([['aiops', '#ai-ops'], ['health', '#health'], ['security', '#security'], ['devices', '#devices'], ['campus', '#campus']]);

  let requestedSection = '';

  function installCompactNavigationStyle() {
    if (document.querySelector('#ekodi-admin-menu-density')) return;
    const style = document.createElement('style');
    style.id = 'ekodi-admin-menu-density';
    style.textContent = `body.compact-control-center .side-caption{margin-bottom:10px!important}body.compact-control-center .sidebar nav{display:flex!important;flex-direction:column!important;gap:0!important;row-gap:0!important;overflow:visible!important;max-height:none!important;padding-right:0!important;flex:0 0 auto!important}body.compact-control-center .sidebar nav>.nav{min-height:30px!important;padding:4px 9px!important;margin:0!important;border-radius:8px!important;line-height:1.1!important;gap:9px!important}body.compact-control-center .sidebar nav>.nav span{font-size:12px!important;line-height:1.1!important}body.compact-control-center .side-bottom{padding-top:8px!important}`;
    document.head.append(style);
  }

  function sectionOf(item) {
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
    syncTitle(section);
    const hash = CANONICAL_HASH.get(section);
    if (hash && location.hash !== hash) history.replaceState(null, '', hash);
    sidebar.classList.remove('open');
    return true;
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
    return HASH_SECTIONS.get(location.hash) || '';
  }

  function reconcileNavigation() {
    enforceInternalNavigationPolicy();
    if (requestedSection) activatePanel(requestedSection);
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

  // Dynamic admin modules now announce their navigation changes explicitly. This avoids
  // keeping subtree MutationObservers alive for the entire session and prevents DOM updates
  // inside feature panels from repeatedly waking the menu router.
  window.addEventListener('ekodi-nav-changed', reconcileNavigation);
  window.addEventListener('ekodi-feature-installed', reconcileNavigation);

  window.addEventListener('ekodi-admin-ready', () => {
    enforceInternalNavigationPolicy();
    const explicit = explicitHashSection();
    if (explicit && isInternalSection(explicit)) routeInternalToAiOps();
    else if (explicit) requestedSection = explicit;
  });

  window.addEventListener('hashchange', () => {
    const explicit = explicitHashSection();
    if (!explicit) return;
    if (isInternalSection(explicit)) return routeInternalToAiOps();
    requestedSection = explicit;
    if (!activatePanel(explicit)) openDemand(explicit);
  });

  installCompactNavigationStyle();
  enforceInternalNavigationPolicy();
  const initialHash = explicitHashSection();
  if (initialHash && isInternalSection(initialHash)) routeInternalToAiOps();
  else if (initialHash) requestedSection = initialHash;

  window.EKODIAdminPanels = Object.freeze({
    activate: section => {
      if (isInternalSection(section)) return routeInternalToAiOps();
      requestedSection = section;
      if (!activatePanel(section)) openDemand(section);
    },
    current: () => requestedSection,
    internalSections: Object.freeze([...INTERNAL_ONLY_SECTIONS]),
    visibleMenuOrder: VISIBLE_NAV_ORDER,
  });
})();
