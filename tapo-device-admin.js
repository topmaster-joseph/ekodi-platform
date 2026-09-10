(() => {
  'use strict';
  const API_BASE='https://api.ekodi.kr';
  const TOKEN_KEY='ekodi-auth-token';
  const BRIDGE_URL='https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/tools/ekodi-device-agent/tapo/index.mjs';
  if(!document.querySelector('link[data-tapo-device-admin-style]')){const l=document.createElement('link');l.rel='stylesheet';l.href='tapo-device-admin.css';l.dataset.tapoDeviceAdminStyle='true';document.head.append(l);}
  let lastDevices=[];

  function authHeaders(json=false){
    const token=sessionStorage.getItem(TOKEN_KEY)||'';
    return {authorization:`Bearer ${token}`,...(json?{'content-type':'application/json'}:{})};
  }
  async function request(path,options={}){
    const response=await fetch(`${API_BASE}${path}`,{
      ...options,cache:'no-store',
      headers:{...authHeaders(Boolean(options.body)),...(options.headers||{})},
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||`Tapo Device API 오류 (${response.status})`);
    return data;
  }
  function cameraDialog(device,camera,playbackUrl){
    let dialog=document.querySelector('#ekodiTapoCameraDialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='ekodiTapoCameraDialog';dialog.className='tapo-camera-dialog';document.body.append(dialog);}
    dialog.innerHTML='<button type="button" class="ghost" data-tapo-close>닫기</button><div><strong></strong><small></small><img alt="실시간 카메라 영상" referrerpolicy="no-referrer"></div>';
    dialog.querySelector('strong').textContent=camera.label||camera.externalId;
    dialog.querySelector('small').textContent=[device.label,camera.locationLabel].filter(Boolean).join(' · ');
    const image=dialog.querySelector('img');let retries=0;
    const load=()=>{image.src=playbackUrl+(playbackUrl.includes('?')?'&':'?')+'retry='+Date.now();};
    image.addEventListener('error',()=>{if(retries++<4&&dialog.open)setTimeout(load,900);},{passive:true});
    dialog.querySelector('[data-tapo-close]').addEventListener('click',()=>{image.removeAttribute('src');dialog.close();});
    if(!dialog.open)dialog.showModal();
    setTimeout(load,900);
  }
  async function waitForStream(statusUrl){
    for(let attempt=0;attempt<14;attempt+=1){
      const data=await request(statusUrl);
      const stream=data.stream||{};
      if(stream.status==='succeeded'&&stream.playbackBase)return stream;
      if(['failed','expired','cancelled'].includes(stream.status))throw new Error('카메라 스트림 세션을 시작하지 못했습니다.');
      await new Promise(resolve=>setTimeout(resolve,450));
    }
    throw new Error('카메라 스트림 준비 시간이 초과되었습니다.');
  }
  async function openStream(device,camera,button){
    const label=button.textContent;button.disabled=true;button.textContent='연결 중…';
    try{
      const data=await request(`/api/control/devices/${encodeURIComponent(device.id)}/cameras/${encodeURIComponent(camera.externalId)}/stream`,{method:'POST',body:'{}'});
      const issued=data.stream||{};
      if(!issued.sessionId||!issued.sessionToken||!issued.statusUrl)throw new Error('보안 스트림 세션을 발급받지 못했습니다.');
      const ready=await waitForStream(issued.statusUrl);
      const playbackUrl=`${ready.playbackBase}/stream/${encodeURIComponent(issued.sessionId)}?token=${encodeURIComponent(issued.sessionToken)}`;
      cameraDialog(device,camera,playbackUrl);
    }catch(error){alert(error.message);}
    finally{setTimeout(()=>{button.disabled=false;button.textContent=label;},1200);}
  }
  function cameraPanel(device){
    const panel=document.createElement('section');panel.className='tapo-camera-panel';panel.dataset.tapoCameraPanel='true';
    panel.innerHTML='<div class="tapo-camera-head"><div><strong>Tapo 카메라</strong><small>RTSP는 Edge에만 보관 · 웹은 3분 임시 세션</small></div><span></span></div>';
    panel.querySelector('.tapo-camera-head span').textContent=device.settings?.providerBridge?.publicBase?'Bridge 준비됨':'Bridge 주소 필요';
    const cameras=Array.isArray(device.settings?.providerBridge?.devices)?device.settings.providerBridge.devices.filter(x=>x.type==='camera'&&(x.capabilities||[]).includes('camera.live')):[];
    if(!cameras.length){const p=document.createElement('p');p.className='device-command-empty';p.textContent='Edge Bridge에서 카메라를 등록하면 자동 표시됩니다.';panel.append(p);return panel;}
    const grid=document.createElement('div');grid.className='tapo-camera-grid';
    cameras.forEach(camera=>{
      const card=document.createElement('article'),text=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');
      strong.textContent=camera.label||camera.externalId;small.textContent=[camera.model,camera.locationLabel].filter(Boolean).join(' · ')||'Tapo camera';text.append(strong,small);
      const live=document.createElement('button');live.type='button';live.className='primary';live.textContent='실시간 보기';live.disabled=device.status!=='online'||!device.settings?.providerBridge?.publicBase;
      live.addEventListener('click',()=>openStream(device,camera,live));
      card.append(text,live);grid.append(card);
    });
    panel.append(grid);return panel;
  }
  function projectPanels(devices){
    lastDevices=devices;
    for(const device of devices.filter(x=>x.management?.type==='gateway')){
      const card=document.querySelector(`.ekodi-device-card[data-device-id="${CSS.escape(device.id)}"]`);
      if(!card||card.querySelector('[data-tapo-camera-panel]'))continue;
      const foot=card.querySelector('.device-card-foot'),panel=cameraPanel(device);
      foot?foot.before(panel):card.append(panel);
    }
  }
  function bridgeCommand(code){
    return `$d="$env:USERPROFILE\\.ekodi-tapo-bridge"; New-Item -ItemType Directory -Force -Path $d | Out-Null; Invoke-WebRequest -UseBasicParsing "${BRIDGE_URL}" -OutFile "$d\\index.mjs"; node "$d\\index.mjs" init --enrollment-code "${code}" --api-base "${API_BASE}"`;
  }
  async function createBridgeEnrollment(box){
    const button=box.querySelector('[data-tapo-enroll]');button.disabled=true;button.textContent='등록 코드 발급 중…';
    try{
      const label=box.querySelector('[data-tapo-label]').value.trim()||'Tapo IoT Bridge';
      const locationLabel=box.querySelector('[data-tapo-location]').value.trim();
      const data=await request('/api/control/devices/enrollment',{method:'POST',body:JSON.stringify({deviceType:'gateway',label,locationLabel})});
      const result=box.querySelector('[data-tapo-result]');result.hidden=false;result.querySelector('strong').textContent=data.enrollmentCode;
      result.querySelector('code').textContent=bridgeCommand(data.enrollmentCode);result.dataset.command=bridgeCommand(data.enrollmentCode);
    }catch(error){alert(error.message);}
    finally{button.disabled=false;button.textContent='IoT Bridge 연결';}
  }
  function mountOnboarding(){
    const host=document.querySelector('.device-onboarding-grid');
    if(!host||host.querySelector('[data-tapo-onboarding]'))return;
    const box=document.createElement('div');box.className='device-enrollment-box tapo-onboarding';box.dataset.tapoOnboarding='true';
    box.innerHTML='<div><p class="kicker">TAPO EDGE BRIDGE</p><h3>Tapo 웹 연결</h3><p>Camera Account와 RTSP 주소는 매장 Edge에만 보관합니다.</p><div class="device-onboarding-fields"><label>표시 이름<input data-tapo-label maxlength="80" placeholder="예: 자담 목포대점 Tapo"></label><label>위치<input data-tapo-location maxlength="120" placeholder="예: 목포대점"></label></div><div class="tapo-enrollment-result" data-tapo-result hidden><small>1회용 코드</small><strong></strong><code></code><button type="button" class="secondary" data-tapo-copy>설치 명령 복사</button></div></div><button type="button" class="primary" data-tapo-enroll>IoT Bridge 연결</button>';
    host.append(box);
    box.querySelector('[data-tapo-enroll]').addEventListener('click',()=>createBridgeEnrollment(box));
    box.querySelector('[data-tapo-copy]').addEventListener('click',async e=>{
      const command=box.querySelector('[data-tapo-result]').dataset.command||'';
      if(!command)return;
      try{await navigator.clipboard.writeText(command);e.currentTarget.textContent='복사했습니다 ✓';}
      catch{e.currentTarget.textContent='직접 선택해 복사하세요';}
    });
  }
  function mount(){mountOnboarding();if(lastDevices.length)projectPanels(lastDevices);}
  window.addEventListener('ekodi-device-control-data',event=>{
    mountOnboarding();projectPanels(event.detail?.devices||[]);
  });
  window.addEventListener('ekodi-admin-ready',mount);
  window.addEventListener('hashchange',()=>{if(location.hash==='#devices')setTimeout(mount,0);});
  window.addEventListener('ekodi-feature-installed',()=>{if(location.hash==='#devices')setTimeout(mount,0);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
