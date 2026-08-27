(() => {
  'use strict';

  const API_BASE = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const WINDOWS_AGENT_URL = 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/tools/ekodi-device-agent/windows/ekodi-device-agent.ps1';
  const BOOTSTRAP_URL = '/ekodi-device-bootstrap.cmd';
  const POWER_COMMANDS = [
    ['power.always_on', '항상 켜짐', '절전 없음 · 화면 AC 30분 / 배터리 15분'],
    ['power.presentation', '프레젠테이션', '화면과 절전을 모두 끄지 않음'],
    ['power.normal', '일반 모드', '일반적인 화면·절전 시간 적용'],
    ['power.restore', '원상복구', 'EKODI 적용 전 전원 계획으로 복원'],
  ];
  const CONFIRM_MESSAGES = {
    'autologon.open': '자동로그인 암호는 클라우드에서 받지 않습니다. 이 PC에서 Microsoft Autologon 창을 열까요?',
    'maintenance.temp_cleanup': '7일 이상 지난 사용자/Windows 임시 파일만 정리합니다. 진행할까요?',
    'updates.install': '대기 중인 Windows 소프트웨어 업데이트를 설치합니다. EKODI는 자동 재부팅하지 않습니다. 진행할까요?',
    'profile.workstation.apply': '바탕화면과 시작 메뉴에 EKODI 업무 바로가기를 구성할까요?',
    'profile.workstation.restore': 'EKODI가 만든 업무 바로가기를 제거할까요?',
    'agent.self_update': '공식 EKODI Agent로 업데이트하고 원클릭 연결 프로토콜을 다시 등록할까요?',
    'startup.disable': '이 시작 프로그램을 비활성화할까요? EKODI가 복원 정보를 로컬에 보관합니다.',
    'startup.restore': '이 시작 프로그램을 다시 활성화할까요?',
  };
  let timer = null;
  let currentEnrollmentUrl = '';

  function authHeaders(json = false) {
    const token = sessionStorage.getItem(TOKEN_KEY) || '';
    return { authorization: `Bearer ${token}`, ...(json ? { 'content-type': 'application/json' } : {}) };
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...authHeaders(Boolean(options.body)), ...(options.headers || {}) },
      cache: 'no-store',
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `Device Control API 오류 (${response.status})`);
    return data;
  }

  function setPageTitle(value) {
    const title = document.querySelector('#pageTitle');
    if (title) title.textContent = value;
  }

  function showDevices() {
    document.querySelectorAll('[data-panel]').forEach(panel => {
      const targets = String(panel.dataset.panel || '').split(' ');
      panel.classList.toggle('hidden-panel', !targets.includes('devices'));
    });
    document.querySelectorAll('.sidebar .nav').forEach(item => item.classList.remove('active'));
    document.querySelector('[data-device-control-nav]')?.classList.add('active');
    document.querySelector('.sidebar')?.classList.remove('open');
    setPageTitle('Devices');
    if (location.hash !== '#devices') history.replaceState(null, '', '#devices');
    loadDevices();
  }

  function statusLabel(status) {
    return ({ online: '온라인', stale: '응답 지연', offline: '오프라인', enrolled: '등록됨', revoked: '해제됨' })[status] || status;
  }

  function timeLabel(value) {
    if (!value) return '아직 확인 없음';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('ko-KR');
  }

  function commandLabel(type) {
    const labels = {
      'power.always_on': '항상 켜짐', 'power.presentation': '프레젠테이션', 'power.normal': '일반 모드', 'power.restore': '원상복구',
      'lock.resume_off': '복귀 잠금 해제', 'lock.resume_on': '복귀 잠금 사용', 'autologon.open': '자동로그인 관리',
      'diagnostics.collect': '전체 진단', 'network.diagnose': '네트워크 진단', 'printers.diagnose': '프린터 진단', 'startup.scan': '시작프로그램 확인',
      'startup.disable': '시작프로그램 해제', 'startup.restore': '시작프로그램 복원', 'maintenance.temp_cleanup': '임시파일 정리',
      'updates.scan': '업데이트 확인', 'updates.install': '업데이트 설치', 'profile.workstation.apply': 'EKODI 업무환경',
      'profile.workstation.restore': '업무환경 복원', 'agent.self_update': 'Agent 업데이트',
    };
    return labels[type] || type;
  }

  function commandStatus(status) {
    return ({ queued: '대기', assigned: '배정됨', claimed: '처리 중', succeeded: '완료', failed: '실패', cancelled: '취소' })[status] || status;
  }

  function capability(device, name) {
    return device.capabilities?.[name] === true;
  }

  function launchProtocol(url) {
    if (!url) return;
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.src = url;
    document.body.append(frame);
    window.setTimeout(() => frame.remove(), 1800);
  }

  async function issueCommand(device, type, button, payload = {}) {
    const message = CONFIRM_MESSAGES[type];
    if (message && !confirm(message)) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = '전송 중…';
    try {
      await request(`/api/control/devices/${encodeURIComponent(device.id)}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type, payload, confirmed: Boolean(message) }),
      });
      button.textContent = '대기열 등록 ✓';
      window.setTimeout(loadDevices, 800);
    } catch (error) {
      button.textContent = '실패';
      alert(error.message);
    } finally {
      window.setTimeout(() => { button.disabled = false; button.textContent = original; }, 1400);
    }
  }

  function makeActionButton(device, type, label, className = 'ghost', payload = {}, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.disabled = disabled || device.status === 'revoked';
    button.addEventListener('click', () => issueCommand(device, type, button, payload));
    return button;
  }

  function latestCommandMarkup(commands = []) {
    if (!commands.length) return '<p class="device-command-empty">아직 실행한 작업이 없습니다.</p>';
    return `<div class="device-command-history">${commands.slice(0, 4).map(command => `
      <div class="device-command-row" data-status="${command.status}">
        <span>${commandLabel(command.type)}</span><strong>${commandStatus(command.status)}</strong>
        <small>${timeLabel(command.completedAt || command.claimedAt || command.issuedAt)}${command.result?.message ? ` · ${escapeHtml(command.result.message)}` : ''}</small>
      </div>`).join('')}</div>`;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function healthMarkup(device) {
    const health = device.health || { score: 100, label: '확인 전', recommendations: [] };
    const system = device.settings?.health?.system || device.diagnostics?.system || {};
    const storage = device.settings?.health?.storage || device.diagnostics?.storage || {};
    const minDisk = Array.isArray(storage.volumes) && storage.volumes.length
      ? Math.min(...storage.volumes.map(volume => Number(volume.freePct)).filter(Number.isFinite))
      : null;
    return `
      <div class="device-health" data-score="${health.score}">
        <div class="device-score"><strong>${health.score}</strong><span>/100 · ${escapeHtml(health.label)}</span></div>
        <div class="device-health-stats">
          <span><small>CPU</small><b>${system.cpuLoadPct ?? '—'}%</b></span>
          <span><small>메모리</small><b>${system.memoryUsedPct ?? '—'}%</b></span>
          <span><small>최소 여유</small><b>${Number.isFinite(minDisk) ? `${Math.round(minDisk)}%` : '—'}</b></span>
          <span><small>업타임</small><b>${system.uptimeHours != null ? `${Math.round(system.uptimeHours)}h` : '—'}</b></span>
        </div>
      </div>`;
  }

  function recommendationPanel(device) {
    const wrap = document.createElement('div');
    wrap.className = 'device-ai-recommendations';
    const items = device.health?.recommendations || [];
    const heading = document.createElement('div');
    heading.className = 'device-subhead';
    heading.innerHTML = '<h3>AI 운영 제안</h3><span>상태·정책 기반 1차 진단</span>';
    wrap.append(heading);
    if (!items.length) {
      const clear = document.createElement('p');
      clear.className = 'device-command-empty';
      clear.textContent = '현재 즉시 처리할 권장 항목이 없습니다.';
      wrap.append(clear);
      return wrap;
    }
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'device-recommendation';
      row.dataset.level = item.level || 'low';
      const text = document.createElement('div');
      const strong = document.createElement('strong'); strong.textContent = item.title || '권장 작업';
      const small = document.createElement('small'); small.textContent = item.detail || '';
      text.append(strong, small);
      const action = makeActionButton(device, item.action, '실행', 'secondary');
      row.append(text, action);
      wrap.append(row);
    });
    return wrap;
  }

  function diagnosticSummary(device) {
    const diagnostics = device.diagnostics || {};
    const updates = diagnostics.updates || {};
    const network = diagnostics.network || {};
    const printers = diagnostics.printers || {};
    const startup = diagnostics.startup || {};
    const panel = document.createElement('div');
    panel.className = 'device-diagnostic-summary';
    panel.innerHTML = `
      <span><small>최근 정밀진단</small><strong>${device.diagnosticsAt ? timeLabel(device.diagnosticsAt) : '아직 없음'}</strong></span>
      <span><small>업데이트</small><strong>${updates.pendingCount ?? '—'}개 대기</strong></span>
      <span><small>네트워크</small><strong>${network.apiReachable === true ? '정상' : network.apiReachable === false ? '점검' : '—'}</strong></span>
      <span><small>프린터</small><strong>${printers.issueCount ?? '—'}개 문제</strong></span>
      <span><small>시작항목</small><strong>${startup.count ?? '—'}개</strong></span>`;
    return panel;
  }

  function startupPanel(device) {
    const startup = device.diagnostics?.startup || {};
    const items = Array.isArray(startup.items) ? startup.items.slice(0, 12) : [];
    const disabled = Array.isArray(startup.disabledItems) ? startup.disabledItems.slice(0, 12) : [];
    const box = document.createElement('details');
    box.className = 'device-details';
    box.innerHTML = '<summary>시작 프로그램 관리</summary>';
    const toolbar = document.createElement('div');
    toolbar.className = 'device-inline-actions';
    toolbar.append(makeActionButton(device, 'startup.scan', '목록 새로 확인', 'ghost', {}, !capability(device, 'startupManagement')));
    box.append(toolbar);
    if (!items.length && !disabled.length) {
      const p = document.createElement('p'); p.className = 'device-command-empty'; p.textContent = '“목록 새로 확인”을 누르면 명령문을 노출하지 않고 항목 이름과 안전 ID만 가져옵니다.'; box.append(p);
      return box;
    }
    const list = document.createElement('div'); list.className = 'device-startup-list';
    items.forEach(item => {
      const row = document.createElement('div');
      const text = document.createElement('span'); text.innerHTML = `<strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.scope)}</small>`;
      row.append(text, makeActionButton(device, 'startup.disable', '사용 안 함', 'ghost', { itemId: item.id }));
      list.append(row);
    });
    disabled.forEach(item => {
      const row = document.createElement('div'); row.dataset.disabled = 'true';
      const text = document.createElement('span'); text.innerHTML = `<strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.scope)} · 비활성</small>`;
      row.append(text, makeActionButton(device, 'startup.restore', '복원', 'secondary', { itemId: item.id }));
      list.append(row);
    });
    box.append(list);
    return box;
  }

  function deviceCard(device) {
    const card = document.createElement('article');
    card.className = 'ekodi-device-card';
    card.dataset.status = device.status;

    const head = document.createElement('div'); head.className = 'ekodi-device-head';
    const identity = document.createElement('div');
    identity.innerHTML = `<span class="device-platform-mark">${device.platform === 'windows' ? '⊞' : '◇'}</span><div><strong></strong><small></small></div>`;
    identity.querySelector('strong').textContent = device.label || device.hostname || 'Windows PC';
    identity.querySelector('small').textContent = `${device.hostname || 'hostname 미확인'} · ${device.osVersion || device.platform}`;
    const state = document.createElement('span'); state.className = 'device-state'; state.textContent = statusLabel(device.status);
    head.append(identity, state);

    const meta = document.createElement('div'); meta.className = 'ekodi-device-meta';
    meta.innerHTML = '<span><small>마지막 연결</small><strong></strong></span><span><small>Agent</small><strong></strong></span><span><small>업무 프로필</small><strong></strong></span><span><small>원클릭 연결</small><strong></strong></span>';
    const values = meta.querySelectorAll('strong');
    values[0].textContent = timeLabel(device.lastSeenAt);
    values[1].textContent = device.agentVersion || '—';
    values[2].textContent = device.profileName || '기본';
    values[3].textContent = device.settings?.protocolRegistered ? '준비됨' : '업데이트 필요';

    const health = document.createElement('div'); health.innerHTML = healthMarkup(device);
    const healthNode = health.firstElementChild;

    const execution = document.createElement('div'); execution.className = 'device-execution-policy';
    const executionText = document.createElement('div');
    executionText.innerHTML = `<strong>자동 작업 ${device.execution?.enabled ? '허용됨' : '중지됨'}</strong><small>그룹 ${escapeHtml(device.execution?.group || 'general')} · 동시 ${Number(device.execution?.maxConcurrency || 1)}개</small>`;
    const executionToggle = document.createElement('button'); executionToggle.type = 'button';
    executionToggle.className = device.execution?.enabled ? 'secondary' : 'primary';
    executionToggle.textContent = device.execution?.enabled ? '자동 작업 OFF' : '자동 작업 ON';
    const autoEligible = device.settings?.health?.system?.autoExecutionEligible === true && device.settings?.health?.system?.isPortable === false;
    executionToggle.disabled = device.status === 'revoked' || (!device.execution?.enabled && !autoEligible);
    if (!autoEligible) executionToggle.title = '노트북·휴대형 기기는 자동 작업 노드에서 제외됩니다.';
    executionToggle.addEventListener('click', async () => {
      const enabled = !device.execution?.enabled;
      if (!confirm(`${device.label || device.hostname}의 자동 작업을 ${enabled ? '허용' : '중지'}할까요?`)) return;
      executionToggle.disabled = true;
      try {
        await request(`/api/control/devices/${encodeURIComponent(device.id)}/execution-policy`, {
          method: 'POST', body: JSON.stringify({ enabled, group: device.execution?.group || 'general', maxConcurrency: device.execution?.maxConcurrency || 1, confirmed: true }),
        });
        await loadDevices();
      } catch (error) { alert(error.message); executionToggle.disabled = false; }
    });
    execution.append(executionText, executionToggle);

    const mainActions = document.createElement('div'); mainActions.className = 'device-ops-grid';
    mainActions.append(
      makeActionButton(device, 'diagnostics.collect', '🩺 전체 진단', 'primary', {}, !capability(device, 'diagnostics')),
      makeActionButton(device, 'maintenance.temp_cleanup', '🧹 임시파일 정리', 'ghost', {}, !capability(device, 'storageMaintenance')),
      makeActionButton(device, 'updates.scan', '🔄 업데이트 확인', 'ghost', {}, !capability(device, 'windowsUpdate')),
      makeActionButton(device, 'updates.install', '⬆ 업데이트 설치', 'ghost', {}, !capability(device, 'windowsUpdate')),
      makeActionButton(device, 'network.diagnose', '🌐 네트워크 진단', 'ghost', {}, !capability(device, 'networkDiagnostics')),
      makeActionButton(device, 'printers.diagnose', '🖨 프린터 진단', 'ghost', {}, !capability(device, 'printerDiagnostics')),
      makeActionButton(device, 'profile.workstation.apply', '◫ EKODI 업무환경', 'ghost', {}, !capability(device, 'workstationProfile')),
      makeActionButton(device, 'profile.workstation.restore', '↩ 업무환경 복원', 'ghost', {}, !capability(device, 'workstationProfile')),
    );

    const profileTitle = document.createElement('h3'); profileTitle.textContent = '전원 프로필';
    const profiles = document.createElement('div'); profiles.className = 'device-command-grid';
    POWER_COMMANDS.forEach(([type, label, title]) => { const b = makeActionButton(device, type, label, type === 'power.restore' ? 'secondary' : 'ghost'); b.title = title; profiles.append(b); });

    const securityTitle = document.createElement('h3'); securityTitle.textContent = '잠금 · Agent';
    const security = document.createElement('div'); security.className = 'device-command-grid security';
    security.append(
      makeActionButton(device, 'lock.resume_off', '복귀 잠금 해제'),
      makeActionButton(device, 'lock.resume_on', '복귀 잠금 사용'),
      makeActionButton(device, 'autologon.open', '자동로그인 관리', 'secondary'),
      makeActionButton(device, 'agent.self_update', 'Agent 업데이트', 'secondary'),
    );

    const history = document.createElement('div'); history.className = 'device-history'; history.innerHTML = `<h3>최근 작업</h3>${latestCommandMarkup(device.recentCommands)}`;
    const foot = document.createElement('div'); foot.className = 'device-card-foot';
    const note = document.createElement('p');
    note.textContent = device.status === 'online' ? 'Agent가 연결되어 있습니다. 실행 결과는 검증 후 이 화면과 Activity Logs에 남습니다.' : device.status === 'revoked' ? '이 기기의 EKODI 접근 권한이 해제되었습니다.' : '오프라인이면 작업은 대기열에 보관되고 Agent가 다시 연결된 뒤 처리됩니다.';
    const revoke = document.createElement('button'); revoke.type = 'button'; revoke.className = 'ghost device-revoke'; revoke.textContent = '기기 권한 해제'; revoke.disabled = device.status === 'revoked';
    revoke.addEventListener('click', async () => {
      if (!confirm(`${device.label || device.hostname}의 EKODI Device Agent 권한을 해제할까요?`)) return;
      try { await request(`/api/control/devices/${encodeURIComponent(device.id)}/revoke`, { method: 'POST' }); await loadDevices(); } catch (error) { alert(error.message); }
    });
    foot.append(note, revoke);

    card.append(head, meta, execution, healthNode, recommendationPanel(device), diagnosticSummary(device), mainActions, startupPanel(device), profileTitle, profiles, securityTitle, security, history, foot);
    return card;
  }

  function renderJobs(jobs = []) {
    const list = document.querySelector('#deviceJobList');
    const queued = document.querySelector('#deviceMetricQueued');
    if (queued) queued.textContent = String(jobs.filter(job => ['queued', 'assigned'].includes(job.status)).length);
    if (!list) return;
    list.textContent = '';
    if (!jobs.length) { list.innerHTML = '<p class="device-command-empty">아직 자동 배정 작업이 없습니다.</p>'; return; }
    jobs.slice(0, 12).forEach(job => {
      const row = document.createElement('div'); row.className = 'device-job-row'; row.dataset.status = job.status;
      row.innerHTML = `<div><strong>${escapeHtml(commandLabel(job.type))}</strong><small>${escapeHtml(job.targetGroup)} 그룹 · 우선순위 ${Number(job.priority)} · 시도 ${Number(job.attempts)}</small></div><span>${escapeHtml(commandStatus(job.status))}</span><time>${escapeHtml(timeLabel(job.completedAt || job.assignedAt || job.requestedAt))}</time>`;
      list.append(row);
    });
  }

  async function createAutoJob(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const type = form.elements.type.value;
    const targetGroup = form.elements.targetGroup.value.trim() || 'general';
    const priority = Number(form.elements.priority.value) || 50;
    const confirmed = Boolean(CONFIRM_MESSAGES[type]) ? confirm(CONFIRM_MESSAGES[type]) : true;
    if (!confirmed) return;
    const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
    try {
      await request('/api/control/devices/jobs', { method: 'POST', body: JSON.stringify({ type, targetGroup, priority, confirmed }) });
      await loadDevices();
    } catch (error) { alert(error.message); }
    finally { submit.disabled = false; }
  }

  function renderDevices(devices) {
    const list = document.querySelector('#ekodiDeviceList');
    const total = document.querySelector('#deviceMetricTotal');
    const online = document.querySelector('#deviceMetricOnline');
    const issues = document.querySelector('#deviceMetricIssues');
    const avgHealth = document.querySelector('#deviceMetricHealth');
    if (!list) return;
    total.textContent = String(devices.length);
    online.textContent = String(devices.filter(device => device.status === 'online').length);
    issues.textContent = String(devices.filter(device => ['stale', 'offline'].includes(device.status) || Number(device.health?.score) < 75).length);
    avgHealth.textContent = devices.length ? String(Math.round(devices.reduce((sum, device) => sum + Number(device.health?.score || 0), 0) / devices.length)) : '—';
    list.textContent = '';
    if (!devices.length) { list.innerHTML = '<div class="device-empty"><strong>아직 등록된 기기가 없습니다.</strong><p>위의 “Windows PC 등록”에서 이 PC를 연결하세요.</p></div>'; return; }
    devices.forEach(device => list.append(deviceCard(device)));
  }

  async function loadDevices() {
    const list = document.querySelector('#ekodiDeviceList');
    if (!list || !sessionStorage.getItem(TOKEN_KEY)) return;
    try {
      const data = await request('/api/control/devices');
      renderDevices(data.devices || []);
      renderJobs(data.jobs || []);
      const stamp = document.querySelector('#deviceGeneratedAt');
      if (stamp) stamp.textContent = `최근 갱신 ${timeLabel(data.generatedAt)}`;
    } catch (error) {
      list.innerHTML = '<div class="device-empty error"><strong>Device Control API를 불러오지 못했습니다.</strong><p></p></div>';
      list.querySelector('p').textContent = error.message;
    }
  }

  async function createEnrollment() {
    const button = document.querySelector('#createDeviceEnrollment');
    const result = document.querySelector('#deviceEnrollmentResult');
    if (!button || !result) return;
    button.disabled = true; button.textContent = '연결 준비 중…';
    try {
      const data = await request('/api/control/devices/enrollment', { method: 'POST', body: JSON.stringify({ label: 'Windows PC' }) });
      const command = `$p="$env:TEMP\\ekodi-device-agent.ps1"; Invoke-WebRequest -UseBasicParsing "${WINDOWS_AGENT_URL}" -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p -Install -EnrollmentCode "${data.enrollmentCode}" -ApiBase "${API_BASE}"`;
      currentEnrollmentUrl = data.protocolUrl || `ekodi-device://enroll?code=${encodeURIComponent(data.enrollmentCode)}`;
      result.hidden = false;
      result.querySelector('[data-enrollment-code]').textContent = data.enrollmentCode;
      result.querySelector('[data-enrollment-expiry]').textContent = `유효시간: ${timeLabel(data.expiresAt)}까지 · 1회 사용`;
      result.querySelector('[data-install-command]').textContent = command;
      result.dataset.installCommand = command;
      launchProtocol(currentEnrollmentUrl);
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; button.textContent = 'Windows PC 등록'; }
  }

  function installPanel() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('#deviceControlPanel')) return;

    const button = document.createElement('button'); button.type = 'button'; button.className = 'nav'; button.dataset.deviceControlNav = 'true'; button.append(document.createTextNode('⌁ '));
    const label = document.createElement('span'); label.textContent = 'Devices'; button.append(label);
    const workspace = nav.querySelector('[data-section="workspace"]'); if (workspace) workspace.insertAdjacentElement('afterend', button); else nav.append(button);

    const panel = document.createElement('section'); panel.id = 'deviceControlPanel'; panel.className = 'section ekodi-device-panel hidden-panel'; panel.dataset.panel = 'devices';
    panel.innerHTML = `
      <div class="device-panel-head">
        <div><p class="kicker">EKODI DEVICE AI</p><h2>기기 운영 · 진단 · 복구</h2><p>승인된 Local Agent가 상태를 관찰하고, 허용된 작업만 실행한 뒤 결과를 검증합니다. 임의 셸·화면캡처·암호수집은 허용하지 않습니다.</p></div>
        <div class="device-head-actions"><span id="deviceGeneratedAt">연결 상태 확인 전</span><button type="button" class="secondary" id="refreshDevices">↻ 새로고침</button></div>
      </div>
      <div class="device-metrics">
        <article><small>등록 기기</small><strong id="deviceMetricTotal">—</strong></article>
        <article><small>온라인</small><strong id="deviceMetricOnline">—</strong></article>
        <article><small>배정 대기</small><strong id="deviceMetricQueued">—</strong></article>
        <article><small>확인 필요</small><strong id="deviceMetricIssues">—</strong></article>
        <article><small>평균 건강점수</small><strong id="deviceMetricHealth">—</strong><span>100점 기준</span></article>
      </div>
      <section class="device-job-console">
        <div><p class="kicker">HYBRID EXECUTION QUEUE</p><h3>자동 작업 배정</h3><p>온라인·허용 상태·기기 능력·현재 부하를 확인해 가능한 PC에 배정합니다.</p></div>
        <form id="deviceJobForm">
          <label>작업<select name="type"><option value="diagnostics.collect">전체 진단</option><option value="network.diagnose">네트워크 진단</option><option value="updates.scan">업데이트 확인</option><option value="maintenance.temp_cleanup">임시파일 정리</option></select></label>
          <label>기기 그룹<input name="targetGroup" value="general" pattern="[a-z0-9][a-z0-9_-]{0,59}" required></label>
          <label>우선순위<input name="priority" type="number" min="1" max="100" value="50"></label>
          <button type="submit" class="primary">작업 등록</button>
        </form>
        <div id="deviceJobList" class="device-job-list"><p class="device-command-empty">작업 큐를 불러오는 중입니다.</p></div>
      </section>
      <div class="device-enrollment-box">
        <div><p class="kicker">ONE-CLICK PAIRING</p><h3>Windows PC 연결</h3><p>연결 프로그램이 설치된 PC는 버튼 클릭 후 Windows 승인만 하면 자동 등록됩니다.</p></div>
        <button type="button" class="primary" id="createDeviceEnrollment">Windows PC 등록</button>
      </div>
      <div class="device-enrollment-result" id="deviceEnrollmentResult" hidden>
        <div><small>1회용 등록 코드</small><strong data-enrollment-code></strong><span data-enrollment-expiry></span></div>
        <p><b>연결 창이 떴다면 Windows 승인만 진행하세요.</b> 아무 반응이 없으면 연결 프로그램을 한 번 설치한 뒤 “이 PC 연결 계속”을 누르면 됩니다.</p>
        <div class="device-pair-actions"><a class="button secondary" href="${BOOTSTRAP_URL}" download="EKODI_Device_연결프로그램.cmd">연결 프로그램 설치</a><button type="button" class="primary" id="continueDeviceEnrollment">이 PC 연결 계속</button></div>
        <details class="device-advanced-install"><summary>고급 설치 · PowerShell 명령 보기</summary><code data-install-command></code><button type="button" class="secondary" id="copyDeviceInstallCommand">설치 명령 복사</button></details>
      </div>
      <div class="device-security-note"><strong>권한 경계</strong><p>관찰 → 진단 → 관리자 승인 → 허용 작업 실행 → 결과 검증 → 감사기록 순서로 동작합니다. Windows 암호는 EKODI 서버로 보내거나 저장하지 않습니다.</p></div>
      <div class="ekodi-device-list" id="ekodiDeviceList"><div class="device-empty"><p>기기 목록을 불러오는 중입니다.</p></div></div>`;
    content.append(panel);

    button.addEventListener('click', showDevices);
    panel.querySelector('#refreshDevices').addEventListener('click', loadDevices);
    panel.querySelector('#deviceJobForm').addEventListener('submit', createAutoJob);
    panel.querySelector('#createDeviceEnrollment').addEventListener('click', createEnrollment);
    panel.querySelector('#continueDeviceEnrollment').addEventListener('click', () => launchProtocol(currentEnrollmentUrl));
    panel.querySelector('#copyDeviceInstallCommand').addEventListener('click', async event => {
      const command = panel.querySelector('#deviceEnrollmentResult').dataset.installCommand || '';
      if (!command) return;
      try { await navigator.clipboard.writeText(command); event.currentTarget.textContent = '복사했습니다 ✓'; setTimeout(() => { event.currentTarget.textContent = '설치 명령 복사'; }, 1500); }
      catch { event.currentTarget.textContent = '코드를 직접 선택해 복사하세요'; }
    });

    if (location.hash === '#devices') showDevices();
    window.addEventListener('hashchange', () => { if (location.hash === '#devices') showDevices(); });
    timer = window.setInterval(() => { if (!panel.classList.contains('hidden-panel')) loadDevices(); }, 10000);
  }

  installPanel();
  window.addEventListener('ekodi-admin-ready', installPanel, { once: true });
  window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer); });
})();
