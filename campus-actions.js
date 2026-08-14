(() => {
  const ALL_SITES = [
    { type: 'Core', name: 'EKODI Home', domain: 'ekodi.kr', section: 'services' },
    { type: 'Control', name: 'EKODI Control Center', domain: 'admin.ekodi.kr', section: 'admins', fallback: 'services' },
    { type: 'Auth', name: 'EKODI Auth', domain: 'auth.ekodi.kr', section: 'admins', fallback: 'services' },
    { type: '교회', name: '에코디교회', domain: 'church.ekodi.kr', section: 'services' },
    { type: '비즈', name: '에코디비즈', domain: 'biz.ekodi.kr', section: 'organization', fallback: 'services' },
    { type: '출판', name: '에코디북스', domain: 'books.ekodi.kr', section: 'books', fallback: 'services' },
    { type: '연구소', name: '에코디연구소', domain: 'lab.ekodi.kr', section: 'services' },
    { type: '커뮤니티', name: '에코디커뮤니티', domain: 'community.ekodi.kr', section: 'community', fallback: 'services' },
    { type: '소셜', name: 'EKODI Social', domain: 'social.ekodi.kr', section: 'social', fallback: 'services' },
    { type: '몰', name: '에코디몰', domain: 'mall.ekodi.kr', section: 'services' },
    { type: '마케팅', name: 'EKODI Marketing AI', domain: 'marketing.ekodi.kr', section: 'services' },
    { type: '무역', name: 'EKODI Trading', domain: 'trade.ekodi.kr', section: 'organization', fallback: 'services' },
    { type: '결제', name: 'EKODI Pay', domain: 'pay.ekodi.kr', section: 'finance', fallback: 'services' },
    { type: '메일', name: 'EKODI Mail', domain: 'mail.ekodi.kr', section: 'communication', fallback: 'services' },
    { type: '라이브', name: 'EKODI Live', domain: 'live.ekodi.kr', section: 'communication', fallback: 'services' },
    { type: '클라우드', name: 'EKODI Cloud', domain: 'cloud.ekodi.kr', section: 'workspace', fallback: 'services' },
    { type: '고객', name: '청계면상인회', domain: 'cgma.ekodi.kr', section: 'clients', fallback: 'services' },
    { type: '고객', name: '자담치킨 목포대점', domain: 'jadam.ekodi.kr', section: 'clients', fallback: 'services' },
    { type: '고객', name: '피자마루 목포대점', domain: 'pizzamaru.ekodi.kr', section: 'clients', fallback: 'services' },
    { type: '고객', name: '요거트퍼플 목포대점', domain: 'yogurt.ekodi.kr', section: 'clients', fallback: 'services' },
  ];

  function nav() {
    return document.querySelector('.sidebar nav');
  }

  function sectionControl(section, fallback = '') {
    const root = nav();
    if (!root) return null;
    return root.querySelector(`[data-section="${section}"], [data-lazy-section="${section}"]`)
      || (fallback ? root.querySelector(`[data-section="${fallback}"], [data-lazy-section="${fallback}"]`) : null);
  }

  function focusService(domain) {
    if (!domain) return false;
    const card = [...document.querySelectorAll('.service-control-card')].find(item => {
      return item.querySelector('.service-control-head small')?.textContent?.trim() === domain;
    });
    if (!card) return false;
    card.classList.add('campus-focus');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => card.classList.remove('campus-focus'), 2200);
    return true;
  }

  function openSection(section, domain, fallback = '') {
    const control = sectionControl(section, fallback);
    control?.click();
    if (!domain) return;
    window.setTimeout(() => {
      if (!focusService(domain)) window.setTimeout(() => focusService(domain), 700);
    }, 250);
  }

  function makeButton(label, className, action, site) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${className} campus-row-action`;
    button.dataset.campusAction = action;
    button.dataset.campusDomain = site.domain;
    button.dataset.campusSection = site.section;
    button.dataset.campusFallback = site.fallback || '';
    button.textContent = label;
    button.setAttribute('aria-label', `${site.name} ${label}`);
    return button;
  }

  function makeOpenLink(site) {
    const link = document.createElement('a');
    link.className = 'primary campus-row-action';
    link.href = `https://${site.domain}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Open ↗';
    link.setAttribute('aria-label', `${site.name} 바로가기`);
    return link;
  }

  function renderSiteRow(site) {
    const row = document.createElement('tr');
    row.dataset.siteDomain = site.domain;

    const type = document.createElement('td');
    type.textContent = site.type;

    const name = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = site.name;
    name.append(strong);

    const domain = document.createElement('td');
    const domainLink = document.createElement('a');
    domainLink.href = `https://${site.domain}`;
    domainLink.target = '_blank';
    domainLink.rel = 'noopener';
    domainLink.textContent = site.domain;
    domain.append(domainLink);

    const actions = document.createElement('td');
    const group = document.createElement('div');
    group.className = 'campus-row-actions';
    group.append(
      makeButton('Manage', 'secondary', 'manage', site),
      makeButton('Status', 'secondary', 'status', site),
      makeOpenLink(site),
    );
    actions.append(group);

    row.append(type, name, domain, actions);
    return row;
  }

  function renderCampus() {
    const panel = document.querySelector('#campusPanel');
    const table = panel?.querySelector('.campus-table');
    const tbody = panel?.querySelector('#campusServiceRows');
    if (!panel || !table || !tbody) return false;
    if (tbody.dataset.allSitesReady === 'true') return true;

    const heading = panel.querySelector('.campus-toolbar h2');
    const copy = panel.querySelector('.campus-toolbar > div > p:not(.kicker)');
    if (heading) heading.textContent = `All EKODI Sites · ${ALL_SITES.length}`;
    if (copy) copy.textContent = '전체 운영 사이트를 한 화면에서 관리하고, 상태를 확인하고, 공개 화면으로 바로 이동합니다.';

    const headRow = table.querySelector('thead tr');
    if (headRow) headRow.innerHTML = '<th>Type</th><th>Service</th><th>Domain</th><th>Actions</th>';

    tbody.replaceChildren(...ALL_SITES.map(renderSiteRow));
    tbody.dataset.allSitesReady = 'true';

    tbody.addEventListener('click', event => {
      const button = event.target.closest('[data-campus-action]');
      if (!button) return;
      const action = button.dataset.campusAction;
      const domain = button.dataset.campusDomain || '';
      if (action === 'status') {
        openSection('overview', domain);
        if (location.hash !== '#operations') history.replaceState(null, '', '#operations');
        return;
      }
      openSection(button.dataset.campusSection || 'services', domain, button.dataset.campusFallback || 'services');
    });
    return true;
  }

  function publicServiceUrl(domain) {
    const host = String(domain || '').trim().toLowerCase();
    if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) return '';
    return `https://${host}`;
  }

  function normalizeServiceOpenLinks() {
    const grid = document.querySelector('#serviceControlGrid');
    if (!grid) return;
    for (const card of grid.querySelectorAll('.service-control-card')) {
      const domain = card.querySelector('.service-control-head small')?.textContent?.trim() || '';
      const open = card.querySelector('.service-actions a');
      if (!open || domain === 'api.ekodi.kr') continue;
      const publicUrl = publicServiceUrl(domain);
      if (publicUrl) open.href = publicUrl;
    }
  }

  function removeDomainsMenu() {
    const root = nav();
    if (!root) return;
    root.querySelectorAll('a[href="/legacy#domains"], [data-section="domains"], [data-lazy-section="domains"]').forEach(item => item.remove());
  }

  function decorateAffiliates() {
    const root = nav();
    if (!root) return;
    const item = root.querySelector('[data-section="affiliates"], [data-lazy-section="affiliates"]');
    if (!item) return;
    const span = item.querySelector('span');
    if (span) {
      span.textContent = '🤝 Affiliates';
      const first = item.firstChild;
      if (first && first.nodeType === Node.TEXT_NODE) first.textContent = '';
      return;
    }
    item.textContent = '🤝 Affiliates';
  }

  function normalizeSidebar() {
    removeDomainsMenu();
    decorateAffiliates();
  }

  function init() {
    renderCampus();
    normalizeSidebar();
    normalizeServiceOpenLinks();

    const sidebarNav = nav();
    if (sidebarNav) {
      const observer = new MutationObserver(() => normalizeSidebar());
      observer.observe(sidebarNav, { childList: true, subtree: true });
    }

    const serviceGrid = document.querySelector('#serviceControlGrid');
    if (serviceGrid) {
      const observer = new MutationObserver(() => normalizeServiceOpenLinks());
      observer.observe(serviceGrid, { childList: true, subtree: true });
    }

    const content = document.querySelector('.content');
    if (content && !document.querySelector('#campusPanel')) {
      const observer = new MutationObserver(() => {
        if (renderCampus()) observer.disconnect();
      });
      observer.observe(content, { childList: true, subtree: true });
    }

    window.addEventListener('ekodi-feature-installed', normalizeSidebar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
