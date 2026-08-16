(() => {
  'use strict';

  const body = document.body;
  const sidebar = document.querySelector('.sidebar');
  const nav = sidebar?.querySelector('nav');
  const content = document.querySelector('.content');
  const sideBottom = sidebar?.querySelector('.side-bottom');
  if (!body || !sidebar || !nav || !content || !sideBottom) return;

  body.classList.add('admin-menu-layout');

  function installSidebarAccount() {
    if (sideBottom.querySelector('.sidebar-account')) return;
    const profile = document.querySelector('.topbar .profile');
    if (!profile) return;

    const account = document.createElement('div');
    account.className = 'sidebar-account';
    account.setAttribute('aria-label', '현재 로그인 계정');
    account.append(profile);

    const logout = sideBottom.querySelector('#logoutButton');
    if (logout) sideBottom.insertBefore(account, logout);
    else sideBottom.append(account);
  }

  function sectionOf(item) {
    return String(item?.dataset?.section || item?.dataset?.lazySection || '').trim();
  }

  function selectedSection() {
    const active = nav.querySelector('.nav.active[data-section], .nav.active[data-lazy-section]');
    return sectionOf(active) || (location.hash === '#campus' ? 'campus' : '');
  }

  function panelTargets(panel) {
    return String(panel.dataset.panel || '').split(/\s+/).filter(Boolean);
  }

  function applyExclusivePanel(section) {
    if (!section) return;

    for (const panel of content.querySelectorAll('[data-panel]')) {
      const matches = panelTargets(panel).includes(section);
      panel.classList.toggle('hidden-panel', !matches);
      panel.hidden = !matches;
    }

    for (const orphan of content.querySelectorAll(':scope > section:not([data-panel])')) {
      orphan.classList.add('hidden-panel');
      orphan.hidden = true;
      orphan.dataset.menuOrphanHidden = 'true';
    }

    for (const item of nav.querySelectorAll('.nav[data-section]')) {
      item.classList.toggle('active', item.dataset.section === section);
    }

    sidebar.classList.remove('open');
  }

  function queueExclusivePanel(section) {
    if (!section) return;
    queueMicrotask(() => applyExclusivePanel(section));
    window.setTimeout(() => applyExclusivePanel(section), 0);
    window.setTimeout(() => applyExclusivePanel(section), 120);
  }

  installSidebarAccount();

  nav.addEventListener('click', event => {
    const item = event.target.closest('.nav[data-section], .nav[data-lazy-section]');
    const section = sectionOf(item);
    if (!section) return;
    queueExclusivePanel(section);
  });

  let mutationQueued = false;
  const observer = new MutationObserver(() => {
    if (mutationQueued) return;
    mutationQueued = true;
    queueMicrotask(() => {
      mutationQueued = false;
      installSidebarAccount();
      const section = selectedSection();
      if (section) applyExclusivePanel(section);
    });
  });
  observer.observe(content, { childList:true, subtree:false });
  observer.observe(nav, { childList:true, subtree:true, attributes:true, attributeFilter:['class','data-section','data-lazy-section'] });

  window.addEventListener('ekodi-feature-installed', () => {
    installSidebarAccount();
    queueExclusivePanel(selectedSection());
  });

  const initial = selectedSection() || 'campus';
  queueExclusivePanel(initial);
})();
