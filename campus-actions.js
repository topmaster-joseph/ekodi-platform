(() => {
  const ALL_SITES = [
    { type: 'Core', name: 'EKODI Home', domain: 'ekodi.kr', section: 'services', group: 'core' },
    { type: 'Control', name: 'EKODI Admin', domain: 'admin.ekodi.kr', section: 'admins', fallback: 'services', group: 'core' },
    { type: 'Auth', name: 'EKODI Auth', domain: 'auth.ekodi.kr', section: 'admins', fallback: 'services', group: 'core' },
    { type: '교회', name: '에코디교회', domain: 'church.ekodi.kr', section: 'services', group: 'community' },
    { type: '비즈', name: '에코디비즈', domain: 'biz.ekodi.kr', section: 'organization', fallback: 'services', group: 'business' },
    { type: 'OS', name: '비즈니스 OS', domain: 'business.ekodi.kr', section: 'services', group: 'business' },
    { type: '출판', name: '에코디서점', domain: 'books.ekodi.kr', section: 'books', fallback: 'services', group: 'knowledge' },
    { type: '작가AI', name: '크리에이터 AI', domain: 'author.ekodi.kr', section: 'books', fallback: 'services', group: 'knowledge' },
    { type: '연구소', name: '에코디연구소', domain: 'lab.ekodi.kr', section: 'services', group: 'knowledge' },
    { type: '교육', name: '에코디교육', domain: 'edu.ekodi.kr', section: 'services', group: 'knowledge' },
    { type: '커뮤니티', name: '커뮤니티', domain: 'community.ekodi.kr', section: 'community', fallback: 'services', group: 'community' },
    { type: '소셜', name: '에코디 소셜', domain: 'social.ekodi.kr', section: 'social', fallback: 'services', group: 'community' },
    { type: '몰', name: '에코디몰', domain: 'ekodi.kr/ekodibiz/mall', section: 'services', group: 'business' },
    { type: '마케팅', name: '마케팅 AI', domain: 'marketing.ekodi.kr', section: 'services', group: 'business' },
    { type: '무역', name: '에코디 트레이딩', domain: 'trade.ekodi.kr', section: 'organization', fallback: 'services', group: 'business' },
    { type: '결제', name: '에코디 페이', domain: 'pay.ekodi.kr', section: 'finance', fallback: 'services', group: 'business' },
    { type: 'My', name: '마이 에코디', domain: 'my.ekodi.kr', section: 'services', group: 'worklife' },
    { type: '워크', name: '에코디 워크', domain: 'work.ekodi.kr', section: 'work', fallback: 'services', group: 'worklife' },
    { type: '에너지', name: '에너지 AI', domain: 'energy.ekodi.kr', section: 'services', group: 'worklife' },
    { type: '보험', name: '에코디보험', domain: 'ins.ekodi.kr', section: 'services', group: 'worklife', lifecycle: 'planned' },
    { type: '메일', name: '에코디 메일', domain: 'mail.ekodi.kr', section: 'communication', fallback: 'services', group: 'communication', lifecycle: 'planned' },
    { type: '라이브', name: '에코디 라이브', domain: 'live.ekodi.kr', section: 'communication', fallback: 'services', group: 'communication', lifecycle: 'planned' },
    { type: '클라우드', name: '에코디 클라우드', domain: 'cloud.ekodi.kr', section: 'workspace', fallback: 'services', group: 'communication', lifecycle: 'planned' },
    { type: '미디어', name: '에코디미디어', domain: 'media.ekodi.kr', section: 'communication', fallback: 'services', group: 'communication', lifecycle: 'planned' },
    { type: '고객', name: '청계면상인회', domain: 'cgma.ekodi.kr', url: 'https://ekodi.kr/cgma/', label: 'ekodi.kr/cgma · cgma.or.kr', section: 'clients', fallback: 'services', group: 'clients' },
    { type: '고객', name: '자담치킨 목포대점', domain: 'jadam.ekodi.kr', section: 'clients', fallback: 'services', group: 'clients' },
    { type: '고객', name: '피자마루 목포대점', domain: 'pizzamaru.ekodi.kr', section: 'clients', fallback: 'services', group: 'clients' },
    { type: '고객', name: '요거트퍼플 목포대점', domain: 'yogurt.ekodi.kr', section: 'clients', fallback: 'services', group: 'clients' },
  ];

  const SITE_GROUPS = [
    { key: 'core', title: 'Core & Access', description: '홈 · 관리자 · 통합인증' },
    { key: 'business', title: 'Business & Commerce', description: '비즈 · OS · 몰 · 마케팅 · 무역 · 결제 · 투자 · 지원' },
    { key: 'community', title: 'Community', description: '교회 · 커뮤니티 · 소셜 · 카페' },
    { key: 'clients', title: 'Client Sites', description: '외부 고객 · 상권 · 매장' },
    { key: 'knowledge', title: 'Knowledge & Content', description: '서점 · 출판 · 작가AI · 연구 · 교육' },
    { key: 'communication', title: 'Communication & Cloud', description: '메신저 · 메일 · 라이브 · 클라우드 · 미디어' },
    { key: 'worklife', title: 'Work & Life', description: 'My · 업무 · 에너지 · 보험' },
    { key: 'other', title: 'Other Services', description: '중앙 레지스트리에 새로 등록된 서비스' },
  ];

  const REGISTRY_GROUP_MAP = Object.freeze({
    'community-ministry': 'community',
    'business-growth': 'business',
    'knowledge-creation': 'knowledge',
    'work-life': 'worklife',
    'communication-cloud': 'communication',
  });

  const REGISTRY_SECTION_MAP = Object.freeze({
    biz: ['organization', 'services'],
    trade: ['organization', 'services'],
    pay: ['finance', 'services'],
    money: ['finance', 'services'],
    books: ['books', 'services'],
    publishing: ['books', 'services'],
    author: ['books', 'services'],
    community: ['community', 'services'],
    social: ['social', 'services'],
    work: ['work', 'services'],
    messenger: ['communication', 'services'],
    mail: ['communication', 'services'],
    live: ['communication', 'services'],
    cloud: ['workspace', 'services'],
    media: ['communication', 'services'],
  });

  const REGISTRY_TYPE_MAP = Object.freeze({
    'community-ministry': '커뮤니티',
    'business-growth': '비즈',
    'knowledge-creation': '콘텐츠',
    'work-life': '워크',
    'communication-cloud': '소통',
  });

  let homepageModulePromise = null;

  function nav() {
    return document.querySelector('.sidebar nav');
  }

  function normalizeDomain(value) {
    return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
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
    button.dataset.campusTarget = action === 'status' ? 'health' : site.section;
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
    link.href = site.url || `https://${site.domain}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Open ↗';
    link.setAttribute('aria-label', `${site.name} 바로가기`);
    return link;
  }

  function stageLabel(lifecycle) {
    if (lifecycle === 'planned') return '오픈 전';
    if (lifecycle === 'preparing') return '준비중';
    if (lifecycle === 'beta') return '베타';
    return '';
  }

  function makeIdentity(site) {
    const identity = document.createElement('div');
    identity.className = 'campus-site-identity';
    const type = document.createElement('span');
    type.className = 'campus-site-type';
    type.textContent = site.type;
    const strong = document.createElement('strong');
    strong.textContent = site.name;
    identity.append(type, strong);
    const stageText = stageLabel(site.lifecycle);
    if (stageText) {
      const stage = document.createElement('span');
      stage.className = 'campus-site-stage';
      stage.textContent = stageText;
      identity.append(stage);
    }
    return identity;
  }

  function makeDomainControl(site) {
    const domain = site.lifecycle === 'planned' ? document.createElement('span') : document.createElement('a');
    domain.className = 'campus-site-domain';
    if (domain.tagName === 'A') {
      domain.href = site.url || `https://${site.domain}`;
      domain.target = '_blank';
      domain.rel = 'noopener';
    }
    domain.textContent = site.label || site.domain;
    return domain;
  }

  function makeOperationalActions(site) {
    const actions = document.createElement('div');
    actions.className = 'campus-row-actions';
    actions.append(
      makeButton('Manage', 'secondary', 'manage', site),
      makeButton('Status', 'secondary', 'status', site),
      makeOpenControl(site),
    );
    return actions;
  }

  function renderSiteItem(site) {
    const item = document.createElement('article');
    item.className = 'campus-site-item';
    item.dataset.siteDomain = site.domain;
    item.dataset.siteLifecycle = site.lifecycle || 'live';
    if (site.id) item.dataset.siteId = site.id;
    if (site.lifecycle === 'planned') item.classList.add('is-planned');
    if (site.lifecycle === 'preparing') item.classList.add('is-preparing');
    if (site.lifecycle === 'beta') item.classList.add('is-beta');
    item.append(makeIdentity(site), makeDomainControl(site), makeOperationalActions(site));
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
    if (!sites.length) card.hidden = true;
    return card;
  }

  function registrySite(service, existing = null) {
    const id = String(service?.id || '').trim().toLowerCase();
    const domain = normalizeDomain(service?.domain || service?.label || service?.url);
    const [section, fallback = 'services'] = REGISTRY_SECTION_MAP[id] || ['services', ''];
    const group = REGISTRY_GROUP_MAP[service?.group] || 'other';
    const type = existing?.querySelector('.campus-site-type')?.textContent?.trim()
      || REGISTRY_TYPE_MAP[service?.group] || '서비스';
    const lifecycle = String(existing?.dataset?.siteLifecycle || service?.status || 'live').trim().toLowerCase();
    return {
      id,
      type,
      name: String(service?.name || id || domain).trim(),
      domain,
      section,
      fallback,
      group,
      lifecycle,
    };
  }

  function updateSiteItem(item, site) {
    item.dataset.siteDomain = site.domain;
    item.dataset.siteLifecycle = site.lifecycle || 'live';
    if (site.id) item.dataset.siteId = site.id;
    item.classList.toggle('is-planned', site.lifecycle === 'planned');
    item.classList.toggle('is-preparing', site.lifecycle === 'preparing');
    item.classList.toggle('is-beta', site.lifecycle === 'beta');

    const identity = item.querySelector('.campus-site-identity');
    if (identity) identity.replaceWith(makeIdentity(site));
    const domain = item.querySelector('.campus-site-domain');
    if (domain) domain.replaceWith(makeDomainControl(site));
    const actions = item.querySelector('.campus-row-actions');
    if (actions) actions.replaceWith(makeOperationalActions(site));
  }

  function refreshCampusCounts() {
    const grid = document.querySelector('#campusSiteGroups');
    if (!grid) return;
    let total = 0;
    for (const card of grid.querySelectorAll('.campus-group-card')) {
      const count = card.querySelectorAll('.campus-site-item').length;
      total += count;
      card.hidden = count === 0;
      const badge = card.querySelector('.campus-group-count');
      if (badge) {
        badge.textContent = String(count);
        badge.setAttribute('aria-label', `${count}개 사이트`);
      }
    }
    const heading = document.querySelector('#campusPanel .campus-toolbar h2');
    if (heading) heading.textContent = `사이트 관리 · ${total}`;
  }

  function reconcileRegistryServices(services = []) {
    const grid = document.querySelector('#campusSiteGroups');
    if (!grid || !Array.isArray(services)) return false;

    for (const service of services) {
      const domain = normalizeDomain(service?.domain || service?.label || service?.url);
      if (!domain) continue;
      let item = [...grid.querySelectorAll('.campus-site-item')].find(row => normalizeDomain(row.dataset.siteDomain) === domain);
      const site = registrySite(service, item);
      if (!site.domain) continue;

      const targetList = grid.querySelector(`[data-campus-group="${site.group}"] .campus-group-list`)
        || grid.querySelector('[data-campus-group="other"] .campus-group-list');
      if (!targetList) continue;

      if (!item) {
        item = renderSiteItem(site);
        targetList.append(item);
      } else {
        updateSiteItem(item, site);
        if (item.parentElement !== targetList) targetList.append(item);
      }
    }

    refreshCampusCounts();
    window.dispatchEvent(new CustomEvent('ekodi-campus-registry-reconciled', { detail: { count: services.length } }));
    return true;
  }

  function loadHomepageAdmin() {
    if (homepageModulePromise) return homepageModulePromise;
    homepageModulePromise = import('./homepage-admin.js')
      .then(module => {
        module.mountHomepageAdmin();
        return module;
      })
      .catch(error => {
        homepageModulePromise = null;
        console.warn('[EKODI Admin] 첫화면 관리 모듈을 불러오지 못했습니다.', error);
      });
    return homepageModulePromise;
  }

  function renderCampus() {
    const panel = document.querySelector('#campusPanel');
    const wrapper = panel?.querySelector('.campus-table-wrap');
    if (!panel || !wrapper) return false;
    if (wrapper.dataset.allSitesReady === 'true') {
      loadHomepageAdmin();
      return true;
    }

    const copy = panel.querySelector('.campus-toolbar > div > p:not(.kicker)');
    if (copy) copy.textContent = '에코디 생태계의 전체 사이트와 EKODI.KR 첫화면 공개 설정을 한 목록에서 관리합니다.';

    const grid = document.createElement('div');
    grid.id = 'campusSiteGroups';
    grid.className = 'campus-groups-grid';
    grid.setAttribute('aria-label', 'EKODI 전체 사이트, 운영 상태 및 첫화면 공개 설정');
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
      if (action === 'status' && location.hash !== '#health') history.replaceState(null, '', '#health');
    });

    refreshCampusCounts();
    loadHomepageAdmin();
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

  function init() {
    renderCampus();
    normalizeServiceOpenLinks();

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
  }

  window.EKODICampus = Object.freeze({
    reconcileRegistryServices,
    refreshCounts: refreshCampusCounts,
    loadHomepageAdmin,
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();