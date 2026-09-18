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
    const panels = window.EKODIAdminPanels;
    if (panels?.activate) {
      panels.activate('devices');
    } else {
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('devices'));
      });
      document.querySelectorAll('.sidebar .nav').forEach(item => item.classList.remove('active'));
      document.querySelector('[data-device-control-nav]')?.classList.add('active');
      setPageTitle('로컬컴퓨터·기기');
      if (location.hash !== '#devices') history.replaceState(null, '', '#devices');
    }
    document.querySelector('.sidebar')?.classList.remove('open');
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
      panel.innerHTML = `
      <div class="device-panel-head">
        <div><p class="kicker">LOCAL COMPUTERS · DEVICES</p><h2>로컬컴퓨터·기기</h2><p>현재 연결 상태와 이용현황을 먼저 보고, 문제가 있는 기기만 빠르게 찾아 조치합니다. 연결·자동작업·고급 설정은 필요할 때 펼쳐 사용합니다.</p></div>
        <div class="device-head-actions"><span id="deviceGeneratedAt">연결 상태 확인 전</span><button type="button" class="secondary" id="refreshDevices">↻ 새로고침</button></div>
      </div>
      <div class="device-metrics" aria-label="기기 핵심 현황">
        <article><small>등록 기기</small><strong id="deviceMetricTotal">—</strong><span>전체 자산</span></article>
        <article><small>현재 온라인</small><strong id="deviceMetricOnline">—</strong><span>Agent 응답 기준</span></article>
        <article><small>확인 필요</small><strong id="deviceMetricIssues">—</strong><span>오프라인·지연·건강 저하</span></article>
        <article><small>평균 건강점수</small><strong id="deviceMetricHealth">—</strong><span>진단 가능한 기기 기준</span></article>
        <article><small>배정 대기</small><strong id="deviceMetricQueued">—</strong><span>자동 작업 큐</span></article>
      </div>
      <div class="device-attention-summary" id="deviceAttentionSummary" data-state="good"><div><strong>기기 상태를 확인하는 중입니다.</strong><span>문제가 있는 기기를 우선 표시합니다.</span></div></div>
      <div class="device-type-filters" id="deviceTypeFilters" aria-label="기기 유형 필터"></div>
      <div class="ekodi-device-list" id="ekodiDeviceList"><div class="device-empty"><p>기기 목록을 불러오는 중입니다.</p></div></div>
      <details class="device-setup-tools">
        <summary><strong>기기 연결 · 자동 작업 설정</strong><span>새 기기 등록, 자동 작업 배정, 권한 경계</span></summary>
        <div class="device-setup-tools-body">
          <section class="device-job-console">
            <div><p class="kicker">HYBRID EXECUTION QUEUE</p><h3>자동 작업 배정</h3><p>검증된 비휴대형 데스크톱 PC만 후보가 됩니다. POS·키오스크·태블릿·센서·로봇은 자동 실행 대상에서 제외합니다.</p></div>
            <form id="deviceJobForm"><label>작업<select name="type"><option value="diagnostics.collect">전체 진단</option><option value="network.diagnose">네트워크 진단</option><option value="updates.scan">업데이트 확인</option><option value="maintenance.temp_cleanup">임시파일 정리</option></select></label><label>기기 그룹<input name="targetGroup" value="general" pattern="[a-z0-9][a-z0-9_-]{0,59}" required></label><label>우선순위<input name="priority" type="number" min="1" max="100" value="50"></label><button type="submit" class="primary">작업 등록</button></form>
            <div id="deviceJobList" class="device-job-list"><p class="device-command-empty">작업 큐를 불러오는 중입니다.</p></div>
          </section>
          <div class="device-onboarding-grid">
            <div class="device-enrollment-box device-enrollment-agent"><div><p class="kicker">AGENT PAIRING</p><h3>Windows Agent 기기 연결</h3><p>PC·Windows POS·Windows 키오스크·Windows 태블릿을 연결합니다. 기기유형 정책은 서버에서 강제됩니다.</p><div class="device-onboarding-fields"><label>유형<select id="deviceEnrollmentType"><option value="pc">PC</option><option value="pos">POS</option><option value="kiosk">키오스크</option><option value="tablet">태블릿</option></select></label><label>표시 이름<input id="deviceEnrollmentLabel" maxlength="80" placeholder="예: 자담 카운터 POS"></label><label>위치<input id="deviceEnrollmentLocation" maxlength="120" placeholder="예: 목포대점 카운터"></label></div></div><button type="button" class="primary" id="createDeviceEnrollment">Windows Agent 연결</button></div>
            <form class="device-enrollment-box device-inventory-box" id="deviceInventoryForm"><div><p class="kicker">OBSERVE FIRST</p><h3>관찰 인벤토리 등록</h3><p>센서·로봇 등 아직 Agent가 없는 기기도 자산과 정책부터 등록합니다. 등록만으로 원격제어 권한이 생기지 않습니다.</p><div class="device-onboarding-fields"><label>유형<select name="deviceType"><option value="sensor">센서</option><option value="robot">서비스로봇</option><option value="pos">POS</option><option value="kiosk">키오스크</option><option value="tablet">태블릿</option><option value="other">기타</option></select></label><label>표시 이름<input name="label" maxlength="80" required placeholder="예: 전력계 1번"></label><label>위치<input name="locationLabel" maxlength="120" placeholder="예: 매장 주방"></label><label>메모<input name="notes" maxlength="500" placeholder="모델/용도 등"></label></div></div><button type="submit" class="secondary">관찰 등록</button></form>
          </div>
          <div class="device-enrollment-result" id="deviceEnrollmentResult" hidden><div><small>1회용 등록 코드</small><strong data-enrollment-code></strong><span data-enrollment-expiry></span></div><p><b>연결 창이 떴다면 Windows 승인만 진행하세요.</b> 아무 반응이 없으면 연결 프로그램을 한 번 설치한 뒤 “이 PC 연결 계속”을 누르면 됩니다. 기존 Agent 업그레이드는 검증·자동 롤백 후 heartbeat까지 확인하며, 데스크톱 Boot/WOL은 Agent 연결과 별도로 설정합니다.</p><div class="device-pair-actions"><a class="button secondary" href="${BOOTSTRAP_URL}" download="EKODI_Device_연결프로그램.cmd">연결 프로그램 설치</a><button type="button" class="primary" id="continueDeviceEnrollment">이 PC 연결 계속</button></div><details class="device-advanced-install"><summary>고급 설치 · PowerShell 명령 보기</summary><code data-install-command></code><button type="button" class="secondary" id="copyDeviceInstallCommand">설치 명령 복사</button></details></div>
          <div class="device-security-note"><strong>권한 경계</strong><p>관찰 → 유형정책 → 진단 → 관리자 승인 → 허용 작업 실행 → 결과 검증 → 감사기록 순서로 동작합니다. 물리 동작이 가능한 기기는 전용 안전 어댑터 없이는 실행권한을 받지 않습니다.</p></div>
        </div>
      </details>
      `;
    content.append(panel);
    const demandLoader=globalThis.EKODIAdminDemand;
    const loadTapoScript=demandLoader?.loadScript||demandLoader?.loadJs;
    if(typeof loadTapoScript==='function') Promise.resolve(loadTapoScript.call(demandLoader,'tapo-device-admin.js')).catch(error=>console.warn('[EKODI Tapo Admin]',error.message));

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
    timer = window.setInterval(() => { if (!panel.classList.contains('hidden-panel')) loadDevices(); }, 10000);
  }

  installPanel();
  window.addEventListener('ekodi-admin-ready', installPanel, { once: true });
  window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer); });
})();
