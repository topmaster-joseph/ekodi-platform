(() => {
  'use strict';

  const sidebar = document.querySelector('.sidebar');
  const nav = sidebar?.querySelector('nav');
  const content = document.querySelector('.content');
  if (!sidebar || !nav || !content) return;

  let requestedSection = '';
  let queued = false;

  function sectionOf(item) {
    const direct = String(item?.dataset?.section || item?.dataset?.lazySection || '').trim();
    if (direct) return direct;
    return item?.dataset?.deviceControlNav ? 'devices' : '';
  }

  function panelTargets(panel) {
    return String(panel?.dataset?.panel || '').split(/\s+/).filter(Boolean);
  }

  function activeSection() {
    const active = nav.querySelector('.nav.active[data-section], .nav.active[data-lazy-section], .nav.active[data-device-control-nav]');
    return sectionOf(active);
  }

  function hasPanel(section) {
    if (!section) return false;
    return Array.from(content.querySelectorAll('[data-panel]')).some(panel => panelTargets(panel).includes(section));
  }

  function applyExclusivePanel(section) {
    const target = String(section || requestedSection || activeSection()).trim();
    if (!target || !hasPanel(target)) return false;

    requestedSection = target;
    for (const panel of content.querySelectorAll('[data-panel]')) {
      const visible = panelTargets(panel).includes(target);
      panel.classList.toggle('hidden-panel', !visible);
      if (visible) panel.removeAttribute('hidden');
      else panel.hidden = true;
    }

    for (const item of nav.querySelectorAll('.nav[data-section], .nav[data-lazy-section], .nav[data-device-control-nav]')) {
      item.classList.toggle('active', sectionOf(item) === target);
    }

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

  nav.addEventListener('click', event => {
    const item = event.target.closest('.nav[data-section], .nav[data-lazy-section], .nav[data-device-control-nav]');
    const section = sectionOf(item);
    if (!section) return;
    requestedSection = section;
    scheduleExclusivePanel(section);
  }, true);

  let mutationQueued = false;
  const mutationObserver = new MutationObserver(() => {
    if (mutationQueued) return;
    mutationQueued = true;
    queueMicrotask(() => {
      mutationQueued = false;
      const active = activeSection();
      if (active) requestedSection = active;
      scheduleExclusivePanel(requestedSection);
    });
  });
  mutationObserver.observe(content, { childList:true, subtree:false });
  mutationObserver.observe(nav, { childList:true, subtree:true, attributes:true, attributeFilter:['class','data-section','data-lazy-section','data-device-control-nav'] });

  window.addEventListener('ekodi-feature-installed', () => scheduleExclusivePanel(activeSection() || requestedSection));
  window.addEventListener('ekodi-admin-ready', () => scheduleExclusivePanel(activeSection() || requestedSection));
  window.addEventListener('hashchange', () => scheduleExclusivePanel(activeSection() || requestedSection));

  requestedSection = activeSection() || 'campus';
  scheduleExclusivePanel(requestedSection);

  window.EKODIAdminPanels = Object.freeze({
    activate: section => scheduleExclusivePanel(section),
    current: () => requestedSection || activeSection(),
  });
})();
