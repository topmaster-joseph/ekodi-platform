(() => {
  const nativeFetch = window.fetch.bind(window);
  const legacyApiOrigin = 'https://ekodi-auth-api.topmaster-joseph.workers.dev';
  const canonicalApiOrigin = 'https://api.ekodi.kr';
  const legacyMonitorPrefix = 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/monitor-status.json';
  let controlManagerReady = false;

  function inputUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    if (input instanceof Request) return input.url;
    return String(input);
  }

  function rewriteInput(input, url) {
    return input instanceof Request ? new Request(url, input) : url;
  }

  function withBearer(init = {}) {
    const headers = new Headers(init.headers || {});
    const token = sessionStorage.getItem('ekodi-auth-token');
    if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`);
    return { ...init, headers, cache: 'no-store' };
  }

  function fallbackApiUrl(url) {
    if (!url.startsWith(canonicalApiOrigin)) return null;
    return legacyApiOrigin + url.slice(canonicalApiOrigin.length);
  }

  async function fetchWithApiFallback(input, init, canonicalUrl) {
    const canonicalInput = rewriteInput(input, canonicalUrl);
    try {
      const response = await nativeFetch(canonicalInput, init);
      if (![404, 502, 522, 523, 525, 530].includes(response.status)) return response;
      const fallback = fallbackApiUrl(canonicalUrl);
      return fallback ? nativeFetch(rewriteInput(input, fallback), init) : response;
    } catch (error) {
      const fallback = fallbackApiUrl(canonicalUrl);
      if (!fallback) throw error;
      return nativeFetch(rewriteInput(input, fallback), init);
    }
  }

  async function controlRequest(path, init = {}) {
    const url = canonicalApiOrigin + path;
    return fetchWithApiFallback(url, withBearer(init), url);
  }

  function announce(message) {
    if (typeof window.notify === 'function') window.notify(message);
    else console.info(message);
  }

  function ensureControlStyles() {
    if (document.querySelector('link[data-control-center-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'control-center.css';
    link.dataset.controlCenterStyle = 'true';
    document.head.append(link);
  }

  function ensureControlManager() {
    if (controlManagerReady) return document.querySelector('#controlServiceManager');
    const servicesPanel = document.querySelector('.services-panel');
    if (!servicesPanel) return null;
    ensureControlStyles();

    const manager = document.createElement('section');
    manager.className = 'control-manager';
    manager.id = 'controlServiceManager';

    const head = document.createElement('div');
    head.className = 'control-manager-head';
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = '통합 서비스 제어';
    const description = document.createElement('p');
    description.textContent = 'API를 통해 서비스 상태·24시간 통계·운영설정을 확인하고 변경합니다.';
    copy.append(title, description);

    const checkButton = document.createElement('button');
    checkButton.type = 'button';
    checkButton.className = 'secondary';
    checkButton.id = 'runControlCheck';
    checkButton.textContent = '↻ 전체 즉시 점검';
    checkButton.addEventListener('click', runImmediateCheck);
    head.append(copy, checkButton);

    const grid = document.createElement('div');
    grid.className = 'control-service-grid';
    grid.id = 'controlServiceGrid';
    const loading = document.createElement('p');
    loading.className = 'control-empty';
    loading.textContent = '서비스 운영정보를 불러오는 중입니다.';
    grid.append(loading);

    manager.append(head, grid);
    servicesPanel.append(manager);
    controlManagerReady = true;
    return manager;
  }

  function statusLabel(status) {
    return ({ online: '정상', degraded: '지연/주의', offline: '장애' })[status] || '점검 전';
  }

  function stateLabel(state) {
    return ({ active: '운영', planned: '준비', paused: '중지' })[state] || state;
  }

  function metricValue(value, suffix = '') {
    return value === null || value === undefined ? '—' : `${value}${suffix}`;
  }

  function metricCell(label, value) {
    const cell = document.createElement('div');
    const small = document.createElement('small');
    small.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    cell.append(small, strong);
    return cell;
  }

  function renderServiceCard(service) {
    const card = document.createElement('article');
    card.className = 'control-service-card searchable';
    card.dataset.state = service.state;

    const head = document.createElement('div');
    head.className = 'control-card-head';
    const identity = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = service.name;
    const domain = document.createElement('small');
    domain.textContent = service.domain;
    identity.append(name, domain);
    const health = document.createElement('span');
    health.className = `control-health ${service.latest?.status || 'pending'}`;
    health.textContent = service.state === 'active' ? statusLabel(service.latest?.status) : stateLabel(service.state);
    head.append(identity, health);

    const metrics = document.createElement('div');
    metrics.className = 'control-metrics';
    metrics.append(
      metricCell('24시간 가용률', metricValue(service.stats24h?.availabilityPercent, '%')),
      metricCell('평균 응답', metricValue(service.stats24h?.averageResponseTime, 'ms')),
      metricCell('최근 HTTP', metricValue(service.latest?.httpStatus))
    );

    const form = document.createElement('form');
    form.className = 'control-settings';

    const stateField = document.createElement('label');
    stateField.textContent = '운영상태';
    const select = document.createElement('select');
    select.name = 'state';
    for (const [value, label] of [['active', '운영'], ['planned', '준비'], ['paused', '중지']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = service.state === value;
      select.append(option);
    }
    stateField.append(select);

    const monitor = document.createElement('label');
    monitor.className = 'control-monitor-toggle';
    const monitorInput = document.createElement('input');
    monitorInput.type = 'checkbox';
    monitorInput.name = 'monitorEnabled';
    monitorInput.checked = Boolean(service.monitorEnabled);
    monitor.append(monitorInput, document.createTextNode(' 자동 상태점검'));

    const noteField = document.createElement('label');
    noteField.className = 'control-note';
    noteField.textContent = '운영 메모';
    const note = document.createElement('input');
    note.type = 'text';
    note.name = 'note';
    note.maxLength = 500;
    note.placeholder = '운영 참고사항, 담당, 다음 작업 등';
    note.value = service.note || '';
    noteField.append(note);

    const actions = document.createElement('div');
    actions.className = 'control-actions';
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'primary';
    save.textContent = '운영설정 저장';
    actions.append(save);

    form.append(stateField, monitor, noteField, actions);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      save.disabled = true;
      try {
        const response = await controlRequest(`/api/control/services/${service.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            state: select.value,
            monitorEnabled: monitorInput.checked,
            note: note.value.trim()
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '운영설정을 저장하지 못했습니다.');
        announce(`${service.name} 운영설정을 저장했습니다.`);
        await loadControlServices();
      } catch (error) {
        announce(error.message);
      } finally {
        save.disabled = false;
      }
    });

    card.append(head, metrics, form);
    return card;
  }

  async function loadControlServices() {
    const token = sessionStorage.getItem('ekodi-auth-token');
    if (!token) return;
    ensureControlManager();
    const grid = document.querySelector('#controlServiceGrid');
    if (!grid) return;
    try {
      const response = await controlRequest('/api/control/services');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '통합 서비스 정보를 불러오지 못했습니다.');
      grid.textContent = '';
      for (const service of data.services || []) grid.append(renderServiceCard(service));
      if (!data.services?.length) {
        const empty = document.createElement('p');
        empty.className = 'control-empty';
        empty.textContent = '등록된 서비스가 없습니다.';
        grid.append(empty);
      }
    } catch (error) {
      grid.textContent = '';
      const message = document.createElement('p');
      message.className = 'control-empty';
      message.textContent = error.message;
      grid.append(message);
    }
  }

  async function runImmediateCheck() {
    const button = document.querySelector('#runControlCheck');
    if (button) {
      button.disabled = true;
      button.textContent = '↻ 점검 중';
    }
    try {
      const response = await controlRequest('/api/control/check', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '즉시 점검에 실패했습니다.');
      announce(`서비스 점검 완료: 정상 ${data.summary.online}, 지연 ${data.summary.degraded}, 장애 ${data.summary.offline}`);
      await loadControlServices();
      if (typeof window.loadMonitorStatus === 'function') await window.loadMonitorStatus();
    } catch (error) {
      announce(error.message);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = '↻ 전체 즉시 점검';
      }
    }
  }

  window.fetch = async (input, init = {}) => {
    const url = inputUrl(input);

    if (url.startsWith(legacyMonitorPrefix)) {
      const options = withBearer(init);
      return fetchWithApiFallback(input, options, `${canonicalApiOrigin}/api/control/overview`);
    }

    if (url.startsWith(legacyApiOrigin)) {
      const canonicalUrl = canonicalApiOrigin + url.slice(legacyApiOrigin.length);
      const response = await fetchWithApiFallback(input, init, canonicalUrl);
      if (response.ok && /\/api\/(login|setup)(?:$|\?)/.test(canonicalUrl)) {
        setTimeout(() => {
          loadControlServices();
          if (typeof window.loadMonitorStatus === 'function') window.loadMonitorStatus();
        }, 500);
      }
      return response;
    }

    return nativeFetch(input, init);
  };

  ensureControlManager();
  setTimeout(loadControlServices, 300);
})();
