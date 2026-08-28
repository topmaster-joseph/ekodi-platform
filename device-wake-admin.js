(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const PANEL_ID = 'adminDeviceWakeControl';

  function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[char]);
  }
  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      cache:'no-store',
      headers:{ authorization:`Bearer ${token()}`, ...(options.body ? {'content-type':'application/json'} : {}), ...(options.headers || {}) },
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `API 오류 (${response.status})`);
    return data;
  }
  function time(value) {
    if (!value) return '확인 없음';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('ko-KR');
  }
  function isDesktopEligible(device) {
    const system = device.settings?.health?.system || device.diagnostics?.system || {};
    return device.management?.type === 'pc'
      && device.platform !== 'inventory'
      && system.autoExecutionEligible === true
      && system.isPortable === false
      && system.deviceClass !== 'portable';
  }
  function profileFor(wake, deviceId) {
    return (wake.profiles || []).find(item => item.deviceId === deviceId) || null;
  }
  function gatewayOptions(wake, selected) {
    const options = ['<option value="">Gateway 선택</option>'];
    for (const gateway of wake.gateways || []) {
      options.push(`<option value="${esc(gateway.id)}"${gateway.id === selected ? ' selected' : ''}>${esc(gateway.label)} · ${esc(gateway.status)}</option>`);
    }
    return options.join('');
  }
  function installStyles() {
    if (document.getElementById('ekodiWakeControlStyles')) return;
    const style = document.createElement('style');
    style.id = 'ekodiWakeControlStyles';
    style.textContent = `
      .device-wake-control{margin:16px 0;padding:16px;border:1px solid rgba(100,151,198,.25);border-radius:14px;background:rgba(7,25,42,.62)}
      .device-wake-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.device-wake-head h3{margin:2px 0 5px}.device-wake-head p{margin:0;color:#8fa6bb;font-size:11px;line-height:1.5}.device-wake-actions{display:flex;gap:7px;flex-wrap:wrap}
      .device-wake-gateways,.device-wake-grid{display:grid;gap:10px;margin-top:13px}.device-wake-gateways{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}.device-wake-grid{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
      .device-wake-gateway,.device-wake-card{border:1px solid rgba(103,149,190,.2);border-radius:12px;background:rgba(8,31,51,.58);padding:12px}.device-wake-gateway strong,.device-wake-card strong{display:block}.device-wake-gateway small,.device-wake-card small{display:block;color:#829bb2;margin-top:3px}
      .device-wake-state{display:inline-flex;margin-top:7px;padding:3px 7px;border-radius:999px;background:rgba(100,116,139,.18);font-size:9px}.device-wake-state.online{background:rgba(34,197,94,.14);color:#86efac}.device-wake-state.offline{background:rgba(245,158,11,.14);color:#fcd34d}
      .device-wake-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.device-wake-form label{display:grid;gap:4px;color:#8ea4b8;font-size:9px}.device-wake-form input,.device-wake-form select{min-width:0;height:34px;border:1px solid rgba(110,153,193,.28);border-radius:8px;background:#0b2943;color:#d7e6f5;padding:0 8px}.device-wake-form .wide{grid-column:1/-1}
      .device-wake-checks{grid-column:1/-1;display:flex;gap:12px;flex-wrap:wrap}.device-wake-checks label{display:flex;align-items:center;gap:5px}.device-wake-card-actions{grid-column:1/-1;display:flex;gap:7px;flex-wrap:wrap}.device-wake-note{margin-top:12px;padding:10px;border-radius:9px;background:rgba(245,158,11,.08);color:#c9b47a;font-size:10px;line-height:1.5}.device-wake-enrollment{margin-top:10px;padding:10px;border:1px dashed rgba(110,153,193,.35);border-radius:9px}.device-wake-enrollment code{display:block;margin-top:7px;padding:8px;overflow-wrap:anywhere;background:#071a2b;border-radius:7px;color:#b8d5ef;font-size:9px}.device-wake-message{margin-top:9px;color:#9bb4ca;font-size:10px}
      @media(max-width:560px){.device-wake-head{flex-direction:column}.device-wake-form{grid-template-columns:1fr}.device-wake-form .wide,.device-wake-checks,.device-wake-card-actions{grid-column:1}}
    `;
    document.head.append(style);
  }

  function render(section, devicesData, wake) {
    const gatewayHost = section.querySelector('[data-wake-gateways]');
    const grid = section.querySelector('[data-wake-grid]');
    const gateways = wake.gateways || [];
    gatewayHost.innerHTML = gateways.length
      ? gateways.map(gateway => `<article class="device-wake-gateway"><strong>${esc(gateway.label)}</strong><small>${esc(gateway.id)}</small><span class="device-wake-state ${gateway.status === 'online' ? 'online' : 'offline'}">${gateway.status === 'online' ? '온라인' : '오프라인'}</span><small>최근 ${esc(time(gateway.lastSeenAt))}</small></article>`).join('')
      : '<p class="device-wake-message">등록된 Wake Gateway가 없습니다.</p>';

    const devices = (devicesData.devices || []).filter(device => device.management?.type === 'pc' && device.platform !== 'inventory');
    grid.innerHTML = devices.length ? devices.map(device => {
      const profile = profileFor(wake, device.id);
      const eligible = isDesktopEligible(device);
      const gateway = gateways.find(item => item.id === profile?.gatewayId);
      const online = device.status === 'online';
      const wakeReady = eligible && profile?.enabled && gateway?.status === 'online' && !online;
      return `<article class="device-wake-card" data-wake-device="${esc(device.id)}">
        <strong>${esc(device.label || device.hostname || device.id)}</strong><small>${esc(device.hostname || device.id)} · ${online ? '온라인' : '오프라인'}</small>
        <span class="device-wake-state ${eligible ? 'online' : 'offline'}">${eligible ? '데스크톱 Wake 허용 가능' : '노트북/휴대형 제외'}</span>
        <form class="device-wake-form" data-wake-profile-form>
          <label class="wide">Wake Gateway<select name="gatewayId"${eligible ? '' : ' disabled'}>${gatewayOptions(wake, profile?.gatewayId || '')}</select></label>
          <label>MAC 주소<input name="macAddress" placeholder="AA:BB:CC:DD:EE:FF" value="${esc(profile?.macAddress || '')}"${eligible ? '' : ' disabled'}></label>
          <label>브로드캐스트<input name="broadcastAddress" value="${esc(profile?.broadcastAddress || '255.255.255.255')}"${eligible ? '' : ' disabled'}></label>
          <label>WOL Port<input name="wolPort" type="number" min="1" max="65535" value="${Number(profile?.wolPort || 9)}"${eligible ? '' : ' disabled'}></label>
          <label>부팅 확인 제한(초)<input name="bootTimeoutSeconds" type="number" min="60" max="900" value="${Number(profile?.bootTimeoutSeconds || 300)}"${eligible ? '' : ' disabled'}></label>
          <div class="device-wake-checks"><label><input name="enabled" type="checkbox"${profile?.enabled ? ' checked' : ''}${eligible ? '' : ' disabled'}> 관리자 원격 전원 허용</label><label><input name="autoWakeForJobs" type="checkbox"${profile?.autoWakeForJobs ? ' checked' : ''}${eligible ? '' : ' disabled'}> 작업 대기 시 자동 깨우기</label><label><input name="resumeJobs" type="checkbox"${profile?.resumeJobs !== false ? ' checked' : ''}${eligible ? '' : ' disabled'}> 부팅 후 작업 계속</label></div>
          <div class="device-wake-card-actions"><button type="submit" class="secondary"${eligible ? '' : ' disabled'}>전원 정책 저장</button><button type="button" class="primary" data-wake-now${wakeReady ? '' : ' disabled'}>${online ? '이미 온라인' : '지금 켜기'}</button></div>
        </form>
      </article>`;
    }).join('') : '<p class="device-wake-message">관리 가능한 데스크톱 PC가 없습니다.</p>';
  }

  async function load(section) {
    const message = section.querySelector('[data-wake-message]');
    try {
      message.textContent = '전원 복구 상태를 확인하고 있습니다…';
      const [devices, wake] = await Promise.all([api('/api/control/devices'), api('/api/control/wake')]);
      render(section, devices, wake);
      message.textContent = `최근 확인 ${new Date().toLocaleTimeString('ko-KR')}`;
    } catch (error) {
      message.textContent = `전원 복구 상태 확인 실패: ${error.message}`;
    }
  }

  function install() {
    const panel = document.querySelector('#deviceControlPanel');
    if (!panel || document.getElementById(PANEL_ID)) return;
    installStyles();
    const section = document.createElement('section');
    section.id = PANEL_ID;
    section.className = 'device-wake-control';
    section.innerHTML = `<div class="device-wake-head"><div><p class="kicker">POWER RECOVERY</p><h3>원격 전원 · 작업 자동복귀</h3><p>관리자가 허용한 데스크톱만 Wake Gateway를 통해 켜고, Windows 로그인 전 Device Agent가 복귀해 대기 작업을 이어갑니다.</p></div><div class="device-wake-actions"><button type="button" class="secondary" data-wake-refresh>↻ 새로고침</button><button type="button" class="primary" data-wake-enroll>Gateway 등록코드</button></div></div><div class="device-wake-note">노트북은 자동 작업 및 Wake 대상에서 제외됩니다. 완전 종료(S5) 깨우기는 대상 PC의 BIOS/NIC WOL과 같은 네트워크의 항상 켜진 Wake Gateway가 모두 준비되어야 합니다. 정전으로 AC 전원이 끊긴 상태는 WOL만으로 켤 수 없습니다.</div><div class="device-wake-enrollment" data-wake-enrollment hidden></div><div class="device-wake-gateways" data-wake-gateways></div><div class="device-wake-grid" data-wake-grid></div><p class="device-wake-message" data-wake-message>전원 복구 상태를 불러오는 중입니다.</p>`;
    const browser = document.getElementById('adminDeviceBrowserDiagnostics');
    if (browser) browser.insertAdjacentElement('afterend', section); else panel.prepend(section);

    section.querySelector('[data-wake-refresh]').addEventListener('click', () => load(section));
    section.querySelector('[data-wake-enroll]').addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      try {
        const data = await api('/api/control/wake/gateways/enrollments', { method:'POST', body:'{}' });
        const code = data.enrollment?.code || '';
        const host = section.querySelector('[data-wake-enrollment]');
        host.hidden = false;
        host.innerHTML = `<strong>10분 1회용 Gateway 등록코드</strong><code>${esc(code)}</code><small>항상 켜져 있는 데스크톱에서 EKODI Wake Gateway 설치 시 이 코드를 사용합니다.</small>`;
      } catch (error) {
        section.querySelector('[data-wake-message]').textContent = error.message;
      } finally { button.disabled = false; }
    });

    section.addEventListener('submit', async event => {
      const form = event.target.closest('[data-wake-profile-form]');
      if (!form) return;
      event.preventDefault();
      const deviceId = form.closest('[data-wake-device]')?.dataset.wakeDevice;
      const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
      try {
        await api(`/api/control/wake/devices/${encodeURIComponent(deviceId)}`, { method:'PUT', body:JSON.stringify({
          enabled:form.elements.enabled.checked,
          autoWakeForJobs:form.elements.autoWakeForJobs.checked,
          resumeJobs:form.elements.resumeJobs.checked,
          gatewayId:form.elements.gatewayId.value,
          macAddress:form.elements.macAddress.value,
          broadcastAddress:form.elements.broadcastAddress.value,
          wolPort:Number(form.elements.wolPort.value),
          bootTimeoutSeconds:Number(form.elements.bootTimeoutSeconds.value),
        }) });
        section.querySelector('[data-wake-message]').textContent = '전원 복구 정책을 저장했습니다.';
        await load(section);
      } catch (error) {
        section.querySelector('[data-wake-message]').textContent = error.message;
      } finally { submit.disabled = false; }
    });

    section.addEventListener('click', async event => {
      const button = event.target.closest('[data-wake-now]');
      if (!button) return;
      const deviceId = button.closest('[data-wake-device]')?.dataset.wakeDevice;
      if (!window.confirm('관리자 승인으로 이 데스크톱의 전원을 원격으로 켜고, 부팅 후 대기 작업을 계속할까요?')) return;
      button.disabled = true;
      try {
        const result = await api(`/api/control/wake/devices/${encodeURIComponent(deviceId)}/wake`, { method:'POST', body:JSON.stringify({ confirmed:true, reason:'admin-ui', continueJobs:true }) });
        section.querySelector('[data-wake-message]').textContent = result.alreadyOnline ? '이미 온라인 상태입니다.' : 'Wake 요청을 Gateway에 전달했습니다. 부팅 상태를 추적합니다.';
        window.setTimeout(() => load(section), 2500);
      } catch (error) {
        section.querySelector('[data-wake-message]').textContent = error.message;
        button.disabled = false;
      }
    });
    load(section);
  }

  install();
  window.addEventListener('ekodi-admin-ready', install);
  window.addEventListener('ekodi-nav-changed', install);
})();
