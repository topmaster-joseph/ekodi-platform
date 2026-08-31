(() => {
  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';

  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';

  function element(tag, text = '', className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  async function api(path) {
    const headers = new Headers();
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    const response = await fetch(`${API}${path}`, { headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `API 요청 실패 (${response.status})`);
    return data;
  }

  function healthLabel(status) {
    return ({ online: '정상', degraded: '지연', offline: '장애' })[status] || '점검 전';
  }

  function stateLabel(state) {
    return ({ active: '운영', planned: '준비', paused: '중지' })[state] || state || '미지정';
  }

  function formatMetric(value, suffix = '') {
    return value === null || value === undefined ? '—' : `${value}${suffix}`;
  }

  function installDomainsHub() {
    if (!token()) return;
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('[data-section="domains"]')) return;

    const navButton = element('button', '', 'nav');
    navButton.type = 'button';
    navButton.dataset.section = 'domains';
    navButton.append(document.createTextNode('◎ '), element('span', 'Domains'));
    const placeholder = nav.querySelector('[data-lazy-section="domains"]');
    if (placeholder) placeholder.insertAdjacentElement('beforebegin', navButton);
    else nav.append(navButton);

    const section = element('section', '', 'section domains-hub hidden-panel');
    section.dataset.panel = 'domains';
    section.id = 'domainsHub';

    const head = element('div', '', 'domains-head');
    const heading = element('div');
    heading.append(element('p', 'SERVICE ROUTING & RELEASE', 'kicker'), element('h2', 'Domains · Deployments'));
    heading.append(element('p', '개발과 운영을 분리해 주소, 배포 경로, 실제 서비스 상태를 함께 확인합니다. DNS 원문 편집은 노출하지 않습니다.', 'operations-copy'));
    const refresh = element('button', '↻ 상태 새로고침', 'secondary domains-refresh');
    refresh.type = 'button';
    head.append(heading, refresh);

    const environmentShell = element('section', '', 'domains-environments');
    const environmentHead = element('div', '', 'domains-environment-head');
    const environmentTitle = element('div');
    environmentTitle.append(element('strong', '배포 환경'), element('small', 'Development와 Production을 서로 다른 경계로 운영합니다.'));
    const environmentCheckedAt = element('small', '환경 상태 대기');
    environmentHead.append(environmentTitle, environmentCheckedAt);
    const environmentGrid = element('div', '', 'domains-environment-grid');
    const promotionFlow = element('div', '', 'domains-promotion-flow');
    promotionFlow.append(
      element('span', 'Development', 'flow-stage development'),
      element('span', '→ 자동 검증 →', 'flow-gate'),
      element('span', 'Production', 'flow-stage production')
    );
    const promotionNote = element('small', '운영 승격은 guarded release를 통해서만 수행합니다. 관리자 화면에서 운영 경계를 우회하지 않습니다.');
    environmentShell.append(environmentHead, environmentGrid, promotionFlow, promotionNote);

    const summary = element('div', '', 'domains-summary');

    const toolbar = element('div', '', 'domains-toolbar');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = '운영 도메인, 서비스 검색';
    search.setAttribute('aria-label', '운영 도메인 검색');
    const healthFilter = document.createElement('select');
    healthFilter.setAttribute('aria-label', '서비스 상태 필터');
    for (const [value, label] of [['all', '상태 전체'], ['online', '정상'], ['degraded', '지연'], ['offline', '장애'], ['pending', '점검 전']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; healthFilter.append(option);
    }
    const stateFilter = document.createElement('select');
    stateFilter.setAttribute('aria-label', '운영 상태 필터');
    for (const [value, label] of [['all', '운영 전체'], ['active', '운영'], ['planned', '준비'], ['paused', '중지']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; stateFilter.append(option);
    }
    const monitorFilter = document.createElement('select');
    monitorFilter.setAttribute('aria-label', '자동 점검 필터');
    for (const [value, label] of [['all', '점검 전체'], ['on', '자동 점검'], ['off', '점검 꺼짐']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; monitorFilter.append(option);
    }
    const reset = element('button', '필터 초기화', 'ghost'); reset.type = 'button';
    toolbar.append(search, healthFilter, stateFilter, monitorFilter, reset);

    const resultBar = element('div', '', 'domains-result-bar');
    const resultCount = element('span', '0개 운영 도메인');
    const checkedAt = element('small', '실시간 운영정보 대기');
    resultBar.append(resultCount, checkedAt);

    const grid = element('div', '', 'domains-grid');
    const stateMessage = element('p', '', 'domains-state');
    stateMessage.setAttribute('role', 'status');

    const guard = element('aside', '', 'domains-release-guard');
    const guardCopy = element('div');
    guardCopy.append(element('strong', 'Release Guard'), element('span', 'Development → 자동 검증 → Production'));
    const guardNote = element('small', '개발은 격리된 workers.dev 경계에서 검증하고, 운영은 canonical ekodi.kr 주소에서만 서비스합니다.');
    guard.append(guardCopy, guardNote);

    section.append(head, environmentShell, summary, toolbar, resultBar, stateMessage, grid, guard);
    content.append(section);

    let servicesCache = [];
    let generatedAt = '';
    let environmentsCache = [];
    let environmentGeneratedAt = '';

    function domainServices() {
      return servicesCache.filter(service => service.domain && String(service.domain).includes('.'));
    }

    function renderSummary() {
      const services = domainServices();
      const active = services.filter(service => service.state === 'active').length;
      const healthy = services.filter(service => service.latest?.status === 'online').length;
      const monitored = services.filter(service => Boolean(service.monitorEnabled)).length;
      summary.replaceChildren();
      for (const [label, value, note] of [
        ['등록 도메인', services.length, 'service registry'],
        ['운영', active, 'active'],
        ['현재 정상', healthy, 'live check'],
        ['자동 점검', monitored, 'monitoring'],
      ]) {
        const card = element('article');
        card.append(element('small', label), element('strong', String(value)), element('span', note));
        summary.append(card);
      }
    }

    function environmentPolicy(environment) {
      if (environment.id === 'development') {
        return {
          label: '개발 Development',
          role: '격리 스테이징',
          branch: 'development',
          route: 'workers.dev · 격리 스테이징',
          deploy: 'Development Cloudflare 계정',
        };
      }
      return {
        label: '운영 Production',
        role: '실서비스',
        branch: 'main',
        route: '*.ekodi.kr · canonical',
        deploy: 'Production Cloudflare 계정',
      };
    }

    function environmentCard(environment) {
      const policy = environmentPolicy(environment);
      const card = element('article', '', `environment-card ${environment.id}`);
      card.dataset.environment = environment.id;

      const top = element('div', '', 'environment-card-head');
      const identity = element('div');
      identity.append(element('small', policy.role), element('strong', policy.label));
      top.append(identity, element('span', healthLabel(environment.status), `domain-health ${environment.status || 'pending'}`));

      const facts = element('dl', '', 'environment-facts');
      for (const [label, value] of [
        ['Git 브랜치', environment.deploymentBranch || policy.branch],
        ['주소 정책', policy.route],
        ['배포 경계', policy.deploy],
      ]) {
        const row = element('div');
        row.append(element('dt', label), element('dd', value));
        facts.append(row);
      }

      const counts = element('div', '', 'environment-counts');
      const snapshot = environment.summary || {};
      for (const [label, value, state] of [
        ['전체', snapshot.total ?? 0, 'total'],
        ['정상', snapshot.online ?? 0, 'online'],
        ['지연', snapshot.degraded ?? 0, 'degraded'],
        ['장애', snapshot.offline ?? 0, 'offline'],
      ]) {
        const metric = element('div', '', state);
        metric.append(element('small', label), element('strong', String(value)));
        counts.append(metric);
      }

      const problemServices = (environment.services || []).filter(service => service.status !== 'online');
      const serviceState = element('div', '', 'environment-service-state');
      if (!problemServices.length) {
        serviceState.append(element('span', '● 모든 대상 서비스 정상', 'environment-all-good'));
      } else {
        serviceState.append(element('span', `${problemServices.length}개 서비스 확인 필요`, 'environment-warning'));
        const names = problemServices.slice(0, 3).map(service => service.name || service.id).join(' · ');
        serviceState.append(element('small', names + (problemServices.length > 3 ? ` 외 ${problemServices.length - 3}개` : '')));
      }

      card.append(top, facts, counts, serviceState);
      return card;
    }

    function renderEnvironments() {
      environmentGrid.replaceChildren();
      const byId = new Map(environmentsCache.map(environment => [environment.id, environment]));
      for (const id of ['development', 'production']) {
        const environment = byId.get(id) || { id, status: 'pending', summary: {}, services: [] };
        environmentGrid.append(environmentCard(environment));
      }
      environmentCheckedAt.textContent = environmentGeneratedAt
        ? `최근 환경 확인 ${new Date(environmentGeneratedAt).toLocaleString('ko-KR')}`
        : '환경 상태 집계 완료';
    }

    function filteredServices() {
      const query = search.value.trim().toLowerCase();
      return domainServices()
        .filter(service => {
          const haystack = `${service.domain || ''} ${service.name || ''}`.toLowerCase();
          const status = service.latest?.status || 'pending';
          const matchesSearch = !query || haystack.includes(query);
          const matchesHealth = healthFilter.value === 'all' || status === healthFilter.value;
          const matchesState = stateFilter.value === 'all' || service.state === stateFilter.value;
          const matchesMonitor = monitorFilter.value === 'all'
            || (monitorFilter.value === 'on' && Boolean(service.monitorEnabled))
            || (monitorFilter.value === 'off' && !service.monitorEnabled);
          return matchesSearch && matchesHealth && matchesState && matchesMonitor;
        })
        .sort((a, b) => String(a.domain).localeCompare(String(b.domain)));
    }

    function focusService(domain) {
      const openServices = document.querySelector('.sidebar [data-section="services"]');
      openServices?.click();
      const tryFocus = () => {
        const card = [...document.querySelectorAll('.service-control-card')].find(item => item.querySelector('.service-control-head small')?.textContent?.trim() === domain);
        if (!card) return false;
        card.classList.add('domains-service-focus');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => card.classList.remove('domains-service-focus'), 2200);
        return true;
      };
      if (!tryFocus()) window.setTimeout(tryFocus, 450);
    }

    function domainCard(service) {
      const card = element('article', '', 'domain-card');
      const status = service.latest?.status || 'pending';
      card.dataset.health = status;
      card.dataset.state = service.state || '';

      const top = element('div', '', 'domain-card-head');
      const identity = element('div', '', 'domain-identity');
      identity.append(element('strong', service.domain), element('small', service.name || service.id || 'EKODI Service'));
      const badges = element('div', '', 'domain-badges');
      badges.append(element('span', healthLabel(status), `domain-health ${status}`));
      badges.append(element('span', stateLabel(service.state), `domain-runtime ${service.state || 'unknown'}`));
      top.append(identity, badges);

      const metrics = element('div', '', 'domain-metrics');
      for (const [label, value] of [
        ['24h 가용률', formatMetric(service.stats24h?.availabilityPercent, '%')],
        ['평균 응답', formatMetric(service.stats24h?.averageResponseTime, 'ms')],
        ['HTTP', formatMetric(service.latest?.httpStatus)],
      ]) {
        const metric = element('div');
        metric.append(element('small', label), element('strong', value));
        metrics.append(metric);
      }

      const meta = element('div', '', 'domain-card-meta');
      const monitor = element('span', service.monitorEnabled ? '● 자동 점검' : '○ 점검 꺼짐', service.monitorEnabled ? 'monitor-on' : 'monitor-off');
      const note = element('span', service.note || '운영 메모 없음');
      meta.append(monitor, note);

      const actions = element('div', '', 'domain-actions');
      const open = element('a', '사이트 열기 ↗', 'ghost');
      open.href = service.url || `https://${service.domain}`;
      open.target = '_blank';
      open.rel = 'noopener';
      const manage = element('button', 'Services에서 관리 →', 'secondary');
      manage.type = 'button';
      manage.addEventListener('click', () => focusService(service.domain));
      actions.append(open, manage);

      card.append(top, metrics, meta, actions);
      return card;
    }

    function renderDomains() {
      const services = filteredServices();
      resultCount.textContent = `${services.length}개 운영 도메인`;
      checkedAt.textContent = generatedAt
        ? `최근 확인 ${new Date(generatedAt).toLocaleString('ko-KR')}`
        : '운영정보 집계 완료';
      grid.replaceChildren();
      if (!services.length) {
        grid.append(element('p', '조건에 맞는 운영 도메인이 없습니다.', 'operations-loading'));
        return;
      }
      services.forEach(service => grid.append(domainCard(service)));
    }

    async function loadDomains() {
      refresh.disabled = true;
      stateMessage.textContent = '';
      environmentGrid.replaceChildren(element('p', '개발·운영 환경 상태를 확인하는 중입니다.', 'operations-loading'));
      grid.replaceChildren(element('p', 'api.ekodi.kr에서 운영 도메인 상태를 확인하는 중입니다.', 'operations-loading'));
      try {
        const [domainData, environmentData] = await Promise.all([
          api('/api/control/overview'),
          api('/api/control/cloudflare-accounts'),
        ]);
        servicesCache = domainData.services || [];
        generatedAt = domainData.generatedAt || '';
        environmentsCache = environmentData.accounts || [];
        environmentGeneratedAt = environmentData.generatedAt || '';
        renderEnvironments();
        renderSummary();
        renderDomains();
      } catch (error) {
        stateMessage.textContent = error.message || '도메인·배포 환경 정보를 불러오지 못했습니다.';
        environmentGrid.replaceChildren(element('p', '배포 환경 정보를 불러오지 못했습니다.', 'operations-loading'));
        grid.replaceChildren(element('p', '운영 도메인 정보를 불러오지 못했습니다.', 'operations-loading'));
      } finally {
        refresh.disabled = false;
      }
    }

    async function activate() {
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('domains'));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'domains'));
      const pageTitle = document.querySelector('#pageTitle');
      if (pageTitle) pageTitle.textContent = 'Domains · Deployments';
      document.querySelector('.sidebar')?.classList.remove('open');
      await loadDomains();
    }

    navButton.addEventListener('click', activate);
    refresh.addEventListener('click', loadDomains);
    [search, healthFilter, stateFilter, monitorFilter].forEach(control => control.addEventListener(control === search ? 'input' : 'change', renderDomains));
    reset.addEventListener('click', () => {
      search.value = '';
      healthFilter.value = 'all';
      stateFilter.value = 'all';
      monitorFilter.value = 'all';
      renderDomains();
      search.focus();
    });
  }

  installDomainsHub();
})();
