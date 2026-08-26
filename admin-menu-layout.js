(() => {
  'use strict';

  const sidebar = document.querySelector('.sidebar');
  const nav = sidebar?.querySelector('nav');
  const content = document.querySelector('.content');
  if (!sidebar || !nav || !content) return;

  const MENU = Object.freeze({
    overview: { icon: '⌂', ko: '운영 현황', en: 'Operations' },
    campus: { icon: '▦', ko: '사이트 관리', en: 'Site Management' },
    aiops: { icon: 'AI', ko: '운영 AI', en: 'AI Operations' },
    health: { icon: '♥', ko: '서비스 상태', en: 'Service Health' },
    security: { icon: 'S', ko: '보안', en: 'Security' },
    'marketing-ai': { icon: 'M', ko: '마케팅 AI', en: 'Marketing AI' },
    work: { icon: 'W', ko: '업무', en: 'Work' },
    finance: { icon: '₩', ko: '결제 · 회계', en: 'Finance & Accounting' },
    communication: { icon: '✦', ko: '메일 · 라이브', en: 'Mail & Live' },
    workspace: { icon: '▣', ko: '클라우드 · 자료', en: 'Cloud & Files' },
    devices: { icon: 'D', ko: '기기 · 장치', en: 'Devices' },
    organization: { icon: '◫', ko: '조직 · 사업', en: 'Organizations' },
    clients: { icon: 'C', ko: '고객 사이트', en: 'Customer Sites' },
    admins: { icon: '♜', ko: '관리자 · 권한', en: 'Administrators & Access' },
    community: { icon: '◎', ko: '커뮤니티', en: 'Community' },
    books: { icon: 'B', ko: '출판 · 도서', en: 'Books & Publishing' },
    social: { icon: 'S', ko: '소셜', en: 'Social' },
    affiliates: { icon: 'A', ko: '제휴', en: 'Affiliates' },
    architecture: { icon: '◇', ko: '아키텍처', en: 'Architecture' },
    services: { icon: '◉', ko: '서비스 · 통계', en: 'Services & Metrics', internal: true },
    deployments: { icon: '↥', ko: '배포', en: 'Deployments', internal: true },
    policies: { icon: '⚙', ko: '정책', en: 'Policies', internal: true },
  });
  const VISIBLE_NAV_ORDER = Object.freeze(['overview', 'campus', 'aiops', 'health', 'security', 'marketing-ai', 'work', 'finance', 'communication', 'workspace', 'devices', 'organization', 'clients', 'admins', 'community', 'books', 'social', 'affiliates', 'architecture']);
  const VISIBLE_NAV_RANK = new Map(VISIBLE_NAV_ORDER.map((section, index) => [section, index + 1]));
  const INTERNAL_ONLY_SECTIONS = new Set(['services', 'deployments', 'policies']);
  const INTERNAL_ONLY_HREFS = new Set(['/legacy#domains', '/legacy#activity']);
  const HASH_SECTIONS = new Map([
    ['#sites', 'sites'], ['#ai-ops', 'aiops'], ['#health', 'health'], ['#security', 'security'], ['#devices', 'devices'], ['#campus', 'campus'],
    ['#policies', 'policies'], ['#operations', 'overview'], ['#services', 'services'], ['#deployments', 'deployments'],
  ]);
  const CANONICAL_HASH = new Map([
    ['overview', '#operations'], ['sites', '#sites'], ['aiops', '#ai-ops'], ['health', '#health'], ['security', '#security'], ['devices', '#devices'], ['campus', '#campus'],
  ]);
  const LOCALE_KEY = 'ekodi-admin-locale';
  const LOCALE_COOKIE = 'ekodi_admin_locale';
  let locale = readLocale();
  let requestedSection = '';
  let sitesLoading = null;

  function normalizeLocale(value) {
    return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'ko';
  }
  function readLocale() {
    try {
      const cookie = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(`${LOCALE_COOKIE}=`));
      if (cookie) return normalizeLocale(decodeURIComponent(cookie.split('=').slice(1).join('=')));
      return normalizeLocale(localStorage.getItem(LOCALE_KEY) || document.documentElement.lang || navigator.language);
    } catch { return 'ko'; }
  }
  function setLocale(value) {
    locale = normalizeLocale(value);
    try { localStorage.setItem(LOCALE_KEY, locale); } catch {}
    if (location.hostname === 'ekodi.kr' || location.hostname.endsWith('.ekodi.kr')) {
      document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Domain=.ekodi.kr; Max-Age=31536000; SameSite=Lax; Secure`;
    }
    document.documentElement.lang = locale;
    syncSidebar();
  }
  function labelFor(section) {
    const item = MENU[section];
    return item ? item[locale] || item.ko : section;
  }
  function sectionOf(item) {
    if (item?.dataset?.deviceControlNav === 'true') return 'devices';
    const raw = String(item?.dataset?.section || item?.dataset?.lazySection || '').trim();
    return raw === 'marketing' ? 'marketing-ai' : raw;
  }
  function allNavItems(root = nav) {
    return root.querySelectorAll('.nav[data-section], .nav[data-lazy-section], .nav[data-device-control-nav], a.nav[href]');
  }
  function isInternalSection(section) {
    return INTERNAL_ONLY_SECTIONS.has(String(section || '').trim());
  }
  function isInternalNav(item) {
    return isInternalSection(sectionOf(item)) || INTERNAL_ONLY_HREFS.has(item?.getAttribute?.('href') || '');
  }
  function ensureLabel(item) {
    let span = item.querySelector('span');
    if (!span) { span = document.createElement('span'); item.append(span); }
    return span;
  }
  function syncSidebar(root = nav) {
    let unknownRank = 500;
    for (const item of allNavItems(root)) {
      const section = sectionOf(item);
      const definition = MENU[section];
      if (!definition) continue;
      const label = ensureLabel(item);
      const canonical = labelFor(section);
      if (label.textContent !== canonical) label.textContent = canonical;
      const rank = definition.internal ? 9999 : (VISIBLE_NAV_RANK.get(section) ?? unknownRank++);
      if (item.style.order !== String(rank)) item.style.order = String(rank);
      item.dataset.menuOrder = String(rank);
      item.dataset.adminSidebarShared = 'true';
    }
    nav.dataset.adminSidebarShared = 'true';
    nav.dataset.adminSidebarLocale = locale;
    const active = [...allNavItems(root)].find(item => item.classList.contains('active'));
    const activeSection = sectionOf(active);
    const titleSection = activeSection === 'sites' ? 'campus' : activeSection;
    const title = document.querySelector('#pageTitle');
    if (title && MENU[titleSection]) title.textContent = labelFor(titleSection);
  }
  function renderSidebar(target, ids = VISIBLE_NAV_ORDER) {
    if (!target) return [];
    const items = ids.map(section => {
      const definition = MENU[section];
      if (!definition || definition.internal) return null;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav';
      button.dataset.section = section;
      button.append(document.createTextNode(`${definition.icon} `));
      const span = document.createElement('span');
      span.textContent = labelFor(section);
      button.append(span);
      return button;
    }).filter(Boolean);
    target.replaceChildren(...items);
    syncSidebar(target);
    return items;
  }
  function scheduleSidebarSync() {
    queueMicrotask(syncSidebar);
    requestAnimationFrame(syncSidebar);
  }
  function panelTargets(panel) {
    return String(panel?.dataset?.panel || '').split(/\s+/).filter(Boolean);
  }
  function hasPanel(section) {
    return Boolean(section && Array.from(content.querySelectorAll('[data-panel]')).some(panel => panelTargets(panel).includes(section)));
  }
  function navItemFor(section) {
    return Array.from(allNavItems()).find(item => sectionOf(item) === section && !isInternalNav(item)) || null;
  }
  function installCompactNavigationStyle() {
    if (document.querySelector('#ekodi-admin-menu-density')) return;
    const style = document.createElement('style');
    style.id = 'ekodi-admin-menu-density';
    style.textContent = `body.compact-control-center .side-caption{margin-bottom:10px!important}body.compact-control-center .sidebar nav{display:flex!important;flex-direction:column!important;gap:0!important;row-gap:0!important;overflow:visible!important;max-height:none!important;padding-right:0!important;flex:0 0 auto!important}body.compact-control-center .sidebar nav>.nav{min-height:30px!important;padding:4px 9px!important;margin:0!important;border-radius:8px!important;line-height:1.1!important;gap:9px!important}body.compact-control-center .sidebar nav>.nav span{font-size:12px!important;line-height:1.1!important}body.compact-control-center .side-bottom{padding-top:8px!important}`;
    document.head.append(style);
  }
  function applyStableNavigationOrder() { syncSidebar(); }
  function enforceInternalNavigationPolicy() {
    for (const item of allNavItems()) {
      if (!isInternalNav(item)) continue;
      item.hidden = true;
      item.dataset.aiInternal = sectionOf(item) || item.getAttribute('href') || 'internal';
      item.setAttribute('aria-hidden', 'true');
      item.tabIndex = -1;
      item.classList.remove('active');
    }
    syncSidebar();
  }
  function syncTitle(section) {
    const titleSection = section === 'sites' ? 'campus' : section;
    const title = document.querySelector('#pageTitle');
    if (title && MENU[titleSection]) title.textContent = labelFor(titleSection);
    window.dispatchEvent(new CustomEvent('ekodi-admin-section-changed', { detail: { section } }));
  }
  function activatePanel(section) {
    if (!section || !hasPanel(section)) return false;
    requestedSection = section;
    for (const panel of content.querySelectorAll('[data-panel]')) {
      const visible = panelTargets(panel).includes(section);
      panel.classList.toggle('hidden-panel', !visible);
      if (visible) panel.removeAttribute('hidden');
      else panel.hidden = true;
    }
    for (const item of allNavItems()) item.classList.toggle('active', !isInternalNav(item) && sectionOf(item) === section);
    syncTitle(section);
    const hash = CANONICAL_HASH.get(section);
    if (hash && location.hash !== hash) history.replaceState(null, '', hash);
    sidebar.classList.remove('open');
    scheduleSidebarSync();
    return true;
  }
  function installSitesEntry() {
    // Do not create a second top-level Sites item. Site presentation belongs to Site Management.
  }
  async function openSites() {
    requestedSection = 'sites';
    if (!sitesLoading) {
      sitesLoading = import('./homepage-admin.js').then(module => {
        module.mountHomepageAdmin();
        window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail: { section: 'sites' } }));
        return module;
      }).catch(error => { sitesLoading = null; throw error; });
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
  function explicitHashSection() { return HASH_SECTIONS.get(location.hash) || ''; }
  function reconcileNavigation() {
    enforceInternalNavigationPolicy();
    if (!requestedSection) return;
    if (requestedSection === 'sites' && !hasPanel('sites')) openSites();
    else activatePanel(requestedSection);
    scheduleSidebarSync();
  }

  nav.addEventListener('click', event => {
    const item = event.target.closest('.nav[data-section], .nav[data-lazy-section], .nav[data-device-control-nav], a.nav[href]');
    if (!item) return;
    scheduleSidebarSync();
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
  window.addEventListener('ekodi-admin-section-changed', scheduleSidebarSync);
  window.addEventListener('ekodi-admin-ready', () => {
    enforceInternalNavigationPolicy();
    const explicit = explicitHashSection();
    if (explicit && isInternalSection(explicit)) routeInternalToAiOps();
    else if (explicit === 'sites') openSites();
    else if (explicit) requestedSection = explicit;
    else { requestedSection = 'overview'; activatePanel('overview'); }
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
  installSitesEntry();
  enforceInternalNavigationPolicy();
  const initialHash = explicitHashSection();
  if (initialHash && isInternalSection(initialHash)) routeInternalToAiOps();
  else if (initialHash === 'sites') openSites();
  else if (initialHash) requestedSection = initialHash;
  else { requestedSection = 'overview'; activatePanel('overview'); }

  window.EKODIAdminSidebar = Object.freeze({
    sync: syncSidebar,
    render: renderSidebar,
    label: labelFor,
    order: () => VISIBLE_NAV_ORDER,
    locale: () => locale,
    setLocale,
    sectionOf,
  });
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
  scheduleSidebarSync();
})();
