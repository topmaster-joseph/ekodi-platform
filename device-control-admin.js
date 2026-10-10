(() => {
  'use strict';

  const API_BASE = 'https://ekodi.kr';
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
    'printing.image_preview.repair': '이미지 우클릭 인쇄가 바로 출력되지 않고 Windows 미리보기/레이아웃을 먼저 열도록 복구하고, 이후 변경도 자동 재복구할까요?',
    'printing.image_preview.restore': 'EKODI 인쇄 미리보기 강제 규칙을 해제하고 최초 변경 전 사용자 설정으로 복원할까요?',
    'updates.install': '대기 중인 Windows 소프트웨어 업데이트를 설치합니다. EKODI는 자동 재부팅하지 않습니다. 진행할까요?',
    'profile.workstation.apply': '바탕화면과 시작 메뉴에 EKODI 업무 바로가기를 구성할까요?',
    'profile.workstation.restore': 'EKODI가 만든 업무 바로가기를 제거할까요?',
    'software.localai.install': 'Ollama와 Claude Code CLI를 이 컴퓨터에 설치하고 로컬 경량 모델을 검증할까요?',
    'agent.self_update': '공식 EKODI Agent로 업데이트하고 원클릭 연결 프로토콜을 다시 등록할까요?',
    'computer.browser.canary': '사용자 화면·입력·클립보드를 건드리지 않는 전용 headless 브라우저 canary를 실행할까요?',
    'computer.desktop.canary': 'EKODI 자체 Hyper-V에서 임시 격리 VM을 생성·부팅·폐기하는 canary를 실행할까요? 사용자 화면과 입력은 사용하지 않습니다.',
    'computer.desktop.guest.canary': '네트워크가 없는 임시 EKODI VM에서 Guest Agent가 실제 작업을 실행하고 결과 영수증을 반환하는 canary를 실행할까요? 실제 사용자 데스크톱에는 접근하지 않습니다.',
    'computer.desktop.ui.canary': '임시 EKODI VM 내부의 독립 UI를 의미 기반 UI Automation으로 제어하는 canary를 실행할까요? 실제 사용자 화면·키보드·마우스는 사용하지 않습니다.',
    'computer.desktop.session.canary': 'bounded-v1 격리 세션 executor canary를 실행할까요? 임시 VM 안의 허용된 UI 작업만 검증하며 사용자 화면은 사용하지 않습니다.',
    'computer.desktop.session.execute': 'EKODI 자체 격리 VM에서 bounded-v1 테스트 작업을 실행할까요? 원문 입력은 결과에 반환되지 않으며 사용자 화면·입력은 사용하지 않습니다.',
    'startup.disable': '이 시작 프로그램을 비활성화할까요? EKODI가 복원 정보를 로컬에 보관합니다.',
    'startup.restore': '이 시작 프로그램을 다시 활성화할까요?',
  };
  let timer = null;
  let currentEnrollmentUrl = '';
  let currentEnrollmentInstaller = '';
  let deviceCatalog = Object.values(TYPE_FALLBACK);
  let currentDevices = [];
  let activeType = 'all';
  let rosterStatus = 'all';
  let rosterSearch = '';
  let showRetiredGroups = false;
  const openRosterGroups = new Set();
  const openRosterRecords = new Set();
  const closedRosterRecords = new Set();
  const openRosterAdvanced = new Set();

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
      'diagnostics.collect': '전체 진단', 'network.diagnose': '네트워크 진단', 'printers.diagnose': '프린터 진단', 'printing.image_preview.status': '인쇄 미리보기 점검', 'printing.image_preview.repair': '인쇄 미리보기 복구', 'printing.image_preview.restore': '인쇄 미리보기 원상복구', 'startup.scan': '시작프로그램 확인',
      'startup.disable': '시작프로그램 해제', 'startup.restore': '시작프로그램 복원', 'maintenance.temp_cleanup': '임시파일 정리',
      'updates.scan': '업데이트 확인', 'updates.install': '업데이트 설치', 'profile.workstation.apply': 'EKODI 업무환경',
      'profile.workstation.restore': '업무환경 복원', 'agent.self_update': 'Agent 업데이트', 'software.localai.install': 'Ollama·Claude 설치', 'software.localai.verify': '로컬 AI 실증', 'computer.browser.canary': 'BG Browser Canary',
      'computer.agent.status': 'Agent 상태', 'computer.system.read': '시스템 상태', 'computer.process.list': '프로세스 보기', 'computer.desktop.probe': '격리 데스크톱 점검', 'computer.desktop.canary': '격리 VM Canary', 'computer.desktop.guest.canary': 'Guest 실행 Canary', 'computer.desktop.ui.canary': 'Guest UI Canary', 'computer.desktop.session.canary': 'Session Canary', 'computer.desktop.session.execute': '격리 Session 실행',
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

  function utf16leBase64(value) {
    const text = String(value || '');
    let binary = '';
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      binary += String.fromCharCode(code & 255, code >>> 8);
    }
    return btoa(binary);
  }

  function buildEnrollmentInstaller(enrollmentCode) {
    const code = String(enrollmentCode || '').trim();
    if (!/^EKD-[A-F0-9]{20}$/.test(code)) throw new Error('기기 연결 코드 형식이 올바르지 않습니다.');
    const ps = [
      "$ErrorActionPreference='Stop'",
      "$stage='download'",
      "$p=Join-Path $env:TEMP ('ekodi-device-agent-'+[guid]::NewGuid().ToString('N')+'.ps1')",
      "try {",
      "Invoke-WebRequest -UseBasicParsing '" + WINDOWS_AGENT_URL + "' -OutFile $p -ErrorAction Stop",
      "$stage='validate'",
      "$source=Get-Content -LiteralPath $p -Raw -Encoding UTF8 -ErrorAction Stop",
      "if($source -notmatch '\\$AgentVersion\\s*='){throw '[EKB-213][validate] Agent 파일 식별 검증 실패'}",
      "$tokens=$null;$errors=$null",
      "$null=[System.Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)",
      "if($errors.Count -gt 0){throw '[EKB-214][validate] Agent PowerShell 구문 검증 실패'}",
      "$stage='install'",
      "& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Install -EnrollmentCode '" + code + "' -ApiBase '" + API_BASE + "'",
      "if($LASTEXITCODE -ne 0){throw ('[EKB-215][install] 설치 프로세스 종료 코드 '+$LASTEXITCODE)}",
      "} catch { Write-Host ('[EKB-219]['+$stage+'] '+$_.Exception.Message) -ForegroundColor Red;exit 1 }",
      "finally { Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue }",
    ].join('\n'); // Preserve the try/catch/finally grammar: ';finally' executes as a command on Windows PowerShell 5.1.
    const encoded = utf16leBase64(ps);
    return [
      '@echo off',
      'setlocal',
      'chcp 65001 >nul',
      'title EKODI PC 연결',
      'echo EKODI에 이 PC를 연결합니다.',
      'echo Windows 관리자 승인창이 나타나면 [예]를 누르세요.',
      'echo.',
      'where powershell.exe >nul 2>&1',
      'if errorlevel 1 (',
      '  echo [EKB-210][powershell_missing] Windows PowerShell을 찾을 수 없습니다.',
      '  echo Windows 관리자에게 PowerShell 설치 및 실행 정책을 확인하세요.',
      '  pause',
      '  exit /b 1',
      ')',
      'powershell.exe -NoProfile -NonInteractive -Command "exit 0" >nul 2>&1',
      'if errorlevel 1 (',
      '  echo [EKB-211][powershell_blocked] Windows 보안 또는 조직 정책이 PowerShell 시작을 거부했습니다.',
      '  echo 앱 제어 및 Windows 보안 차단 기록을 확인하세요. 보안 설정을 해제하지 않습니다.',
      '  pause',
      '  exit /b 1',
      ')',
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      'if errorlevel 1 (',
      '  echo.',
      '  echo [EKB-212][enrollment] EKODI PC 연결 작업이 완료되지 않았습니다.',
      '  echo 위쪽 EKA 단계 오류를 확인하고 다른 EKODI 설치 창을 닫은 뒤 다시 시도하세요.',
      '  echo Windows 앱 제어 차단 기록을 확인하되 보안 기능을 해제하지 마세요.',
      '  pause',
      '  exit /b 1',
      ')',
      'echo.',
      'echo EKODI PC 연결이 완료되었습니다. 이 창을 닫아도 됩니다.',
      'pause',
      'endlocal',
    ].join('\r\n');
  }

  function downloadEnrollmentInstaller() {
    if (!currentEnrollmentInstaller) return;
    const blob = new Blob([currentEnrollmentInstaller], { type:'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'EKODI_PC_연결.cmd';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  function latestCommandByType(device, type) {
    const commands = device.recentCommands || [];
    return commands.find(command => command.type === type && command.status === 'succeeded')
      || commands.find(command => command.type === type)
      || null;
  }

  function remoteComputerPanel(device) {
    const box = document.createElement('details');
    box.className = 'device-details device-remote-computer';
    box.innerHTML = '<summary>원격 컴퓨터 · 상태 보기</summary>';
    if (isInventory(device) || device.management?.type !== 'pc') {
      const p = document.createElement('p');
      p.className = 'device-command-empty';
      p.textContent = 'Native Remote Computer는 현재 검증된 PC Agent에서만 상태 조회를 제공합니다.';
      box.append(p);
      return box;
    }

    const intro = document.createElement('p');
    intro.className = 'device-remote-note';
    intro.textContent = '사용자 화면 보호가 기본입니다. 웹 작업은 Background Browser, GUI 작업은 격리 Desktop을 우선하며 최소화 창은 격리로 인정하지 않습니다.';

    const actions = document.createElement('div');
    actions.className = 'device-inline-actions device-remote-actions';
    actions.append(
      makeActionButton(device, 'computer.agent.status', 'Agent 상태', 'ghost', {}, !capability(device, 'agentStatus')),
      makeActionButton(device, 'computer.desktop.probe', '격리 데스크톱 점검', 'ghost', {}, !capability(device, 'isolatedDesktopProbe')),
      makeActionButton(device, 'computer.desktop.canary', '격리 VM Canary', 'ghost', {}, !capability(device, 'isolatedDesktopProbe')),
      makeActionButton(device, 'computer.desktop.guest.canary', 'Guest 실행 Canary', 'ghost', {}, !capability(device, 'isolatedDesktopCanary')),
      makeActionButton(device, 'computer.desktop.ui.canary', 'Guest UI Canary', 'ghost', {}, !capability(device, 'isolatedDesktopGuestCanary')),
      makeActionButton(device, 'computer.desktop.session.canary', 'Session Canary', 'ghost', {}, !capability(device, 'isolatedDesktopUiCanary')),
      makeActionButton(device, 'computer.desktop.session.execute', '격리 Session 테스트', 'secondary', {operation:'ui.text.roundtrip',text:'EKODI_SESSION_ADMIN_TEST'}, !capability(device, 'isolatedDesktop')),
      makeActionButton(device, 'computer.system.read', '시스템 상태', 'ghost', {}, !capability(device, 'computerRead')),
      makeActionButton(device, 'computer.process.list', '프로세스 보기', 'secondary', {}, !capability(device, 'processRead')),
    );

    const result = document.createElement('div');
    result.className = 'device-remote-result';
    const agentCommand = latestCommandByType(device, 'computer.agent.status');
    const systemCommand = latestCommandByType(device, 'computer.system.read');
    const processCommand = latestCommandByType(device, 'computer.process.list');
    const agent = agentCommand?.result?.agent;
    const system = systemCommand?.result?.system;
    const processes = processCommand?.result?.processes;

    const agentCard = document.createElement('div');
    agentCard.className = 'device-remote-summary-card';
    agentCard.innerHTML = `<small>Agent · 사용자 화면 보호</small><strong>${escapeHtml(agent?.version || device.agentVersion || '확인 전')}</strong><span>${agent ? `작업 ${escapeHtml(agent.taskState || 'unknown')} · Shell ${agent.persistentShell ? '열림' : '차단'} · BG Canary ${device.capabilities?.backgroundBrowserCanary ? '통과' : '대기'} · Browser Worker ${agent.backgroundBrowserReady ? '준비' : '대기'} · Desktop Probe ${agent.isolatedDesktopProbeAvailable ? '가능' : '대기'} · VM Canary ${agent.isolatedDesktopCanaryVerified ? '통과' : '대기'} · Guest Canary ${agent.isolatedDesktopGuestCanaryVerified ? '통과' : '대기'} · UI Canary ${agent.isolatedDesktopUiCanaryVerified ? '통과' : '대기'} · Session Canary ${agent.isolatedDesktopSessionCanaryVerified ? '통과' : '대기'} · Isolated Desktop ${agent.isolatedDesktopReady ? '준비' : '대기'}` : '“Agent 상태”로 최신 상태를 확인하세요.'}</span>`;

    const systemCard = document.createElement('div');
    systemCard.className = 'device-remote-summary-card';
    systemCard.innerHTML = `<small>시스템</small><strong>${system?.cpuLoadPct != null ? `CPU ${Number(system.cpuLoadPct)}%` : '확인 전'}</strong><span>${system ? `메모리 ${system.memoryUsedPct ?? '—'}% · 업타임 ${system.uptimeHours ?? '—'}h · ${escapeHtml(system.deviceClass || 'unknown')}` : '“시스템 상태”로 현재 부하를 확인하세요.'}</span>`;

    result.append(agentCard, systemCard);

    if (processes) {
      const processWrap = document.createElement('div');
      processWrap.className = 'device-remote-processes';
      const heading = document.createElement('div');
      heading.className = 'device-subhead';
      heading.innerHTML = `<h3>프로세스</h3><span>총 ${Math.max(0, Number(processes.count) || 0)}개 · 상위 ${Array.isArray(processes.items) ? processes.items.length : 0}개 표시</span>`;
      processWrap.append(heading);
      const items = Array.isArray(processes.items) ? processes.items : [];
      if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'device-command-empty';
        empty.textContent = processes.error ? '프로세스 목록을 가져오지 못했습니다.' : '표시할 프로세스가 없습니다.';
        processWrap.append(empty);
      } else {
        const list = document.createElement('div');
        list.className = 'device-remote-process-list';
        items.forEach(item => {
          const row = document.createElement('div');
          row.innerHTML = `<strong>${escapeHtml(item.name || 'unknown')}</strong><span>PID ${Math.max(0, Number(item.id) || 0)}</span><span>CPU ${item.cpuSeconds ?? '—'}s</span><span>메모리 ${item.memoryMB ?? '—'} MB</span>`;
          list.append(row);
        });
        processWrap.append(list);
      }
      result.append(processWrap);
    }

    box.append(intro, actions, result);
    return box;
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
    const card = document.createElement('article'); card.className = 'ekodi-device-card'; card.dataset.status = device.status; card.dataset.deviceType = device.management?.type || 'pc'; card.dataset.deviceId = device.id;
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

    const health = document.createElement('div'); health.innerHTML = healthMarkup(device);
    const mainActions = document.createElement('div'); mainActions.className = 'device-ops-grid device-primary-actions';
    mainActions.append(
      makeActionButton(device, 'diagnostics.collect', '전체 진단', 'primary', {}, !capability(device, 'diagnostics')),
      makeActionButton(device, 'network.diagnose', '네트워크 진단', 'ghost', {}, !capability(device, 'networkDiagnostics')),
      makeActionButton(device, 'updates.scan', '업데이트 확인', 'ghost', {}, !capability(device, 'windowsUpdate')),
      makeActionButton(device, 'agent.self_update', 'Agent 업데이트', 'secondary'),
      makeActionButton(device, 'software.localai.install', 'Ollama·Claude 설치', 'secondary', {}, !capability(device, 'localAiInstall')),
      makeActionButton(device, 'software.localai.verify', '로컬 AI 실증', 'primary', {}, !capability(device, 'localAiVerify')),
    );

    const advanced = document.createElement('details'); advanced.className = 'device-details device-advanced-control';
    advanced.open = openRosterAdvanced.has(device.id);
    advanced.addEventListener('toggle', () => {
      if (!advanced.isConnected) return;
      if (advanced.open) openRosterAdvanced.add(device.id); else openRosterAdvanced.delete(device.id);
    });
    advanced.innerHTML = '<summary>세부 관리 · 고급 작업</summary>';
    const advancedBody = document.createElement('div'); advancedBody.className = 'device-advanced-control-body';

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

    const advancedActions = document.createElement('div'); advancedActions.className = 'device-ops-grid';
    advancedActions.append(
      makeActionButton(device, 'maintenance.temp_cleanup', '임시파일 정리', 'ghost', {}, !capability(device, 'storageMaintenance')),
      makeActionButton(device, 'updates.install', '업데이트 설치', 'ghost', {}, !capability(device, 'windowsUpdate')),
      makeActionButton(device, 'printers.diagnose', '프린터 진단', 'ghost', {}, !capability(device, 'printerDiagnostics')),
      makeActionButton(device, 'printing.image_preview.status', '인쇄 미리보기 점검', 'ghost', {}, !capability(device, 'imagePrintPreview')),
      makeActionButton(device, 'printing.image_preview.repair', '인쇄 미리보기 복구', 'primary', {}, !capability(device, 'imagePrintPreview')),
      makeActionButton(device, 'printing.image_preview.restore', '인쇄 설정 원상복구', 'secondary', {}, !capability(device, 'imagePrintPreview')),
      makeActionButton(device, 'profile.workstation.apply', 'EKODI 업무환경', 'ghost', {}, !capability(device, 'workstationProfile')),
      makeActionButton(device, 'profile.workstation.restore', '업무환경 복원', 'ghost', {}, !capability(device, 'workstationProfile')),
    );
    const profileTitle = document.createElement('h3'); profileTitle.textContent = '전원 프로필';
    const profiles = document.createElement('div'); profiles.className = 'device-command-grid';
    POWER_COMMANDS.forEach(([command, label, title]) => { const b = makeActionButton(device, command, label, command === 'power.restore' ? 'secondary' : 'ghost'); b.title = b.disabled ? b.title : title; profiles.append(b); });
    const securityTitle = document.createElement('h3'); securityTitle.textContent = '잠금 · Agent';
    const security = document.createElement('div'); security.className = 'device-command-grid security';
    security.append(makeActionButton(device, 'lock.resume_off', '복귀 잠금 해제'), makeActionButton(device, 'lock.resume_on', '복귀 잠금 사용'), makeActionButton(device, 'autologon.open', '자동로그인 관리', 'secondary'), makeActionButton(device, 'agent.self_update', 'Agent 업데이트', 'secondary'), makeActionButton(device, 'computer.browser.canary', 'BG Browser Canary', 'secondary'));
    const history = document.createElement('div'); history.className = 'device-history'; history.innerHTML = `<h3>최근 작업</h3>${latestCommandMarkup(device.recentCommands)}`;
    advancedBody.append(managementPanel(device), execution, remoteComputerPanel(device), diagnosticSummary(device), advancedActions, startupPanel(device), profileTitle, profiles, securityTitle, security, history);
    advanced.append(advancedBody);

    const foot = document.createElement('div'); foot.className = 'device-card-foot';
    const note = document.createElement('p');
    note.textContent = isInventory(device) ? '관찰 인벤토리입니다. 전용 어댑터가 검증되기 전에는 원격 제어나 물리 동작을 실행하지 않습니다.' : device.status === 'online' ? 'Agent가 연결되어 있습니다. 실행 결과는 검증 후 이 화면과 Activity Logs에 남습니다.' : device.status === 'revoked' ? '이 기기의 EKODI 접근 권한이 해제되었습니다.' : '오프라인이면 허용된 작업만 대기열에 보관되고 Agent가 다시 연결된 뒤 처리됩니다.';
    const revoke = document.createElement('button'); revoke.type = 'button'; revoke.className = 'ghost device-revoke'; revoke.textContent = isInventory(device) ? '인벤토리 해제' : '기기 권한 해제'; revoke.disabled = device.status === 'revoked';
    revoke.addEventListener('click', async () => { if (!confirm(`${device.label || type.label}의 EKODI ${isInventory(device) ? '인벤토리 등록' : 'Device Agent 권한'}을 해제할까요?`)) return; try { await request(`/api/control/devices/${encodeURIComponent(device.id)}/revoke`, { method:'POST' }); await loadDevices(); } catch (error) { alert(error.message); } });
    foot.append(note, revoke);

    card.append(head, meta, health.firstElementChild, recommendationPanel(device), mainActions, advanced, foot);
    const proofCommand = latestCommandByType(device, 'software.localai.verify');
    const proof = proofCommand?.result?.localAiProof;
    if (proof) {
      const summary = document.createElement('div');
      summary.className = 'device-remote-summary-card';
      summary.innerHTML = `<small>로컬 AI 실증 · ${timeLabel(proofCommand.completedAt || proofCommand.issuedAt)}</small><strong>Ollama ${escapeHtml(proof.ollamaApi || '미확인')} · 추론 ${escapeHtml(proof.inference || '미확인')}</strong><span>모델 ${escapeHtml(proof.selectedModel || '없음')} · Claude CLI ${escapeHtml(proof.claudeCli || '미확인')} · Claude 계정 인증은 사용자 세션에서 별도 확인</span>`;
      mainActions.after(summary);
    }
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

  // Presentation-only grouping: identical hostnames are NOT proof of shared hardware identity.
  // Every original record and its deviceId remain reachable; no server mutation or token merger.
  function rosterGroupKey(device) {
    const id = String(device?.id || '').trim();
    const type = String(device?.management?.type || 'pc').trim().toLowerCase();
    const host = String(device?.hostname || '').trim().toLowerCase();
    const platform = String(device?.platform || '').trim().toLowerCase();
    if (platform !== 'windows' || !host || ['unknown', 'localhost', 'windows', 'pc', 'n/a', '-'].includes(host)) {
      return 'id:' + id;
    }
    return 'host:windows:' + type + ':' + host;
  }

  function rosterRecordRank(device) {
    return ({ online:0, stale:1, enrolled:2, offline:3, inventory:4, revoked:5 })[device.status] ?? 4;
  }

  function compareRosterRecords(a, b) {
    const rank = rosterRecordRank(a) - rosterRecordRank(b);
    if (rank) return rank;
    const seen = (Date.parse(b.lastSeenAt || b.enrolledAt || '') || 0) - (Date.parse(a.lastSeenAt || a.enrolledAt || '') || 0);
    if (seen) return seen;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  function groupRosterDevices(devices) {
    const groups = new Map();
    const seenIds = new Set();
    for (const device of (Array.isArray(devices) ? devices : [])) {
      const id = String(device?.id || '').trim();
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      const key = rosterGroupKey(device);
      if (!groups.has(key)) groups.set(key, { key, records:[] });
      groups.get(key).records.push(device);
    }
    return Array.from(groups.values()).map(group => {
      group.records.sort(compareRosterRecords);
      const active = group.records.filter(device => device.status !== 'revoked');
      group.retired = active.length === 0;
      group.primary = active[0] || group.records[0];
      group.activeCount = active.length;
      return group;
    }).sort((a, b) => compareRosterRecords(a.primary, b.primary) || a.key.localeCompare(b.key, 'ko'));
  }

  function hasRosterHealthScore(device) {
    const score = device.health?.score;
    return score !== null && score !== undefined && score !== '' && Number.isFinite(Number(score));
  }

  function rosterNeedsAttention(device) {
    return ['stale', 'offline'].includes(device.status)
      || (device.status === 'online' && hasRosterHealthScore(device) && Number(device.health.score) < 75);
  }

  function createRosterGroup(group) {
    const primary = group.primary;
    const type = typeInfo(primary);
    const wrapper = document.createElement('details');
    wrapper.className = 'device-roster-group';
    wrapper.dataset.rosterKey = group.key;
    wrapper.dataset.status = primary.status;
    wrapper.open = openRosterGroups.has(group.key);
    const heading = document.createElement('summary');
    heading.className = 'device-roster-summary';
    const name = document.createElement('span'); name.className = 'device-roster-name';
    const title = document.createElement('strong'); title.textContent = primary.label || primary.hostname || type.label;
    const host = document.createElement('small');
    host.textContent = [type.label, primary.hostname && primary.hostname !== primary.label ? primary.hostname : '', primary.management?.locationLabel || ''].filter(Boolean).join(' · ');
    name.append(title, host);
    const status = document.createElement('span'); status.className = 'device-roster-state'; status.textContent = statusLabel(primary.status);
    const seen = document.createElement('time'); seen.className = 'device-roster-seen';
    seen.textContent = primary.status === 'inventory' ? '관찰 등록' : '최근 연결 ' + timeLabel(primary.lastSeenAt);
    if (primary.lastSeenAt) seen.dateTime = primary.lastSeenAt;
    const registrations = document.createElement('span'); registrations.className = 'device-roster-count';
    registrations.textContent = group.records.length > 1 ? '동일 이름 기록 ' + group.records.length + '건' : '등록 1건';
    heading.append(name, status, seen, registrations);
    const body = document.createElement('div'); body.className = 'device-roster-body';

    function populateBody() {
      if (body.childNodes.length) return;
      if (group.records.length > 1) {
        const hint = document.createElement('p'); hint.className = 'device-roster-hint';
        hint.textContent = '컴퓨터명이 같은 등록 기록을 한곳에 모았습니다. 실제 같은 PC인지 확인 전까지 기기 ID·권한은 각각 유지하며 자동 삭제하지 않습니다.';
        body.append(hint);
      }
      for (const [index, device] of group.records.entries()) {
        const row = document.createElement('details'); row.className = 'device-roster-record';
        row.dataset.deviceId = device.id;
        row.open = openRosterRecords.has(device.id) || (index === 0 && !closedRosterRecords.has(device.id));
        const recordSummary = document.createElement('summary');
        const date = device.lastSeenAt || device.enrolledAt;
        const statusText = statusLabel(device.status);
        recordSummary.textContent = [device.label || device.hostname || typeInfo(device).label, statusText, 'ID …' + String(device.id).slice(-8), date ? timeLabel(date) : '연결 정보 없음'].join(' · ');
        const recordBody = document.createElement('div'); recordBody.className = 'device-roster-record-body';
        function populateRecord() { if (!recordBody.childNodes.length) recordBody.append(deviceCard(device)); }
        if (row.open) populateRecord();
        row.addEventListener('toggle', () => {
          if (!row.isConnected) return;
          if (row.open) {
            openRosterRecords.add(device.id); closedRosterRecords.delete(device.id);
            populateRecord();
          } else {
            openRosterRecords.delete(device.id); closedRosterRecords.add(device.id);
            recordBody.replaceChildren();
          }
        });
        row.append(recordSummary, recordBody);
        body.append(row);
      }
    }
    if (wrapper.open) populateBody();
    wrapper.addEventListener('toggle', () => {
      if (!wrapper.isConnected) return;
      if (wrapper.open) { openRosterGroups.add(group.key); populateBody(); }
      else { openRosterGroups.delete(group.key); body.replaceChildren(); }
    });
    wrapper.append(heading, body);
    return wrapper;
  }

  function renderTypeFilters(devices) {
    const host = document.querySelector('#deviceTypeFilters');
    if (!host) return;
    const groups = groupRosterDevices(devices).filter(group => showRetiredGroups || !group.retired);
    const counts = groups.reduce((map, group) => {
      const type = group.primary.management?.type || 'pc';
      map[type] = (map[type] || 0) + 1;
      return map;
    }, {});
    host.innerHTML = [{id:'all',label:'전체',icon:'◉'}, ...deviceCatalog].map(item => {
      const count = item.id === 'all' ? groups.length : (counts[item.id] || 0);
      return `<button type="button" class="device-type-filter${activeType === item.id ? ' active' : ''}" data-type-filter="${escapeHtml(item.id)}" aria-pressed="${activeType === item.id}"><span>${escapeHtml(item.icon || '○')}</span><strong>${escapeHtml(item.label)}</strong><small>${count}</small></button>`;
    }).join('');
    host.querySelectorAll('[data-type-filter]').forEach(button => button.addEventListener('click', () => {
      activeType = button.dataset.typeFilter || 'all';
      renderDevices(currentDevices);
    }));
  }

  function renderAttentionSummary(groups) {
    const host = document.querySelector('#deviceAttentionSummary');
    if (!host) return;
    const issues = groups.filter(group => rosterNeedsAttention(group.primary));
    host.dataset.state = issues.length ? 'attention' : 'good';
    if (!groups.length) {
      host.innerHTML = '<div><strong>관리 중인 기기가 없습니다.</strong><span>“이 PC 연결”로 기기를 등록하세요. 해제된 기록은 별도로 확인할 수 있습니다.</span></div>';
      return;
    }
    if (!issues.length) {
      host.innerHTML = '<div><strong>현재 확인이 필요한 기기가 없습니다.</strong><span>기기별 최근 연결과 상태는 아래 목록에서 확인하세요.</span></div>';
      return;
    }
    const visible = issues.slice(0, 4).map(group => {
      const device = group.primary;
      const score = device.status === 'online' && hasRosterHealthScore(device) ? ' · 건강 ' + Math.round(Number(device.health.score)) + '점' : '';
      return `<button type="button" data-roster-focus="${escapeHtml(group.key)}"><strong>${escapeHtml(device.label || device.hostname || typeInfo(device).label)}</strong><span>${escapeHtml(statusLabel(device.status))}${escapeHtml(score)}</span></button>`;
    }).join('');
    host.innerHTML = `<div><strong>확인 필요 ${issues.length}개 그룹</strong><span>응답 지연·오프라인·건강점수 75점 미만 기기를 우선 표시합니다.</span></div><div class="device-attention-items">${visible}</div>`;
    host.querySelectorAll('[data-roster-focus]').forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.rosterFocus || '';
      activeType = 'all'; rosterStatus = 'all'; rosterSearch = '';
      const search = document.querySelector('#deviceRosterSearch'); if (search) search.value = '';
      const select = document.querySelector('#deviceRosterStatus'); if (select) select.value = 'all';
      openRosterGroups.add(key);
      renderDevices(currentDevices);
      const target = Array.from(document.querySelectorAll('[data-roster-key]')).find(element => element.dataset.rosterKey === key);
      target?.scrollIntoView({ behavior:'smooth', block:'center' });
      target?.classList.add('is-focused');
      window.setTimeout(() => target?.classList.remove('is-focused'), 1600);
    }));
  }

  function renderDevices(devices) {
    currentDevices = Array.isArray(devices) ? devices : [];
    const list = document.querySelector('#ekodiDeviceList');
    if (!list) return;
    const grouped = groupRosterDevices(currentDevices);
    const current = grouped.filter(group => !group.retired);
    const counted = showRetiredGroups ? grouped : current;
    const onlineGroups = current.filter(group => group.primary.status === 'online');
    const attentionGroups = current.filter(group => rosterNeedsAttention(group.primary));
    const scored = onlineGroups.filter(group => hasRosterHealthScore(group.primary));
    const total = document.querySelector('#deviceMetricTotal');
    const online = document.querySelector('#deviceMetricOnline');
    const issues = document.querySelector('#deviceMetricIssues');
    const avgHealth = document.querySelector('#deviceMetricHealth');
    if (total) total.textContent = String(current.length);
    if (online) online.textContent = String(onlineGroups.length);
    if (issues) issues.textContent = String(attentionGroups.length);
    if (avgHealth) avgHealth.textContent = scored.length
      ? String(Math.round(scored.reduce((sum, group) => sum + Number(group.primary.health.score), 0) / scored.length)) : '—';
    const duplicates = grouped.filter(group => group.records.length > 1).length;
    const registrations = grouped.reduce((sum, group) => sum + group.records.length, 0);
    const statusSummary = document.querySelector('#deviceStatusSummary');
    if (statusSummary) statusSummary.textContent = `관리 목록 ${current.length}개 · 등록기록 ${registrations}건${duplicates ? ' · 같은 이름 그룹 ' + duplicates : ''}`;
    renderAttentionSummary(current);
    renderTypeFilters(currentDevices);
    const query = rosterSearch.trim().toLocaleLowerCase();
    const visible = counted.filter(group => {
      const device = group.primary;
      if (activeType !== 'all' && (device.management?.type || 'pc') !== activeType) return false;
      if (rosterStatus === 'online' && device.status !== 'online') return false;
      if (rosterStatus === 'attention' && !rosterNeedsAttention(device)) return false;
      if (rosterStatus === 'offline' && !['stale', 'offline', 'enrolled'].includes(device.status)) return false;
      if (!query) return true;
      return group.records.some(item => [item.label, item.hostname, item.management?.locationLabel, item.osVersion, item.id]
        .some(value => String(value || '').toLocaleLowerCase().includes(query)));
    });
    const overview = document.querySelector('#deviceRosterOverview');
    if (overview) overview.textContent = `표시 ${visible.length}개 / ${counted.length}개 · 원본 등록기록 ${registrations}건${duplicates ? ' · 같은 이름 ' + duplicates + '개 그룹' : ''}`;
    // Avoid discarding inputs while an operator is changing a per-device management field.
    if (list.contains(document.activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    list.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement('div'); empty.className = 'device-empty';
      empty.innerHTML = '<strong>조건에 맞는 등록 기기가 없습니다.</strong><p>검색·상태·유형 필터를 바꾸거나 해제된 기록 표시를 확인하세요.</p>';
      list.append(empty); return;
    }
    visible.forEach(group => list.append(createRosterGroup(group)));
  }

  async function loadDevices() {
    const list = document.querySelector('#ekodiDeviceList');
    if (!list || !sessionStorage.getItem(TOKEN_KEY)) return;
    try {
      const data = await request('/api/control/devices');
      if (Array.isArray(data.catalog) && data.catalog.length) deviceCatalog = data.catalog;
      renderDevices(data.devices || []); renderJobs(data.jobs || []);
      window.dispatchEvent(new CustomEvent('ekodi-device-control-data', { detail:{ devices:data.devices || [], jobs:data.jobs || [], generatedAt:data.generatedAt } }));
      const stamp = document.querySelector('#deviceGeneratedAt'); if (stamp) stamp.textContent = `최근 갱신 ${timeLabel(data.generatedAt)}`;
    } catch (error) { list.innerHTML = '<div class="device-empty error"><strong>Device Control API를 불러오지 못했습니다.</strong><p></p></div>'; list.querySelector('p').textContent = error.message; }
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
      currentEnrollmentInstaller = buildEnrollmentInstaller(data.enrollmentCode);
      result.hidden = false;
      result.querySelector('[data-enrollment-code]').textContent = data.enrollmentCode;
      result.querySelector('[data-enrollment-expiry]').textContent = `${typeInfo(deviceType).label} · ${timeLabel(data.expiresAt)}까지 사용할 수 있습니다.`;
      result.querySelector('[data-install-command]').textContent = command;
      result.dataset.installCommand = command;
      downloadEnrollmentInstaller();
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; button.textContent = '이 PC 연결'; }
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
    const label = document.createElement('span'); label.textContent = '로컬컴퓨터·기기'; button.append(label);
    const workspace = nav.querySelector('[data-section="workspace"]'); if (workspace) workspace.insertAdjacentElement('afterend', button); else nav.append(button);

    const panel = document.createElement('section'); panel.id = 'deviceControlPanel'; panel.className = 'section ekodi-device-panel hidden-panel'; panel.dataset.panel = 'devices';
    panel.innerHTML = `
      <div class="device-panel-head">
        <div><p class="kicker">REMOTE WORK & DEVICE MANAGEMENT · LOCAL COMPUTERS · DEVICES</p><h2>로컬컴퓨터·기기</h2><p>현재 연결 상태와 이용현황을 먼저 보고, 문제가 있는 기기만 빠르게 찾아 조치합니다. 원격 작업·연결·자동작업·고급 설정은 필요할 때 펼쳐 사용합니다.</p></div>
        <div class="device-head-actions"><span id="deviceGeneratedAt">연결 상태 확인 전</span><button type="button" class="secondary" id="refreshDevices">↻ 새로고침</button></div>
      </div>
      <details class="device-status-tools" open>
        <summary><strong>연결된 기기 · 상태 보기</strong><span id="deviceStatusSummary">상태 확인 중</span></summary>
        <div class="device-metrics" aria-label="기기 핵심 현황">
          <article><small>관리 목록</small><strong id="deviceMetricTotal">—</strong><span>같은 컴퓨터명 묶음</span></article>
          <article><small>현재 온라인</small><strong id="deviceMetricOnline">—</strong><span>목록별 최신 Agent</span></article>
          <article><small>확인 필요</small><strong id="deviceMetricIssues">—</strong><span>응답 지연·건강 저하</span></article>
          <article><small>평균 건강점수</small><strong id="deviceMetricHealth">—</strong><span>현재 온라인·진단 가능 기기 기준</span></article>
          <article><small>배정 대기</small><strong id="deviceMetricQueued">—</strong><span>자동 작업 큐</span></article>
        </div>
        <div class="device-attention-summary" id="deviceAttentionSummary" data-state="good"><div><strong>기기 상태를 확인하는 중입니다.</strong><span>문제가 있는 기기를 우선 표시합니다.</span></div></div>
        <div class="device-roster-toolbar" role="group" aria-label="등록 기기 목록 검색 및 필터">
          <label class="device-roster-search-label"><span>기기 검색</span><input id="deviceRosterSearch" type="search" placeholder="컴퓨터명 · 위치 · 기기 ID" autocomplete="off"></label>
          <label class="device-roster-status-label"><span>연결 상태</span><select id="deviceRosterStatus"><option value="all">전체 상태</option><option value="online">온라인</option><option value="attention">확인 필요</option><option value="offline">오프라인·지연</option></select></label>
          <label class="device-roster-retired-label"><input id="deviceRosterShowRetired" type="checkbox"><span>해제된 기기 기록 포함</span></label>
        </div>
        <p class="device-roster-overview" id="deviceRosterOverview" aria-live="polite">등록 기록을 불러오는 중입니다.</p>
        <div class="device-type-filters" id="deviceTypeFilters" aria-label="기기 유형 필터"></div>
        <div class="ekodi-device-list" id="ekodiDeviceList"><div class="device-empty"><p>기기 목록을 불러오는 중입니다.</p></div></div>
      </details>
      <details class="device-setup-tools" open>
        <summary><strong>PC 연결 · 설정</strong><span>처음에는 “이 PC 연결”만 누르면 됩니다.</span></summary>
        <div class="device-setup-tools-body">
          <section class="device-enrollment-box device-enrollment-agent device-quick-connect">
            <div>
              <p class="kicker">ONE CLICK CONNECT</p>
              <h3>이 PC를 EKODI에 연결</h3>
              <p>처음 연결은 이 버튼만 사용합니다. 다운로드한 연결파일 하나만 실행하고, Windows 관리자 승인창이 뜨면 허용하세요.</p>
              <details class="device-advanced-install">
                <summary>다른 기기 유형 · 이름 · 위치 지정</summary>
                <div class="device-onboarding-fields">
                  <label>유형<select id="deviceEnrollmentType"><option value="pc">PC</option><option value="pos">POS</option><option value="kiosk">키오스크</option><option value="tablet">태블릿</option></select></label>
                  <label>표시 이름<input id="deviceEnrollmentLabel" maxlength="80" placeholder="비우면 PC로 자동 등록"></label>
                  <label>위치<input id="deviceEnrollmentLocation" maxlength="120" placeholder="선택사항"></label>
                </div>
              </details>
            </div>
            <button type="button" class="primary" id="createDeviceEnrollment">이 PC 연결</button>
          </section>
          <div class="device-enrollment-result" id="deviceEnrollmentResult" hidden>
            <div><strong>연결 준비가 됐습니다.</strong><span data-enrollment-expiry></span></div>
            <p><b>다운로드된 “EKODI_PC_연결.cmd” 파일 하나만 실행하세요. 다른 EKODI 설치 창이 열려 있으면 먼저 완료하거나 닫고 Windows 승인창에서 “예”를 누르세요.</b> 등록·Agent 실행·heartbeat 확인까지 자동으로 진행됩니다.</p>
            <div class="device-pair-actions"><button type="button" class="primary" id="downloadDeviceEnrollment">연결파일 다시 받기</button></div>
            <details class="device-advanced-install">
              <summary>연결 문제 해결</summary>
              <p>연결 프로그램을 동시에 여러 개 실행하지 마세요. 기존 설치를 모두 종료한 후, 원클릭 프로토콜이 필요한 경우에만 아래 보조 설치를 별도로 수행합니다. 접근 거부가 나타나면 Windows 보안/앱 제어 차단 기록과 EKB/EKA 단계를 확인하세요.</p>
              <div class="device-pair-actions"><a class="button secondary" href="${BOOTSTRAP_URL}" download="EKODI_Device_연결프로그램.cmd">연결 프로그램 설치</a></div>
              <small>1회용 등록 코드</small><strong data-enrollment-code></strong>
              <code data-install-command></code><button type="button" class="secondary" id="copyDeviceInstallCommand">설치 명령 복사</button>
            </details>
          </div>
          <details class="device-advanced-install">
            <summary>고급 운영 설정</summary>
            <section class="device-job-console">
              <div><p class="kicker">HYBRID EXECUTION QUEUE</p><h3>자동 작업 배정</h3><p>검증된 비휴대형 데스크톱 PC만 자동 작업 후보가 됩니다.</p></div>
              <form id="deviceJobForm"><label>작업<select name="type"><option value="diagnostics.collect">전체 진단</option><option value="network.diagnose">네트워크 진단</option><option value="updates.scan">업데이트 확인</option><option value="maintenance.temp_cleanup">임시파일 정리</option></select></label><label>기기 그룹<input name="targetGroup" value="general" pattern="[a-z0-9][a-z0-9_-]{0,59}" required></label><label>우선순위<input name="priority" type="number" min="1" max="100" value="50"></label><button type="submit" class="primary">작업 등록</button></form>
              <div id="deviceJobList" class="device-job-list"><p class="device-command-empty">작업 큐를 불러오는 중입니다.</p></div>
            </section>
            <form class="device-enrollment-box device-inventory-box" id="deviceInventoryForm"><div><p class="kicker">OBSERVE FIRST</p><h3>관찰 인벤토리 등록</h3><p>Agent가 없는 센서·로봇 등을 관찰 자산으로만 등록합니다. 등록만으로 원격제어 권한이 생기지 않습니다.</p><div class="device-onboarding-fields"><label>유형<select name="deviceType"><option value="sensor">센서</option><option value="robot">서비스로봇</option><option value="pos">POS</option><option value="kiosk">키오스크</option><option value="tablet">태블릿</option><option value="other">기타</option></select></label><label>표시 이름<input name="label" maxlength="80" required placeholder="예: 전력계 1번"></label><label>위치<input name="locationLabel" maxlength="120" placeholder="선택사항"></label><label>메모<input name="notes" maxlength="500" placeholder="모델/용도 등"></label></div></div><button type="submit" class="secondary">관찰 등록</button></form>
          </details></div>
          <div class="device-security-note"><strong>권한 경계</strong><p>관찰 → 유형정책 → 진단 → 관리자 승인 → 허용 작업 실행 → 결과 검증 → 감사기록 순서로 동작합니다. 물리 동작이 가능한 기기는 전용 안전 어댑터 없이는 실행권한을 받지 않습니다.</p></div>
        </div>
      </details>
      `;
    const quickSetup = panel.querySelector('.device-setup-tools');
    const statusTools = panel.querySelector('.device-status-tools');
    if (quickSetup && statusTools) statusTools.before(quickSetup);
        content.append(panel);
    const demandLoader=globalThis.EKODIAdminDemand;
    const loadTapoScript=demandLoader?.loadScript||demandLoader?.loadJs;
    if(typeof loadTapoScript==='function') Promise.resolve(loadTapoScript.call(demandLoader,'tapo-device-admin.js')).catch(error=>console.warn('[EKODI Tapo Admin]',error.message));

    button.addEventListener('click', showDevices);
    panel.querySelector('#refreshDevices').addEventListener('click', loadDevices);
    panel.querySelector('#deviceRosterSearch').addEventListener('input', event => { rosterSearch = event.currentTarget.value; renderDevices(currentDevices); });
    panel.querySelector('#deviceRosterStatus').addEventListener('change', event => { rosterStatus = event.currentTarget.value; renderDevices(currentDevices); });
    panel.querySelector('#deviceRosterShowRetired').addEventListener('change', event => { showRetiredGroups = event.currentTarget.checked; renderDevices(currentDevices); });
    panel.querySelector('#deviceJobForm').addEventListener('submit', createAutoJob);
    panel.querySelector('#createDeviceEnrollment').addEventListener('click', createEnrollment);
    panel.querySelector('#deviceInventoryForm').addEventListener('submit', createInventory);
    panel.querySelector('#downloadDeviceEnrollment').addEventListener('click', downloadEnrollmentInstaller);
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
