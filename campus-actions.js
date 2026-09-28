(() => {
  const ALL_SITES = [
    { type: 'Core', name: 'EKODI Home', domain: 'ekodi.kr', url:'https://ekodi.kr/', label:'ekodi.kr', publicHref:'/', adminHref:'/admin', section: 'services', group: 'core', relation:'internal' },
    { type: 'Control', name: 'EKODI Admin', domain: 'ekodi.kr/admin', url:'https://ekodi.kr/admin', label:'ekodi.kr/admin', publicHref:'/', adminHref:'/admin', section: 'admins', fallback: 'services', group: 'core', relation:'internal' },
    { type: 'Auth', name: 'EKODI Auth', domain: 'ekodi.kr/auth', url:'https://ekodi.kr/auth', label:'ekodi.kr/auth', publicHref:'/auth', section: 'admins', fallback: 'services', group: 'core', relation:'internal' },
    { type: '교회', name: '에코디교회', domain: 'ekodi.kr/ekodichurch', url:'https://ekodi.kr/ekodichurch', label:'ekodi.kr/ekodichurch', publicHref:'/ekodichurch', adminHref:'/ekodichurch/admin', section: 'services', group: 'community', relation:'user' },
    { type: '비즈', name: '에코디비즈', domain: 'ekodi.kr/ekodibiz', url:'https://ekodi.kr/ekodibiz', label:'ekodi.kr/ekodibiz', publicHref:'/ekodibiz', adminHref:'/ekodibiz/admin', section: 'organization', fallback: 'services', group: 'business', relation:'user' },
    { type: 'OS', name: '비즈니스 OS', domain: 'business.ekodi.kr', section: 'services', group: 'business' },
    { type: '서점', name: '에코디서점', domain: 'ekodi.kr/books', url:'https://ekodi.kr/books', label:'ekodi.kr/books', publicHref:'/books', adminHref:'/books/admin', section: 'books', fallback: 'services', group: 'knowledge', relation:'user' },
    { type: '작가AI', name: '크리에이터 AI', domain: 'author.ekodi.kr', section: 'books', fallback: 'services', group: 'knowledge' },
    { type: '연구소', name: '에코디연구소', domain: 'ekodi.kr/ekodilab', url:'https://ekodi.kr/ekodilab', label:'ekodi.kr/ekodilab', publicHref:'/ekodilab', adminHref:'/ekodilab/admin', section: 'services', group: 'knowledge', relation:'user' },
    { type: '교육', name: '에코디교육', domain: 'ekodi.kr/education', url:'https://ekodi.kr/education', label:'ekodi.kr/education', publicHref:'/education', adminHref:'/education/admin', section: 'services', group: 'knowledge', lifecycle:'planned', relation:'user' },
    { type: '커뮤니티', name: '커뮤니티', domain: 'ekodi.kr/community', section: 'community', fallback: 'services', group: 'community' },
    { type: '소셜', name: '에코디소셜', domain: 'ekodi.kr/social', url:'https://ekodi.kr/social', label:'ekodi.kr/social', publicHref:'/social', adminHref:'/social/admin', section: 'social', fallback: 'services', group: 'community', relation:'user' },
    { type: '몰', name: '에코디몰', domain: 'ekodi.kr/ekodimall', url:'https://ekodi.kr/ekodimall', label:'ekodi.kr/ekodimall', publicHref:'/ekodimall', adminHref:'/ekodimall/admin', section: 'services', group: 'business', relation:'user' },
    { type: '투자', name: '에코디투자', domain: 'ekodi.kr/invest', url:'https://ekodi.kr/invest', label:'ekodi.kr/invest', publicHref:'/invest', adminHref:'/invest/admin', section:'invest', fallback:'services', group:'business', lifecycle:'beta', relation:'user' },
    { type: '마케팅', name: '마케팅 AI', domain: 'marketing.ekodi.kr', section: 'services', group: 'business' },
    { type: '무역', name: '에코디무역', domain: 'ekodi.kr/trade', url:'https://ekodi.kr/trade', label:'ekodi.kr/trade', publicHref:'/trade', adminHref:'/ekodibiz/trade/admin', section: 'organization', fallback: 'services', group: 'business', relation:'user' },
    { type: '결제', name: '에코디페이', domain: 'ekodi.kr/pay', url:'https://ekodi.kr/pay', label:'ekodi.kr/pay', publicHref:'/pay', adminHref:'/pay/admin', section: 'finance', fallback: 'services', group: 'business', lifecycle:'preparing', relation:'user' },
    { type: 'My', name: '마이 에코디', domain: 'my.ekodi.kr', section: 'services', group: 'worklife' },
    { type: '워크', name: '에코디워크', domain: 'ekodi.kr/work', url:'https://ekodi.kr/work', label:'ekodi.kr/work', publicHref:'/work', adminHref:'/work/admin', section: 'work', fallback: 'services', group: 'worklife', relation:'user' },
    { type: '에너지', name: '에너지 AI', domain: 'energy.ekodi.kr', section: 'services', group: 'worklife' },
    { type: '보험', name: '에코디보험', domain: 'ekodi.kr/insurance', url: 'https://ekodi.kr/insurance', label: 'ekodi.kr/insurance', publicHref:'/insurance', adminHref:'/insurance/admin', section: 'services', group: 'worklife', lifecycle: 'beta', relation:'user' },
    { type: '메일', name: '에코디메일', domain: 'ekodi.kr/mail', url:'https://ekodi.kr/mail', label:'ekodi.kr/mail', publicHref:'/mail', adminHref:'/mail/admin', section: 'communication', fallback: 'services', group: 'communication', lifecycle: 'preparing', relation:'user' },
    { type: '라이브', name: '에코디라이브', domain: 'ekodi.kr/live', url:'https://ekodi.kr/live', label:'ekodi.kr/live', publicHref:'/live', adminHref:'/live/admin', section: 'communication', fallback: 'services', group: 'communication', lifecycle: 'preparing', relation:'user' },
    { type: '클라우드', name: '에코디클라우드', domain: 'ekodi.kr/cloud', url:'https://ekodi.kr/cloud', label:'ekodi.kr/cloud', publicHref:'/cloud', adminHref:'/cloud/admin', section: 'workspace', fallback: 'services', group: 'communication', lifecycle: 'preparing', relation:'user' },
    { type: '미디어', name: '에코디미디어', domain: 'ekodi.kr/media', url:'https://ekodi.kr/media', label:'ekodi.kr/media', publicHref:'/media', adminHref:'/media/admin', section: 'communication', fallback: 'services', group: 'communication', lifecycle: 'planned', relation:'user' },
    { type: '고객', name: '청계면상인회', domain: 'cgma.ekodi.kr', url: 'https://ekodi.kr/cgma/', label: 'ekodi.kr/cgma · cgma.or.kr', section: 'clients', fallback: 'services', group: 'clients' },
    { type: '고객', name: '자담치킨 목포대점', domain: 'jadam.ekodi.kr', section: 'clients', fallback: 'services', group: 'clients' },
    { type: '고객', name: '피자마루 목포대점', domain: 'pizzamaru.ekodi.kr', section: 'clients', fallback: 'services', group: 'clients' },
    { type: '고객', name: '요거트퍼플 목포대점', domain: 'yogurt.ekodi.kr', section: 'clients', fallback: 'services', group: 'clients' },
  ];

  const SITE_GROUPS = [
    { key: 'core', title: '핵심·접근', description: '홈 · 관리자 · 통합인증' },
    { key: 'business', title: '사업·상거래', description: '비즈 · OS · 몰 · 마케팅 · 무역 · 결제 · 투자 · 지원' },
    { key: 'community', title: '공동체', description: '교회 · 커뮤니티 · 소셜 · 카페' },
    { key: 'clients', title: '고객·협력', description: '외부 고객 · 상권 · 매장' },
    { key: 'knowledge', title: '지식·콘텐츠', description: '서점 · 출판 · 작가AI · 연구 · 교육' },
    { key: 'communication', title: '소통·클라우드', description: '메신저 · 메일 · 라이브 · 클라우드 · 미디어' },
    { key: 'worklife', title: '업무·생활', description: 'My · 업무 · 에너지 · 보험' },
    { key: 'other', title: '기타', description: '중앙 레지스트리에 새로 등록된 사이트' },
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
  let activeSiteGroup = 'all';
  let activeSiteRelation = 'all';
  const SITE_SECTION_FILTER = Object.freeze({
    'sites-all': { group:'all', relation:'all' },
    'sites-core': { group:'core', relation:'all' },
    'sites-business': { group:'business', relation:'all' },
    'sites-community': { group:'community', relation:'all' },
    'sites-clients': { group:'clients', relation:'all' },
    'sites-knowledge': { group:'knowledge', relation:'all' },
    'sites-communication': { group:'communication', relation:'all' },
    'sites-worklife': { group:'worklife', relation:'all' },
    'sites-other': { group:'other', relation:'all' },
    'sites-preparing': { group:'all', relation:'preparing' },
    'sites-internal': { group:'all', relation:'internal' },
    'sites-user': { group:'all', relation:'user' },
    'sites-customer-partner': { group:'clients', relation:'customer-partner' },
    'sites-independent': { group:'other', relation:'independent' },
  });

  function nav() {
    return document.querySelector('.sidebar nav');
  }

  function normalizeDomain(value) {
    const raw=String(value||'').trim().toLowerCase();
    if(!raw)return '';
    try{
      const url=new URL(/^https?:\/\//.test(raw)?raw:`https://${raw}`);
      const path=url.pathname.replace(/\/+$/,'');
      return `${url.hostname}${path==='/'?'':path}`;
    }catch{return raw.replace(/^https?:\/\//,'').split(/[?#]/)[0].replace(/\/+$/,'');}
  }

  function siteRelation(site) {
    const lifecycle = String(site?.lifecycle || '').trim().toLowerCase();
    if (['planned','preparing','private','hidden'].includes(lifecycle)) return 'preparing';
    if (site?.group === 'clients') return 'customer-partner';
    if (site?.relation) return site.relation;
    if (site?.publicHref || site?.adminHref) return 'user';
    if (site?.group === 'other') return 'independent';
    return 'internal';
  }

  function surfaceInfo(site) {
    const resolver = window.EKODIAdminSurfaceLabels;
    if (resolver?.info) return resolver.info(site?.domain, site?.label || '', site?.url || '');
    const raw = String(site?.domain || '').trim();
    return { label: site?.label || raw, url: site?.url || (raw ? `https://${raw}` : ''), kind: 'fallback' };
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
    if (action === 'manage' && site.group === 'core') button.dataset.section = 'campus';
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
    link.href = surfaceInfo(site).url;
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
    const relation=document.createElement('small');
    relation.className='campus-site-relation';
    relation.textContent=site.adminHref?'사용자·관리자 분리':siteRelation(site)==='internal'?'공통·내부':'사용자 사이트';
    identity.append(relation);
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
    const info = surfaceInfo(site);
    const domain = site.lifecycle === 'planned' || !info.url ? document.createElement('span') : document.createElement('a');
    domain.className = 'campus-site-domain';
    if (domain.tagName === 'A') { domain.href = info.url; domain.target = '_blank'; domain.rel = 'noopener'; }
    domain.textContent = info.label;
    if (info.kind === 'runtime') domain.title = '운영에는 사용되지만 사용자 대표 주소로 표시하지 않는 내부 실행 경계입니다.';
    return domain;
  }

  function makeSurfaceLink(label, href, className='secondary') {
    if (!href) return null;
    const link=document.createElement('a');
    link.className=`${className} campus-row-action`;
    link.href=href;
    link.target='_blank';
    link.rel='noopener';
    link.textContent=label;
    return link;
  }

  function makeOperationalActions(site) {
    const actions = document.createElement('div');
    actions.className = 'campus-row-actions';
    const publicLink=makeSurfaceLink('사용자', site.publicHref || surfaceInfo(site).url, 'secondary');
    const adminLink=makeSurfaceLink('관리자', site.adminHref, 'primary');
    const status=makeButton('상태', 'secondary', 'status', site);
    for (const control of [publicLink, adminLink, status]) if(control) actions.append(control);
    if (!site.adminHref) actions.append(makeButton('관리', 'secondary', 'manage', site));
    return actions;
  }

  function renderSiteItem(site) {
    const item = document.createElement('article');
    item.className = 'campus-site-item';
    item.dataset.siteDomain = site.domain;
    item.dataset.siteLifecycle = site.lifecycle || 'live';
    item.dataset.siteRelation = site.relation || siteRelation(site);
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

  function renderGroupTabs() {
    const bar = document.createElement('div');
    bar.className = 'campus-group-tabs';
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', '사이트 분류');
    for (const group of [{ key:'all', title:'전체' }, ...SITE_GROUPS]) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'campus-group-tab'; button.dataset.campusGroupTab = group.key; button.setAttribute('role', 'tab');
      button.innerHTML = `<span>${group.title}</span><b data-campus-tab-count>0</b>`;
      button.addEventListener('click', () => applyGroupFilter(group.key));
      bar.append(button);
    }
    return bar;
  }

  function refreshGroupTabs() {
    const grid = document.querySelector('#campusSiteGroups'); if (!grid) return;
    const total = grid.querySelectorAll('.campus-site-item').length;
    for (const button of document.querySelectorAll('[data-campus-group-tab]')) {
      const key = button.dataset.campusGroupTab || 'all';
      const count = key === 'all' ? total : grid.querySelector(`[data-campus-group="${key}"]`)?.querySelectorAll('.campus-site-item').length || 0;
      button.querySelector('[data-campus-tab-count]')?.replaceChildren(document.createTextNode(String(count)));
      button.setAttribute('aria-selected', key === activeSiteGroup ? 'true' : 'false');
      button.classList.toggle('active', key === activeSiteGroup);
    }
  }

  function registrySite(service, existing = null) {
    const id = String(service?.id || '').trim().toLowerCase();
    const domain = normalizeDomain(service?.label || service?.domain || service?.url);
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
      relation: siteRelation({ id, name:String(service?.name||''), group, lifecycle }),
    };
  }

  function updateSiteItem(item, site) {
    item.dataset.siteDomain = site.domain;
    item.dataset.siteLifecycle = site.lifecycle || 'live';
    item.dataset.siteRelation = site.relation || siteRelation(site);
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

  function matchesSiteRelation(item) {
    if (activeSiteRelation === 'all') return true;
    const relation = String(item.dataset.siteRelation || 'internal');
    const lifecycle = String(item.dataset.siteLifecycle || 'live');
    if (activeSiteRelation === 'preparing') return relation === 'preparing' || ['planned','preparing','private','hidden'].includes(lifecycle);
    return relation === activeSiteRelation;
  }

  function syncVisibleState() {
    const grid = document.querySelector('#campusSiteGroups');
    if (!grid) return 0;
    const visible = grid.querySelectorAll('.campus-site-item:not([hidden])').length;
    const heading = document.querySelector('#campusPanel .campus-toolbar h2');
    if (heading) heading.textContent = `사이트 관리 · ${visible}`;
    const empty = document.querySelector('#campusEmptyState');
    if (empty) empty.hidden = visible !== 0;
    return visible;
  }

  function applySiteVisibility() {
    const grid = document.querySelector('#campusSiteGroups');
    if (!grid) return;
    for (const card of grid.querySelectorAll('.campus-group-card')) {
      const groupMatches = activeSiteGroup === 'all' || card.dataset.campusGroup === activeSiteGroup;
      let visible = 0;
      for (const item of card.querySelectorAll('.campus-site-item')) {
        const show = groupMatches && matchesSiteRelation(item);
        item.hidden = !show;
        if (show) visible += 1;
      }
      card.hidden = visible === 0;
    }
    syncVisibleState();
  }

  function applySiteRelation(relation) {
    activeSiteRelation = ['all','internal','user','customer-partner','independent','preparing'].includes(relation) ? relation : 'all';
    applySiteVisibility();
  }

  function applyGroupFilter(group, { syncUrl = true } = {}) {
    const valid = group === 'all' || SITE_GROUPS.some(item => item.key === group);
    activeSiteGroup = valid ? group : 'all';
    applySiteVisibility();
    if (syncUrl) {
      const url = new URL(location.href);
      if (activeSiteGroup === 'all') url.searchParams.delete('site_group'); else url.searchParams.set('site_group', activeSiteGroup);
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }

  function applySiteSection(section) {
    const filter = SITE_SECTION_FILTER[String(section || '')] || SITE_SECTION_FILTER['sites-all'];
    activeSiteGroup = filter.group;
    activeSiteRelation = filter.relation;
    applySiteVisibility();
  }

  function refreshCampusCounts() {
    const grid = document.querySelector('#campusSiteGroups');
    if (!grid) return;
    let total = 0;
    for (const card of grid.querySelectorAll('.campus-group-card')) {
      const count = card.querySelectorAll('.campus-site-item').length;
      total += count;
      const badge = card.querySelector('.campus-group-count');
      if (badge) {
        badge.textContent = String(count);
        badge.setAttribute('aria-label', `${count}개 사이트`);
      }
    }
    applySiteVisibility();
  }

  function reconcileRegistryServices(services = []) {
    const grid = document.querySelector('#campusSiteGroups');
    if (!grid || !Array.isArray(services)) return false;

    for (const service of services) {
      const domain = normalizeDomain(service?.label || service?.domain || service?.url);
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
    panel.dataset.panel = [...new Set([
      ...String(panel.dataset.panel || 'campus').split(/\s+/).filter(Boolean),
      ...Object.keys(SITE_SECTION_FILTER),
    ])].join(' ');
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

    const empty = document.createElement('div');
    empty.id = 'campusEmptyState';
    empty.className = 'campus-empty-state';
    empty.hidden = true;
    empty.textContent = '해당 분류의 사이트가 없습니다.';

    wrapper.classList.add('campus-groups-wrap');
    wrapper.replaceChildren(grid, empty);
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

    const requestedGroup = new URLSearchParams(location.search).get('site_group');
    if (requestedGroup) applyGroupFilter(requestedGroup, { syncUrl:false });
    else applySiteSection(window.EKODIAdminPanels?.current?.() || 'sites-all');
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
      if (!open) continue;
      const currentPath = (() => { try { return new URL(open.href, location.origin).pathname; } catch { return ''; } })();
      if (domain === 'ekodi.kr' && currentPath.startsWith('/api')) continue;
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

  window.addEventListener('ekodi-admin-section-changed', event => {
    const section = String(event.detail?.section || '');
    if (SITE_SECTION_FILTER[section]) applySiteSection(section);
  });

  window.EKODICampus = Object.freeze({
    reconcileRegistryServices,
    refreshCounts: refreshCampusCounts,
    applySiteRelation,
    applySiteSection,
    loadHomepageAdmin,
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();