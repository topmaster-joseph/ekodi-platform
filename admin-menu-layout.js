(() => {
  'use strict';

  const sidebar = document.querySelector('.sidebar');
  const nav = sidebar?.querySelector('nav');
  const content = document.querySelector('.content');
  if (!sidebar || !nav || !content) return;

  const API = 'https://api.ekodi.kr';
  const INTERNAL_ONLY_SECTIONS = new Set(['overview', 'services', 'deployments', 'policies']);
  const INTERNAL_ONLY_HREFS = new Set(['/legacy#domains', '/legacy#activity']);
  const VISIBLE_NAV_ORDER = Object.freeze([
    'campus', 'sites', 'aiops', 'health', 'security', 'marketing-ai', 'work', 'clients', 'admins', 'community', 'books',
    'finance', 'communication', 'social', 'workspace', 'devices', 'organization', 'affiliates',
  ]);
  const VISIBLE_NAV_RANK = new Map(VISIBLE_NAV_ORDER.map((section, index) => [section, index + 1]));
  const HASH_SECTIONS = new Map([
    ['#sites', 'sites'], ['#ai-ops', 'aiops'], ['#health', 'health'], ['#security', 'security'], ['#devices', 'devices'], ['#campus', 'campus'],
    ['#policies', 'policies'], ['#operations', 'overview'], ['#services', 'services'], ['#deployments', 'deployments'],
  ]);
  const CANONICAL_HASH = new Map([
    ['sites', '#sites'], ['aiops', '#ai-ops'], ['health', '#health'], ['security', '#security'], ['devices', '#devices'], ['campus', '#campus'],
  ]);

  let requestedSection = '';
  let homepageLoaded = false;

  function token() {
    return sessionStorage.getItem('ekodi-auth-token') || '';
  }

  function installCompactNavigationStyle() {
    if (document.querySelector('#ekodi-admin-menu-density')) return;
    const style = document.createElement('style');
    style.id = 'ekodi-admin-menu-density';
    style.textContent = `body.compact-control-center .side-caption{margin-bottom:10px!important}body.compact-control-center .sidebar nav{display:flex!important;flex-direction:column!important;gap:0!important;row-gap:0!important;overflow:visible!important;max-height:none!important;padding-right:0!important;flex:0 0 auto!important}body.compact-control-center .sidebar nav>.nav{min-height:30px!important;padding:4px 9px!important;margin:0!important;border-radius:8px!important;line-height:1.1!important;gap:9px!important}body.compact-control-center .sidebar nav>.nav span{font-size:12px!important;line-height:1.1!important}body.compact-control-center .side-bottom{padding-top:8px!important}`;
    document.head.append(style);
  }

  function installHomepageManagementStyle() {
    if (document.querySelector('#ekodi-homepage-management-style')) return;
    const style = document.createElement('style');
    style.id = 'ekodi-homepage-management-style';
    style.textContent = `
      .homepage-admin-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}
      .homepage-admin-head p{max-width:760px}.homepage-admin-actions{display:flex;gap:8px;flex-wrap:wrap}
      .homepage-admin-notice{display:flex;gap:12px;align-items:center;margin:16px 0;padding:13px 15px;border:1px solid rgba(125,211,252,.18);border-radius:12px;background:rgba(15,23,42,.38)}
      .homepage-admin-notice>span{display:grid;place-items:center;width:38px;height:38px;flex:0 0 38px;border-radius:11px;background:rgba(56,189,248,.12);font-size:20px}.homepage-admin-notice strong{display:block}.homepage-admin-notice small{display:block;margin-top:3px;opacity:.72;line-height:1.45}
      .homepage-admin-grid{display:grid;gap:8px}.homepage-site-row{display:grid;grid-template-columns:minmax(190px,1fr) 92px 92px 96px minmax(120px,.55fr);align-items:center;gap:10px;padding:11px 12px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.32)}
      .homepage-site-row[data-eligible="false"]{opacity:.62}.homepage-site-identity strong,.homepage-site-identity small{display:block}.homepage-site-identity small{margin-top:3px;opacity:.62;word-break:break-all}.homepage-site-control{display:flex;align-items:center;gap:7px;font-size:12px}.homepage-site-control input[type="checkbox"]{width:16px;height:16px}.homepage-site-order input{width:78px;padding:7px 8px}.homepage-site-status{font-size:11px;line-height:1.35}.homepage-site-status b,.homepage-site-status span{display:block}.homepage-site-status span{opacity:.62;margin-top:3px}
      .homepage-preview{margin-top:16px;padding:14px;border:1px dashed rgba(125,211,252,.24);border-radius:12px}.homepage-preview[hidden]{display:none}.homepage-preview-list{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.homepage-preview-chip{padding:8px 10px;border-radius:10px;background:rgba(30,41,59,.65);font-size:12px}.homepage-preview-chip.featured{outline:1px solid rgba(250,204,21,.48)}
      @media(max-width:760px){.homepage-site-row{grid-template-columns:1fr 1fr}.homepage-site-identity{grid-column:1/-1}.homepage-site-status{grid-column:1/-1}.homepage-admin-actions{width:100%}.homepage-admin-actions button{flex:1 1 auto}}
    `;
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

  async function homepageApi(path = '/api/control/homepage', options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `첫화면 설정 API 오류 (${response.status})`);
    return data;
  }

  function homepageStatus(message, detail = '', state = 'info') {
    const notice = document.querySelector('#homepageAdminNotice');
    if (!notice) return;
    notice.dataset.state = state;
    const strong = notice.querySelector('strong');
    const small = notice.querySelector('small');
    if (strong) strong.textContent = message;
    if (small) small.textContent = detail;
  }

  function createHomepageRow(service) {
    const row = document.createElement('article');
    row.className = 'homepage-site-row';
    row.dataset.homepageService = service.id;
    row.dataset.eligible = service.homepageEligible ? 'true' : 'false';

    const identity = document.createElement('div');
    identity.className = 'homepage-site-identity';
    const name = document.createElement('strong');
    name.textContent = service.name || service.id;
    const domain = document.createElement('small');
    domain.textContent = service.domain || service.label || service.id;
    identity.append(name, domain);

    const showLabel = document.createElement('label');
    showLabel.className = 'homepage-site-control';
    const show = document.createElement('input');
    show.type = 'checkbox';
    show.dataset.homepageShow = 'true';
    show.checked = service.visibility !== 'hidden';
    show.disabled = !service.homepageEligible;
    showLabel.append(show, document.createTextNode(' 첫화면'));

    const featureLabel = document.createElement('label');
    featureLabel.className = 'homepage-site-control';
    const feature = document.createElement('input');
    feature.type = 'checkbox';
    feature.dataset.homepageFeatured = 'true';
    feature.checked = service.visibility === 'featured';
    feature.disabled = !service.homepageEligible || !show.checked;
    featureLabel.append(feature, document.createTextNode(' ★ 주요'));

    const orderLabel = document.createElement('label');
    orderLabel.className = 'homepage-site-control homepage-site-order';
    const order = document.createElement('input');
    order.type = 'number';
    order.min = '0';
    order.max = '9999';
    order.step = '1';
    order.value = String(service.order ?? service.defaultOrder ?? 9999);
    order.dataset.homepageOrder = 'true';
    order.setAttribute('aria-label', `${service.name || service.id} 표시 순서`);
    orderLabel.append(document.createTextNode('순서 '), order);

    const status = document.createElement('div');
    status.className = 'homepage-site-status';
    const state = document.createElement('b');
    state.textContent = service.homepageEligible ? '공개 가능' : '공개 차단';
    const reason = document.createElement('span');
    reason.textContent = service.homepageEligible
      ? `${service.status === 'live' ? '운영중' : service.status} · 운영 검증 완료`
      : `${service.status || '준비'} · 운영 검증 후 선택 가능`;
    status.append(state, reason);

    show.addEventListener('change', () => {
      feature.disabled = !service.homepageEligible || !show.checked;
      if (!show.checked) feature.checked = false;
    });
    feature.addEventListener('change', () => {
      if (feature.checked) show.checked = true;
      feature.disabled = !service.homepageEligible || !show.checked;
    });

    row.append(identity, showLabel, featureLabel, orderLabel, status);
    return row;
  }

  function renderHomepageServices(services) {
    const grid = document.querySelector('#homepageAdminGrid');
    if (!grid) return;
    grid.replaceChildren();
    for (const service of services || []) grid.append(createHomepageRow(service));
    homepageStatus(
      '첫화면 표시 설정을 불러왔습니다.',
      '체크는 표시 여부, ★ 주요는 시각적 강조만 바꿉니다. 운영 검증이 안 된 사이트는 자동으로 차단됩니다.',
      'ready'
    );
  }

  function collectHomepageDraft() {
    return Array.from(document.querySelectorAll('[data-homepage-service]')).map(row => {
      const show = row.querySelector('[data-homepage-show]');
      const featured = row.querySelector('[data-homepage-featured]');
      const order = row.querySelector('[data-homepage-order]');
      const eligible = row.dataset.eligible === 'true';
      return {
        id: row.dataset.homepageService,
        visibility: !eligible || !show?.checked ? 'hidden' : featured?.checked ? 'featured' : 'normal',
        order: Math.max(0, Math.min(9999, Math.trunc(Number(order?.value) || 9999))),
        name: row.querySelector('.homepage-site-identity strong')?.textContent || row.dataset.homepageService,
        eligible,
      };
    });
  }

  function previewHomepageDraft() {
    const preview = document.querySelector('#homepageAdminPreview');
    const list = document.querySelector('#homepageAdminPreviewList');
    if (!preview || !list) return;
    const visible = collectHomepageDraft()
      .filter(item => item.eligible && item.visibility !== 'hidden')
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    list.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement('span');
      empty.className = 'homepage-preview-chip';
      empty.textContent = '표시할 사이트가 없습니다.';
      list.append(empty);
    } else {
      for (const item of visible) {
        const chip = document.createElement('span');
        chip.className = `homepage-preview-chip${item.visibility === 'featured' ? ' featured' : ''}`;
        chip.textContent = `${item.visibility === 'featured' ? '★ ' : ''}${item.order}. ${item.name}`;
        list.append(chip);
      }
    }
    preview.hidden = false;
    homepageStatus('미리보기를 만들었습니다.', '아직 공개 화면에는 반영되지 않았습니다. 확인 후 적용을 누르세요.', 'preview');
  }

  async function loadHomepageControls(force = false) {
    if (homepageLoaded && !force) return;
    if (!token()) {
      homepageStatus('관리자 인증이 필요합니다.', '통합인증센터에서 로그인한 뒤 다시 열어 주세요.', 'warning');
      return;
    }
    homepageStatus('첫화면 설정을 확인하는 중입니다.', '중앙 서비스 레지스트리와 현재 공개 설정을 비교합니다.', 'loading');
    try {
      const data = await homepageApi();
      renderHomepageServices(data.services || []);
      homepageLoaded = true;
    } catch (error) {
      homepageStatus('첫화면 설정을 불러오지 못했습니다.', error.message, 'error');
    }
  }

  async function saveHomepageControls() {
    const apply = document.querySelector('#homepageAdminApply');
    if (!apply || !token()) return;
    const services = collectHomepageDraft().map(({ id, visibility, order }) => ({ id, visibility, order }));
    apply.disabled = true;
    apply.textContent = '적용 중…';
    homepageStatus('안전하게 적용하는 중입니다.', '운영 검증과 공개 가능 여부를 서버에서 다시 확인합니다.', 'loading');
    try {
      const data = await homepageApi('/api/control/homepage', {
        method: 'PUT',
        body: JSON.stringify({ services }),
      });
      renderHomepageServices(data.services || []);
      document.querySelector('#homepageAdminPreview')?.setAttribute('hidden', '');
      homepageStatus('EKODI.KR 첫화면 설정을 적용했습니다.', '공개 화면은 새 설정을 읽어 표시 순서와 주요 노출을 반영합니다.', 'success');
    } catch (error) {
      homepageStatus('적용하지 못했습니다.', error.message, 'error');
    } finally {
      apply.disabled = false;
      apply.textContent = '적용';
    }
  }

  function installHomepageManagement() {
    installHomepageManagementStyle();
    if (!nav.querySelector('[data-section="sites"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav';
      button.dataset.section = 'sites';
      button.append(document.createTextNode('▦ '));
      const label = document.createElement('span');
      label.textContent = 'Sites';
      button.append(label);
      nav.append(button);
    }

    if (!document.querySelector('#homepageAdminPanel')) {
      const panel = document.createElement('section');
      panel.id = 'homepageAdminPanel';
      panel.className = 'section hidden-panel';
      panel.dataset.panel = 'sites';
      panel.hidden = true;
      panel.innerHTML = `
        <div class="homepage-admin-head">
          <div><p class="kicker">SITE MANAGEMENT · PUBLIC GATEWAY</p><h2>사이트 관리 · EKODI.KR 첫화면</h2><p>생태계 사이트의 존재와 첫화면 노출을 분리해 관리합니다. 중앙 레지스트리에 새 사이트가 등록되면 이 목록에 자동으로 나타나며, 공개 가능한 사이트만 선택할 수 있습니다.</p></div>
          <div class="homepage-admin-actions"><button class="secondary" id="homepageAdminRefresh" type="button">↻ 새로고침</button><button class="secondary" id="homepageAdminPreviewButton" type="button">미리보기</button><button class="primary" id="homepageAdminApply" type="button">적용</button></div>
        </div>
        <div class="homepage-admin-notice" id="homepageAdminNotice" role="status" aria-live="polite"><span aria-hidden="true">▦</span><div><strong>첫화면 설정을 준비합니다.</strong><small>사이트를 선택하면 현재 상태와 다음 행동을 바로 확인할 수 있습니다.</small></div></div>
        <div class="homepage-admin-grid" id="homepageAdminGrid"></div>
        <div class="homepage-preview" id="homepageAdminPreview" hidden><strong>공개 순서 미리보기</strong><div class="homepage-preview-list" id="homepageAdminPreviewList"></div></div>`;
      content.append(panel);
      panel.querySelector('#homepageAdminRefresh')?.addEventListener('click', () => loadHomepageControls(true));
      panel.querySelector('#homepageAdminPreviewButton')?.addEventListener('click', previewHomepageDraft);
      panel.querySelector('#homepageAdminApply')?.addEventListener('click', saveHomepageControls);
    }
    applyStableNavigationOrder();
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
    queueMicrotask(() => {
      activatePanel(section);
      if (section === 'sites') loadHomepageControls();
    });
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
    const explicit = explicitHashSection();
    if (explicit && isInternalSection(explicit)) routeInternalToAiOps();
    else if (explicit) {
      requestedSection = explicit;
      if (explicit === 'sites') loadHomepageControls();
    }
  });

  window.addEventListener('hashchange', () => {
    const explicit = explicitHashSection();
    if (!explicit) return;
    if (isInternalSection(explicit)) return routeInternalToAiOps();
    requestedSection = explicit;
    if (!activatePanel(explicit)) openDemand(explicit);
    if (explicit === 'sites') loadHomepageControls();
  });

  installCompactNavigationStyle();
  installHomepageManagement();
  enforceInternalNavigationPolicy();
  const initialHash = explicitHashSection();
  if (initialHash && isInternalSection(initialHash)) routeInternalToAiOps();
  else if (initialHash) {
    requestedSection = initialHash;
    if (initialHash === 'sites') loadHomepageControls();
  }

  window.EKODIAdminPanels = Object.freeze({
    activate: section => {
      if (isInternalSection(section)) return routeInternalToAiOps();
      requestedSection = section;
      if (!activatePanel(section)) openDemand(section);
      if (section === 'sites') loadHomepageControls();
    },
    current: () => requestedSection,
    internalSections: Object.freeze([...INTERNAL_ONLY_SECTIONS]),
    visibleMenuOrder: VISIBLE_NAV_ORDER,
  });
})();

import('./admin-menu-runtime.js').catch(error => {
  console.error('EKODI shared admin menu runtime failed to load.', error);
});
