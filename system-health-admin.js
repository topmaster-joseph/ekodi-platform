(() => {
  const MODULE_ID = 'ekodiSystemHealth';
  const API_BASE = 'https://api.ekodi.kr';
  if (document.getElementById(MODULE_ID)) return;

  const operations = document.querySelector('.operations-section');
  if (!operations) return;

  const section = document.createElement('section');
  section.id = MODULE_ID;
  section.className = 'section system-health-section';
  section.dataset.panel = 'overview services';
  section.innerHTML = `
    <div class="section-head system-health-head">
      <div>
        <p class="kicker">SYSTEM HEALTH</p>
        <h2>트래픽 · 시스템 사용량</h2>
        <p class="operations-copy" data-health-status>Cloudflare 일별 집계를 확인하는 중입니다.</p>
      </div>
      <div class="system-health-actions" aria-label="System Health 기간 선택">
        <button class="ghost compact is-active" type="button" data-health-days="7">7일</button>
        <button class="ghost compact" type="button" data-health-days="30">30일</button>
        <button class="secondary compact" type="button" data-health-refresh>↻ 새로고침</button>
      </div>
    </div>
    <div class="system-health-metrics" aria-label="System Health 요약">
      <article><small>최근 요청</small><strong data-health-requests>—</strong><span>완료된 최근 UTC 일자</span></article>
      <article><small>최근 전송량</small><strong data-health-bandwidth>—</strong><span>Cloudflare 측정값</span></article>
      <article><small>캐시 요청 비율</small><strong data-health-cache>—</strong><span>최근 선택 기간</span></article>
      <article><small>최근 고유 방문</small><strong data-health-unique>—</strong><span>Cloudflare 추정 고유 IP</span></article>
    </div>
    <div class="system-health-chart-card">
      <div class="system-health-chart-toolbar">
        <div>
          <strong data-health-chart-title>일자별 전송량</strong>
          <small>원본 접속 로그는 EKODI DB에 저장하지 않습니다.</small>
        </div>
        <div class="system-health-metric-switch" role="group" aria-label="그래프 지표">
          <button class="ghost compact is-active" type="button" data-health-metric="bandwidthBytes">전송량</button>
          <button class="ghost compact" type="button" data-health-metric="requests">요청</button>
        </div>
      </div>
      <div class="system-health-chart" data-health-chart role="img" aria-label="일자별 System Health 그래프">
        <p class="operations-loading">집계 데이터를 불러오는 중입니다.</p>
      </div>
      <div class="system-health-footnote" data-health-footnote>Cloudflare Analytics · UTC 일 단위 · 과금 산정 지표가 아닌 운영 추세용</div>
    </div>`;
  operations.insertAdjacentElement('afterend', section);

  const status = section.querySelector('[data-health-status]');
  const requestsValue = section.querySelector('[data-health-requests]');
  const bandwidthValue = section.querySelector('[data-health-bandwidth]');
  const cacheValue = section.querySelector('[data-health-cache]');
  const uniqueValue = section.querySelector('[data-health-unique]');
  const chart = section.querySelector('[data-health-chart]');
  const chartTitle = section.querySelector('[data-health-chart-title]');
  const footnote = section.querySelector('[data-health-footnote]');
  const refresh = section.querySelector('[data-health-refresh]');
  let days = 7;
  let metric = 'bandwidthBytes';
  let latestData = null;
  let loaded = false;
  let loading = false;

  function authToken() {
    return sessionStorage.getItem('ekodi-auth-token') || '';
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }

  function formatBytes(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let amount = Math.max(0, n);
    let index = 0;
    while (amount >= 1024 && index < units.length - 1) {
      amount /= 1024;
      index += 1;
    }
    const digits = amount >= 100 || index === 0 ? 0 : amount >= 10 ? 1 : 2;
    return `${amount.toFixed(digits)} ${units[index]}`;
  }

  function dateLabel(day) {
    const date = new Date(`${day}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return day;
    return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }).format(date);
  }

  function metricLabel(value) {
    return metric === 'bandwidthBytes' ? formatBytes(value) : formatNumber(value);
  }

  function svgNode(name, attributes = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  }

  function renderChart(series) {
    chart.textContent = '';
    if (!series?.length) {
      const empty = document.createElement('p');
      empty.className = 'operations-loading';
      empty.textContent = '아직 일별 집계 데이터가 없습니다.';
      chart.append(empty);
      return;
    }

    const width = 760;
    const height = 250;
    const pad = { top: 18, right: 18, bottom: 42, left: 54 };
    const values = series.map(row => Math.max(0, Number(row[metric]) || 0));
    const max = Math.max(...values, 1);
    const innerWidth = width - pad.left - pad.right;
    const innerHeight = height - pad.top - pad.bottom;
    const step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
    const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    svg.classList.add('system-health-svg');

    for (let i = 0; i <= 3; i += 1) {
      const y = pad.top + (innerHeight * i) / 3;
      svg.append(svgNode('line', { x1: pad.left, x2: width - pad.right, y1: y, y2: y, class: 'system-health-gridline' }));
      const label = svgNode('text', { x: pad.left - 8, y: y + 4, 'text-anchor': 'end', class: 'system-health-axis-label' });
      label.textContent = metricLabel(max * (1 - i / 3));
      svg.append(label);
    }

    const points = series.map((row, index) => {
      const x = series.length === 1 ? pad.left + innerWidth / 2 : pad.left + step * index;
      const y = pad.top + innerHeight - (values[index] / max) * innerHeight;
      return { x, y, row, value: values[index] };
    });
    const pathData = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    svg.append(svgNode('path', { d: pathData, class: 'system-health-line' }));

    const labelEvery = series.length <= 8 ? 1 : series.length <= 16 ? 2 : 5;
    points.forEach((point, index) => {
      const circle = svgNode('circle', { cx: point.x, cy: point.y, r: 3.2, class: 'system-health-point' });
      const title = svgNode('title');
      title.textContent = `${point.row.day} · ${metricLabel(point.value)}`;
      circle.append(title);
      svg.append(circle);
      if (index % labelEvery === 0 || index === points.length - 1) {
        const label = svgNode('text', { x: point.x, y: height - 14, 'text-anchor': 'middle', class: 'system-health-axis-label' });
        label.textContent = dateLabel(point.row.day);
        svg.append(label);
      }
    });
    chart.append(svg);
  }

  function render(data) {
    latestData = data;
    const latest = data?.summary?.latest;
    requestsValue.textContent = latest ? formatNumber(latest.requests) : '—';
    bandwidthValue.textContent = latest ? formatBytes(latest.bandwidthBytes) : '—';
    cacheValue.textContent = data?.summary?.cacheRequestPercent == null ? '—' : `${data.summary.cacheRequestPercent}%`;
    uniqueValue.textContent = latest?.uniqueVisitors == null ? '—' : formatNumber(latest.uniqueVisitors);
    const state = data?.state || {};
    if (state.status === 'ok') {
      status.textContent = `정상 · 최근 집계 ${state.lastSuccessAt ? new Date(state.lastSuccessAt).toLocaleString('ko-KR') : '완료'}`;
    } else if (state.status === 'error') {
      status.textContent = `Analytics 연결 확인 필요 · ${state.message || '최근 수집 실패'}`;
    } else {
      status.textContent = state.message || '첫 Analytics 집계를 기다리는 중입니다.';
    }
    chartTitle.textContent = metric === 'bandwidthBytes' ? '일자별 전송량' : '일자별 요청 수';
    footnote.textContent = `${data?.source === 'cloudflare' ? 'Cloudflare Analytics' : 'System Health'} · UTC 일 단위 · 과금 산정 지표가 아닌 운영 추세용`;
    renderChart(data?.series || []);
  }

  async function load(force = false) {
    if (loading || (loaded && !force)) return;
    const token = authToken();
    if (!token) return;
    loading = true;
    refresh.disabled = true;
    status.textContent = 'Cloudflare 일별 집계를 읽는 중입니다.';
    try {
      const response = await fetch(`${API_BASE}/api/control/system-health?days=${days}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      loaded = true;
      render(data);
    } catch (error) {
      status.textContent = `System Health를 불러오지 못했습니다: ${error.message || error}`;
      chart.textContent = '';
      const message = document.createElement('p');
      message.className = 'operations-error';
      message.textContent = '서비스 운영에는 영향이 없습니다. Analytics 연결 상태만 확인해 주세요.';
      chart.append(message);
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  }

  section.querySelectorAll('[data-health-days]').forEach(button => {
    button.addEventListener('click', () => {
      days = Number(button.dataset.healthDays) === 30 ? 30 : 7;
      section.querySelectorAll('[data-health-days]').forEach(item => item.classList.toggle('is-active', item === button));
      loaded = false;
      load(true);
    });
  });

  section.querySelectorAll('[data-health-metric]').forEach(button => {
    button.addEventListener('click', () => {
      metric = button.dataset.healthMetric === 'requests' ? 'requests' : 'bandwidthBytes';
      section.querySelectorAll('[data-health-metric]').forEach(item => item.classList.toggle('is-active', item === button));
      if (latestData) render(latestData);
    });
  });

  refresh.addEventListener('click', () => load(true));

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    }, { rootMargin: '180px' });
    observer.observe(section);
  } else if ('requestIdleCallback' in window) {
    requestIdleCallback(() => load(), { timeout: 1500 });
  } else {
    setTimeout(() => load(), 0);
  }
})();
