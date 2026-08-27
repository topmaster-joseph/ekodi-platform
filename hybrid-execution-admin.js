(() => {
  'use strict';

  const API_BASE = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  let timer = null;

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
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('ko-KR');
  }

  function statusLabel(status) {
    return ({
      pending:'대기', assigned:'배정', leased:'실행 중', completed:'완료',
      failed:'실패', cancelled:'취소',
    })[status] || status;
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

  function ensureStyle() {
    if (document.querySelector('#ekodiHybridExecutionStyle')) return;
    const style = document.createElement('style');
    style.id = 'ekodiHybridExecutionStyle';
    style.textContent = `
      .hybrid-execution{margin:18px 0;padding:18px;border:1px solid var(--line,#d9dee7);border-radius:18px;background:var(--card,#fff)}
      .hybrid-head{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
      .hybrid-head h3{margin:3px 0 5px}.hybrid-head p{margin:0;max-width:760px}
      .hybrid-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .hybrid-metrics{display:grid;grid-template-columns:repeat(4,minmax(110px,1fr));gap:10px;margin:14px 0}
      .hybrid-metrics article{padding:12px;border:1px solid var(--line,#e0e4eb);border-radius:14px}
      .hybrid-metrics small,.hybrid-node small,.hybrid-job small{display:block;opacity:.7}.hybrid-metrics strong{font-size:1.45rem}
      .hybrid-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
      .hybrid-box{border:1px solid var(--line,#e0e4eb);border-radius:14px;padding:13px;min-width:0}
      .hybrid-box-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}
      .hybrid-list{display:grid;gap:8px;max-height:360px;overflow:auto}
      .hybrid-node,.hybrid-job{border:1px solid var(--line,#e0e4eb);border-radius:12px;padding:10px}
      .hybrid-row{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
      .hybrid-controls{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:8px}
      .hybrid-controls input{width:72px}.hybrid-controls select{max-width:160px}
      .hybrid-pill{display:inline-flex;padding:3px 8px;border-radius:999px;background:rgba(127,127,127,.12);font-size:.78rem}
      .hybrid-empty{padding:16px;text-align:center;opacity:.72}
      @media(max-width:760px){.hybrid-grid{grid-template-columns:1fr}.hybrid-metrics{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.append(style);
  }

  function panelHtml() {
    return `
      <div class="hybrid-head">
        <div><p class="kicker">EKODI HYBRID EXECUTION</p><h3>하이브리드 실행망</h3>
        <p>클라우드가 작업·권한·기록을 보관하고, 승인된 PC 중 온라인 상태·기능·부하·동시작업 한도를 비교해 실행 노드를 자동 선택합니다. 새 기기의 자동 실행은 기본 OFF입니다.</p></div>
        <div class="hybrid-actions"><span id="hybridGeneratedAt">확인 전</span><button type="button" class="secondary" id="refreshHybrid">↻ 새로고침</button>
        <button type="button" class="primary" id="enqueueHybridDiagnostic">전체 진단 자동배정</button></div>
      </div>
      <div class="hybrid-metrics">
        <article><small>온라인 노드</small><strong id="hybridOnlineNodes">—</strong></article>
        <article><small>자동실행 가능</small><strong id="hybridAutoNodes">—</strong></article>
        <article><small>대기 작업</small><strong id="hybridPendingJobs">—</strong></article>
        <article><small>실행 중</small><strong id="hybridActiveJobs">—</strong></article>
      </div>
      <div class="hybrid-grid">
        <section class="hybrid-box"><div class="hybrid-box-head"><strong>실행 노드</strong><small>OFF → 관리자 승인 후 ON</small></div><div class="hybrid-list" id="hybridNodeList"></div></section>
        <section class="hybrid-box"><div class="hybrid-box-head"><strong>작업 큐 · 배정 기록</strong><small>실패·지연 시 최대 3회</small></div><div class="hybrid-list" id="hybridJobList"></div></section>
      </div>`;
  }

  function install() {
    if (document.querySelector('#hybridExecutionPanel')) return true;
    const host = document.querySelector('#deviceControlPanel');
    if (!host) return false;
    ensureStyle();
    const panel = document.createElement('section');
    panel.id = 'hybridExecutionPanel';
    panel.className = 'hybrid-execution';
    panel.innerHTML = panelHtml();
    const list = host.querySelector('#ekodiDeviceList');
    if (list) list.insertAdjacentElement('beforebegin', panel); else host.append(panel);
    panel.querySelector('#refreshHybrid')?.addEventListener('click', load);
    panel.querySelector('#enqueueHybridDiagnostic')?.addEventListener('click', enqueueDiagnostic);
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

  function jobMarkup(job) {
    const assigned = job.assignedDeviceId ? ` → ${escapeHtml(job.assignedDeviceId)}` : '';
    const error = job.lastError ? `<small>오류: ${escapeHtml(job.lastError)}</small>` : '';
    const cancel = ['pending','assigned'].includes(job.status)
      ? `<button type="button" class="ghost" data-cancel-job="${escapeHtml(job.id)}">취소</button>` : '';
    return `<article class="hybrid-job">
      <div class="hybrid-row"><div><strong>${escapeHtml(taskLabel(job.taskType))}</strong>
      <small>${statusLabel(job.status)} · 우선순위 ${Number(job.priority) || 0}${assigned}</small>
      <small>${timeLabel(job.createdAt)} · 시도 ${Number(job.attemptCount) || 0}/${Number(job.maxAttempts) || 3}</small>${error}</div>${cancel}</div>
    </article>`;
  }

  async function load() {
    const panel = document.querySelector('#hybridExecutionPanel');
    if (!panel || !sessionStorage.getItem(TOKEN_KEY)) return;
    try {
      const data = await request('/api/control/hybrid-execution/dashboard');
      const summary = data.summary || {};
      panel.querySelector('#hybridOnlineNodes').textContent = String(summary.onlineNodes ?? 0);
      panel.querySelector('#hybridAutoNodes').textContent = String(summary.autoNodes ?? 0);
      panel.querySelector('#hybridPendingJobs').textContent = String(summary.pendingJobs ?? 0);
      panel.querySelector('#hybridActiveJobs').textContent = String(summary.activeJobs ?? 0);
      panel.querySelector('#hybridGeneratedAt').textContent = `최근 갱신 ${timeLabel(data.generatedAt)}`;
      const nodes = panel.querySelector('#hybridNodeList');
      const jobs = panel.querySelector('#hybridJobList');
      nodes.innerHTML = (data.nodes || []).length ? data.nodes.map(nodeMarkup).join('') : '<div class="hybrid-empty">Agent가 다음 작업을 확인하면 실행 노드로 나타납니다.</div>';
      jobs.innerHTML = (data.jobs || []).length ? data.jobs.map(jobMarkup).join('') : '<div class="hybrid-empty">아직 하이브리드 작업이 없습니다.</div>';
      nodes.querySelectorAll('[data-save-node]').forEach(button => button.addEventListener('click', saveNode));
      jobs.querySelectorAll('[data-cancel-job]').forEach(button => button.addEventListener('click', cancelJob));
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
  window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer); });
})();
