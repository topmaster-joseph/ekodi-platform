from pathlib import Path

js = Path('system-health-admin.js')
s = js.read_text()

old = '''    <div class="core-health-grid" aria-label="EKODI Core 상태">
      <article data-core-card="core" data-state="pending"><div><small>Core</small><b data-core-badge="core">확인 전</b></div><strong data-core-value="core">—</strong><span data-core-detail="core">api.ekodi.kr</span></article>
      <article data-core-card="database" data-state="pending"><div><small>DB</small><b data-core-badge="database">확인 전</b></div><strong data-core-value="database">Hybrid</strong><span data-core-detail="database">D1 · Supabase · Storage</span></article>
      <article data-core-card="backup" data-state="pending"><div><small>Backup</small><b data-core-badge="backup">확인 전</b></div><strong data-core-value="backup">—</strong><span data-core-detail="backup">독립 복원 검증</span></article>
      <article data-core-card="ai" data-state="pending"><div><small>AI Independence</small><b data-core-badge="ai">확인 전</b></div><strong data-core-value="ai">—</strong><span data-core-detail="ai">AI 공급자 없이도 Core 유지</span></article>
    </div>

    <div class="core-health-columns">'''
new = '''    <div class="core-health-grid" aria-label="EKODI Core 상태">
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

    <div class="core-health-columns">'''
assert old in s
s = s.replace(old, new, 1)

old = '''    <div class="system-health-metrics" aria-label="System Health 요약">
      <article><small>최근 요청</small><strong data-health-requests>—</strong><span>완료된 최근 UTC 일자</span></article>
      <article><small>최근 전송량</small><strong data-health-bandwidth>—</strong><span>Cloudflare 측정값</span></article>
      <article><small>캐시 요청 비율</small><strong data-health-cache>—</strong><span>최근 선택 기간</span></article>
      <article><small>최근 고유 방문</small><strong data-health-unique>—</strong><span>Cloudflare 추정 고유 IP</span></article>
    </div>
    <div class="system-health-chart-card">'''
new = '''    <div class="system-health-metrics" aria-label="System Health 요약">
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
    <div class="system-health-chart-card">'''
assert old in s
s = s.replace(old, new, 1)

old = '''  function setCoreCard(name, state, badge, value, detail) {
    const card = get(`[data-core-card="${name}"]`);'''
new = '''  function setFlowNode(name, state, detail) {
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
    const card = get(`[data-core-card="${name}"]`);'''
assert old in s
s = s.replace(old, new, 1)

old = '''  function renderFleet(overview) {
    const list = get('[data-core-fleet]');
    const latencyChart = get('[data-core-latency-chart]');
    list.textContent = '';
    latencyChart.textContent = '';'''
new = '''  function renderFleet(overview) {
    const list = get('[data-core-fleet]');
    const latencyChart = get('[data-core-latency-chart]');
    const bottlenecks = get('[data-health-bottlenecks]');
    const matrix = get('[data-health-state-matrix]');
    list.textContent = '';
    latencyChart.textContent = '';
    bottlenecks.textContent = '';
    matrix.textContent = '';'''
assert old in s
s = s.replace(old, new, 1)

old = '''      latencyChart.append(chartEmpty);
      get('[data-core-fleet-summary]').textContent = '확인 필요';
      return { ...counts, pending:1 };'''
new = '''      latencyChart.append(chartEmpty);
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
      return { ...counts, pending:1 };'''
assert old in s
s = s.replace(old, new, 1)

old = '''      row.append(identity, meta);
      list.append(row);
    }
    const latencyRows = rows.map(service => {'''
new = '''      row.append(identity, meta);
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
    const latencyRows = rows.map(service => {'''
assert old in s
s = s.replace(old, new, 1)

old = '''        visual.append(label, track, value);
        latencyChart.append(visual);
      });
    } else {'''
new = '''        visual.append(label, track, value);
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
    } else {'''
assert old in s
s = s.replace(old, new, 1)

old = '''      chartEmpty.textContent = '응답속도 데이터가 없습니다.';
      latencyChart.append(chartEmpty);
    }
    get('[data-core-fleet-summary]').textContent = `${counts.ok}/${rows.length} 정상`;
    return counts;'''
new = '''      chartEmpty.textContent = '응답속도 데이터가 없습니다.';
      latencyChart.append(chartEmpty);
      const bottleneckEmpty = document.createElement('p');
      bottleneckEmpty.className = 'operations-loading';
      bottleneckEmpty.textContent = '응답속도 데이터가 없습니다.';
      bottlenecks.append(bottleneckEmpty);
    }
    const serviceState = counts.error ? 'error' : counts.warn ? 'warn' : counts.pending ? 'pending' : 'ok';
    setFlowNode('services', serviceState, `${counts.ok}/${rows.length} 정상 · 주의 ${counts.warn + counts.pending}`);
    get('[data-core-fleet-summary]').textContent = `${counts.ok}/${rows.length} 정상`;
    return counts;'''
assert old in s
s = s.replace(old, new, 1)

