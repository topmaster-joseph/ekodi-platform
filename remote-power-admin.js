(() => {
  'use strict';
  if (window.EKODIRemotePowerAdmin) return;

  const API = 'https://ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const state = { loading:false, relayConfigured:false, devices:[], agents:[], selectedAgentId:'', nodesOpen:false, message:'' };

  function token(){ try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''} }
  function headers(json=false){ const h=token()?{authorization:`Bearer ${token()}`}:{ }; if(json)h['content-type']='application/json'; return h; }
  function esc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function host(){ return document.querySelector('#deviceControlPanel') || document.querySelector('[data-panel~="devices"]'); }
  function statusLabel(status, source='remote'){ 
    if(status==='online') return source==='agent'?'Agent 연결됨':'온라인';
    if(status==='offline') return source==='agent'?'Agent 응답없음':'오프라인';
    if(status==='stale') return source==='agent'?'Agent 응답지연':'응답 지연';
    if(status==='enrolled') return source==='agent'?'Agent 등록됨 · 첫 heartbeat 대기':'등록됨';
    if(status==='revoked') return '권한 해제';
    if(status==='wake_requested') return '기동 요청';
    return '상태 확인 전';
  }
  function timeLabel(value){
    if(!value)return 'heartbeat 없음';
    const date=new Date(value); if(Number.isNaN(date.getTime()))return 'heartbeat 확인 불가';
    return date.toLocaleString('ko-KR');
  }

  function render(){
    const root=host(); if(!root)return;
    let card=root.querySelector('[data-ekodi-remote-power]');
    if(!card){ card=document.createElement('section'); card.dataset.ekodiRemotePower='true'; card.className='remote-power-card'; root.appendChild(card); }
    const relay = state.relayConfigured ? '전원 릴레이 연결 설정됨' : '전원 릴레이 설정 필요';
    const selected = state.agents.find(device => device.id === state.selectedAgentId) || state.agents.find(device => device.status === 'online') || state.agents[0] || null;
    if (selected) state.selectedAgentId = selected.id;
    card.innerHTML=`
      <div class="remote-power-head"><div><small>REMOTE WORK NODES</small><h3>원격 PC 전원관리</h3><p>${esc(relay)} · MAC/IP/비밀키는 관리자 브라우저에 노출하지 않습니다.</p></div><button type="button" data-rp-refresh ${state.loading?'disabled':''}>새로고침</button></div>
      ${state.message?`<div class="remote-power-message">${esc(state.message)}</div>`:''}
      <details class="remote-power-nodes" data-rp-nodes ${state.nodesOpen ? 'open' : ''}><summary>전원 릴레이 기기 ${state.devices.length}개 · 상세 관리</summary><div class="remote-power-grid">${state.devices.length?state.devices.map(device=>`
        <article class="remote-power-device">
          <div><strong>${esc(device.label)}</strong><span class="remote-power-status" data-status="${esc(device.status||'unknown')}">${esc(statusLabel(device.status,'remote'))}</span></div>
          <small>${esc(device.id)}</small>
          <button type="button" data-rp-wake="${esc(device.id)}" ${state.loading||!state.relayConfigured?'disabled':''}>깨우기</button>
        </article>`).join(''):'<div class="remote-power-empty">등록된 원격 PC 정보를 불러오는 중입니다.</div>'}</div></details>
      <div class="remote-power-subhead"><strong>Remote Desktop 자가복구</strong><small>등록 기기 목록은 상단 통합 목록에서 확인하고, 여기서는 선택한 Agent만 조작합니다.</small></div>
      <div class="remote-power-agent-control">
        ${state.agents.length ? `<label>관리할 Agent 등록기록
          <select data-rp-agent aria-label="Remote Desktop 복구 대상 Agent">
            ${state.agents.map(device => `<option value="${esc(device.id)}"${device.id === state.selectedAgentId ? " selected" : ""}>${esc(device.label || device.hostname || "미식별 PC")} · ${esc(statusLabel(device.status,"agent"))} · ID …${esc(String(device.id).slice(-8))}</option>`).join("")}
          </select></label>
          <span class="remote-power-agent-status">${esc(statusLabel(selected.status,"agent"))} · 마지막 heartbeat ${esc(timeLabel(selected.lastSeenAt || selected.last_seen_at))}</span>
          <div class="remote-power-actions">
            <button type="button" data-rp-recovery="enable" data-rp-device="${esc(selected.id)}" ${state.loading || selected.status === "revoked" ? "disabled" : ""}>자가복구 켜기</button>
            <button type="button" data-rp-recovery="run" data-rp-device="${esc(selected.id)}" ${state.loading || selected.status !== "online" ? "disabled" : ""}>지금 복구</button>
            <button type="button" data-rp-recovery="disable" data-rp-device="${esc(selected.id)}" ${state.loading || selected.status === "revoked" ? "disabled" : ""}>끄기</button>
          </div>` : `<p class="remote-power-empty">복구 가능한 EKODI Device Agent가 없습니다.</p>`}
      </div>`;
    card.querySelector('[data-rp-refresh]')?.addEventListener('click',load);
    card.querySelector('[data-rp-nodes]')?.addEventListener('toggle', event => { if (event.currentTarget.isConnected) state.nodesOpen = event.currentTarget.open; });
    card.querySelector('[data-rp-agent]')?.addEventListener('change', event => { state.selectedAgentId = event.currentTarget.value; render(); });
    card.querySelectorAll('[data-rp-wake]').forEach(button=>button.addEventListener('click',()=>wake(button.dataset.rpWake)));
    card.querySelectorAll('[data-rp-recovery]').forEach(button=>button.addEventListener('click',()=>recovery(button.dataset.rpDevice,button.dataset.rpRecovery)));
  }

  async function load(){
    state.loading=true; state.message=''; render();
    try{
      const response=await fetch(`${API}/api/control/remote/devices`,{headers:headers(),cache:'no-store'});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
      state.relayConfigured=Boolean(payload.relayConfigured);
      state.devices=Array.isArray(payload.devices) ? [...new Map(payload.devices.filter(device => device?.id).map(device => [device.id,device])).values()] : [];
      const agentResponse=await fetch(`${API}/api/control/devices`,{headers:headers(),cache:'no-store'});
      const agentPayload=await agentResponse.json().catch(()=>({}));
      state.agents=agentResponse.ok&&Array.isArray(agentPayload.devices)?[...new Map(agentPayload.devices.filter(device=>(device.management?.type==='pc'||device.platform==='windows')&&device?.id&&device.status!=='revoked').map(device=>[device.id,device])).values()]:[];
      if(!state.relayConfigured)state.message='LAN 전원 릴레이를 연결하면 오프라인 PC를 관리자에서 기동할 수 있습니다.';
    }catch(error){ state.message=`원격 전원 상태를 불러오지 못했습니다: ${error.message}`; }
    finally{ state.loading=false; render(); }
  }

  async function wake(deviceId){
    if(!deviceId||state.loading)return;
    state.loading=true; state.message=`${deviceId} 기동을 요청하고 있습니다.`; render();
    try{
      const response=await fetch(`${API}/api/control/remote/devices/${encodeURIComponent(deviceId)}/wake`,{method:'POST',headers:headers(true),body:'{}'});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
      state.devices=state.devices.map(device=>device.id===deviceId?{...device,status:'wake_requested'}:device);
      state.message=`${payload.label||deviceId}에 Wake-on-LAN 기동 요청을 전달했습니다.`;
    }catch(error){ state.message=`기동 요청 실패: ${error.message}`; }
    finally{ state.loading=false; render(); }
  }


  async function recovery(deviceId,action){
    if(!deviceId||state.loading)return;
    const type=`remote_desktop.recovery.${action}`;
    state.loading=true; state.message=`${deviceId} 원격 에이전트 복구 설정을 적용하고 있습니다.`; render();
    try{
      const response=await fetch(`${API}/api/control/devices/${encodeURIComponent(deviceId)}/commands`,{method:'POST',headers:headers(true),body:JSON.stringify({type,confirmed:true})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
      state.message=action==='enable'?'자가복구 활성화 명령을 전달했습니다.':action==='disable'?'자가복구 비활성화 명령을 전달했습니다.':'즉시 복구 명령을 전달했습니다.';
    }catch(error){ state.message=`자가복구 명령 실패: ${error.message}`; }
    finally{ state.loading=false; render(); }
  }

  window.EKODIRemotePowerAdmin={load,wake,recovery};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(host())load()},{once:true}); else if(host())load();
})();
