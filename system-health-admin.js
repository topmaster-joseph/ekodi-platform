(() => {
  const MODULE_ID = 'ekodiSystemHealth';
  const API_BASE = 'https://api.ekodi.kr';
  if (document.getElementById(MODULE_ID)) return;
  const operations = document.querySelector('.operations-section');
  if (!operations) return;

  const section = document.createElement('section');
  section.id = MODULE_ID;
  section.className = 'section system-health-section';
  section.dataset.panel = 'overview services aiops';
  section.innerHTML = `
    <div class="section-head system-health-head">
      <div><p class="kicker">SYSTEM HEALTH</p><h2>트래픽 · 시스템 사용량</h2><p class="operations-copy" data-health-status>Cloudflare 일별 집계를 확인하는 중입니다.</p></div>
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
        <div><strong data-health-chart-title>일자별 전송량</strong><small>원본 접속 로그는 EKODI DB에 저장하지 않습니다.</small></div>
        <div class="system-health-metric-switch" role="group" aria-label="그래프 지표">
          <button class="ghost compact is-active" type="button" data-health-metric="bandwidthBytes">전송량</button>
          <button class="ghost compact" type="button" data-health-metric="requests">요청</button>
        </div>
      </div>
      <div class="system-health-chart" data-health-chart role="img" aria-label="일자별 System Health 그래프"><p class="operations-loading">집계 데이터를 불러오는 중입니다.</p></div>
      <div class="system-health-footnote" data-health-footnote>Cloudflare Analytics · UTC 일 단위 · 과금 산정 지표가 아닌 운영 추세용</div>
    </div>`;
  operations.insertAdjacentElement('afterend', section);

  const get = selector => section.querySelector(selector);
  const status = get('[data-health-status]');
  const chart = get('[data-health-chart]');
  const refresh = get('[data-health-refresh]');
  let days = 7;
  let metric = 'bandwidthBytes';
  let latestData = null;
  let loaded = false;
  let loading = false;

  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const compact = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value)) : '—';
  function bytes(value) {
    let n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unit = 0;
    n = Math.max(0, n);
    while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit += 1; }
    const digits = n >= 100 || unit === 0 ? 0 : n >= 10 ? 1 : 2;
    return `${n.toFixed(digits)} ${units[unit]}`;
  }
  const valueLabel = value => metric === 'bandwidthBytes' ? bytes(value) : compact(value);
  const dayLabel = day => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
  function svg(name, attrs = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }

  function draw(series) {
    chart.textContent = '';
    if (!series?.length) {
      const empty = document.createElement('p');
      empty.className = 'operations-loading';
      empty.textContent = '아직 일별 집계 데이터가 없습니다.';
      chart.append(empty);
      return;
    }
    const width = 760, height = 250, left = 56, right = 18, top = 18, bottom = 42;
    const innerWidth = width - left - right, innerHeight = height - top - bottom;
    const values = series.map(row => Math.max(0, Number(row[metric]) || 0));
    const max = Math.max(...values, 1);
    const step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
    const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    root.classList.add('system-health-svg');
    for (let i = 0; i <= 3; i += 1) {
      const y = top + innerHeight * i / 3;
      root.append(svg('line', { x1: left, x2: width - right, y1: y, y2: y, class: 'system-health-gridline' }));
      const label = svg('text', { x: left - 8, y: y + 4, 'text-anchor': 'end', class: 'system-health-axis-label' });
      label.textContent = valueLabel(max * (1 - i / 3));
      root.append(label);
    }
    const points = series.map((row, index) => ({
      x: series.length === 1 ? left + innerWidth / 2 : left + step * index,
      y: top + innerHeight - values[index] / max * innerHeight,
      row,
      value: values[index]
    }));
    root.append(svg('path', { d: points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '), class: 'system-health-line' }));
    const every = series.length <= 8 ? 1 : series.length <= 16 ? 2 : 5;
    points.forEach((p, i) => {
      const dot = svg('circle', { cx: p.x, cy: p.y, r: 3.2, class: 'system-health-point' });
      const title = svg('title'); title.textContent = `${p.row.day} · ${valueLabel(p.value)}`; dot.append(title); root.append(dot);
      if (i % every === 0 || i === points.length - 1) {
        const label = svg('text', { x: p.x, y: height - 14, 'text-anchor': 'middle', class: 'system-health-axis-label' });
        label.textContent = dayLabel(p.row.day); root.append(label);
      }
    });
    chart.append(root);
  }

  function render(data) {
    latestData = data;
    const latest = data?.summary?.latest;
    get('[data-health-requests]').textContent = latest ? compact(latest.requests) : '—';
    get('[data-health-bandwidth]').textContent = latest ? bytes(latest.bandwidthBytes) : '—';
    get('[data-health-cache]').textContent = data?.summary?.cacheRequestPercent == null ? '—' : `${data.summary.cacheRequestPercent}%`;
    get('[data-health-unique]').textContent = latest?.uniqueVisitors == null ? '—' : compact(latest.uniqueVisitors);
    const state = data?.state || {};
    status.textContent = state.status === 'ok'
      ? `정상 · 최근 집계 ${state.lastSuccessAt ? new Date(state.lastSuccessAt).toLocaleString('ko-KR') : '완료'}`
      : state.status === 'error' ? `Analytics 연결 확인 필요 · ${state.message || '최근 수집 실패'}` : state.message || '첫 Analytics 집계를 기다리는 중입니다.';
    get('[data-health-chart-title]').textContent = metric === 'bandwidthBytes' ? '일자별 전송량' : '일자별 요청 수';
    draw(data?.series || []);
  }

  async function load(force = false) {
    if (loading || (loaded && !force) || !token()) return;
    loading = true; refresh.disabled = true; status.textContent = 'Cloudflare 일별 집계를 읽는 중입니다.';
    try {
      const response = await fetch(`${API_BASE}/api/control/system-health?days=${days}`, { headers: { authorization: `Bearer ${token()}` }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      loaded = true; render(data);
    } catch (error) {
      status.textContent = `System Health를 불러오지 못했습니다: ${error.message || error}`;
      chart.innerHTML = '<p class="operations-error">서비스 운영에는 영향이 없습니다. Analytics 연결 상태만 확인해 주세요.</p>';
    } finally { loading = false; refresh.disabled = false; }
  }

  section.querySelectorAll('[data-health-days]').forEach(button => button.addEventListener('click', () => {
    days = Number(button.dataset.healthDays) === 30 ? 30 : 7;
    section.querySelectorAll('[data-health-days]').forEach(item => item.classList.toggle('is-active', item === button));
    loaded = false; load(true);
  }));
  section.querySelectorAll('[data-health-metric]').forEach(button => button.addEventListener('click', () => {
    metric = button.dataset.healthMetric === 'requests' ? 'requests' : 'bandwidthBytes';
    section.querySelectorAll('[data-health-metric]').forEach(item => item.classList.toggle('is-active', item === button));
    if (latestData) render(latestData);
  }));
  refresh.addEventListener('click', () => load(true));

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); }
    }, { rootMargin: '180px' });
    observer.observe(section);
  } else if ('requestIdleCallback' in window) requestIdleCallback(() => load(), { timeout: 1500 });
  else setTimeout(() => load(), 0);
})();
