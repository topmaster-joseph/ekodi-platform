(() => {
  'use strict';

  const API_BASE = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const ENGINE_MARKER = 'EKODI HYBRID EXECUTION';
  let timer = null;
  let lastDashboard = { fabric:{ enabled:true }, nodes:[], jobs:[], events:[], monitoring:null };

  function authHeaders(json = false) {
    const token = sessionStorage.getItem(TOKEN_KEY) || '';
    return { authorization:`Bearer ${token}`, ...(json ? { 'content-type':'application/json' } : {}) };
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers:{ ...authHeaders(Boolean(options.body)), ...(options.headers || {}) },
      cache:'no-store',
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(data.error || `Hybrid Execution API 오류 (${response.status})`);
      error.code = data.code || '';
      throw error;
    }
    return data;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;',
    })[char]);
  }

  function timeLabel(value) {
    if (!value) return '미확인';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('ko-KR');
  }

  function statusLabel(status) {
    return ({
      pending:'대기', assigned:'배정', leased:'실행 중', completed:'완료',
      failed:'실패', cancelled:'취소',
    })[status] || status;
  }

  function monitorStatusLabel(status) {
    return ({ healthy:'정상', degraded:'주의', critical:'긴급', unknown:'확인 전', unavailable:'확인 불가' })[status] || status || '확인 전';
  }

  function severityLabel(severity) {
    return ({ critical:'긴급', warning:'주의' })[severity] || severity;
  }

  function eventLabel(type) {
    return ({
      created:'작업 생성', assigned:'기기 배정', leased:'실행 시작', completed:'실행 완료',
      requeued:'재배정 대기', failed:'실행 실패', cancelled:'관리자 취소',
    })[type] || type;
  }

  function taskLabel(type) {
    return ({
      'diagnostics.collect':'전체 진단',
      'network.diagnose':'네트워크 진단',
      'printers.diagnose':'프린터 진단',
      'updates.scan':'업데이트 확인',
      'startup.scan':'시작프로그램 확인',
      'maintenance.temp_cleanup':'임시파일 정리',
      'power.always_on':'항상 켜짐',
      'power.presentation':'프레젠테이션',
      'power.normal':'일반 모드',
    })[type] || type;
  }

  function eventDetail(detail = {}) {
    const labels = {
      taskType:'작업', priority:'우선순위', deviceGroup:'그룹', maxAttempts:'최대시도', risk:'위험도',
      currentLoad:'부하', leaseExpiresAt:'리스만료', attempt:'시도', reason:'사유', terminal:'최종실패',
    };
    const values = Object.entries(detail || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined);
    if (!values.length) return '';
    return values.slice(0, 8).map(([key, value]) => {
      const rendered = key === 'taskType' ? taskLabel(value) : key === 'leaseExpiresAt' ? timeLabel(value) : String(value);
      return `${labels[key] || key}: ${rendered}`;
    }).join(' · ');
  }

  function ensureStyle() {
    if (document.querySelector('#ekodiHybridExecutionStyle')) return;
    const style = document.createElement('style');
    style.id = 'ekodiHybridExecutionStyle';
    style.textContent = `
      .hybrid-execution{margin:18px 0;padding:18px;border:1px solid var(--line,#d9dee7);border-radius:18px;background:var(--card,#fff)}
      .hybrid-head{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
      .hybrid-head h3{margin:3px 0 5px}.hybrid-head p{margin:0;max-width:780px}
      .hybrid-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .hybrid-fabric-policy{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:14px 0;padding:14px;border:1px solid var(--line,#e0e4eb);border-radius:14px;background:rgba(127,127,127,.04)}
      .hybrid-fabric-policy[data-enabled="true"]{border-color:rgba(24,130,76,.35)}
      .hybrid-fabric-policy[data-enabled="false"]{border-color:rgba(191,126,0,.45)}
      .hybrid-fabric-policy strong{display:block;margin-bottom:3px}.hybrid-fabric-policy p{margin:0;max-width:760px;font-size:.86rem;opacity:.78}
      .hybrid-watchdog{margin:14px 0;padding:13px;border:1px solid var(--line,#e0e4eb);border-radius:14px;background:rgba(127,127,127,.04)}
      .hybrid-watchdog[data-status="healthy"]{border-color:rgba(24,130,76,.35)}
      .hybrid-watchdog[data-status="degraded"]{border-color:rgba(191,126,0,.45)}
      .hybrid-watchdog[data-status="critical"]{border-color:rgba(180,35,35,.5)}
      .hybrid-watchdog-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .hybrid-watchdog-head div{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .hybrid-incidents{display:grid;gap:7px;margin-top:9px}
      .hybrid-incident{padding:9px 10px;border:1px solid var(--line,#e0e4eb);border-radius:10px}
      .hybrid-incident[data-severity="critical"]{border-color:rgba(180,35,35,.4)}
      .hybrid-incident small{display:block;opacity:.72;margin-top:3px}
      .hybrid-monitor-note{margin-top:8px;font-size:.8rem;opacity:.7}
      .hybrid-metrics{display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));gap:10px;margin:14px 0}
      .hybrid-metrics article{padding:12px;border:1px solid var(--line,#e0e4eb);border-radius:14px}
      .hybrid-metrics small,.hybrid-node small,.hybrid-job small,.hybrid-event small{display:block;opacity:.72}.hybrid-metrics strong{font-size:1.45rem}
      .hybrid-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
      .hybrid-box{border:1px solid var(--line,#e0e4eb);border-radius:14px;padding:13px;min-width:0}
      .hybrid-ledger{grid-column:1/-1}
      .hybrid-box-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
      .hybrid-filter{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
      .hybrid-filter input,.hybrid-filter select{min-height:34px;border:1px solid var(--line,#d9dee7);border-radius:9px;background:var(--card,#fff);padding:5px 8px}
      .hybrid-filter input{width:min(250px,58vw)}
      .hybrid-list{display:grid;gap:8px;max-height:390px;overflow:auto}
      .hybrid-node,.hybrid-job,.hybrid-event{border:1px solid var(--line,#e0e4eb);border-radius:12px;padding:10px}
      .hybrid-row{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
      .hybrid-controls{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:8px}
      .hybrid-controls input{width:72px}.hybrid-controls select{max-width:160px}
      .hybrid-pill{display:inline-flex;padding:3px 8px;border-radius:999px;background:rgba(127,127,127,.12);font-size:.78rem}
      .hybrid-empty{padding:16px;text-align:center;opacity:.72}
      .hybrid-job details{margin-top:8px;border-top:1px dashed var(--line,#e0e4eb);padding-top:7px}
      .hybrid-job summary{cursor:pointer;font-weight:650}
      .hybrid-job-detail{display:grid;gap:5px;padding:8px 2px 2px;word-break:break-word}
      .hybrid-event[data-type="failed"]{border-color:rgba(180,35,35,.35)}
      .hybrid-event[data-type="completed"]{border-color:rgba(24,130,76,.28)}
      .hybrid-privacy{margin:12px 0 0;font-size:.84rem;opacity:.76}
      @media(max-width:900px){.hybrid-metrics{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:760px){.hybrid-grid{grid-template-columns:1fr}.hybrid-ledger{grid-column:auto}.hybrid-metrics{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.append(style);
  }

  function panelHtml() {
    return `
      <div class="hybrid-head">
        <div><p class="kicker">EKODI EXECUTION FABRIC · HYBRID EXECUTION</p><h3>실행 인프라 · 작업 관제</h3>
        <p>클라우드 큐가 작업·권한·기록을 보관하고, 승인된 Worker의 온라인 상태·기능·부하·동시작업 한도를 비교해 안전하게 실행처를 선택합니다. 새 Worker의 자동 실행은 기본 OFF입니다.</p></div>
        <div class="hybrid-actions"><span id="hybridGeneratedAt">확인 전</span><button type="button" class="secondary" id="refreshHybrid">↻ 새로고침</button>
        <button type="button" class="primary" id="enqueueHybridDiagnostic">전체 진단 자동배정</button></div>
      </div>
      <section class="hybrid-fabric-policy" id="hybridFabricPolicy" data-enabled="true">
        <div><strong id="hybridFabricState">실행망 가동 중</strong><p id="hybridFabricNote">승인된 Worker에 새 작업을 자동 배정합니다. 일시중지하면 실행 중 작업은 완료하고 새 배정만 멈춥니다.</p></div>
        <button type="button" class="secondary" id="toggleHybridFabric">실행망 일시중지</button>
      </section>
      <section class="hybrid-watchdog" id="hybridWatchdog" data-status="unknown">
        <div class="hybrid-watchdog-head"><div><strong>운영 자동감시</strong><span class="hybrid-pill" id="hybridMonitorStatus">확인 전</span></div><small id="hybridMonitorTime">10분 주기 감시</small></div>
        <div class="hybrid-incidents" id="hybridIncidentList"><div class="hybrid-empty">감시 상태를 불러오는 중입니다.</div></div>
        <div class="hybrid-monitor-note">노드 heartbeat 5분, 작업 대기 15분, 최근 30분 실패·재배정, 운영 API health와 관리자 Hybrid 자산을 자동 점검합니다.</div>
      </section>
      <div class="hybrid-metrics">
        <article><small>온라인 노드</small><strong id="hybridOnlineNodes">0</strong></article>
        <article><small>자동실행 가능</small><strong id="hybridAutoNodes">0</strong></article>
        <article><small>대기 작업</small><strong id="hybridPendingJobs">0</strong></article>
        <article><small>실행 중</small><strong id="hybridActiveJobs">0</strong></article>
        <article><small>실패 기록</small><strong id="hybridFailedJobs">0</strong></article>
      </div>
      <div class="hybrid-grid">
        <section class="hybrid-box"><div class="hybrid-box-head"><strong>실행 노드</strong><small>OFF → 관리자 승인 후 ON</small></div><div class="hybrid-list" id="hybridNodeList"></div></section>
        <section class="hybrid-box"><div class="hybrid-box-head"><strong>실행 기록</strong><div class="hybrid-filter"><select id="hybridStatusFilter" aria-label="실행 상태 필터"><option value="">전체 상태</option><option value="pending">대기</option><option value="assigned">배정</option><option value="leased">실행 중</option><option value="completed">완료</option><option value="failed">실패</option><option value="cancelled">취소</option></select><input id="hybridJobSearch" type="search" placeholder="작업·기기·ID 검색" aria-label="실행 기록 검색"></div></div><div class="hybrid-list" id="hybridJobList"></div></section>
        <section class="hybrid-box hybrid-ledger"><div class="hybrid-box-head"><strong>감사 이벤트</strong><small>생성 → 배정 → 실행 → 완료/실패 흐름</small></div><div class="hybrid-list" id="hybridEventList"></div></section>
      </div>
      <p class="hybrid-privacy">보안 원칙: 실행 기록에는 작업 상태와 기기·프로세스 수준의 진단 메타데이터만 사용하며, 입력한 문자·비밀번호·메시지 내용은 수집하지 않습니다.</p>`;
  }

  function renameDeviceSurface() {
    document.querySelectorAll('[data-device-control-nav] span').forEach(node => { node.textContent = '실행 인프라'; });
    const host = document.querySelector('#deviceControlPanel');
    const title = host?.querySelector('.device-panel-head h2');
    if (title) title.textContent = '실행 인프라';
    if (location.hash === '#devices') {
      const pageTitle = document.querySelector('#pageTitle');
      if (pageTitle) pageTitle.textContent = '실행 인프라';
    }
  }

  function install() {
    if (document.querySelector('#hybridExecutionPanel')) { renameDeviceSurface(); return true; }
    const host = document.querySelector('#deviceControlPanel');
    if (!host) return false;
    ensureStyle();
    const panel = document.createElement('section');
    panel.id = 'hybridExecutionPanel';
    panel.className = 'hybrid-execution';
    panel.innerHTML = panelHtml();
    const list = host.querySelector('#ekodiDeviceList');
    if (list) list.insertAdjacentElement('beforebegin', panel); else host.append(panel);
    renameDeviceSurface();
    panel.querySelector('#refreshHybrid')?.addEventListener('click', load);
    panel.querySelector('#toggleHybridFabric')?.addEventListener('click', toggleFabric);
    panel.querySelector('#enqueueHybridDiagnostic')?.addEventListener('click', enqueueDiagnostic);
    panel.querySelector('#hybridStatusFilter')?.addEventListener('change', renderJobs);
    panel.querySelector('#hybridJobSearch')?.addEventListener('input', renderJobs);
    load();
    if (!timer) timer = window.setInterval(() => {
      if (!host.classList.contains('hidden-panel')) load();
    }, 10000);
    return true;
  }

  function nodeMarkup(node) {
    const auto = node.autoExecute ? 'checked' : '';
    const enabled = node.enabled ? 'checked' : '';
    const online = node.online ? '온라인' : '오프라인';
    return `<article class="hybrid-node" data-device-id="${escapeHtml(node.deviceId)}">
      <div class="hybrid-row"><div><strong>${escapeHtml(node.label || node.hostname || node.deviceId)}</strong>
      <small>${escapeHtml(node.hostname || '')} · ${online} · 부하 ${Number(node.currentLoad) || 0}% · 실행 ${Number(node.activeJobs) || 0}/${Number(node.maxConcurrency) || 1}</small></div>
      <span class="hybrid-pill">${escapeHtml(node.deviceGroup || 'default')}</span></div>
      <div class="hybrid-controls">
        <label><input type="checkbox" data-auto ${auto}> 자동 실행</label>
        <label><input type="checkbox" data-enabled ${enabled}> 사용</label>
        <label>그룹 <input type="text" data-group value="${escapeHtml(node.deviceGroup || 'default')}" maxlength="64"></label>
        <label>동시 <input type="number" data-concurrency min="1" max="8" value="${Number(node.maxConcurrency) || 1}"></label>
        <button type="button" class="secondary" data-save-node>저장</button>
      </div>
    </article>`;
  }

  function incidentMarkup(incident) {
    const detail = incident.detail || {};
    const detailBits = [];
    if (Number.isFinite(Number(detail.count))) detailBits.push(`건수 ${Number(detail.count)}`);
    if (Number.isFinite(Number(detail.configured))) detailBits.push(`설정 노드 ${Number(detail.configured)}`);
    if (Array.isArray(detail.nodes) && detail.nodes.length) detailBits.push(`노드 ${detail.nodes.slice(0, 4).map(node => node.label || node.deviceId).join(', ')}`);
    if (Array.isArray(detail.stale) && detail.stale.length) detailBits.push(`이탈 ${detail.stale.slice(0, 4).map(node => node.label || node.deviceId).join(', ')}`);
    if (detail.oldest) detailBits.push(`최초 대기 ${timeLabel(detail.oldest)}`);
    return `<article class="hybrid-incident" data-severity="${escapeHtml(incident.severity)}">
      <div class="hybrid-row"><div><strong>${escapeHtml(incident.title)}</strong>
      <small>${severityLabel(incident.severity)} · 최초 ${timeLabel(incident.firstSeenAt)} · 최근 ${timeLabel(incident.lastSeenAt)}${detailBits.length ? ` · ${escapeHtml(detailBits.join(' · '))}` : ''}</small></div>
      <span class="hybrid-pill">${escapeHtml(incident.category || incident.key)}</span></div>
    </article>`;
  }

  function renderFabric() {
    const panel = document.querySelector('#hybridExecutionPanel');
    if (!panel) return;
    const enabled = lastDashboard.fabric?.enabled !== false;
    const policy = panel.querySelector('#hybridFabricPolicy');
    if (policy) policy.dataset.enabled = String(enabled);
    const state = panel.querySelector('#hybridFabricState');
    const note = panel.querySelector('#hybridFabricNote');
    const button = panel.querySelector('#toggleHybridFabric');
    if (state) state.textContent = enabled ? '실행망 가동 중' : '실행망 일시중지';
    if (note) note.textContent = enabled
      ? '승인된 Worker에 새 작업을 자동 배정합니다. 일시중지하면 실행 중 작업은 완료하고 새 배정만 멈춥니다.'
      : '새 작업 배정이 중지되어 있습니다. 이미 실행 중인 작업은 안전하게 완료됩니다.';
    if (button) {
      button.hidden = lastDashboard.fabric?.canManage !== true;
      button.textContent = enabled ? '실행망 일시중지' : '실행망 가동';
      button.className = enabled ? 'secondary' : 'primary';
    }
  }

  function renderMonitoring() {
    const panel = document.querySelector('#hybridExecutionPanel');
    if (!panel) return;
    const monitoring = lastDashboard.monitoring;
    const watchdog = panel.querySelector('#hybridWatchdog');
    const status = monitoring?.status || 'unavailable';
    watchdog.dataset.status = status;
    panel.querySelector('#hybridMonitorStatus').textContent = monitorStatusLabel(status);
    panel.querySelector('#hybridMonitorTime').textContent = monitoring?.lastRunAt ? `최근 점검 ${timeLabel(monitoring.lastRunAt)}` : '점검 기록 없음';
    const list = panel.querySelector('#hybridIncidentList');
    const open = (monitoring?.incidents || []).filter(item => item.status === 'open');
    if (lastDashboard.fabric?.enabled === false) {
      list.innerHTML = '<div class="hybrid-empty">관리자가 실행망을 일시중지했습니다. 새 작업 배정은 멈추고 진행 중 작업만 완료합니다.</div>';
      return;
    }
    if (status === 'unavailable') {
      list.innerHTML = '<div class="hybrid-empty">감시 API 상태를 확인할 수 없습니다. 실행망 자체 기능은 계속 동작합니다.</div>';
      return;
    }
    list.innerHTML = open.length
      ? open.map(incidentMarkup).join('')
      : '<div class="hybrid-empty">현재 감지된 운영 이상이 없습니다.</div>';
  }

  function eventMarkup(event) {
    const detail = eventDetail(event.detail);
    return `<article class="hybrid-event" data-type="${escapeHtml(event.type)}">
      <div class="hybrid-row"><div><strong>${escapeHtml(eventLabel(event.type))}</strong>
      <small>${timeLabel(event.createdAt)} · 작업 ${escapeHtml(event.jobId || '없음')}${event.deviceId ? ` · 기기 ${escapeHtml(event.deviceId)}` : ''}</small>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div><span class="hybrid-pill">${escapeHtml(event.type)}</span></div>
    </article>`;
  }

  function jobMarkup(job, events) {
    const assigned = job.assignedDeviceId ? ` → ${escapeHtml(job.assignedDeviceId)}` : '';
    const error = job.lastError ? `<small>오류: ${escapeHtml(job.lastError)}</small>` : '';
    const cancel = ['pending','assigned'].includes(job.status)
      ? `<button type="button" class="ghost" data-cancel-job="${escapeHtml(job.id)}">취소</button>` : '';
    const jobEvents = events.filter(event => event.jobId === job.id).slice(0, 12);
    const history = jobEvents.length
      ? jobEvents.map(event => `<small>• ${timeLabel(event.createdAt)} · ${escapeHtml(eventLabel(event.type))}${event.deviceId ? ` · ${escapeHtml(event.deviceId)}` : ''}${eventDetail(event.detail) ? ` · ${escapeHtml(eventDetail(event.detail))}` : ''}</small>`).join('')
      : '<small>세부 이벤트가 아직 없습니다.</small>';
    return `<article class="hybrid-job" data-job-status="${escapeHtml(job.status)}">
      <div class="hybrid-row"><div><strong>${escapeHtml(taskLabel(job.taskType))}</strong>
      <small>${statusLabel(job.status)} · 우선순위 ${Number(job.priority) || 0}${assigned}</small>
      <small>${timeLabel(job.createdAt)} · 시도 ${Number(job.attemptCount) || 0}/${Number(job.maxAttempts) || 3}</small>${error}</div>${cancel}</div>
      <details data-job-events><summary>실행 상세 · 이벤트</summary><div class="hybrid-job-detail">
        <small>작업 ID: ${escapeHtml(job.id)}</small>
        <small>최근 갱신: ${timeLabel(job.updatedAt)}${job.completedAt ? ` · 종료 ${timeLabel(job.completedAt)}` : ''}</small>
        <small>현재 기기: ${escapeHtml(job.assignedDeviceId || '없음')} · 이전 기기: ${escapeHtml(job.lastDeviceId || '없음')}</small>
        ${job.leaseExpiresAt ? `<small>리스 만료: ${timeLabel(job.leaseExpiresAt)}</small>` : ''}${history}
      </div></details>
    </article>`;
  }

  function filteredJobs() {
    const panel = document.querySelector('#hybridExecutionPanel');
    const status = panel?.querySelector('#hybridStatusFilter')?.value || '';
    const query = (panel?.querySelector('#hybridJobSearch')?.value || '').trim().toLowerCase();
    return (lastDashboard.jobs || []).filter(job => {
      if (status && job.status !== status) return false;
      if (!query) return true;
      const haystack = [job.id, job.taskType, taskLabel(job.taskType), job.status, statusLabel(job.status), job.assignedDeviceId, job.lastDeviceId, job.lastError]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderJobs() {
    const panel = document.querySelector('#hybridExecutionPanel');
    const jobs = panel?.querySelector('#hybridJobList');
    if (!jobs) return;
    const visible = filteredJobs();
    jobs.innerHTML = visible.length ? visible.map(job => jobMarkup(job, lastDashboard.events || [])).join('') : '<div class="hybrid-empty">조건에 맞는 실행 기록이 없습니다.</div>';
    jobs.querySelectorAll('[data-cancel-job]').forEach(button => button.addEventListener('click', cancelJob));
  }

  function renderEvents() {
    const panel = document.querySelector('#hybridExecutionPanel');
    const events = panel?.querySelector('#hybridEventList');
    if (!events) return;
    const rows = lastDashboard.events || [];
    events.innerHTML = rows.length ? rows.slice(0, 100).map(eventMarkup).join('') : '<div class="hybrid-empty">아직 감사 이벤트가 없습니다.</div>';
  }

  async function load() {
    const panel = document.querySelector('#hybridExecutionPanel');
    if (!panel || !sessionStorage.getItem(TOKEN_KEY)) return;
    try {
      const [data, monitoring] = await Promise.all([
        request('/api/control/hybrid-execution/dashboard'),
        request('/api/control/hybrid-execution/monitor').catch(error => ({ status:'unavailable', error:error.message, incidents:[] })),
      ]);
      lastDashboard = { fabric:data.fabric || { enabled:true }, nodes:data.nodes || [], jobs:data.jobs || [], events:data.events || [], monitoring };
      const summary = data.summary || {};
      panel.querySelector('#hybridOnlineNodes').textContent = String(summary.onlineNodes ?? 0);
      panel.querySelector('#hybridAutoNodes').textContent = String(summary.autoNodes ?? 0);
      panel.querySelector('#hybridPendingJobs').textContent = String(summary.pendingJobs ?? 0);
      panel.querySelector('#hybridActiveJobs').textContent = String(summary.activeJobs ?? 0);
      panel.querySelector('#hybridFailedJobs').textContent = String(summary.failedJobs ?? 0);
      panel.querySelector('#hybridGeneratedAt').textContent = `최근 갱신 ${timeLabel(data.generatedAt)}`;
      const nodes = panel.querySelector('#hybridNodeList');
      nodes.innerHTML = lastDashboard.nodes.length ? lastDashboard.nodes.map(nodeMarkup).join('') : '<div class="hybrid-empty">Agent가 다음 작업을 확인하면 실행 노드로 나타납니다.</div>';
      nodes.querySelectorAll('[data-save-node]').forEach(button => button.addEventListener('click', saveNode));
      renderFabric();
      renderMonitoring();
      renderJobs();
      renderEvents();
    } catch (error) {
      const nodes = panel.querySelector('#hybridNodeList');
      if (nodes) nodes.innerHTML = `<div class="hybrid-empty">${escapeHtml(error.message)}</div>`;
    }
  }

  async function saveNode(event) {
    const button = event.currentTarget;
    const card = button.closest('[data-device-id]');
    if (!card) return;
    button.disabled = true;
    try {
      await request(`/api/control/hybrid-execution/nodes/${encodeURIComponent(card.dataset.deviceId)}`, {
        method:'PATCH',
        body:JSON.stringify({
          autoExecute:card.querySelector('[data-auto]').checked,
          enabled:card.querySelector('[data-enabled]').checked,
          deviceGroup:card.querySelector('[data-group]').value,
          maxConcurrency:Number(card.querySelector('[data-concurrency]').value) || 1,
        }),
      });
      await load();
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
  }

  async function toggleFabric(event) {
    const button = event.currentTarget;
    const nextEnabled = lastDashboard.fabric?.enabled === false;
    const message = nextEnabled
      ? '승인된 Worker에 대기 작업 배정을 다시 시작할까요?'
      : '새 작업 배정을 일시중지할까요? 이미 실행 중인 작업은 중단하지 않고 완료합니다.';
    if (!confirm(message)) return;
    button.disabled = true;
    try {
      await request('/api/control/hybrid-execution/settings', {
        method:'PATCH',
        body:JSON.stringify({ enabled:nextEnabled, confirmed:true }),
      });
      await load();
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
  }

  async function enqueueDiagnostic() {
    const button = document.querySelector('#enqueueHybridDiagnostic');
    if (!button) return;
    button.disabled = true;
    try {
      await request('/api/control/hybrid-execution/jobs', {
        method:'POST',
        body:JSON.stringify({ taskType:'diagnostics.collect', priority:60, maxAttempts:3 }),
      });
      await load();
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
  }

  async function cancelJob(event) {
    const id = event.currentTarget.dataset.cancelJob;
    if (!id) return;
    try {
      await request(`/api/control/hybrid-execution/jobs/${encodeURIComponent(id)}/cancel`, { method:'POST' });
      await load();
    } catch (error) { alert(error.message); }
  }

  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
  }
  window.addEventListener('ekodi-admin-ready', install);
  window.addEventListener('ekodi-admin-section-changed', () => queueMicrotask(renameDeviceSurface));
  window.addEventListener('hashchange', () => queueMicrotask(renameDeviceSurface));
  window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer); });
})();
