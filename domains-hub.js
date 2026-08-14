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
    const activity = nav.querySelector('a[href="/legacy#activity"]');
    if (placeholder) placeholder.insertAdjacentElement('beforebegin', navButton);
    else if (activity) nav.insertBefore(navButton, activity);
    else nav.append(navButton);

    const section = element('section', '', 'section domains-hub hidden-panel');
    section.dataset.panel = 'domains';
    section.id = 'domainsHub';

    const head = element('div', '', 'domains-head');
    const heading = element('div');
    heading.append(element('p', 'SERVICE ROUTING MAP', 'kicker'), element('h2', 'Domains'));
    heading.append(element('p', 'EKODI 서비스 주소와 실제 운영 상태를 한 화면에서 확인합니다. DNS 원문 편집은 노출하지 않습니다.', 'operations-copy'));
    const refresh = element('button', '↻ 새로고침', 'secondary domains-refresh');
    refresh.type = 'button';
    head.append(heading, refresh);

    const summary = element('div', '', 'domains-summary');

    const toolbar = element('div', '', 'domains-toolbar');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = '도메인, 서비스 검색';
    search.setAttribute('aria-label', '도메인 검색');
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
    const resultCount = element('span', '0개 도메인');
    const checkedAt = element('small', '실시간 운영정보 대기');
    resultBar.append(resultCount, checkedAt);

    const grid = element('div', '', 'domains-grid');
    const stateMessage = element('p', '', 'domains-state');
    stateMessage.setAttribute('role', 'status');

    const guard = element('aside', '', 'domains-release-guard');
    const guardCopy = element('div');
    guardCopy.append(element('strong', 'Release Guard'), element('span', 'Staging → 자동 검증 → 운영 전환'));
    const guardNote = element('small', 'DNS 변경 자체보다 서비스가 실제 주소에서 정상 동작하는지 확인하는 것을 우선합니다.');
    guard.append(guardCopy, guardNote);

    section.append(head, summary, toolbar, resultBar, stateMessage, grid, guard);
    content.append(section);

    let servicesCache = [];
    let generatedAt = '';

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
      resultCount.textContent = `${services.length}개 도메인`;
      checkedAt.textContent = generatedAt
        ? `최근 확인 ${new Date(generatedAt).toLocaleString('ko-KR')}`
        : '운영정보 집계 완료';
      grid.replaceChildren();
      if (!services.length) {
        grid.append(element('p', '조건에 맞는 도메인이 없습니다.', 'operations-loading'));
        return;
      }
      services.forEach(service => grid.append(domainCard(service)));
    }

    async function loadDomains() {
      refresh.disabled = true;
      stateMessage.textContent = '';
      grid.replaceChildren(element('p', 'api.ekodi.kr에서 도메인 운영 상태를 확인하는 중입니다.', 'operations-loading'));
      try {
        const data = await api('/api/control/overview');
        servicesCache = data.services || [];
        generatedAt = data.generatedAt || '';
        renderSummary();
        renderDomains();
      } catch (error) {
        stateMessage.textContent = error.message || '도메인 정보를 불러오지 못했습니다.';
        grid.replaceChildren(element('p', '도메인 운영정보를 불러오지 못했습니다.', 'operations-loading'));
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
      if (pageTitle) pageTitle.textContent = 'Domains';
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