old = '''    if (core.ok && coreData.ok) {
      setCoreCard('core', 'ok', '정상', `v${coreData.apiVersion || '1.0.0'}`, `${coreData.canonicalHosts?.api || 'api.ekodi.kr'} · ${coreData.architecture || 'hybrid-cloud'}`);'''
new = '''    if (core.ok && coreData.ok) {
      setFlowNode('core', 'ok', `${coreData.canonicalHosts?.api || 'api.ekodi.kr'} 정상`);
      setCoreCard('core', 'ok', '정상', `v${coreData.apiVersion || '1.0.0'}`, `${coreData.canonicalHosts?.api || 'api.ekodi.kr'} · ${coreData.architecture || 'hybrid-cloud'}`);'''
assert old in s
s = s.replace(old, new, 1)

old = '''    } else {
      setCoreCard('core', 'error', '점검 필요', '응답 없음', core.error?.message || 'Core API 확인 실패');
      get('[data-core-architecture]').textContent = '확인 실패';
    }

    const databaseOk = recovery.ok && overview.ok;
    setCoreCard('database', databaseOk ? 'ok' : 'error','''
new = '''    } else {
      setFlowNode('core', 'error', 'Core API 확인 필요');
      setCoreCard('core', 'error', '점검 필요', '응답 없음', core.error?.message || 'Core API 확인 실패');
      get('[data-core-architecture]').textContent = '확인 실패';
    }

    const databaseOk = recovery.ok && overview.ok;
    setFlowNode('data', databaseOk ? 'ok' : 'error', databaseOk ? '운영 DB 연결 정상' : 'DB 연결 확인 필요');
    setCoreCard('database', databaseOk ? 'ok' : 'error','''
assert old in s
s = s.replace(old, new, 1)

old = '''    const latest = recoveryData?.latest;
    get('[data-core-backup-policy]').textContent = recoveryData?.policy || coreData.recovery?.strategy || '—';'''
new = '''    const latest = recoveryData?.latest;
    setCheckpoint('recovery', recovery.ok && recoveryData?.verified ? 'ok' : recovery.ok ? 'warn' : 'error', recoveryData?.verified ? time(latest?.createdAt) : recovery.ok ? '복원 검증 대기' : '조회 실패');
    setCheckpoint('fleet', overview.ok ? (fleet.error ? 'error' : fleet.warn || fleet.pending ? 'warn' : 'ok') : 'error', overview.ok ? time(overview.data?.generatedAt) : '조회 실패');
    get('[data-core-backup-policy]').textContent = recoveryData?.policy || coreData.recovery?.strategy || '—';'''
assert old in s
s = s.replace(old, new, 1)

old = '''  function render(data) {
    latestData = data;
    const latest = data?.summary?.latest;'''
new = '''  function renderTrafficFlow(data) {
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
    const latest = data?.summary?.latest;'''
assert old in s
s = s.replace(old, new, 1)

old = '''    const state = data?.state || {};
    const ok = state.status === 'ok';
    const error = state.status === 'error';'''
new = '''    const state = data?.state || {};
    const ok = state.status === 'ok';
    const error = state.status === 'error';
    const edgeState = ok ? 'ok' : error ? 'error' : 'pending';
    setFlowNode('edge', edgeState, ok ? `캐시 ${data?.summary?.cacheRequestPercent ?? 0}% · 집계 정상` : error ? 'Analytics 연결 확인 필요' : 'Analytics 집계 대기');
    setCheckpoint('analytics', edgeState, ok ? time(state.lastSuccessAt) : error ? '수집 실패' : '집계 대기');
    renderTrafficFlow(data);'''
assert old in s
s = s.replace(old, new, 1)
js.write_text(s)

