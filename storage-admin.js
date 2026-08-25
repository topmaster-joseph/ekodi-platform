(() => {
  'use strict';
  const API='https://drive.ekodi.kr/api/control/storage/google';
  const TOKEN_KEY='ekodi-auth-token';
  let state=null;

  function el(tag,text='',className=''){const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;}
  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||'';}catch{return '';}}
  async function request(path,options={}){
    const headers=new Headers(options.headers||{});headers.set('authorization',`Bearer ${token()}`);
    if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');
    const response=await fetch(`${API}${path}`,{cache:'no-store',...options,headers});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Storage API 오류 (${response.status})`);
    return data;
  }
  function button(text,handler,className='secondary'){const node=el('button',text,className);node.type='button';node.addEventListener('click',handler);return node;}
  function showError(error){const section=document.querySelector('#storageAdminPanel');if(!section)return;let box=document.querySelector('#storageMessage');if(!box){box=el('div','','storage-banner');box.id='storageMessage';section.prepend(box);}box.className='storage-banner';box.textContent=String(error?.message||error||'처리 중 오류가 발생했습니다.');}

  async function startOAuth(role){try{const result=await request('/oauth/start',{method:'POST',body:JSON.stringify({role})});location.assign(result.authorizeUrl);}catch(error){showError(error);}}
  async function loadDrives(connection,wrap){
    wrap.textContent='Drive 목록을 읽는 중…';
    try{
      const result=await request(`/connections/${encodeURIComponent(connection.id)}/drives`);wrap.textContent='';
      const select=document.createElement('select');select.setAttribute('aria-label','Google Drive 선택');
      for(const drive of result.drives||[]){const option=document.createElement('option');option.value=drive.id;option.textContent=`${drive.name}${drive.type==='shared-drive'?' · 공유 드라이브':''}`;if(drive.id===connection.drive_id)option.selected=true;select.append(option);}
      const save=button('이 Drive 사용',async()=>{try{save.disabled=true;await request(`/connections/${encodeURIComponent(connection.id)}/select`,{method:'POST',body:JSON.stringify({driveId:select.value})});await refresh();}catch(error){showError(error);}finally{save.disabled=false;}});wrap.append(select,save);
    }catch(error){wrap.textContent='';showError(error);}
  }
  async function bootstrap(connection,trigger){if(!confirm('선택한 기본 Google Drive에 EKODI 표준 폴더 구조를 생성합니다. 계속할까요?'))return;try{trigger.disabled=true;await request(`/connections/${encodeURIComponent(connection.id)}/bootstrap`,{method:'POST'});await refresh();}catch(error){showError(error);}finally{trigger.disabled=false;}}
  async function disconnect(connection){if(!confirm(`${connection.account_email} 연결을 해제할까요? 파일은 삭제되지 않습니다.`))return;try{await request(`/connections/${encodeURIComponent(connection.id)}`,{method:'DELETE'});await refresh();}catch(error){showError(error);}}

  function summary(container){const cards=[['기본 원본 저장소','Google Workspace Drive'],['보조 저장소','다른 Google 계정 선택 연결'],['웹 배포 파일','Cloudflare R2 필요 시 복제'],['자격증명','AES-GCM 암호화 저장']];const grid=el('div','','storage-summary');for(const [title,copy] of cards){const card=el('div','','storage-card');card.append(el('strong',title),el('span',copy));grid.append(card);}container.append(grid);}
  function renderConnections(container){
    const area=el('div','','storage-connections');if(!(state.connections||[]).length)area.append(el('div','연결된 Google Drive 계정이 없습니다. 위 버튼에서 EKODI Workspace 계정을 먼저 연결하세요.','storage-banner'));
    for(const connection of state.connections||[]){const card=el('article','','storage-connection'),head=el('div','','storage-connection-head');head.append(el('span',connection.role==='primary'?'PRIMARY · EKODI':'SECONDARY · 추가 계정','storage-role'),el('span',connection.status==='ready'?'준비 완료':'설정 중','storage-state'));card.append(head);card.append(el('h3',connection.display_name||connection.account_email),el('div',connection.account_email,'storage-muted'));const meta=el('div','','storage-meta');meta.append(el('span',`Drive: ${connection.drive_name||'선택 전'}`),el('span',`상태: ${connection.status}`));card.append(meta);const controls=el('div','','storage-control-row');controls.append(button(connection.drive_id?'Drive 변경':'Drive 선택',()=>loadDrives(connection,controls)));if(connection.role==='primary'&&connection.drive_root_id){const boot=button(connection.status==='ready'?'폴더 구조 확인/보완':'EKODI 폴더 구축',()=>bootstrap(connection,boot),'primary');controls.append(boot);}controls.append(button('연결 해제',()=>disconnect(connection)));card.append(controls);area.append(card);}container.append(area);
  }
  function renderRoutes(container){const box=el('div','','storage-route-box');box.append(el('h3','EKODI 기본 아카이브 경로'));const grid=el('div','','storage-routes');for(const route of state.routes||[]){const row=el('div','','storage-route');row.append(el('span',route.service_key),el('code',`${route.folder_name}${route.folder_id?' ✓':''}`));grid.append(row);}box.append(grid);container.append(box);}
  function paint(){const section=document.querySelector('#storageAdminPanel');if(!section)return;section.textContent='';const head=el('div','','storage-head'),copy=el('div');copy.append(el('div','EKODI CLOUD ARCHIVE','storage-kicker'),el('h2','Storage'),el('p','원본·문서·영상은 Google Drive에, 웹 서비스용 복제본은 필요할 때 R2에 둡니다.','storage-muted'));const actions=el('div','','storage-actions');actions.append(button('EKODI 기본 Drive 연결',()=>startOAuth('primary'),'primary'),button('다른 Google 계정 추가',()=>startOAuth('secondary')),button('↻ 새로고침',refresh));head.append(copy,actions);section.append(head);const message=el('div',state.configured?`기본 허용 조직: ${state.primaryDomains.join(', ')}`:'Google Drive OAuth Secret 설정이 아직 필요합니다.',`storage-banner ${state.configured?'ok':''}`);message.id='storageMessage';section.append(message);summary(section);renderConnections(section);renderRoutes(section);}
  async function refresh(){const section=document.querySelector('#storageAdminPanel');if(section)section.innerHTML='<div class="storage-loading">Storage 상태를 확인하는 중…</div>';try{state=await request('/status');paint();}catch(error){if(section)section.textContent='';showError(error);}}
  function activate(button,section){document.querySelectorAll('[data-panel]').forEach(panel=>panel.classList.toggle('hidden-panel',panel!==section));document.querySelectorAll('.sidebar .nav').forEach(item=>item.classList.toggle('active',item===button));const title=document.querySelector('#pageTitle');if(title)title.textContent='Storage';document.querySelector('.sidebar')?.classList.remove('open');if(location.hash!=='#storage')history.replaceState(null,'','#storage');refresh();}
  function install(){const nav=document.querySelector('.sidebar nav'),content=document.querySelector('.content');if(!nav||!content)return;let button=nav.querySelector('[data-section="storage"]');if(!button){button=el('button','','nav');button.type='button';button.dataset.section='storage';button.append(document.createTextNode('▣ '),el('span','Storage'));const security=nav.querySelector('[data-section="security"],[data-demand-feature="security"]');if(security)nav.insertBefore(button,security);else nav.append(button);}let section=document.querySelector('#storageAdminPanel');if(!section){section=el('section','','section storage-admin hidden-panel');section.dataset.panel='storage';section.id='storageAdminPanel';content.append(section);}if(!button.dataset.storageBound){button.dataset.storageBound='true';button.addEventListener('click',()=>activate(button,section));}if(location.hash==='#storage')queueMicrotask(()=>activate(button,section));}
  install();window.addEventListener('ekodi-admin-ready',install);window.EKODIStorageAdmin=Object.freeze({refresh});
})();
