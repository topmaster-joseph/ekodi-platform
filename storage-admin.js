(() => {
  'use strict';
  const API='/storage/api/control/storage/google';
  const TOKEN_KEY='ekodi-auth-token';
  const LOCALE_KEY='ekodi-admin-locale';
  const GOOGLE_ACCOUNT_BY_ROLE=Object.freeze({primary:'joseph@ekodi.kr',secondary:'topmaster.joseph@gmail.com'});
  const AUTO_RECONNECT_KEY='ekodi-storage-auto-reconnect-at';
  const AUTO_RECONNECT_COOLDOWN_MS=5*60*1000;
  let state=null;
  let autoReconnectInFlight=false;

  function el(tag,text='',className=''){const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;}
  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||'';}catch{return '';}}
  function locale(){try{return String(window.EKODIAdminSidebar?.locale?.()||localStorage.getItem(LOCALE_KEY)||document.documentElement.lang||navigator.language||'ko').toLowerCase().startsWith('en')?'en':'ko';}catch{return 'ko';}}
  function t(ko,en){return locale()==='en'?en:ko;}
  function statusText(connection){if(connection.status==='ready')return t('준비 완료','Ready');if(connection.status==='connected'&&!connection.drive_id)return t('Drive 선택 필요','Select a Drive');if(connection.status==='connected')return t('연결됨','Connected');return t('설정 확인','Check setup');}
  function autoReconnectAllowed(){try{const last=Number(sessionStorage.getItem(AUTO_RECONNECT_KEY)||0);return !last||Date.now()-last>AUTO_RECONNECT_COOLDOWN_MS;}catch{return true;}}
  function markAutoReconnect(){try{sessionStorage.setItem(AUTO_RECONNECT_KEY,String(Date.now()));}catch{}}
  function clearAutoReconnect(){try{sessionStorage.removeItem(AUTO_RECONNECT_KEY);}catch{}}
  async function request(path,options={}){const {skipAutoReconnect=false,...fetchOptions}=options;const headers=new Headers(fetchOptions.headers||{});headers.set('authorization',`Bearer ${token()}`);if(fetchOptions.body&&!headers.has('content-type'))headers.set('content-type','application/json');const response=await fetch(`${API}${path}`,{cache:'no-store',credentials:'same-origin',...fetchOptions,headers});const data=await response.json().catch(()=>({}));if(!response.ok){if(data.code==='GOOGLE_REAUTH_REQUIRED'&&!skipAutoReconnect&&autoReconnectAllowed()&&!autoReconnectInFlight){markAutoReconnect();autoReconnectInFlight=true;await startOAuth(data.reconnectRole||'primary',{automatic:true});return new Promise(()=>{});}const error=new Error(data.error||t(`저장소 API 오류 (${response.status})`,`Storage API error (${response.status})`));error.code=data.code||'';throw error;}if(path!=='/oauth/start')clearAutoReconnect();return data;}
  function button(text,handler,className='secondary'){const node=el('button',text,className);node.type='button';node.addEventListener('click',handler);return node;}
  function showError(error){const section=document.querySelector('#storageAdminPanel');if(!section)return;let box=document.querySelector('#storageMessage');if(!box){box=el('div','','storage-banner');box.id='storageMessage';section.prepend(box);}box.className='storage-banner';const raw=String(error?.message||error||'');const network=error instanceof TypeError||/failed to fetch|networkerror|load failed/i.test(raw);box.textContent=network?t('저장소 연결을 확인할 수 없습니다. 잠시 후 새로고침해 주세요.','Unable to reach the storage service. Please refresh shortly.'):raw||t('처리 중 오류가 발생했습니다.','An error occurred.');}

  function accountHintedAuthorizeUrl(authorizeUrl,role,accountHint=''){const target=new URL(authorizeUrl,location.href);const account=accountHint||GOOGLE_ACCOUNT_BY_ROLE[role];if(account)target.searchParams.set('login_hint',account);const prompts=(target.searchParams.get('prompt')||'').split(/\s+/).filter(Boolean).filter(value=>value!=='select_account');if(prompts.length)target.searchParams.set('prompt',prompts.join(' '));else target.searchParams.delete('prompt');return target.toString();}
  function currentAdminReturnPath(){return `${location.pathname}${location.search}${location.hash}`;}
  async function startOAuth(role,{automatic=false,accountHint=''}={}){try{const result=await request('/oauth/start',{method:'POST',body:JSON.stringify({role,accountHint,returnTo:currentAdminReturnPath()}),skipAutoReconnect:true});location.assign(accountHintedAuthorizeUrl(result.authorizeUrl,role,accountHint));}catch(error){autoReconnectInFlight=false;if(automatic)markAutoReconnect();showError(error);}}
  async function loadDrives(connection,wrap){wrap.textContent=t('Drive 목록을 불러오는 중…','Loading Drive list…');try{const result=await request(`/connections/${encodeURIComponent(connection.id)}/drives`);wrap.textContent='';const select=document.createElement('select');select.setAttribute('aria-label',t('Google Drive 선택','Select Google Drive'));for(const drive of result.drives||[]){const option=document.createElement('option');option.value=drive.id;option.textContent=`${drive.name}${drive.type==='shared-drive'?t(' · 공유 드라이브',' · Shared Drive'):''}`;if(drive.id===connection.drive_id)option.selected=true;select.append(option);}const save=button(t('이 Drive 사용','Use this Drive'),async()=>{try{save.disabled=true;await request(`/connections/${encodeURIComponent(connection.id)}/select`,{method:'POST',body:JSON.stringify({driveId:select.value})});await refresh();}catch(error){showError(error);}finally{save.disabled=false;}},'primary');wrap.append(select,save);}catch(error){wrap.textContent='';showError(error);}}
  async function bootstrap(connection,trigger){if(!confirm(t('선택한 기본 Google Drive에 표준 폴더 구조를 생성합니다. 계속할까요?','Create the standard folder structure in the selected primary Google Drive?')))return;try{trigger.disabled=true;await request(`/connections/${encodeURIComponent(connection.id)}/bootstrap`,{method:'POST'});await refresh();}catch(error){showError(error);}finally{trigger.disabled=false;}}
  async function disconnect(connection){if(!confirm(t(`${connection.account_email} 연결을 해제할까요? 파일은 삭제되지 않습니다.`,`Disconnect ${connection.account_email}? Files will not be deleted.`)))return;try{await request(`/connections/${encodeURIComponent(connection.id)}`,{method:'DELETE'});await refresh();}catch(error){showError(error);}}

  function summary(container){const cards=locale()==='en'?[['Original files','Google Workspace Drive'],['Extra account','Optional secondary Google Drive'],['Web files','Copy to Cloudflare R2 only when needed'],['Security','Credentials encrypted with AES-GCM']]:[['원본 파일','Google Workspace Drive'],['추가 계정','필요할 때 보조 Google Drive 연결'],['웹 배포 파일','필요한 파일만 Cloudflare R2로 복제'],['보안','연결 정보 AES-GCM 암호화 저장']];const grid=el('div','','storage-summary');for(const [title,copy] of cards){const card=el('div','','storage-card');card.append(el('strong',title),el('span',copy));grid.append(card);}container.append(grid);}
  function renderConnections(container){const area=el('div','','storage-connections');if(!(state.connections||[]).length)area.append(el('div',t('연결된 Google Drive가 없습니다. 위 버튼에서 기본 계정을 먼저 연결하세요.','No Google Drive is connected. Connect the primary account first.'),'storage-banner'));for(const connection of state.connections||[]){const card=el('article','','storage-connection'),head=el('div','','storage-connection-head');head.append(el('span',connection.role==='primary'?t('기본 계정','PRIMARY'):t('추가 계정','SECONDARY'),'storage-role'),el('span',statusText(connection),'storage-state'));card.append(head);card.append(el('h3',connection.display_name||connection.account_email),el('div',connection.account_email,'storage-muted'));const meta=el('div','','storage-meta');meta.append(el('span',`${t('사용 Drive','Drive')}: ${connection.drive_name||t('아직 선택하지 않음','Not selected')}`),el('span',`${t('연결 상태','Connection')}: ${connection.status==='ready'?t('정상','Ready'):connection.status==='connected'?t('연결됨 · 폴더 확인 필요','Connected · setup pending'):t('확인 필요','Needs attention')}`));card.append(meta);const controls=el('div','','storage-control-row');controls.append(button(connection.drive_id?t('Drive 변경','Change Drive'):t('Drive 선택','Select Drive'),()=>loadDrives(connection,controls)));if(connection.role==='primary'&&connection.drive_root_id){const boot=button(connection.status==='ready'?t('폴더 확인·보완','Check folders'):t('표준 폴더 만들기','Build folders'),()=>bootstrap(connection,boot),'primary');controls.append(boot);}controls.append(button(t('연결 해제','Disconnect'),()=>disconnect(connection)));card.append(controls);area.append(card);}container.append(area);}
  function renderSharedDriveAccounts(container){
    const approved=state.approvedSharedDriveAccounts||[];
    if(!approved.length)return;
    const box=el('section','','storage-route-box');
    box.append(el('h3',t('EKODI 기본 공유드라이브 이용 허용 계정','Approved EKODI Shared Drive accounts')));
    box.append(el('p',t('대표 관리 계정은 joseph@ekodi.kr입니다. Google 공유드라이브 회원 권한과 플랫폼 계정 연결은 별도로 확인합니다.',
      'The primary steward remains joseph@ekodi.kr. Google membership and application OAuth are distinct.'),'storage-muted'));
    const area=el('div','','storage-connections');
    for(const entry of approved){
      const card=el('article','','storage-connection');
      card.append(el('strong',entry.email),
        el('div',entry.platformRole==='canonical_steward'?t('대표 관리 계정','Primary steward'):t('추가 이용 허용 계정','Approved collaborator'),'storage-muted'));
      card.append(el('div',entry.platformConnection==='not_connected'?
        t('플랫폼 Google 연결 필요 (공유드라이브 회원 권한과 별개)','Google OAuth connection pending (separate from Drive membership)'):
        t('플랫폼 Google 연결: '+entry.platformConnection,'Platform OAuth: '+entry.platformConnection),'storage-muted'));
      if(entry.platformRole!=='canonical_steward')
        card.append(button(t('이 계정으로 연결','Connect this account'),()=>startOAuth('secondary',{accountHint:entry.email})));
      area.append(card);
    }
    box.append(area);container.append(box);
  }
  function renderRoutes(container){const box=el('div','','storage-route-box');box.append(el('h3',t('기본 폴더 구조','Default folder structure')));const grid=el('div','','storage-routes');for(const route of state.routes||[]){const row=el('div','','storage-route');row.append(el('span',route.service_key),el('code',`${route.folder_name}${route.folder_id?' ✓':''}`));grid.append(row);}box.append(grid);container.append(box);}
  function paint(){const section=document.querySelector('#storageAdminPanel');if(!section)return;section.textContent='';const head=el('div','','storage-head'),copy=el('div');copy.append(el('div',t('저장 아카이브','CLOUD ARCHIVE'),'storage-kicker'),el('h2',t('저장소','Storage')),el('p',t('원본은 Google Drive에 보관하고, 웹 서비스에 필요한 파일만 R2로 복제합니다.','Keep originals in Google Drive and replicate only web-ready files to R2.'),'storage-muted'));const actions=el('div','','storage-actions');actions.append(button(t('기본 Drive 연결','Connect primary Drive'),()=>startOAuth('primary'),'primary'),button(t('추가 계정 연결','Add account'),()=>startOAuth('secondary')),button(t('새로고침','Refresh'),refresh));head.append(copy,actions);section.append(head);const message=el('div',state.configured?t(`허용 조직: ${state.primaryDomains.join(', ')}`,`Allowed domains: ${state.primaryDomains.join(', ')}`):t('Google Drive 연결 설정이 더 필요합니다.','Google Drive connection setup is incomplete.'),`storage-banner ${state.configured?'ok':''}`);message.id='storageMessage';section.append(message);
    if(state.primaryAccountEmail){
      const verified=state.primaryAccountMatched===true;
      const accountMessage=el('div',verified?
        t(`기본 관리 계정 확인: ${state.primaryAccountEmail}`,`Primary Workspace account verified: ${state.primaryAccountEmail}`):
        t(`기본 관리 계정 재연결 필요: ${state.primaryAccountEmail}. 개인 Google 계정을 기본 저장소로 사용하지 마세요.`,
          `Reconnect the primary Workspace account: ${state.primaryAccountEmail}. Do not use a personal account as primary storage.`),
        `storage-banner ${verified?'ok':''}`);
      section.append(accountMessage);
    }
    summary(section);renderSharedDriveAccounts(section);renderConnections(section);renderRoutes(section);}
  async function refresh(){const section=document.querySelector('#storageAdminPanel');if(section)section.innerHTML=`<div class="storage-loading">${t('저장소 상태를 확인하는 중…','Checking storage status…')}</div>`;try{state=await request('/status');paint();}catch(error){if(section)section.textContent='';showError(error);}}
  function activate(button,section){document.querySelectorAll('[data-panel]').forEach(panel=>panel.classList.toggle('hidden-panel',panel!==section));document.querySelectorAll('.sidebar .nav').forEach(item=>item.classList.toggle('active',item===button));const title=document.querySelector('#pageTitle');if(title)title.textContent=t('저장소','Storage');document.querySelector('.sidebar')?.classList.remove('open');if(location.hash!=='#storage')history.replaceState(null,'','#storage');refresh();}
  function install(){const nav=document.querySelector('.sidebar nav'),content=document.querySelector('.content');if(!nav||!content)return;let button=nav.querySelector('[data-section="storage"]');if(!button){button=el('button','','nav');button.type='button';button.dataset.section='storage';button.append(document.createTextNode('▣ '),el('span',t('저장소','Storage')));const security=nav.querySelector('[data-section="security"],[data-demand-feature="security"]');if(security)nav.insertBefore(button,security);else nav.append(button);}let section=document.querySelector('#storageAdminPanel');if(!section){section=el('section','','section storage-admin hidden-panel');section.dataset.panel='storage';section.id='storageAdminPanel';content.append(section);}if(!button.dataset.storageBound){button.dataset.storageBound='true';button.addEventListener('click',()=>activate(button,section));}if(location.hash==='#storage')queueMicrotask(()=>activate(button,section));}
  function refreshWhenSharedNavigationActivates(event){
    const current=String(event?.detail?.section||window.EKODIAdminPanels?.current?.()||'').trim();
    if(current!=='storage')return;
    const section=document.querySelector('#storageAdminPanel');
    if(!section||section.hidden||section.classList.contains('hidden-panel'))return;
    void refresh();
  }
  install();window.addEventListener('ekodi-admin-ready',install);window.addEventListener('ekodi-admin-locale-changed',()=>{if(document.querySelector('#storageAdminPanel:not(.hidden-panel)'))paint();window.EKODIAdminSidebar?.sync?.();});window.addEventListener('ekodi-admin-section-changed',refreshWhenSharedNavigationActivates);
  queueMicrotask(()=>refreshWhenSharedNavigationActivates());
  window.EKODIStorageAdmin=Object.freeze({refresh,activate:()=>refreshWhenSharedNavigationActivates({detail:{section:'storage'}})});
})();