css = Path('system-health-admin.css')
c = css.read_text().rstrip() + '''
.health-diagram-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:12px;margin:12px 0 18px}.health-diagram-card{min-width:0;padding:14px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:rgba(2,6,23,.24)}.health-diagram-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}.health-diagram-head>div{display:grid;gap:2px}.health-diagram-head small{font-size:.68rem;font-weight:700;letter-spacing:.08em;color:var(--muted,#94a3b8)}.health-diagram-head strong{font-size:.95rem}.health-diagram-head>span{font-size:.68rem;color:var(--muted,#94a3b8);white-space:nowrap}.health-flow{display:grid;grid-template-columns:minmax(84px,1fr) auto minmax(84px,1fr) auto minmax(84px,1fr) auto minmax(84px,1fr) auto minmax(84px,1fr);gap:6px;align-items:stretch}.health-flow-node{display:grid;align-content:center;gap:3px;min-height:76px;padding:9px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:rgba(15,23,42,.28)}.health-flow-node small{font-size:.6rem;letter-spacing:.08em;color:var(--muted,#94a3b8)}.health-flow-node strong{font-size:.78rem}.health-flow-node span{font-size:.64rem;line-height:1.35;color:var(--muted,#94a3b8);overflow-wrap:anywhere}.health-flow-node[data-state="ok"]{border-color:rgba(34,197,94,.32);background:rgba(34,197,94,.06)}.health-flow-node[data-state="warn"]{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.06)}.health-flow-node[data-state="error"]{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.06)}.health-flow-arrow{display:grid;place-items:center;font-style:normal;font-size:1.3rem;color:var(--muted,#94a3b8);opacity:.65}.health-state-matrix{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:10px}.health-state-cell{display:grid;place-items:center;min-height:28px;padding:4px;border:1px solid rgba(148,163,184,.16);border-radius:8px;background:rgba(148,163,184,.08);overflow:hidden}.health-state-cell b{max-width:100%;font-size:.59rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.health-state-cell[data-state="ok"]{border-color:rgba(34,197,94,.25);background:rgba(34,197,94,.09);color:#86efac}.health-state-cell[data-state="warn"]{border-color:rgba(245,158,11,.28);background:rgba(245,158,11,.09);color:#fcd34d}.health-state-cell[data-state="error"]{border-color:rgba(239,68,68,.28);background:rgba(239,68,68,.09);color:#fca5a5}.health-bottlenecks{display:grid;gap:9px}.health-bottleneck-row{display:grid;grid-template-columns:minmax(72px,115px) minmax(70px,1fr) 52px;gap:8px;align-items:center}.health-bottleneck-row>span{font-size:.67rem;color:var(--muted,#94a3b8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.health-bottleneck-row>i{display:block;height:8px;overflow:hidden;border-radius:999px;background:rgba(148,163,184,.12)}.health-bottleneck-row>i>span{display:block;height:100%;min-width:5px;border-radius:inherit;background:#22c55e}.health-bottleneck-row[data-state="warn"]>i>span{background:#f59e0b}.health-bottleneck-row[data-state="error"]>i>span{background:#ef4444}.health-bottleneck-row>b{text-align:right;font-size:.66rem}.health-traffic-diagrams{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:12px;margin:0 0 12px}.health-request-track{display:flex;width:100%;height:16px;overflow:hidden;border-radius:999px;background:rgba(148,163,184,.11)}.health-request-track>span,.health-request-track>i{display:block;height:100%;transition:width .2s ease}.health-request-track>span{background:#22c55e}.health-request-track>i{background:rgba(56,189,248,.7)}.health-request-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:.68rem;color:var(--muted,#94a3b8)}.health-request-legend span{display:flex;gap:5px;align-items:center}.health-request-legend strong{color:inherit}.health-request-legend b{display:inline-block;width:8px;height:8px;border-radius:999px}.health-legend-cache{background:#22c55e}.health-legend-origin{background:rgba(56,189,248,.7)}.health-checkpoints{display:grid;gap:8px}.health-checkpoints>div{display:grid;grid-template-columns:10px minmax(0,1fr);gap:8px;align-items:center}.health-checkpoints>div>i{width:8px;height:8px;border-radius:999px;background:#94a3b8;box-shadow:0 0 0 4px rgba(148,163,184,.09)}.health-checkpoints>div[data-state="ok"]>i{background:#22c55e}.health-checkpoints>div[data-state="warn"]>i{background:#f59e0b}.health-checkpoints>div[data-state="error"]>i{background:#ef4444}.health-checkpoints span{display:grid;grid-template-columns:72px minmax(0,1fr);gap:8px;align-items:center}.health-checkpoints small{font-size:.64rem;color:var(--muted,#94a3b8)}.health-checkpoints strong{font-size:.7rem;font-weight:650;overflow-wrap:anywhere}@media(max-width:1050px){.health-diagram-grid,.health-traffic-diagrams{grid-template-columns:1fr}.health-flow{grid-template-columns:1fr}.health-flow-arrow{height:12px;transform:rotate(90deg)}.health-state-matrix{grid-template-columns:repeat(5,minmax(0,1fr))}}@media(max-width:540px){.health-diagram-card{padding:12px}.health-state-matrix{grid-template-columns:repeat(2,minmax(0,1fr))}.health-bottleneck-row{grid-template-columns:72px minmax(60px,1fr) 48px}.health-checkpoints span{grid-template-columns:64px minmax(0,1fr)}}
'''
css.write_text(c)

test = Path('test/admin-health-menu.test.mjs')
t = test.read_text().rstrip() + '''

test('Health diagrams stay lightweight and are driven by existing read-only data', async () => {
  const [health, css] = await Promise.all([
    read('system-health-admin.js'),
    read('system-health-admin.css'),
  ]);
  assert.match(health, /data-health-flow/);
  assert.match(health, /data-health-state-matrix/);
  assert.match(health, /data-health-bottlenecks/);
  assert.match(health, /data-request-flow/);
  assert.match(health, /data-checkpoint=\"analytics\"/);
  assert.match(health, /function renderTrafficFlow\(data\)/);
  assert.match(css, /\.health-flow-node/);
  assert.match(css, /\.health-bottleneck-row/);
  assert.match(css, /\.health-request-track/);
  assert.doesNotMatch(health, /setInterval\(/);
  assert.doesNotMatch(health, /chart\.js|recharts|d3\./i);
});
'''
test.write_text(t)
