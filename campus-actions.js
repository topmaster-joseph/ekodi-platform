(() => {
  const ALL_SITES = [
    { type: 'Core', name: 'EKODI Home', domain: 'ekodi.kr', section: 'services', group: 'core' },
    { type: 'Control', name: 'EKODI Control Center', domain: 'admin.ekodi.kr', section: 'admins', fallback: 'services', group: 'core' },
    { type: 'Auth', name: 'EKODI Auth', domain: 'auth.ekodi.kr', section: 'admins', fallback: 'services', group: 'core' },
    { type: '교회', name: '에코디교회', domain: 'church.ekodi.kr', section: 'services', group: 'community' },
    { type: '비즈', name: '에코디비즈', domain: 'biz.ekodi.kr', section: 'organization', fallback: 'services', group: 'business' },
    { type: 'OS', name: 'EKODI Business OS', domain: 'business.ekodi.kr', section: 'services', group: 'business' },
    { type: '출판', name: '에코디북스', domain: 'books.ekodi.kr', section: 'books', fallback: 'services', group: 'knowledge' },
    { type: '작가AI', name: 'EKODI Creator AI', domain: 'author.ekodi.kr', section: 'books', fallback: 'services', group: 'knowledge' },
    { type: '연구소', name: '에코디연구소', domain: 'lab.ekodi.kr', section: 'services', group: 'knowledge' },
    { type: '교육', name: '에코디교육', domain: 'edu.ekodi.kr', section: 'services', group: 'knowledge', lifecycle: 'planned' },
    { type: '커뮤니티', name: '에코디커뮤니티', domain: 'community.ekodi.kr', section: 'community', fallback: 'services', group: 'community' },
    { type: '소셜', name: 'EKODI Social', domain: 'social.ekodi.kr', section: 'social', fallback: 'services', group: 'community' },
    { type: '몰', name: '에코디몰', domain: 'mall.ekodi.kr', section: 'services', group: 'business' },
    { type: '마케팅', name: 'EKODI Marketing AI', domain: 'marketing.ekodi.kr', section: 'services', group: 'business' },
    { type: '무역', name: 'EKODI Trading', domain: 'trade.ekodi.kr', section: 'organization', fallback: 'services', group: 'business' },
    { type: '결제', name: 'EKODI Pay', domain: 'pay.ekodi.kr', section: 'finance', fallback: 'services', group: 'business' },
    { type: 'My', name: 'My EKODI', domain: 'my.ekodi.kr', section: 'services', group: 'worklife', lifecycle: 'planned' },
    { type: '워크', name: 'EKODI Work', domain: 'work.ekodi.kr', section: 'work', fallback: 'services', group: 'worklife' },
    { type: '에너지', name: 'EKODI Energy AI', domain: 'energy.ekodi.kr', section: 'services', group: 'worklife' },
    { type: '보험', name: 'EKODI Insurance', domain: 'ins.ekodi.kr', section: 'services', group: 'worklife', lifecycle: 'planned' },
    { type: '메일', name: 'EKODI Mail', domain: 'mail.ekodi.kr', section: 'communication', fallback: 'services', group: 'communication' },
    { type: '라이브', name: 'EKODI Live', domain: 'live.ekodi.kr', section: 'communication', fallback: 'services', group: 'communication' },
    { type: '클라우드', name: 'EKODI Cloud', domain: 'cloud.ekodi.kr', section: 'workspace', fallback: 'services', group: 'communication' },
    { type: '미디어', name: '에코디미디어', domain: 'media.ekodi.kr', section: 'communication', fallback: 'services', group: 'communication', lifecycle: 'planned' },
    { type: '고객', name: '청계면상인회', domain: 'cgma.ekodi.kr', section: 'clients', fallback: 'services', group: 'clients' },
    { type: '고객', name: '자담치킨 목포대점', domain: 'jadam.ekodi.kr', section: 'clients', fallback: 'services', group: 'clients' },
    { type: '고객', name: '피자마루 목포대점', domain: 'pizzamaru.ekodi.kr', section: 'clients', fallback: 'services', group: 'clients' },
    { type: '고객', name: '요거트퍼플 목포대점', domain: 'yogurt.ekodi.kr', section: 'clients', fallback: 'services', group: 'clients' },
  ];

  const SITE_GROUPS = [
    { key: 'core', title: 'Core & Access', description: '홈 · 관리자 · 통합인증' },
    { key: 'business', title: 'Business & Commerce', description: '비즈 · OS · 몰 · 마케팅 · 무역 · 결제' },
    { key: 'community', title: 'Community', description: '교회 · 커뮤니티 · 소셜' },
    { key: 'clients', title: 'Client Sites', description: '외부 고객 · 상권 · 매장' },
    { key: 'knowledge', title: 'Knowledge & Content', description: '출판 · 작가AI · 연구 · 교육' },
    { key: 'communication', title: 'Communication & Cloud', description: '메일 · 라이브 · 클라우드 · 미디어' },
    { key: 'worklife', title: 'Work & Life', description: 'My · 업무 · 에너지 · 보험' },
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
    button.dataset.campusTarget = action === 'status' ? 'overview' : site.section;
    button.dataset.campusFallback = site.fallback || '';
    button.textContent = label;
    button.setAttribute('aria-label', `${site.name} ${label}`);
    return button;
  }

  function makeOpenControl(site) {
    if (site.lifecycle === 'planned') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary campus-row-action campus-site-planned-action';
      button.disabled = true;
      button.textContent = '오픈 전';
      button.setAttribute('aria-label', `${site.name} 오픈 전`);
      return button;
    }
    const link = document.createElement('a');
    link.className = 'primary campus-row-action';
    link.href = `https://${site.domain}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Open ↗';
    link.setAttribute('aria-label', `${site.name} 바로가기`);
    return link;
  }

  function renderSiteItem(site) {
    const item = document.createElement('article');
    item.className = 'campus-site-item';
    item.dataset.siteDomain = site.domain;
    item.dataset.siteLifecycle = site.lifecycle || 'live';
    if (site.lifecycle === 'planned') item.classList.add('is-planned');

    const identity = document.createElement('div');
    identity.className = 'campus-site-identity';
    const type = document.createElement('span');
    type.className = 'campus-site-type';
    type.textContent = site.type;
    const strong = document.createElement('strong');
    strong.textContent = site.name;
    identity.append(type, strong);
    if (site.lifecycle === 'planned') {
      const stage = document.createElement('span');
      stage.className = 'campus-site-stage';
      stage.textContent = '오픈 전';
      identity.append(stage);
    }

    const domain = site.lifecycle === 'planned' ? document.createElement('span') : document.createElement('a');
    domain.className = 'campus-site-domain';
    if (domain.tagName === 'A') {
      domain.href = `https://${site.domain}`;
      domain.target = '_blank';
      domain.rel = 'noopener';
    }
    domain.textContent = site.domain;

    const actions = document.createElement('div');
    actions.className = 'campus-row-actions';
    actions.append(
      makeButton('Manage', 'secondary', 'manage', site),
      makeButton('Status', 'secondary', 'status', site),
      makeOpenControl(site),
    );

    item.append(identity, domain, actions);
    return item;
  }

  function renderGroup(group) {
    const sites = ALL_SITES.filter(site => site.group === group.key);
    const card = document.createElement('section');
    card.className = 'campus-group-card';
    card.dataset.campusGroup = group.key;

    const header = document.createElement('header');
    header.className = 'campus-group-head';
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = group.title;
    const description = document.createElement('p');
    description.textContent = group.description;
    copy.append(title, description);

    const count = document.createElement('span');
    count.className = 'campus-group-count';
    count.textContent = String(sites.length);
    count.setAttribute('aria-label', `${sites.length}개 사이트`);
    header.append(copy, count);

    const list = document.createElement('div');
    list.className = 'campus-group-list';
    list.append(...sites.map(renderSiteItem));
    card.append(header, list);
    return card;
  }

  function renderCampus() {
    const panel = document.querySelector('#campusPanel');
    const wrapper = panel?.querySelector('.campus-table-wrap');
    if (!panel || !wrapper) return false;
    if (wrapper.dataset.allSitesReady === 'true') return true;

    const heading = panel.querySelector('.campus-toolbar h2');
    const copy = panel.querySelector('.campus-toolbar > div > p:not(.kicker)');
    if (heading) heading.textContent = `All EKODI Sites · ${ALL_SITES.length}`;
    if (copy) copy.textContent = '운영 중인 사이트와 오픈 전 플랫폼을 함께 보여주며, 성격이 비슷한 사이트끼리 묶어 상태·관리·공개 화면을 한곳에서 확인합니다.';

    const grid = document.createElement('div');
    grid.id = 'campusSiteGroups';
    grid.className = 'campus-groups-grid';
    grid.setAttribute('aria-label', 'EKODI 전체 사이트 및 오픈 전 플랫폼 목록');
    grid.append(...SITE_GROUPS.map(renderGroup));

    wrapper.classList.add('campus-groups-wrap');
    wrapper.replaceChildren(grid);
    wrapper.dataset.allSitesReady = 'true';

    grid.addEventListener('click', event => {
      const button = event.target.closest('[data-campus-action]');
      if (!button) return;
      event.stopPropagation();
      const action = button.dataset.campusAction;
      const domain = button.dataset.campusDomain || '';
      const target = button.dataset.campusTarget || 'services';
      const fallback = button.dataset.campusFallback || 'services';
      openSection(target, domain, fallback);
      if (action === 'status' && location.hash !== '#operations') history.replaceState(null, '', '#operations');
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
      if (publicUrl && open.href !== `${publicUrl}/` && open.href !== publicUrl) open.href = publicUrl;
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
      if (span.textContent !== '🤝 Affiliates') span.textContent = '🤝 Affiliates';
      const first = item.firstChild;
      if (first && first.nodeType === Node.TEXT_NODE && first.textContent) first.textContent = '';
      return;
    }
    if (item.textContent !== '🤝 Affiliates') item.textContent = '🤝 Affiliates';
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
      let sidebarQueued = false;
      const observer = new MutationObserver(() => {
        if (sidebarQueued) return;
        sidebarQueued = true;
        queueMicrotask(() => {
          sidebarQueued = false;
          normalizeSidebar();
        });
      });
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
