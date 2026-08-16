(() => {
  'use strict';

  const API_BASE = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const WINDOWS_AGENT_URL = 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/tools/ekodi-device-agent/windows/ekodi-device-agent.ps1';
  const COMMANDS = [
    ['power.always_on', '항상 켜짐', '절전 없음 · 화면 AC 30분 / 배터리 15분'],
    ['power.presentation', '프레젠테이션', '화면과 절전을 모두 끄지 않음'],
    ['power.normal', '일반 모드', '일반적인 화면·절전 시간 적용'],
    ['power.restore', '원상복구', 'EKODI 적용 전 전원 계획으로 복원'],
  ];
  let timer = null;

  function authHeaders(json = false) {
    const token = sessionStorage.getItem(TOKEN_KEY) || '';
    return {
      authorization: `Bearer ${token}`,
      ...(json ? { 'content-type': 'application/json' } : {}),
    };
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
    if (!value) return '아직 연결 없음';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('ko-KR');
  }

  function commandLabel(type) {
    const labels = {
      'power.always_on': '항상 켜짐',
      'power.presentation': '프레젠테이션',
      'power.normal': '일반 모드',
      'power.restore': '원상복구',
      'lock.resume_off': '복귀 잠금 해제',
      'lock.resume_on': '복귀 잠금 사용',
      'autologon.open': '자동로그인 관리',
    };
    return labels[type] || type;
  }

  function commandStatus(status) {
    return ({ queued: '대기', claimed: '처리 중', succeeded: '완료', failed: '실패', cancelled: '취소' })[status] || status;
  }

  function latestCommandMarkup(commands = []) {
    if (!commands.length) return '<p class="device-command-empty">아직 실행한 명령이 없습니다.</p>';
    return `<div class="device-command-history">${commands.slice(0, 3).map(command => `
      <div class="device-command-row" data-status="${command.status}">
        <span>${commandLabel(command.type)}</span>
        <strong>${commandStatus(command.status)}</strong>
        <small>${timeLabel(command.completedAt || command.claimedAt || command.issuedAt)}</small>
      </div>`).join('')}</div>`;
  }

  async function issueCommand(device, type, button) {
    if (type === 'autologon.open' && !confirm('자동로그인 암호는 클라우드에서 받지 않습니다. 이 PC에서 Microsoft Autologon 창을 열까요?')) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = '전송 중…';
    try {
      await request(`/api/control/devices/${encodeURIComponent(device.id)}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type }),
      });
      button.textContent = '대기열 등록 ✓';
      window.setTimeout(loadDevices, 700);
    } catch (error) {
      button.textContent = '실패';
      alert(error.message);
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = original;
      }, 1200);
    }
  }

  function deviceCard(device) {
    const card = document.createElement('article');
    card.className = 'ekodi-device-card';
    card.dataset.status = device.status;

    const head = document.createElement('div');
    head.className = 'ekodi-device-head';
    const identity = document.createElement('div');
    identity.innerHTML = `<span class="device-platform-mark">${device.platform === 'windows' ? '⊞' : '◇'}</span><div><strong></strong><small></small></div>`;
    identity.querySelector('strong').textContent = device.label || device.hostname || 'Windows PC';
    identity.querySelector('small').textContent = `${device.hostname || 'hostname 미확인'} · ${device.osVersion || device.platform}`;
    const state = document.createElement('span');
    state.className = 'device-state';
    state.textContent = statusLabel(device.status);
    head.append(identity, state);

    const meta = document.createElement('div');
    meta.className = 'ekodi-device-meta';
    meta.innerHTML = `<span><small>마지막 연결</small><strong></strong></span><span><small>Agent</small><strong></strong></span><span><small>전원 백업</small><strong></strong></span>`;
    const values = meta.querySelectorAll('strong');
    values[0].textContent = timeLabel(device.lastSeenAt);
    values[1].textContent = device.agentVersion || '—';
    values[2].textContent = device.settings?.powerBackupAvailable ? '있음' : '아직 없음';

    const profileTitle = document.createElement('h3');
    profileTitle.textContent = '전원 프로필';
    const profiles = document.createElement('div');
    profiles.className = 'device-command-grid';
    COMMANDS.forEach(([type, label, title]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = type === 'power.restore' ? 'secondary' : 'ghost';
      button.textContent = label;
      button.title = title;
      button.disabled = device.status === 'revoked';
      button.addEventListener('click', () => issueCommand(device, type, button));
      profiles.append(button);
    });

    const securityTitle = document.createElement('h3');
    securityTitle.textContent = '잠금 · 로그인';
    const security = document.createElement('div');
    security.className = 'device-command-grid security';
    [
      ['lock.resume_off', '복귀 잠금 해제'],
      ['lock.resume_on', '복귀 잠금 사용'],
      ['autologon.open', '자동로그인 관리'],
    ].forEach(([type, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = type === 'autologon.open' ? 'secondary' : 'ghost';
      button.textContent = label;
      button.disabled = device.status === 'revoked';
      button.addEventListener('click', () => issueCommand(device, type, button));
      security.append(button);
    });

    const history = document.createElement('div');
    history.className = 'device-history';
    history.innerHTML = `<h3>최근 명령</h3>${latestCommandMarkup(device.recentCommands)}`;

    const foot = document.createElement('div');
    foot.className = 'device-card-foot';
    const note = document.createElement('p');
    note.textContent = device.status === 'online'
      ? 'Agent가 연결되어 있습니다. 명령은 보통 다음 폴링 주기에 적용됩니다.'
      : device.status === 'revoked'
        ? '이 기기의 EKODI 접근 권한이 해제되었습니다.'
        : '오프라인이어도 명령을 대기열에 둘 수 있으며 Agent가 다시 연결되면 처리합니다.';
    const revoke = document.createElement('button');
    revoke.type = 'button';
    revoke.className = 'ghost device-revoke';
    revoke.textContent = '기기 권한 해제';
    revoke.disabled = device.status === 'revoked';
    revoke.addEventListener('click', async () => {
      if (!confirm(`${device.label || device.hostname}의 EKODI Device Agent 권한을 해제할까요?`)) return;
      try {
        await request(`/api/control/devices/${encodeURIComponent(device.id)}/revoke`, { method: 'POST' });
        await loadDevices();
      } catch (error) { alert(error.message); }
    });
    foot.append(note, revoke);

    card.append(head, meta, profileTitle, profiles, securityTitle, security, history, foot);
    return card;
  }

  function renderDevices(devices) {
    const list = document.querySelector('#ekodiDeviceList');
    const total = document.querySelector('#deviceMetricTotal');
    const online = document.querySelector('#deviceMetricOnline');
    const issues = document.querySelector('#deviceMetricIssues');
    if (!list) return;
    total.textContent = String(devices.length);
    online.textContent = String(devices.filter(device => device.status === 'online').length);
    issues.textContent = String(devices.filter(device => ['stale', 'offline'].includes(device.status)).length);
    list.textContent = '';
    if (!devices.length) {
      list.innerHTML = '<div class="device-empty"><strong>아직 등록된 기기가 없습니다.</strong><p>위의 “Windows PC 등록”에서 1회용 코드를 발급해 첫 기기를 연결하세요.</p></div>';
      return;
    }
    devices.forEach(device => list.append(deviceCard(device)));
  }

  async function loadDevices() {
    const list = document.querySelector('#ekodiDeviceList');
    if (!list || !sessionStorage.getItem(TOKEN_KEY)) return;
    try {
      const data = await request('/api/control/devices');
      renderDevices(data.devices || []);
      const stamp = document.querySelector('#deviceGeneratedAt');
      if (stamp) stamp.textContent = `최근 갱신 ${timeLabel(data.generatedAt)}`;
    } catch (error) {
      list.innerHTML = `<div class="device-empty error"><strong>Device Control API를 불러오지 못했습니다.</strong><p></p></div>`;
      list.querySelector('p').textContent = error.message;
    }
  }

  async function createEnrollment() {
    const button = document.querySelector('#createDeviceEnrollment');
    const result = document.querySelector('#deviceEnrollmentResult');
    if (!button || !result) return;
    button.disabled = true;
    button.textContent = '코드 발급 중…';
    try {
      const data = await request('/api/control/devices/enrollment', {
        method: 'POST',
        body: JSON.stringify({ label: 'Windows PC' }),
      });
      const command = `$p="$env:TEMP\\ekodi-device-agent.ps1"; Invoke-WebRequest -UseBasicParsing "${WINDOWS_AGENT_URL}" -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p -Install -EnrollmentCode "${data.enrollmentCode}" -ApiBase "${API_BASE}"`;
      result.hidden = false;
      result.querySelector('[data-enrollment-code]').textContent = data.enrollmentCode;
      result.querySelector('[data-enrollment-expiry]').textContent = `유효시간: ${timeLabel(data.expiresAt)}까지 · 1회 사용`;
      result.querySelector('[data-install-command]').textContent = command;
      result.dataset.installCommand = command;
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Windows PC 등록';
    }
  }

  function installPanel() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('#deviceControlPanel')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav';
    button.dataset.deviceControlNav = 'true';
    button.append(document.createTextNode('⌁ '));
    const label = document.createElement('span');
    label.textContent = 'Devices';
    button.append(label);
    const workspace = nav.querySelector('[data-section="workspace"]');
    if (workspace) workspace.insertAdjacentElement('afterend', button); else nav.append(button);

    const panel = document.createElement('section');
    panel.id = 'deviceControlPanel';
    panel.className = 'section ekodi-device-panel hidden-panel';
    panel.dataset.panel = 'devices';
    panel.innerHTML = `
      <div class="device-panel-head">
        <div><p class="kicker">EKODI DEVICE CONTROL</p><h2>기기 전원 · 잠금 관리</h2><p>승인된 기기의 전원 프로필과 절전 복귀 잠금을 제어합니다. 임의 셸 명령은 실행하지 않습니다.</p></div>
        <div class="device-head-actions"><span id="deviceGeneratedAt">연결 상태 확인 전</span><button type="button" class="secondary" id="refreshDevices">↻ 새로고침</button></div>
      </div>
      <div class="device-metrics">
        <article><small>등록 기기</small><strong id="deviceMetricTotal">—</strong></article>
        <article><small>온라인</small><strong id="deviceMetricOnline">—</strong></article>
        <article><small>확인 필요</small><strong id="deviceMetricIssues">—</strong></article>
        <article><small>지원</small><strong>Windows</strong><span>Android · iOS는 MDM 단계에서 추가</span></article>
      </div>
      <div class="device-enrollment-box">
        <div><p class="kicker">FIRST PAIRING</p><h3>Windows Agent 등록</h3><p>PC마다 최초 한 번만 등록하면 이후에는 이 화면의 버튼으로 설정·복원이 가능합니다.</p></div>
        <button type="button" class="primary" id="createDeviceEnrollment">Windows PC 등록</button>
      </div>
      <div class="device-enrollment-result" id="deviceEnrollmentResult" hidden>
        <div><small>1회용 등록 코드</small><strong data-enrollment-code></strong><span data-enrollment-expiry></span></div>
        <p>등록할 PC에서 PowerShell을 열고 아래 명령을 한 번 실행합니다. 관리자 권한이 필요하면 Windows가 승인 창을 표시합니다.</p>
        <code data-install-command></code>
        <button type="button" class="secondary" id="copyDeviceInstallCommand">설치 명령 복사</button>
      </div>
      <div class="device-security-note"><strong>자동로그인 보안 경계</strong><p>Windows 암호는 EKODI 서버로 보내거나 저장하지 않습니다. “자동로그인 관리”는 해당 PC에서 Microsoft Sysinternals Autologon 창만 열어 로컬 입력을 받습니다.</p></div>
      <div class="ekodi-device-list" id="ekodiDeviceList"><div class="device-empty"><p>기기 목록을 불러오는 중입니다.</p></div></div>
    `;
    content.append(panel);

    button.addEventListener('click', showDevices);
    panel.querySelector('#refreshDevices').addEventListener('click', loadDevices);
    panel.querySelector('#createDeviceEnrollment').addEventListener('click', createEnrollment);
    panel.querySelector('#copyDeviceInstallCommand').addEventListener('click', async event => {
      const command = panel.querySelector('#deviceEnrollmentResult').dataset.installCommand || '';
      if (!command) return;
      try {
        await navigator.clipboard.writeText(command);
        event.currentTarget.textContent = '복사했습니다 ✓';
        setTimeout(() => { event.currentTarget.textContent = '설치 명령 복사'; }, 1500);
      } catch {
        event.currentTarget.textContent = '코드를 직접 선택해 복사하세요';
      }
    });

    if (location.hash === '#devices') showDevices();
    window.addEventListener('hashchange', () => { if (location.hash === '#devices') showDevices(); });
    timer = window.setInterval(() => {
      if (!panel.classList.contains('hidden-panel')) loadDevices();
    }, 10000);
  }

  installPanel();
  window.addEventListener('ekodi-admin-ready', installPanel, { once: true });
  window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer); });
})();
