(() => {
  'use strict';
  if (window.EKODIRemotePowerAdmin) return;

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const state = { loading:false, relayConfigured:false, devices:[], agents:[], message:'' };

  function token(){ try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''} }
  function headers(json=false){ const h=token()?{authorization:`Bearer ${token()}`}:{ }; if(json)h['content-type']='application/json'; return h; }
  function esc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function host(){ return document.querySelector('#aiOpsPanel') || document.querySelector('main') || document.body; }
  function statusLabel(status){ return status==='online'?'온라인':status==='offline'?'오프라인':status==='wake_requested'?'기동 요청':'상태 확인 전'; }

  function render(){
    const root=host(); if(!root)return;
    let card=root.querySelector('[data-ekodi-remote-power]');
    if(!card){ card=document.createElement('section'); card.dataset.ekodiRemotePower='true'; card.className='remote-power-card'; root.appendChild(card); }
    const relay = state.relayConfigured ? '전원 릴레이 연결 설정됨' : '전원 릴레이 설정 필요';
    card.innerHTML=`
      <div class="remote-power-head"><div><small>REMOTE WORK NODES</small><h3>원격 PC 전원관리</h3><p>${esc(relay)} · MAC/IP/비밀키는 관리자 브라우저에 노출하지 않습니다.</p></div><button type="button" data-rp-refresh ${state.loading?'disabled':''}>새로고침</button></div>
      ${state.message?`<div class="remote-power-message">${esc(state.message)}</div>`:''}
      <div class="remote-power-grid">${state.devices.length?state.devices.map(device=>`
        <article class="remote-power-device">
          <div><strong>${esc(device.label)}</strong><span class="remote-power-status" data-status="${esc(device.status||'unknown')}">${esc(statusLabel(device.status))}</span></div>
          <small>${esc(device.id)}</small>
          <button type="button" data-rp-wake="${esc(device.id)}" ${state.loading||!state.relayConfigured?'disabled':''}>깨우기</button>
        </article>`).join(''):'<div class="remote-power-empty">등록된 원격 PC 정보를 불러오는 중입니다.</div>'}</div>
      <div class="remote-power-subhead"><strong>Remote Desktop 자가복구</strong><small>EKODI Device Agent가 허용된 복구 명령만 실행합니다.</small></div>
      <div class="remote-power-grid">${state.agents.length?state.agents.map(device=>`
        <article class="remote-power-device">
          <div><strong>${esc(device.label||device.hostname||device.id)}</strong><span class="remote-power-status" data-status="${esc(device.status||'unknown')}">${esc(statusLabel(device.status))}</span></div>
          <small>${esc(device.id)}</small>
          <div class="remote-power-actions"><button type="button" data-rp-recovery="enable" data-rp-device="${esc(device.id)}" ${state.loading?'disabled':''}>자가복구 켜기</button><button type="button" data-rp-recovery="run" data-rp-device="${esc(device.id)}" ${state.loading?'disabled':''}>지금 복구</button><button type="button" data-rp-recovery="disable" data-rp-device="${esc(device.id)}" ${state.loading?'disabled':''}>끄기</button></div>
        </article>`).join(''):'<div class="remote-power-empty">EKODI Device Agent에 등록된 PC가 없습니다.</div>'}</div>`;
    card.querySelector('[data-rp-refresh]')?.addEventListener('click',load);
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
      state.devices=Array.isArray(payload.devices)?payload.devices:[];
      const agentResponse=await fetch(`${API}/api/control/devices`,{headers:headers(),cache:'no-store'});
      const agentPayload=await agentResponse.json().catch(()=>({}));
      state.agents=agentResponse.ok&&Array.isArray(agentPayload.devices)?agentPayload.devices.filter(device=>device.deviceType==='pc'||device.platform==='windows'):[];
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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true}); else load();
})();
