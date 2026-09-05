(() => {
  'use strict';

  const API_BASE = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const WINDOWS_AGENT_URL = 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/tools/ekodi-device-agent/windows/ekodi-device-agent.ps1';
  const BOOTSTRAP_URL = '/ekodi-device-bootstrap.cmd';
  const DEVICE_REFRESH_MS = 30 * 1000;
  const POWER_COMMANDS = [
    ['power.always_on', '항상 켜짐', '절전 없음 · 화면 AC 30분 / 배터리 15분'],
    ['power.presentation', '프레젠테이션', '화면과 절전을 모두 끄지 않음'],
    ['power.normal', '일반 모드', '일반적인 화면·절전 시간 적용'],
    ['power.restore', '원상복구', 'EKODI 적용 전 전원 계획으로 복원'],
  ];
  const TYPE_FALLBACK = Object.freeze({
    pc: { id:'pc', label:'PC', icon:'⊞', managementMode:'managed', enrollment:'windows-agent', remoteCommandLevel:'managed', autoExecution:'desktop-only' },
    pos: { id:'pos', label:'POS', icon:'▤', managementMode:'limited', enrollment:'windows-agent', remoteCommandLevel:'observe', autoExecution:'never' },
    kiosk: { id:'kiosk', label:'키오스크', icon:'▣', managementMode:'limited', enrollment:'windows-agent', remoteCommandLevel:'observe', autoExecution:'never' },
    tablet: { id:'tablet', label:'태블릿', icon:'▯', managementMode:'limited', enrollment:'windows-agent', remoteCommandLevel:'observe', autoExecution:'never' },
    sensor: { id:'sensor', label:'센서', icon:'⌁', managementMode:'observe', enrollment:'inventory', remoteCommandLevel:'none', autoExecution:'never' },
    robot: { id:'robot', label:'서비스로봇', icon:'◇', managementMode:'observe', enrollment:'inventory', remoteCommandLevel:'none', autoExecution:'never' },
    other: { id:'other', label:'기타 기기', icon:'○', managementMode:'observe', enrollment:'inventory', remoteCommandLevel:'none', autoExecution:'never' },
  });
  const OBSERVE_COMMANDS = Object.freeze({
    pos: new Set(['diagnostics.collect','network.diagnose','printers.diagnose','updates.scan']),
    kiosk: new Set(['diagnostics.collect','network.diagnose','updates.scan']),
    tablet: new Set(['diagnostics.collect','network.diagnose','updates.scan']),
    sensor: new Set(), robot: new Set(), other: new Set(),
  });
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
  let loadPromise = null;
  let currentEnrollmentUrl = '';
  let deviceCatalog = Object.values(TYPE_FALLBACK);
  let currentDevices = [];
  let activeType = 'all';

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
    setPageTitle('원격 작업');
    if (location.hash !== '#devices') history.replaceState(null, '', '#devices');
    loadDevices();
  }

  function statusLabel(status) {
    return ({ online: '온라인', stale: '응답 지연', offline: '오프라인', enrolled: '등록됨', inventory: '관찰 등록', revoked: '해제됨' })[status] || status;
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

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function typeInfo(deviceOrType) {
    const id = typeof deviceOrType === 'string' ? deviceOrType : (deviceOrType?.management?.type || 'pc');
    return deviceCatalog.find(item => item.id === id) || TYPE_FALLBACK[id] || TYPE_FALLBACK.other;
  }

  function isInventory(device) { return device.management?.source === 'inventory' || device.platform === 'inventory'; }
  function capability(device, name) { return device.capabilities?.[name] === true; }
  function commandAllowed(device, type) {
    if (isInventory(device)) return false;
    const deviceType = device.management?.type || 'pc';
    if (deviceType === 'pc') return true;
    return OBSERVE_COMMANDS[deviceType]?.has(type) === true;
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
    if (!commandAllowed(device, type)) return;
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
    button.disabled = disabled || device.status === 'revoked' || !commandAllowed(device, type);
    if (!commandAllowed(device, type)) button.title = `${typeInfo(device).label} 정책에서는 이 원격 작업을 허용하지 않습니다.`;
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

  function healthMarkup(device) {
    if (device.health?.score == null) {
      return `<div class="device-health device-health-observe"><div class="device-score"><strong>—</strong><span>${escapeHtml(device.health?.label || '연결 준비')}</span></div><p>전용 어댑터가 연결되기 전에는 상태를 추정하지 않습니다.</p></div>`;
    }
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
    heading.innerHTML = '<h3>운영 제안</h3><span>기기유형 · 상태 · 정책 기반</span>';
    wrap.append(heading);
    if (!items.length) {
      const clear = document.createElement('p'); clear.className = 'device-command-empty'; clear.textContent = '현재 즉시 처리할 권장 항목이 없습니다.'; wrap.append(clear); return wrap;
    }
    items.forEach(item => {
      const row = document.createElement('div'); row.className = 'device-recommendation'; row.dataset.level = item.level || 'low';
      const text = document.createElement('div');
      const strong = document.createElement('strong'); strong.textContent = item.title || '권장 작업';
      const small = document.createElement('small'); small.textContent = item.detail || '';
      text.append(strong, small);
      row.append(text);
      if (item.action && commandAllowed(device, item.action)) row.append(makeActionButton(device, item.action, '실행', 'secondary'));
      else { const policy = document.createElement('span'); policy.className = 'device-policy-state'; policy.textContent = '관찰'; row.append(policy); }
      wrap.append(row);
    });
    return wrap;
  }

  function diagnosticSummary(device) {
    const panel = document.createElement('div'); panel.className = 'device-diagnostic-summary';
    if (isInventory(device)) {
      panel.innerHTML = `<span><small>관리 방식</small><strong>관찰 등록</strong></span><span><small>원격명령</small><strong>차단</strong></span><span><small>자동배정</small><strong>제외</strong></span>`;
      return panel;
    }
    const diagnostics = device.diagnostics || {};
    const updates = diagnostics.updates || {}, network = diagnostics.network || {}, printers = diagnostics.printers || {}, startup = diagnostics.startup || {};
    panel.innerHTML = `
      <span><small>최근 정밀진단</small><strong>${device.diagnosticsAt ? timeLabel(device.diagnosticsAt) : '아직 없음'}</strong></span>
      <span><small>업데이트</small><strong>${updates.pendingCount ?? '—'}개 대기</strong></span>
      <span><small>네트워크</small><strong>${network.apiReachable === true ? '정상' : network.apiReachable === false ? '점검' : '—'}</strong></span>
      <span><small>프린터</small><strong>${printers.issueCount ?? '—'}개 문제</strong></span>
      <span><small>시작항목</small><strong>${startup.count ?? '—'}개</strong></span>`;
    return panel;
  }

  function startupPanel(device) {
    const box = document.createElement('details'); box.className = 'device-details'; box.innerHTML = '<summary>시작 프로그램 관리</summary>';
    if (!commandAllowed(device, 'startup.scan')) {
      const p = document.createElement('p'); p.className = 'device-command-empty'; p.textContent = '이 기기 유형에서는 시작 프로그램 원격관리를 허용하지 않습니다.'; box.append(p); return box;
    }
    const startup = device.diagnostics?.startup || {};
    const items = Array.isArray(startup.items) ? startup.items.slice(0, 12) : [];
    const disabled = Array.isArray(startup.disabledItems) ? startup.disabledItems.slice(0, 12) : [];
    const toolbar = document.createElement('div'); toolbar.className = 'device-inline-actions';
    toolbar.append(makeActionButton(device, 'startup.scan', '목록 새로 확인', 'ghost', {}, !capability(device, 'startupManagement'))); box.append(toolbar);
    if (!items.length && !disabled.length) {
      const p = document.createElement('p'); p.className = 'device-command-empty'; p.textContent = '“목록 새로 확인”을 누르면 명령문을 노출하지 않고 항목 이름과 안전 ID만 가져옵니다.'; box.append(p); return box;
    }
    const list = document.createElement('div'); list.className = 'device-startup-list';
    items.forEach(item => { const row = document.createElement('div'); const text = document.createElement('span'); text.innerHTML = `<strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.scope)}</small>`; row.append(text, makeActionButton(device, 'startup.disable', '사용 안 함', 'ghost', { itemId: item.id })); list.append(row); });
    disabled.forEach(item => { const row = document.createElement('div'); row.dataset.disabled = 'true'; const text = document.createElement('span'); text.innerHTML = `<strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.scope)} · 비활성</small>`; row.append(text, makeActionButton(device, 'startup.restore', '복원', 'secondary', { itemId: item.id })); list.append(row); });
    box.append(list); return box;
  }

  function managementPanel(device) {
    const box = document.createElement('div'); box.className = 'device-management-row';
    const current = device.management || { type:'pc', locationLabel:'' };
    const options = deviceCatalog.map(item => `<option value="${escapeHtml(item.id)}"${item.id === current.type ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
    box.innerHTML = `<label>기기 유형<select data-device-type>${options}</select></label><label>위치<input data-device-location maxlength="120" value="${escapeHtml(current.locationLabel || '')}" placeholder="예: 목포대점 카운터"></label><button type="button" class="secondary" data-save-management>정책 저장</button>`;
    const save = box.querySelector('[data-save-management]');
    save.addEventListener('click', async () => {
      const nextType = box.querySelector('[data-device-type]').value;
      const locationLabel = box.querySelector('[data-device-location]').value.trim();
      if (!confirm(`${device.label || '기기'}를 ${typeInfo(nextType).label} 유형으로 관리할까요? 유형에 따라 원격권한이 자동 축소될 수 있습니다.`)) return;
      save.disabled = true;
      try { await request(`/api/control/devices/${encodeURIComponent(device.id)}/management`, { method:'POST', body:JSON.stringify({ deviceType:nextType, locationLabel, confirmed:true }) }); await loadDevices(); }
      catch (error) { alert(error.message); save.disabled = false; }
    });
    return box;
  }

  function deviceCard(device) {
    const card = document.createElement('article'); card.className = 'ekodi-device-card'; card.dataset.status = device.status; card.dataset.deviceType = device.management?.type || 'pc';
    const type = typeInfo(device);
    const head = document.createElement('div'); head.className = 'ekodi-device-head';
    const identity = document.createElement('div');
    identity.innerHTML = `<span class="device-platform-mark">${escapeHtml(type.icon || '○')}</span><div><span class="device-type-badge">${escapeHtml(type.label)}</span><strong></strong><small></small></div>`;
    identity.querySelector('strong').textContent = device.label || device.hostname || type.label;
    identity.querySelector('small').textContent = isInventory(device)
      ? `${device.management?.locationLabel || '위치 미지정'} · 관찰 인벤토리`
      : `${device.hostname || 'hostname 미확인'} · ${device.osVersion || device.platform}${device.management?.locationLabel ? ` · ${device.management.locationLabel}` : ''}`;
    const state = document.createElement('span'); state.className = 'device-state'; state.textContent = statusLabel(device.status); head.append(identity, state);

    const meta = document.createElement('div'); meta.className = 'ekodi-device-meta';
    meta.innerHTML = '<span><small>마지막 연결</small><strong></strong></span><span><small>관리모드</small><strong></strong></span><span><small>Agent</small><strong></strong></span><span><small>원격권한</small><strong></strong></span>';
    const values = meta.querySelectorAll('strong');
    values[0].textContent = isInventory(device) ? '어댑터 연결 전' : timeLabel(device.lastSeenAt);
    values[1].textContent = ({managed:'관리',limited:'제한 관리',observe:'관찰'})[device.management?.mode] || device.management?.mode || '관리';
    values[2].textContent = device.agentVersion || '없음';
    values[3].textContent = ({managed:'관리 작업',observe:'관찰 작업',none:'없음'})[device.management?.remoteCommandLevel] || '없음';

    const execution = document.createElement('div'); execution.className = 'device-execution-policy';
    const executionText = document.createElement('div');
    const pcType = device.management?.type === 'pc' && !isInventory(device);
    executionText.innerHTML = `<strong>자동 작업 ${device.execution?.enabled ? '허용됨' : '중지됨'}</strong><small>${pcType ? `그룹 ${escapeHtml(device.execution?.group || 'general')} · 동시 ${Number(device.execution?.maxConcurrency || 1)}개` : '데스크톱 PC가 아닌 기기는 자동 작업배정에서 제외'}</small>`;
    const executionToggle = document.createElement('button'); executionToggle.type = 'button'; executionToggle.className = device.execution?.enabled ? 'secondary' : 'primary'; executionToggle.textContent = device.execution?.enabled ? '자동 작업 OFF' : '자동 작업 ON';
    const autoEligible = pcType && device.settings?.health?.system?.autoExecutionEligible === true && device.settings?.health?.system?.isPortable === false;
    executionToggle.disabled = device.status === 'revoked' || (!device.execution?.enabled && !autoEligible) || !pcType;
    if (!autoEligible) executionToggle.title = pcType ? '노트북·휴대형 기기는 자동 작업 노드에서 제외됩니다.' : '자동 작업은 검증된 데스크톱 PC에만 허용됩니다.';
    executionToggle.addEventListener('click', async () => {
      const enabled = !device.execution?.enabled;
      if (!confirm(`${device.label || device.hostname}의 자동 작업을 ${enabled ? '허용' : '중지'}할까요?`)) return;
      executionToggle.disabled = true;
      try { await request(`/api/control/devices/${encodeURIComponent(device.id)}/execution-policy`, { method:'POST', body:JSON.stringify({ enabled, group:device.execution?.group || 'general', maxConcurrency:device.execution?.maxConcurrency || 1, confirmed:true }) }); await loadDevices(); }
      catch (error) { alert(error.message); executionToggle.disabled = false; }
    });
    execution.append(executionText, executionToggle);

    const health = document.createElement('div'); health.innerHTML = healthMarkup(device);
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
    POWER_COMMANDS.forEach(([command, label, title]) => { const b = makeActionButton(device, command, label, command === 'power.restore' ? 'secondary' : 'ghost'); b.title = b.disabled ? b.title : title; profiles.append(b); });
    const securityTitle = document.createElement('h3'); securityTitle.textContent = '잠금 · Agent';
    const security = document.createElement('div'); security.className = 'device-command-grid security';
    security.append(makeActionButton(device, 'lock.resume_off', '복귀 잠금 해제'), makeActionButton(device, 'lock.resume_on', '복귀 잠금 사용'), makeActionButton(device, 'autologon.open', '자동로그인 관리', 'secondary'), makeActionButton(device, 'agent.self_update', 'Agent 업데이트', 'secondary'));
    const history = document.createElement('div'); history.className = 'device-history'; history.innerHTML = `<h3>최근 작업</h3>${latestCommandMarkup(device.recentCommands)}`;
    const foot = document.createElement('div'); foot.className = 'device-card-foot';
    const note = document.createElement('p');
    note.textContent = isInventory(device) ? '관찰 인벤토리입니다. 전용 어댑터가 검증되기 전에는 원격 제어나 물리 동작을 실행하지 않습니다.' : device.status === 'online' ? 'Agent가 연결되어 있습니다. 실행 결과는 검증 후 이 화면과 Activity Logs에 남습니다.' : device.status === 'revoked' ? '이 기기의 EKODI 접근 권한이 해제되었습니다.' : '오프라인이면 허용된 작업만 대기열에 보관되고 Agent가 다시 연결된 뒤 처리됩니다.';
    const revoke = document.createElement('button'); revoke.type = 'button'; revoke.className = 'ghost device-revoke'; revoke.textContent = isInventory(device) ? '인벤토리 해제' : '기기 권한 해제'; revoke.disabled = device.status === 'revoked';
    revoke.addEventListener('click', async () => { if (!confirm(`${device.label || type.label}의 EKODI ${isInventory(device) ? '인벤토리 등록' : 'Device Agent 권한'}을 해제할까요?`)) return; try { await request(`/api/control/devices/${encodeURIComponent(device.id)}/revoke`, { method:'POST' }); await loadDevices(); } catch (error) { alert(error.message); } });
    foot.append(note, revoke);

    card.append(head, meta, managementPanel(device), execution, health.firstElementChild, recommendationPanel(device), diagnosticSummary(device), mainActions, startupPanel(device), profileTitle, profiles, securityTitle, security, history, foot);
    return card;
  }

  function renderJobs(jobs = []) {
    const list = document.querySelector('#deviceJobList');
    const queued = document.querySelector('#deviceMetricQueued');
    if (queued) queued.textContent = String(jobs.filter(job => ['queued','assigned'].includes(job.status)).length);
    if (!list) return;
    list.textContent = '';
    if (!jobs.length) { list.innerHTML = '<p class="device-command-empty">아직 자동 배정 작업이 없습니다.</p>'; return; }
    jobs.slice(0, 12).forEach(job => { const row = document.createElement('div'); row.className = 'device-job-row'; row.dataset.status = job.status; row.innerHTML = `<div><strong>${escapeHtml(commandLabel(job.type))}</strong><small>${escapeHtml(job.targetGroup)} 그룹 · 우선순위 ${Number(job.priority)} · 시도 ${Number(job.attempts)}</small></div><span>${escapeHtml(commandStatus(job.status))}</span><time>${escapeHtml(timeLabel(job.completedAt || job.assignedAt || job.requestedAt))}</time>`; list.append(row); });
  }

  async function createAutoJob(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const type = form.elements.type.value, targetGroup = form.elements.targetGroup.value.trim() || 'general', priority = Number(form.elements.priority.value) || 50;
    const confirmed = Boolean(CONFIRM_MESSAGES[type]) ? confirm(CONFIRM_MESSAGES[type]) : true;
    if (!confirmed) return;
    const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
    try { await request('/api/control/devices/jobs', { method:'POST', body:JSON.stringify({ type, targetGroup, priority, confirmed }) }); await loadDevices(); }
    catch (error) { alert(error.message); } finally { submit.disabled = false; }
  }

  function renderTypeFilters(devices) {
    const host = document.querySelector('#deviceTypeFilters');
    if (!host) return;
    const counts = devices.reduce((map, device) => { const type = device.management?.type || 'pc'; map[type] = (map[type] || 0) + 1; return map; }, {});
    const buttons = [{id:'all',label:'전체',icon:'◉'}, ...deviceCatalog].map(item => {
      const count = item.id === 'all' ? devices.length : (counts[item.id] || 0);
      return `<button type="button" class="device-type-filter${activeType === item.id ? ' active' : ''}" data-type-filter="${escapeHtml(item.id)}"><span>${escapeHtml(item.icon || '○')}</span><strong>${escapeHtml(item.label)}</strong><small>${count}</small></button>`;
    }).join('');
    host.innerHTML = buttons;
    host.querySelectorAll('[data-type-filter]').forEach(button => button.addEventListener('click', () => { activeType = button.dataset.typeFilter || 'all'; renderTypeFilters(currentDevices); renderDevices(currentDevices); }));
  }

  function renderDevices(devices) {
    currentDevices = devices;
    const list = document.querySelector('#ekodiDeviceList');
    const total = document.querySelector('#deviceMetricTotal'), online = document.querySelector('#deviceMetricOnline'), issues = document.querySelector('#deviceMetricIssues'), avgHealth = document.querySelector('#deviceMetricHealth');
    if (!list) return;
    const scored = devices.filter(device => Number.isFinite(Number(device.health?.score)));
    total.textContent = String(devices.length);
    online.textContent = String(devices.filter(device => device.status === 'online').length);
    issues.textContent = String(devices.filter(device => ['stale','offline'].includes(device.status) || (Number.isFinite(Number(device.health?.score)) && Number(device.health.score) < 75)).length);
    avgHealth.textContent = scored.length ? String(Math.round(scored.reduce((sum, device) => sum + Number(device.health.score), 0) / scored.length)) : '—';
    renderTypeFilters(devices);
    const visible = activeType === 'all' ? devices : devices.filter(device => (device.management?.type || 'pc') === activeType);
    list.textContent = '';
    if (!visible.length) { list.innerHTML = `<div class="device-empty"><strong>${devices.length ? '이 유형에 등록된 기기가 없습니다.' : '아직 등록된 기기가 없습니다.'}</strong><p>Windows Agent 기기는 연결하고, 센서·로봇 등은 관찰 인벤토리로 먼저 등록할 수 있습니다.</p></div>`; return; }
    visible.forEach(device => list.append(deviceCard(device)));
  }

  function loadDevices() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
    const list = document.querySelector('#ekodiDeviceList');
    if (!list || !sessionStorage.getItem(TOKEN_KEY)) return;
    try {
      const data = await request('/api/control/devices');
      if (Array.isArray(data.catalog) && data.catalog.length) deviceCatalog = data.catalog;
      renderDevices(data.devices || []); renderJobs(data.jobs || []);
      const stamp = document.querySelector('#deviceGeneratedAt'); if (stamp) stamp.textContent = `최근 갱신 ${timeLabel(data.generatedAt)}`;
    } catch (error) { list.innerHTML = '<div class="device-empty error"><strong>Device Control API를 불러오지 못했습니다.</strong><p></p></div>'; list.querySelector('p').textContent = error.message; }
    })().finally(() => { loadPromise = null; });
    return loadPromise;
  }

  async function createEnrollment() {
    const button = document.querySelector('#createDeviceEnrollment'), result = document.querySelector('#deviceEnrollmentResult'), typeSelect = document.querySelector('#deviceEnrollmentType'), labelInput = document.querySelector('#deviceEnrollmentLabel'), locationInput = document.querySelector('#deviceEnrollmentLocation');
    if (!button || !result) return;
    const deviceType = typeSelect?.value || 'pc';
    button.disabled = true; button.textContent = '연결 준비 중…';
    try {
      const data = await request('/api/control/devices/enrollment', { method:'POST', body:JSON.stringify({ deviceType, label:labelInput?.value.trim() || typeInfo(deviceType).label, locationLabel:locationInput?.value.trim() || '' }) });
      const command = `$p="$env:TEMP\\ekodi-device-agent.ps1"; Invoke-WebRequest -UseBasicParsing "${WINDOWS_AGENT_URL}" -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p -Install -EnrollmentCode "${data.enrollmentCode}" -ApiBase "${API_BASE}"`;
      currentEnrollmentUrl = data.protocolUrl || `ekodi-device://enroll?code=${encodeURIComponent(data.enrollmentCode)}`;
      result.hidden = false;
      result.querySelector('[data-enrollment-code]').textContent = data.enrollmentCode;
      result.querySelector('[data-enrollment-expiry]').textContent = `${typeInfo(deviceType).label} · 유효시간: ${timeLabel(data.expiresAt)}까지 · 1회 사용`;
      result.querySelector('[data-install-command]').textContent = command;
      result.dataset.installCommand = command;
      launchProtocol(currentEnrollmentUrl);
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; button.textContent = 'Windows Agent 연결'; }
  }

  async function createInventory(event) {
    event.preventDefault();
    const form = event.currentTarget, submit = form.querySelector('button[type="submit"]');
    const payload = { deviceType:form.elements.deviceType.value, label:form.elements.label.value.trim(), locationLabel:form.elements.locationLabel.value.trim(), notes:form.elements.notes.value.trim() };
    submit.disabled = true;
    try { await request('/api/control/devices/inventory', { method:'POST', body:JSON.stringify(payload) }); form.reset(); await loadDevices(); }
    catch (error) { alert(error.message); } finally { submit.disabled = false; }
  }

  function installPanel() {
    const nav = document.querySelector('.sidebar nav'), content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('#deviceControlPanel')) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'nav'; button.dataset.deviceControlNav = 'true'; button.append(document.createTextNode('⌁ '));
    const label = document.createElement('span'); label.textContent = '원격 작업'; button.append(label);
    const workspace = nav.querySelector('[data-section="workspace"]'); if (workspace) workspace.insertAdjacentElement('afterend', button); else nav.append(button);

    const panel = document.createElement('section'); panel.id = 'deviceControlPanel'; panel.className = 'section ekodi-device-panel hidden-panel'; panel.dataset.panel = 'devices';
    panel.innerHTML = `
      <div class="device-panel-head">
        <div><p class="kicker">REMOTE WORK & DEVICE MANAGEMENT</p><h2>원격 작업</h2><p>원격 PC의 연결·복구·작업배정과 기기 진단을 한곳에서 관리합니다. PC는 허용된 원격 작업만 실행하며 POS·키오스크·센서·서비스로봇은 기기 유형별 안전정책을 그대로 적용합니다.</p></div>
        <div class="device-head-actions"><span id="deviceGeneratedAt">연결 상태 확인 전</span><button type="button" class="secondary" id="refreshDevices">↻ 새로고침</button></div>
      </div>
      <div class="device-type-filters" id="deviceTypeFilters" aria-label="기기 유형 필터"></div>
      <div class="device-metrics">
        <article><small>등록 기기</small><strong id="deviceMetricTotal">—</strong></article>
        <article><small>온라인</small><strong id="deviceMetricOnline">—</strong></article>
        <article><small>배정 대기</small><strong id="deviceMetricQueued">—</strong></article>
        <article><small>확인 필요</small><strong id="deviceMetricIssues">—</strong></article>
        <article><small>평균 건강점수</small><strong id="deviceMetricHealth">—</strong><span>진단 가능한 기기 기준</span></article>
      </div>
      <section class="device-job-console">
        <div><p class="kicker">HYBRID EXECUTION QUEUE</p><h3>자동 작업 배정</h3><p>검증된 비휴대형 데스크톱 PC만 후보가 됩니다. POS·키오스크·태블릿·센서·로봇은 자동 실행 대상에서 제외합니다.</p></div>
        <form id="deviceJobForm"><label>작업<select name="type"><option value="diagnostics.collect">전체 진단</option><option value="network.diagnose">네트워크 진단</option><option value="updates.scan">업데이트 확인</option><option value="maintenance.temp_cleanup">임시파일 정리</option></select></label><label>기기 그룹<input name="targetGroup" value="general" pattern="[a-z0-9][a-z0-9_-]{0,59}" required></label><label>우선순위<input name="priority" type="number" min="1" max="100" value="50"></label><button type="submit" class="primary">작업 등록</button></form>
        <div id="deviceJobList" class="device-job-list"><p class="device-command-empty">작업 큐를 불러오는 중입니다.</p></div>
      </section>
      <div class="device-onboarding-grid">
        <div class="device-enrollment-box device-enrollment-agent"><div><p class="kicker">AGENT PAIRING</p><h3>Windows Agent 기기 연결</h3><p>PC·Windows POS·Windows 키오스크·Windows 태블릿을 연결합니다. 기기유형 정책은 서버에서 강제됩니다.</p><div class="device-onboarding-fields"><label>유형<select id="deviceEnrollmentType"><option value="pc">PC</option><option value="pos">POS</option><option value="kiosk">키오스크</option><option value="tablet">태블릿</option></select></label><label>표시 이름<input id="deviceEnrollmentLabel" maxlength="80" placeholder="예: 자담 카운터 POS"></label><label>위치<input id="deviceEnrollmentLocation" maxlength="120" placeholder="예: 목포대점 카운터"></label></div></div><button type="button" class="primary" id="createDeviceEnrollment">Windows Agent 연결</button></div>
        <form class="device-enrollment-box device-inventory-box" id="deviceInventoryForm"><div><p class="kicker">OBSERVE FIRST</p><h3>관찰 인벤토리 등록</h3><p>센서·로봇 등 아직 Agent가 없는 기기도 자산과 정책부터 등록합니다. 등록만으로 원격제어 권한이 생기지 않습니다.</p><div class="device-onboarding-fields"><label>유형<select name="deviceType"><option value="sensor">센서</option><option value="robot">서비스로봇</option><option value="pos">POS</option><option value="kiosk">키오스크</option><option value="tablet">태블릿</option><option value="other">기타</option></select></label><label>표시 이름<input name="label" maxlength="80" required placeholder="예: 전력계 1번"></label><label>위치<input name="locationLabel" maxlength="120" placeholder="예: 매장 주방"></label><label>메모<input name="notes" maxlength="500" placeholder="모델/용도 등"></label></div></div><button type="submit" class="secondary">관찰 등록</button></form>
      </div>
      <div class="device-enrollment-result" id="deviceEnrollmentResult" hidden><div><small>1회용 등록 코드</small><strong data-enrollment-code></strong><span data-enrollment-expiry></span></div><p><b>연결 창이 떴다면 Windows 승인만 진행하세요.</b> 아무 반응이 없으면 연결 프로그램을 한 번 설치한 뒤 “이 PC 연결 계속”을 누르면 됩니다.</p><div class="device-pair-actions"><a class="button secondary" href="${BOOTSTRAP_URL}" download="EKODI_Device_연결프로그램.cmd">연결 프로그램 설치</a><button type="button" class="primary" id="continueDeviceEnrollment">이 PC 연결 계속</button></div><details class="device-advanced-install"><summary>고급 설치 · PowerShell 명령 보기</summary><code data-install-command></code><button type="button" class="secondary" id="copyDeviceInstallCommand">설치 명령 복사</button></details></div>
      <div class="device-security-note"><strong>권한 경계</strong><p>관찰 → 유형정책 → 진단 → 관리자 승인 → 허용 작업 실행 → 결과 검증 → 감사기록 순서로 동작합니다. 물리 동작이 가능한 기기는 전용 안전 어댑터 없이는 실행권한을 받지 않습니다.</p></div>
      <div class="ekodi-device-list" id="ekodiDeviceList"><div class="device-empty"><p>기기 목록을 불러오는 중입니다.</p></div></div>`;
    content.append(panel);

    button.addEventListener('click', showDevices);
    panel.querySelector('#refreshDevices').addEventListener('click', loadDevices);
    panel.querySelector('#deviceJobForm').addEventListener('submit', createAutoJob);
    panel.querySelector('#createDeviceEnrollment').addEventListener('click', createEnrollment);
    panel.querySelector('#deviceInventoryForm').addEventListener('submit', createInventory);
    panel.querySelector('#continueDeviceEnrollment').addEventListener('click', () => launchProtocol(currentEnrollmentUrl));
    panel.querySelector('#copyDeviceInstallCommand').addEventListener('click', async event => {
      const command = panel.querySelector('#deviceEnrollmentResult').dataset.installCommand || '';
      if (!command) return;
      try { await navigator.clipboard.writeText(command); event.currentTarget.textContent = '복사했습니다 ✓'; setTimeout(() => { event.currentTarget.textContent = '설치 명령 복사'; }, 1500); }
      catch { event.currentTarget.textContent = '코드를 직접 선택해 복사하세요'; }
    });

    if (location.hash === '#devices') showDevices();
    window.addEventListener('hashchange', () => { if (location.hash === '#devices') showDevices(); });
    timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !panel.classList.contains('hidden-panel')) loadDevices(); }, DEVICE_REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !panel.classList.contains('hidden-panel')) loadDevices(); });
  }

  installPanel();
  window.addEventListener('ekodi-admin-ready', installPanel, { once: true });
  window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer); });
})();
