(() => {
  'use strict';

  const sidebar = document.querySelector('.sidebar');
  const nav = sidebar?.querySelector('nav');
  const content = document.querySelector('.content');
  if (!sidebar || !nav || !content) return;

  // These capabilities still run and remain addressable by the AI/control plane,
  // but they are not daily human workspaces. AI Ops becomes their primary surface.
  const INTERNAL_ONLY_SECTIONS = new Set(['overview', 'services', 'deployments', 'policies']);
  const INTERNAL_ONLY_HREFS = new Set(['/legacy#domains', '/legacy#activity']);
  const HASH_SECTIONS = new Map([
    ['#ai-ops', 'aiops'],
    ['#devices', 'devices'],
    ['#campus', 'campus'],
    ['#policies', 'policies'],
    ['#operations', 'overview'],
    ['#services', 'services'],
    ['#deployments', 'deployments'],
  ]);
  const CANONICAL_HASH = new Map([
    ['aiops', '#ai-ops'],
    ['devices', '#devices'],
    ['campus', '#campus'],
  ]);

  let requestedSection = '';
  let queued = false;
  let preferAiOpsOnReady = ['', '#operations', '#services', '#deployments', '#policies'].includes(location.hash);

  function sectionOf(item) {
    if (item?.dataset?.deviceControlNav === 'true') return 'devices';
    return String(item?.dataset?.section || item?.dataset?.lazySection || '').trim();
  }

  function panelTargets(panel) {
    return String(panel?.dataset?.panel || '').split(/\s+/).filter(Boolean);
  }

  function hasPanel(section) {
    if (!section) return false;
    return Array.from(content.querySelectorAll('[data-panel]')).some(panel => panelTargets(panel).includes(section));
  }

  function isInternalSection(section) {
    return INTERNAL_ONLY_SECTIONS.has(String(section || '').trim());
  }

  function isInternalNav(item) {
    const section = sectionOf(item);
    const href = item?.getAttribute?.('href') || '';
    return isInternalSection(section) || INTERNAL_ONLY_HREFS.has(href);
  }

  function allNavItems() {
    return nav.querySelectorAll('.nav[data-section], .nav[data-lazy-section], .nav[data-device-control-nav], a.nav[href]');
  }

  function navItemFor(section) {
    return Array.from(allNavItems()).find(item => sectionOf(item) === section && !isInternalNav(item)) || null;
  }

  function activeSection() {
    const active = Array.from(allNavItems()).find(item => item.classList.contains('active') && !item.hidden && !isInternalNav(item));
    return sectionOf(active);
  }

  function explicitHashSection() {
    return HASH_SECTIONS.get(location.hash) || '';
  }

  function preferredHumanSection() {
    const explicit = explicitHashSection();
    if (explicit && !isInternalSection(explicit) && hasPanel(explicit)) return explicit;
    if (hasPanel('aiops') && navItemFor('aiops')) return 'aiops';
    if (hasPanel('campus') && navItemFor('campus')) return 'campus';
    if (hasPanel('devices') && navItemFor('devices')) return 'devices';
    const first = Array.from(allNavItems()).find(item => {
      const section = sectionOf(item);
      return section && !item.hidden && !isInternalNav(item) && hasPanel(section);
    });
    return sectionOf(first);
  }

  function titleFor(section) {
    if (section === 'aiops') return 'AI Ops';
    if (section === 'devices') return 'Devices';
    if (section === 'campus') return 'Campus';
    const item = navItemFor(section);
    return item?.querySelector('span')?.textContent?.trim() || item?.textContent?.trim() || '';
  }

  function syncTitle(section) {
    const title = document.querySelector('#pageTitle');
    const value = titleFor(section);
    if (title && value) title.textContent = value;
  }

  function syncCanonicalHash(section) {
    const hash = CANONICAL_HASH.get(section);
    if (!hash) return;
    const currentSection = explicitHashSection();
    const replacingInternal = currentSection && isInternalSection(currentSection);
    if ((preferAiOpsOnReady || replacingInternal || location.hash === hash) && location.hash !== hash) {
      history.replaceState(null, '', hash);
    }
  }

  function markInternal(item, reason) {
    item.hidden = true;
    item.dataset.aiInternal = reason;
    item.setAttribute('aria-hidden', 'true');
    item.tabIndex = -1;
    item.classList.remove('active');
  }

  function enforceInternalNavigationPolicy() {
    for (const item of allNavItems()) {
      if (isInternalNav(item)) {
        markInternal(item, sectionOf(item) || item.getAttribute('href') || 'internal');
      }
    }

    // Old Campus shortcuts must not reopen the retired human-facing Operations/Services panels.
    for (const control of content.querySelectorAll('[data-campus-section]')) {
      if (!isInternalSection(control.dataset.campusSection)) continue;
      control.dataset.campusSection = 'aiops';
      const text = control.textContent?.trim();
      if (['Operations', 'Services', 'Deployments', 'Policies'].includes(text)) control.textContent = 'AI Ops';
      control.setAttribute('aria-label', control.getAttribute('aria-label')?.replace(/관리 메뉴 열기$/, 'AI Ops에서 보기') || 'AI Ops에서 보기');
    }
  }

  function normalizeTarget(section) {
    const candidate = String(section || '').trim();
    if (isInternalSection(candidate)) return preferredHumanSection();
    if (candidate && hasPanel(candidate)) return candidate;
    if (preferAiOpsOnReady) return preferredHumanSection();
    return '';
  }

  function applyExclusivePanel(section) {
    enforceInternalNavigationPolicy();
    const target = normalizeTarget(section || requestedSection || activeSection());
    if (!target || !hasPanel(target)) return false;

    requestedSection = target;
    for (const panel of content.querySelectorAll('[data-panel]')) {
      const visible = panelTargets(panel).includes(target);
      panel.classList.toggle('hidden-panel', !visible);
      if (visible) panel.removeAttribute('hidden');
      else panel.hidden = true;
    }

    for (const item of allNavItems()) {
      const active = !isInternalNav(item) && sectionOf(item) === target;
      item.classList.toggle('active', active);
    }

    syncTitle(target);
    syncCanonicalHash(target);
    if (target === 'aiops') preferAiOpsOnReady = false;
    sidebar.classList.remove('open');
    return true;
  }

  function scheduleExclusivePanel(section = '') {
    const next = String(section || '').trim();
    if (next) requestedSection = next;
    if (queued) return;
    queued = true;

    queueMicrotask(() => {
      queued = false;
      applyExclusivePanel();
    });
    window.setTimeout(() => applyExclusivePanel(), 40);
    window.setTimeout(() => applyExclusivePanel(), 180);
  }

  function openAiOpsFromInternalRequest() {
    preferAiOpsOnReady = true;
    requestedSection = 'aiops';
    if (location.hash !== '#ai-ops') history.replaceState(null, '', '#ai-ops');
    scheduleExclusivePanel('aiops');
  }

  nav.addEventListener('click', event => {
    const item = event.target.closest('.nav[data-section], .nav[data-lazy-section], .nav[data-device-control-nav], a.nav[href]');
    if (!item) return;
    if (isInternalNav(item)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openAiOpsFromInternalRequest();
      return;
    }
    const section = sectionOf(item);
    if (!section) return;
    preferAiOpsOnReady = false;
    requestedSection = section;
    scheduleExclusivePanel(section);
  }, true);

  content.addEventListener('click', event => {
    const control = event.target.closest('[data-campus-section]');
    if (!control) return;
    if (!isInternalSection(control.dataset.campusSection)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openAiOpsFromInternalRequest();
  }, true);

  let mutationQueued = false;
  const mutationObserver = new MutationObserver(() => {
    if (mutationQueued) return;
    mutationQueued = true;
    queueMicrotask(() => {
      mutationQueued = false;
      enforceInternalNavigationPolicy();
      if (preferAiOpsOnReady && hasPanel('aiops') && navItemFor('aiops')) requestedSection = 'aiops';
      const active = activeSection();
      if (active && !isInternalSection(active)) requestedSection = active;
      scheduleExclusivePanel(requestedSection || preferredHumanSection());
    });
  });
  mutationObserver.observe(content, { childList:true, subtree:false });
  mutationObserver.observe(nav, { childList:true, subtree:true, attributes:true, attributeFilter:['class','data-section','data-lazy-section','data-device-control-nav'] });

  window.addEventListener('ekodi-feature-installed', () => {
    enforceInternalNavigationPolicy();
    if (preferAiOpsOnReady && hasPanel('aiops')) requestedSection = 'aiops';
    scheduleExclusivePanel(requestedSection || preferredHumanSection());
  });
  window.addEventListener('ekodi-admin-ready', () => {
    enforceInternalNavigationPolicy();
    if (preferAiOpsOnReady && hasPanel('aiops')) requestedSection = 'aiops';
    scheduleExclusivePanel(requestedSection || preferredHumanSection());
  });
  window.addEventListener('hashchange', () => {
    const explicit = explicitHashSection();
    if (explicit && isInternalSection(explicit)) {
      openAiOpsFromInternalRequest();
      return;
    }
    if (explicit) {
      preferAiOpsOnReady = false;
      requestedSection = explicit;
    }
    scheduleExclusivePanel(requestedSection || preferredHumanSection());
  });

  enforceInternalNavigationPolicy();
  const initialHash = explicitHashSection();
  if (initialHash && isInternalSection(initialHash)) {
    requestedSection = 'aiops';
    preferAiOpsOnReady = true;
  } else if (initialHash) {
    requestedSection = initialHash;
    preferAiOpsOnReady = false;
  } else {
    requestedSection = 'aiops';
    preferAiOpsOnReady = true;
  }
  scheduleExclusivePanel(requestedSection);

  window.EKODIAdminPanels = Object.freeze({
    activate: section => {
      if (isInternalSection(section)) return openAiOpsFromInternalRequest();
      preferAiOpsOnReady = false;
      scheduleExclusivePanel(section);
    },
    current: () => requestedSection || activeSection(),
    internalSections: Object.freeze([...INTERNAL_ONLY_SECTIONS]),
  });
})();
