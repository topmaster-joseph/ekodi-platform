(() => {
  'use strict';

  const MODULE_ID = 'ekodiSystemHealth';
  const SECTION = 'health';
  const API_BASE = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const CORE_SERVICES = ['root', 'admin', 'api', 'biz', 'church', 'lab', 'client-cgma', 'client-jadam', 'client-pizzamaru', 'client-yogurt'];
  if (document.getElementById(MODULE_ID)) return;

  const nav = document.querySelector('.sidebar nav');
  const content = document.querySelector('.content');
  if (!nav || !content) return;

  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';
  const compact = value => Number.isFinite(Number(value))
    ? new Intl.NumberFormat('ko-KR', { notation:'compact', maximumFractionDigits:1 }).format(Number(value))
    : '—';

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

  function time(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR');
  }

  function svg(name, attrs = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nav system-health-nav';
  button.dataset.section = SECTION;
  button.title = 'EKODI Core · 코드 · 구조 · 운영 시스템 건강';
  button.append(document.createTextNode('◉ '));
  const navLabel = document.createElement('span');
  navLabel.textContent = '시스템 건강';
  button.append(navLabel);

  const aiOps = nav.querySelector('[data-section="aiops"], [data-demand-feature="aiops"]');
  if (aiOps) aiOps.insertAdjacentElement('afterend', button);
  else nav.append(button);

  const section = document.createElement('section');
  section.id = MODULE_ID;
  section.className = 'section system-health-section hidden-panel';
  section.dataset.panel = SECTION;
  section.hidden = true;
  section.innerHTML = `
    <div class="section-head system-health-head">
      <div>
        <p class="kicker">EKODI CORE & SYSTEM HEALTH</p>
        <h2>EKODI Core & System Health</h2>
        <p class="operations-copy">Core · DB · Backup · AI 독립성 · 주요 사이트와 트래픽을 한 화면에서 확인합니다. 평상시에는 데이터를 읽지 않습니다.</p>
      </div>
      <div class="system-health-actions" aria-label="System Health 기간 선택">
        <button class="ghost compact is-active" type="button" data-health-days="7">7일</button>
        <button class="ghost compact" type="button" data-health-days="30">30일</button>
        <button class="secondary compact" type="button" data-health-refresh>↻ 새로고침</button>
      </div>
    </div>

    <div class="core-health-overall" data-core-overall data-state="pending">
      <span class="system-health-dot" aria-hidden="true"></span>
      <div><small>EKODI Core</small><strong data-core-overall-label>확인 전</strong><span data-core-status>Health 메뉴를 열면 Core 운영 상태를 확인합니다.</span></div>
      <time data-core-checked-at>—</time>
    </div>

    <div class="core-health-grid" aria-label="EKODI Core 상태">
      <article data-core-card="core" data-state="pending"><div><small>Core</small><b data-core-badge="core">확인 전</b></div><strong data-core-value="core">—</strong><span data-core-detail="core">api.ekodi.kr</span></article>
      <article data-core-card="database" data-state="pending"><div><small>DB</small><b data-core-badge="database">확인 전</b></div><strong data-core-value="database">Hybrid</strong><span data-core-detail="database">D1 · Supabase · Storage</span></article>
      <article data-core-card="backup" data-state="pending"><div><small>Backup</small><b data-core-badge="backup">확인 전</b></div><strong data-core-value="backup">—</strong><span data-core-detail="backup">독립 복원 검증</span></article>
      <article data-core-card="ai" data-state="pending"><div><small>AI Independence</small><b data-core-badge="ai">확인 전</b></div><strong data-core-value="ai">—</strong><span data-core-detail="ai">AI 공급자 없이도 Core 유지</span></article>
    </div>

    <div class="system-health-divider"><span>SYSTEM MAP</span></div>
    <div class="health-diagram-grid" aria-label="시스템 흐름 및 병목 다이어그램">
      <article class="health-diagram-card health-path-card">
        <div class="health-diagram-head"><div><small>REQUEST PATH</small><strong>서비스 연결 흐름</strong></div><span>현재 상태</span></div>
        <div class="health-flow" data-health-flow>
          <div class="health-flow-node" data-flow-node="user" data-state="ok"><small>USER</small><strong>사용자</strong><span>브라우저 · 모바일</span></div>
          <i class="health-flow-arrow" aria-hidden="true">›</i>
          <div class="health-flow-node" data-flow-node="edge" data-state="pending"><small>EDGE</small><strong>Cloudflare</strong><span data-flow-detail="edge">Analytics 확인 전</span></div>
          <i class="health-flow-arrow" aria-hidden="true">›</i>
          <div class="health-flow-node" data-flow-node="core" data-state="pending"><small>CORE</small><strong>API · Auth</strong><span data-flow-detail="core">Core 확인 전</span></div>
          <i class="health-flow-arrow" aria-hidden="true">›</i>
          <div class="health-flow-node" data-flow-node="data" data-state="pending"><small>DATA</small><strong>D1 · Storage</strong><span data-flow-detail="data">DB 확인 전</span></div>
          <i class="health-flow-arrow" aria-hidden="true">›</i>
          <div class="health-flow-node" data-flow-node="services" data-state="pending"><small>SERVICES</small><strong>EKODI Sites</strong><span data-flow-detail="services">사이트 확인 전</span></div>
        </div>
        <div class="health-state-matrix" data-health-state-matrix aria-label="사이트 상태 매트릭스"><p class="operations-loading">사이트 상태 매트릭스 준비 전입니다.</p></div>
      </article>
      <article class="health-diagram-card">
        <div class="health-diagram-head"><div><small>BOTTLENECK</small><strong>느린 구간</strong></div><span>응답속도 기준</span></div>
        <div class="health-bottlenecks" data-health-bottlenecks><p class="operations-loading">응답속도 분석 전입니다.</p></div>
      </article>
    </div>

    <div class="core-health-columns">
      <div class="core-health-card">
        <div class="core-health-card-head"><div><small>PRODUCTION FLEET</small><strong>주요 사이트</strong></div><span data-core-fleet-summary>—</span></div>
        <div class="core-health-fleet" data-core-fleet><p class="operations-loading">운영 상태 확인 전입니다.</p></div>
        <div class="core-health-latency-chart" data-core-latency-chart aria-label="주요 사이트 응답속도 그래프"><p class="operations-loading">응답속도 그래프 준비 전입니다.</p></div>
      </div>
      <div class="core-health-card">
        <div class="core-health-card-head"><div><small>RECOVERY</small><strong>백업 · 복구 상태</strong></div></div>
        <dl class="core-health-facts">
          <div><dt>아키텍처</dt><dd data-core-architecture>—</dd></div>
          <div><dt>백업 정책</dt><dd data-core-backup-policy>—</dd></div>
          <div><dt>최근 복원 검증</dt><dd data-core-recovery-time>—</dd></div>
          <div><dt>복원 무결성</dt><dd data-core-integrity>—</dd></div>
          <div><dt>백업 크기</dt><dd data-core-backup-size>—</dd></div>
          <div><dt>최근 운영 확인</dt><dd data-core-live-check>—</dd></div>
        </dl>
      </div>
    </div>

    <div class="system-health-divider"><span>CODE & ARCHITECTURE HEALTH</span></div>
    <div class="code-health-overall" data-code-health-overall data-state="pending">
      <div class="code-health-score"><small>건강점수</small><strong data-code-health-score>—</strong><span>/ 100</span></div>
      <div class="code-health-summary"><small>코드 · 구조 · 배포 · 보안 · 문서</small><strong data-code-health-label>확인 전</strong><span data-code-health-detail>정기 건강검사 스냅샷을 불러옵니다.</span></div>
      <time data-code-health-time>—</time>
    </div>
    <div class="code-health-grid" data-code-health-dimensions><p class="operations-loading">7개 건강지표를 확인하는 중입니다.</p></div>
    <div class="code-health-debt-card">
      <div class="core-health-card-head"><div><small>TECHNICAL DEBT</small><strong>우선 정비 항목</strong></div><span data-code-health-debt-count>—</span></div>
      <div class="code-health-debt" data-code-health-debt><p class="operations-loading">기술부채 분류를 확인하는 중입니다.</p></div>
      <p class="code-health-policy">자동 수정하지 않습니다. 관찰 → 원인분석 → 수정안 → 테스트·영향검증 → 관리자 승인 → 가역적 적용 → 운영 재검증 순서를 지킵니다.</p>
    </div>

    <div class="system-health-divider"><span>TRAFFIC HEALTH</span></div>
    <div class="system-health-overall" data-health-overall data-state="pending">
      <span class="system-health-dot" aria-hidden="true"></span>
      <div><small>트래픽 상태</small><strong data-health-overall-label>확인 전</strong><span data-health-status>Health 메뉴를 열면 최근 집계를 확인합니다.</span></div>
    </div>
    <div class="system-health-metrics" aria-label="System Health 요약">
      <article><small>최근 요청</small><strong data-health-requests>—</strong><span>완료된 최근 UTC 일자</span></article>
      <article><small>최근 전송량</small><strong data-health-bandwidth>—</strong><span>Cloudflare 측정값</span></article>
      <article><small>캐시 요청 비율</small><strong data-health-cache>—</strong><span>최근 선택 기간</span></article>
      <article><small>최근 고유 방문</small><strong data-health-unique>—</strong><span>Cloudflare 추정 고유 IP</span></article>
    </div>
    <div class="health-traffic-diagrams">
      <article class="health-diagram-card">
        <div class="health-diagram-head"><div><small>REQUEST FLOW</small><strong>캐시 · 원본 요청</strong></div><span data-request-flow-total>—</span></div>
        <div class="health-request-flow" data-request-flow>
          <div class="health-request-track"><span data-request-cache style="width:0%"></span><i data-request-origin style="width:100%"></i></div>
          <div class="health-request-legend"><span><b class="health-legend-cache"></b>캐시 <strong data-request-cache-label>—</strong></span><span><b class="health-legend-origin"></b>원본 <strong data-request-origin-label>—</strong></span><span>위협 <strong data-request-threats>—</strong></span></div>
        </div>
      </article>
      <article class="health-diagram-card">
        <div class="health-diagram-head"><div><small>CHECKPOINTS</small><strong>최근 운영 확인</strong></div><span>읽기 전용</span></div>
        <div class="health-checkpoints">
          <div data-checkpoint-state="analytics" data-state="pending"><i></i><span><small>Analytics</small><strong data-checkpoint="analytics">확인 전</strong></span></div>
          <div data-checkpoint-state="fleet" data-state="pending"><i></i><span><small>Fleet</small><strong data-checkpoint="fleet">확인 전</strong></span></div>
          <div data-checkpoint-state="recovery" data-state="pending"><i></i><span><small>Recovery</small><strong data-checkpoint="recovery">확인 전</strong></span></div>
        </div>
      </article>
    </div>
    <div class="system-health-chart-card">
      <div class="system-health-chart-toolbar">
        <div><strong data-health-chart-title>일자별 전송량</strong><small>원본 접속 로그는 EKODI DB에 저장하지 않습니다.</small></div>
        <div class="system-health-metric-switch" role="group" aria-label="그래프 지표">
          <button class="ghost compact is-active" type="button" data-health-metric="bandwidthBytes">전송량</button>
          <button class="ghost compact" type="button" data-health-metric="requests">요청</button>
        </div>
      </div>
      <div class="system-health-chart" data-health-chart role="img" aria-label="일자별 System Health 그래프"><p class="operations-loading">Health 메뉴를 열면 집계 데이터를 표시합니다.</p></div>
      <div class="system-health-footnote">Cloudflare Analytics · UTC 일 단위 · 과금 산정 지표가 아닌 운영 추세용</div>
    </div>`;
  content.append(section);

  const get = selector => section.querySelector(selector);
  const status = get('[data-health-status]');
  const overall = get('[data-health-overall]');
  const overallLabel = get('[data-health-overall-label]');
  const chart = get('[data-health-chart]');
  const refresh = get('[data-health-refresh]');
  let days = 7;
  let metric = 'bandwidthBytes';
  let latestData = null;
  let loaded = false;
  let loading = false;

  const valueLabel = value => metric === 'bandwidthBytes' ? bytes(value) : compact(value);
  const dayLabel = day => new Intl.DateTimeFormat('ko-KR', { month:'numeric', day:'numeric', timeZone:'UTC' }).format(new Date(`${day}T00:00:00Z`));

  function draw(series) {
    chart.textContent = '';
    if (!series?.length) {
      const empty = document.createElement('div');
      empty.className = 'system-health-chart-empty';
      const grid = document.createElement('div');
      grid.className = 'system-health-chart-empty-grid';
      grid.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('p');
      copy.className = 'operations-loading';
      copy.textContent = '트래픽 집계 연결 대기 · 위의 주요 사이트 응답속도 그래픽은 현재 측정값으로 표시됩니다.';
      empty.append(grid, copy);
      chart.append(empty);
      return;
    }
    const width = 760, height = 250, left = 56, right = 18, top = 18, bottom = 42;
    const innerWidth = width - left - right, innerHeight = height - top - bottom;
    const values = series.map(row => Math.max(0, Number(row[metric]) || 0));
    const max = Math.max(...values, 1);
    const step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
    const root = svg('svg', { viewBox:`0 0 ${width} ${height}`, preserveAspectRatio:'none', 'aria-hidden':'true' });
    root.classList.add('system-health-svg');

    for (let i = 0; i <= 3; i += 1) {
      const y = top + innerHeight * i / 3;
      root.append(svg('line', { x1:left, x2:width - right, y1:y, y2:y, class:'system-health-gridline' }));
      const label = svg('text', { x:left - 8, y:y + 4, 'text-anchor':'end', class:'system-health-axis-label' });
      label.textContent = valueLabel(max * (1 - i / 3));
      root.append(label);
    }

    const points = series.map((row, index) => ({
      x:series.length === 1 ? left + innerWidth / 2 : left + step * index,
      y:top + innerHeight - values[index] / max * innerHeight,
      row,
      value:values[index],
    }));
    root.append(svg('path', { d:points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '), class:'system-health-line' }));
    const every = series.length <= 8 ? 1 : series.length <= 16 ? 2 : 5;
    points.forEach((p, i) => {
      const dot = svg('circle', { cx:p.x, cy:p.y, r:3.2, class:'system-health-point' });
      const title = svg('title');
      title.textContent = `${p.row.day} · ${valueLabel(p.value)}`;
      dot.append(title);
      root.append(dot);
      if (i % every === 0 || i === points.length - 1) {
        const label = svg('text', { x:p.x, y:height - 14, 'text-anchor':'middle', class:'system-health-axis-label' });
        label.textContent = dayLabel(p.row.day);
        root.append(label);
      }
    });
    chart.append(root);
  }

  function renderTrafficFlow(data) {
    const series = data?.series || [];
    const total = series.reduce((sum, row) => sum + Math.max(0, Number(row.requests) || 0), 0);
    const cached = series.reduce((sum, row) => sum + Math.max(0, Number(row.cachedRequests) || 0), 0);
    const threats = series.reduce((sum, row) => sum + Math.max(0, Number(row.threats) || 0), 0);
    const safeCached = Math.min(total, cached);
    const origin = Math.max(0, total - safeCached);
    const cachePercent = total ? Math.round((safeCached / total) * 1000) / 10 : 0;
    const originPercent = total ? Math.round((origin / total) * 1000) / 10 : 0;
    get('[data-request-flow-total]').textContent = total ? `${compact(total)} 요청` : '집계 대기';
    get('[data-request-cache]').style.width = `${cachePercent}%`;
    get('[data-request-origin]').style.width = `${originPercent}%`;
    get('[data-request-cache-label]').textContent = total ? `${cachePercent}%` : '—';
    get('[data-request-origin-label]').textContent = total ? `${originPercent}%` : '—';
    get('[data-request-threats]').textContent = total ? compact(threats) : '—';
  }

  function render(data) {
    latestData = data;
    const latest = data?.summary?.latest;
    get('[data-health-requests]').textContent = latest ? compact(latest.requests) : '—';
    get('[data-health-bandwidth]').textContent = latest ? bytes(latest.bandwidthBytes) : '—';
    get('[data-health-cache]').textContent = data?.summary?.cacheRequestPercent == null ? '—' : `${data.summary.cacheRequestPercent}%`;
    get('[data-health-unique]').textContent = latest?.uniqueVisitors == null ? '—' : compact(latest.uniqueVisitors);

    const state = data?.state || {};
    const ok = state.status === 'ok';
    const error = state.status === 'error';
    const edgeState = ok ? 'ok' : error ? 'error' : 'pending';
    setFlowNode('edge', edgeState, ok ? `캐시 ${data?.summary?.cacheRequestPercent ?? 0}% · 집계 정상` : error ? 'Analytics 연결 확인 필요' : 'Analytics 집계 대기');
    setCheckpoint('analytics', edgeState, ok ? time(state.lastSuccessAt) : error ? '수집 실패' : '집계 대기');
    renderTrafficFlow(data);
    overall.dataset.state = ok ? 'ok' : error ? 'error' : 'pending';
    overallLabel.textContent = ok ? '정상' : error ? '점검 필요' : '집계 대기';
    status.textContent = ok
      ? `최근 집계 ${state.lastSuccessAt ? new Date(state.lastSuccessAt).toLocaleString('ko-KR') : '완료'}`
      : error ? `Analytics 연결 확인 필요 · ${state.message || '최근 수집 실패'}` : state.message || '첫 Analytics 집계를 기다리는 중입니다.';

    get('[data-health-chart-title]').textContent = metric === 'bandwidthBytes' ? '일자별 전송량' : '일자별 요청 수';
    draw(data?.series || []);
  }

  async function fetchJson(path, authenticated = false) {
    const headers = {};
    if (authenticated) {
      const value = token();
      if (!value) throw new Error('관리자 세션이 없습니다.');
      headers.authorization = `Bearer ${value}`;
    }
    const response = await fetch(`${API_BASE}${path}`, { headers, cache:'no-store' });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  async function attempt(label, task) {
    try { return { ok:true, data:await task() }; }
    catch (error) { return { ok:false, error:new Error(`${label}: ${error?.message || error}`) }; }
  }

  function setFlowNode(name, state, detail) {
    const node = get(`[data-flow-node="${name}"]`);
    if (node) node.dataset.state = state;
    const detailNode = get(`[data-flow-detail="${name}"]`);
    if (detailNode) detailNode.textContent = detail;
  }

  function setCheckpoint(name, state, value) {
    const row = get(`[data-checkpoint-state="${name}"]`);
    if (row) row.dataset.state = state;
    const valueNode = get(`[data-checkpoint="${name}"]`);
    if (valueNode) valueNode.textContent = value;
  }

  function setCoreCard(name, state, badge, value, detail) {
    const card = get(`[data-core-card="${name}"]`);
    if (card) card.dataset.state = state;
    const badgeNode = get(`[data-core-badge="${name}"]`);
    if (badgeNode) badgeNode.textContent = badge;
    const valueNode = get(`[data-core-value="${name}"]`);
    if (valueNode) valueNode.textContent = value;
    const detailNode = get(`[data-core-detail="${name}"]`);
    if (detailNode) detailNode.textContent = detail;
  }

  function fleetState(service) {
    const state = service?.status || service?.latest?.status || '';
    if (state === 'online') return 'ok';
    if (state === 'degraded') return 'warn';
    if (state === 'offline') return 'error';
    return 'pending';
  }

  function renderFleet(overview) {
    const list = get('[data-core-fleet]');
    const latencyChart = get('[data-core-latency-chart]');
    const bottlenecks = get('[data-health-bottlenecks]');
    const matrix = get('[data-health-state-matrix]');
    list.textContent = '';
    latencyChart.textContent = '';
    bottlenecks.textContent = '';
    matrix.textContent = '';
    const monitored = new Map((overview?.sites || []).map(item => [item.id, item]));
    const services = new Map((overview?.services || []).map(item => [item.id, item]));
    const rows = CORE_SERVICES.map(id => monitored.get(id) || services.get(id)).filter(Boolean);
    const counts = { ok:0, warn:0, error:0, pending:0 };

    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'operations-loading';
      empty.textContent = '주요 사이트 상태를 확인하지 못했습니다.';
      list.append(empty);
      const chartEmpty = document.createElement('p');
      chartEmpty.className = 'operations-loading';
      chartEmpty.textContent = '응답속도 데이터가 없습니다.';
      latencyChart.append(chartEmpty);
      const bottleneckEmpty = document.createElement('p');
      bottleneckEmpty.className = 'operations-loading';
      bottleneckEmpty.textContent = '응답속도 분석 데이터가 없습니다.';
      bottlenecks.append(bottleneckEmpty);
      const matrixEmpty = document.createElement('p');
      matrixEmpty.className = 'operations-loading';
      matrixEmpty.textContent = '사이트 상태 데이터가 없습니다.';
      matrix.append(matrixEmpty);
      setFlowNode('services', 'pending', '사이트 상태 확인 대기');
      get('[data-core-fleet-summary]').textContent = '확인 필요';
      return { ...counts, pending:1 };
    }

    for (const service of rows) {
      const state = fleetState(service);
      counts[state] += 1;
      const row = document.createElement('div');
      row.className = 'core-health-fleet-row';
      row.dataset.state = state;

      const identity = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = service.name || service.domain || service.id;
      const domain = document.createElement('small');
      domain.textContent = service.domain || '';
      identity.append(name, domain);

      const meta = document.createElement('div');
      const badge = document.createElement('b');
      badge.textContent = state === 'ok' ? '정상' : state === 'warn' ? '주의' : state === 'error' ? '오프라인' : '확인 대기';
      const latency = document.createElement('span');
      const responseTime = service.responseTime ?? service.latest?.responseTime;
      latency.textContent = Number.isFinite(Number(responseTime)) ? `${Number(responseTime)} ms` : '—';
      meta.append(badge, latency);
      row.append(identity, meta);
      list.append(row);

      const cell = document.createElement('span');
      cell.className = 'health-state-cell';
      cell.dataset.state = state;
      cell.title = `${service.name || service.domain || service.id} · ${latency.textContent}`;
      const cellLabel = document.createElement('b');
      cellLabel.textContent = String(service.name || service.id).replace(/^client-/, '').slice(0, 10);
      cell.append(cellLabel);
      matrix.append(cell);
    }
    const latencyRows = rows.map(service => {
      const responseTime = Number(service.responseTime ?? service.latest?.responseTime);
      return { service, responseTime };
    }).filter(item => Number.isFinite(item.responseTime) && item.responseTime >= 0);
    if (latencyRows.length) {
      const maxLatency = Math.max(...latencyRows.map(item => item.responseTime), 1);
      latencyRows.forEach(({ service, responseTime }) => {
        const visual = document.createElement('div');
        visual.className = 'core-health-latency-row';
        visual.dataset.state = fleetState(service);
        const label = document.createElement('span');
        label.textContent = service.name || service.domain || service.id;
        const track = document.createElement('i');
        track.className = 'core-health-latency-track';
        const fill = document.createElement('span');
        fill.className = 'core-health-latency-fill';
        fill.style.width = `${Math.max(4, Math.min(100, (responseTime / maxLatency) * 100))}%`;
        track.append(fill);
        const value = document.createElement('b');
        value.textContent = `${Math.round(responseTime)} ms`;
        visual.append(label, track, value);
        latencyChart.append(visual);
      });

      latencyRows.slice().sort((a, b) => b.responseTime - a.responseTime).slice(0, 4).forEach(({ service, responseTime }) => {
        const state = fleetState(service);
        const row = document.createElement('div');
        row.className = 'health-bottleneck-row';
        row.dataset.state = state;
        const label = document.createElement('span');
        label.textContent = service.name || service.domain || service.id;
        const track = document.createElement('i');
        const fill = document.createElement('span');
        fill.style.width = `${Math.max(5, Math.min(100, (responseTime / maxLatency) * 100))}%`;
        track.append(fill);
        const value = document.createElement('b');
        value.textContent = `${Math.round(responseTime)} ms`;
        row.append(label, track, value);
        bottlenecks.append(row);
      });
    } else {
      const chartEmpty = document.createElement('p');
      chartEmpty.className = 'operations-loading';
      chartEmpty.textContent = '응답속도 데이터가 없습니다.';
      latencyChart.append(chartEmpty);
      const bottleneckEmpty = document.createElement('p');
      bottleneckEmpty.className = 'operations-loading';
      bottleneckEmpty.textContent = '응답속도 데이터가 없습니다.';
      bottlenecks.append(bottleneckEmpty);
    }
    const serviceState = counts.error ? 'error' : counts.warn ? 'warn' : counts.pending ? 'pending' : 'ok';
    setFlowNode('services', serviceState, `${counts.ok}/${rows.length} 정상 · 주의 ${counts.warn + counts.pending}`);
    get('[data-core-fleet-summary]').textContent = `${counts.ok}/${rows.length} 정상`;
    return counts;
  }

  function renderCodeHealth(result) {
    const root = get('[data-code-health-overall]');
    const scoreNode = get('[data-code-health-score]');
    const label = get('[data-code-health-label]');
    const detail = get('[data-code-health-detail]');
    const checked = get('[data-code-health-time]');
    const dimensions = get('[data-code-health-dimensions]');
    const debtList = get('[data-code-health-debt]');
    const debtCount = get('[data-code-health-debt-count]');
    dimensions.textContent = ''; debtList.textContent = '';
    if (!result?.ok) {
      root.dataset.state = 'error'; scoreNode.textContent = '—'; label.textContent = '스냅샷 확인 필요';
      detail.textContent = result?.error?.message || 'Code Health 스냅샷을 불러오지 못했습니다.';
      checked.textContent = '최근 점검 조회 실패';
      const d = document.createElement('p'); d.className = 'operations-error'; d.textContent = '코드 건강 데이터는 운영 트래픽과 독립되어 있습니다.'; dimensions.append(d);
      const q = document.createElement('p'); q.className = 'operations-error'; q.textContent = '정기 건강검사 Workflow 상태를 확인해 주세요.'; debtList.append(q);
      debtCount.textContent = '조회 실패'; return;
    }
    const data = result.data || {}; const score = Number(data.overallScore);
    const state = data.status === 'healthy' ? 'ok' : ['watch','maintenance'].includes(data.status) ? 'warn' : 'error';
    root.dataset.state = state; scoreNode.textContent = Number.isFinite(score) ? String(Math.round(score * 10) / 10) : '—';
    label.textContent = state === 'ok' ? '건강' : state === 'warn' ? '정비 권장' : '우선 점검';
    detail.textContent = (data.branch || 'system-health-data') + ' · ' + (data.head ? data.head.slice(0, 8) : 'commit 확인 전') + ' · 기술부채 ' + (data.technicalDebt || []).length + '건';
    checked.textContent = data.generatedAt ? '점검 ' + time(data.generatedAt) : '점검시각 없음';
    const names = { tests:'테스트', duplication:'중복', complexity:'복잡도', security:'보안', architecture:'아키텍처', deployment:'배포', documentation:'문서' };
    for (const [key, item] of Object.entries(data.dimensions || {})) {
      const card = document.createElement('article'); card.dataset.state = item.status === 'ok' ? 'ok' : item.status === 'error' ? 'error' : 'warn';
      const head = document.createElement('div'); const name = document.createElement('small'); name.textContent = names[key] || key;
      const points = document.createElement('b'); points.textContent = String(item.score ?? 0) + ' / ' + String(item.weight ?? 0);
      const copy = document.createElement('span'); copy.textContent = item.detail || ''; head.append(name, points); card.append(head, copy); dimensions.append(card);
    }
    const debts = Array.isArray(data.technicalDebt) ? data.technicalDebt : []; debtCount.textContent = debts.length + '건';
    if (!debts.length) { const empty = document.createElement('p'); empty.className = 'operations-loading'; empty.textContent = '현재 우선 정비 기술부채가 없습니다.'; debtList.append(empty); }
    for (const debt of debts.slice(0, 12)) {
      const row = document.createElement('article'); row.dataset.severity = debt.severity || 'info';
      const badge = document.createElement('b'); badge.textContent = String(debt.severity || 'info').toUpperCase();
      const body = document.createElement('div'); const title = document.createElement('strong'); title.textContent = debt.title || '점검 항목';
      const copy = document.createElement('span'); copy.textContent = debt.recommendation || debt.detail || ''; body.append(title, copy); row.append(badge, body); debtList.append(row);
    }
  }
  function renderCore(results) {
    const { core, ai, recovery, overview } = results;
    const coreData = core.data || {};
    const recoveryData = recovery.data?.recovery;
    const aiData = ai.data || coreData.ai || {};

    if (core.ok && coreData.ok) {
      setFlowNode('core', 'ok', `${coreData.canonicalHosts?.api || 'api.ekodi.kr'} 정상`);
      setCoreCard('core', 'ok', '정상', `v${coreData.apiVersion || '1.0.0'}`, `${coreData.canonicalHosts?.api || 'api.ekodi.kr'} · ${coreData.architecture || 'hybrid-cloud'}`);
      get('[data-core-architecture]').textContent = coreData.architecture === 'hybrid-cloud' ? 'Hybrid Cloud · Provider Independent' : coreData.architecture || '—';
    } else {
      setFlowNode('core', 'error', 'Core API 확인 필요');
      setCoreCard('core', 'error', '점검 필요', '응답 없음', core.error?.message || 'Core API 확인 실패');
      get('[data-core-architecture]').textContent = '확인 실패';
    }

    const databaseOk = recovery.ok && overview.ok;
    setFlowNode('data', databaseOk ? 'ok' : 'error', databaseOk ? '운영 DB 연결 정상' : 'DB 연결 확인 필요');
    setCoreCard('database', databaseOk ? 'ok' : 'error', databaseOk ? '연결' : '확인 필요', databaseOk ? 'Hybrid 연결' : '확인 필요', databaseOk ? 'Core 원장과 운영 관제 DB 응답 정상' : [recovery.error?.message, overview.error?.message].filter(Boolean).join(' · ') || 'DB 응답 확인 실패');

    if (recovery.ok && recoveryData?.verified) {
      setCoreCard('backup', 'ok', '검증됨', '복원 가능', `${time(recoveryData.latest?.createdAt)} · ${recoveryData.latest?.restoreIntegrity || 'ok'}`);
    } else if (recovery.ok) {
      setCoreCard('backup', 'warn', '확인 필요', recoveryData?.configured ? '검증 대기' : '미설정', '최근 독립 복원 성공 기록을 확인해 주세요.');
    } else {
      setCoreCard('backup', 'error', '점검 필요', '조회 실패', recovery.error?.message || '복구 상태 확인 실패');
    }

    const aiIndependent = Boolean(ai.ok && aiData.providerIndependent && aiData.aiOptional);
    if (aiIndependent) {
      setCoreCard('ai', 'ok', '독립', 'AI Optional', `${aiData.gateway || 'EKODI Core Gateway'} · ${aiData.mode || 'provider-independent'}`);
    } else if (ai.ok) {
      setCoreCard('ai', 'warn', '확인 필요', '정책 확인', 'AI Optional / 공급자 독립 상태를 확인해 주세요.');
    } else {
      setCoreCard('ai', 'error', '점검 필요', '조회 실패', ai.error?.message || 'AI Gateway 상태 확인 실패');
    }

    const fleet = overview.ok ? renderFleet(overview.data) : renderFleet(null);
    const hardIssues = [!core.ok, !databaseOk, !aiIndependent, !recovery.ok || !recoveryData?.verified, !overview.ok || fleet.error > 0].filter(Boolean).length;
    const softIssues = fleet.warn + fleet.pending;
    const coreOverall = get('[data-core-overall]');
    const coreLabel = get('[data-core-overall-label]');
    const coreStatus = get('[data-core-status]');
    if (!hardIssues && !softIssues) {
      coreOverall.dataset.state = 'ok';
      coreLabel.textContent = '정상';
      coreStatus.textContent = 'Core, DB, Backup, AI 독립성, 주요 사이트를 모두 확인했습니다.';
    } else if (!hardIssues) {
      coreOverall.dataset.state = 'warn';
      coreLabel.textContent = '정상 · 일부 확인 대기';
      coreStatus.textContent = `핵심 기능은 정상이며 사이트 ${softIssues}건이 주의 또는 확인 대기입니다.`;
    } else {
      coreOverall.dataset.state = 'error';
      coreLabel.textContent = '점검 필요';
      coreStatus.textContent = `${hardIssues}개 핵심 항목을 확인해 주세요. 확인되지 않은 항목은 정상으로 간주하지 않습니다.`;
    }

    const latest = recoveryData?.latest;
    setCheckpoint('recovery', recovery.ok && recoveryData?.verified ? 'ok' : recovery.ok ? 'warn' : 'error', recoveryData?.verified ? time(latest?.createdAt) : recovery.ok ? '복원 검증 대기' : '조회 실패');
    setCheckpoint('fleet', overview.ok ? (fleet.error ? 'error' : fleet.warn || fleet.pending ? 'warn' : 'ok') : 'error', overview.ok ? time(overview.data?.generatedAt) : '조회 실패');
    get('[data-core-backup-policy]').textContent = recoveryData?.policy || coreData.recovery?.strategy || '—';
    get('[data-core-recovery-time]').textContent = time(latest?.createdAt);
    get('[data-core-integrity]').textContent = latest?.restoreIntegrity || (recoveryData?.verified ? 'ok' : '—');
    get('[data-core-backup-size]').textContent = bytes(latest?.exportBytes);
    get('[data-core-live-check]').textContent = overview.ok ? time(overview.data?.generatedAt) : '확인 실패';
    get('[data-core-checked-at]').textContent = `확인 ${new Date().toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}`;
  }

  async function load(force = false) {
    if (loading || (loaded && !force) || !token()) return;
    loading = true;
    refresh.disabled = true;
    overall.dataset.state = 'pending';
    overallLabel.textContent = '확인 중';
    status.textContent = 'Cloudflare 일별 집계를 읽는 중입니다.';
    const coreOverall = get('[data-core-overall]');
    coreOverall.dataset.state = 'pending';
    get('[data-core-overall-label]').textContent = '확인 중';
    get('[data-core-status]').textContent = 'Core 운영 계약과 복구 상태를 확인하는 중입니다.';

    const [health, codeHealth, core, ai, recovery, overview] = await Promise.all([
      attempt('System Health', () => fetchJson(`/api/control/system-health?days=${days}`, true)),
      attempt('Code Health', () => fetchJson('/api/control/system-health/code', true)),
      attempt('Core', () => fetchJson('/api/core/v1/status')),
      attempt('AI Gateway', () => fetchJson('/api/core/v1/ai/status')),
      attempt('Backup', () => fetchJson('/api/core/v1/recovery/status', true)),
      attempt('Fleet', () => fetchJson('/api/control/overview', true)),
    ]);

    renderCore({ core, ai, recovery, overview });
    renderCodeHealth(codeHealth);
    if (health.ok) {
      loaded = true;
      render(health.data);
    } else {
      overall.dataset.state = 'error';
      overallLabel.textContent = '점검 필요';
      status.textContent = `System Health를 불러오지 못했습니다: ${health.error?.message || '연결 실패'}`;
      chart.innerHTML = '<p class="operations-error">서비스 운영에는 영향이 없습니다. Analytics 연결 상태만 확인해 주세요.</p>';
    }
    loading = false;
    refresh.disabled = false;
  }

  function activate() {
    section.hidden = false;
    document.querySelectorAll('[data-panel]').forEach(panel => {
      const targets = String(panel.dataset.panel || '').split(/\s+/).filter(Boolean);
      panel.classList.toggle('hidden-panel', !targets.includes(SECTION));
      if (!targets.includes(SECTION) && !panel.hidden) panel.hidden = true;
    });
    document.querySelectorAll('.sidebar .nav').forEach(item => item.classList.toggle('active', item === button));
    const pageTitle = document.querySelector('#pageTitle');
    if (pageTitle) pageTitle.textContent = '시스템 건강';
    document.querySelector('.sidebar')?.classList.remove('open');
    if (location.hash !== '#health') history.replaceState(null, '', '#health');
    load(false);
  }

  section.querySelectorAll('[data-health-days]').forEach(periodButton => periodButton.addEventListener('click', () => {
    days = Number(periodButton.dataset.healthDays) === 30 ? 30 : 7;
    section.querySelectorAll('[data-health-days]').forEach(item => item.classList.toggle('is-active', item === periodButton));
    loaded = false;
    load(true);
  }));

  section.querySelectorAll('[data-health-metric]').forEach(metricButton => metricButton.addEventListener('click', () => {
    metric = metricButton.dataset.healthMetric === 'requests' ? 'requests' : 'bandwidthBytes';
    section.querySelectorAll('[data-health-metric]').forEach(item => item.classList.toggle('is-active', item === metricButton));
    if (latestData) render(latestData);
  }));

  refresh.addEventListener('click', () => load(true));
  button.addEventListener('click', activate);
  window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail:{ feature:SECTION } }));
  if (location.hash === '#health') queueMicrotask(activate);
})();
