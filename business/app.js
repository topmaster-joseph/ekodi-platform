const cfg=window.EKODI_BUSINESS_CONFIG||{};
const $=(id)=>document.getElementById(id);
const SESSION_KEY='ekodi-business-session';
const state={workspaces:[],current:null,metrics:null,liveSnapshot:null,session:null};

function applyConfig(){
  const readiness=Number.isFinite(Number(cfg.readiness))?Math.min(100,Math.max(0,Number(cfg.readiness))):62;
  $('readinessScore').textContent=`${readiness}%`;
  $('readinessBar').style.width=`${readiness}%`;
  if($('modeBadge'))$('modeBadge').textContent=cfg.mode==='production-readonly-mvp'?(cfg.dataEnabled?'LIVE READ-ONLY':'READ-ONLY OPERATIONS'):cfg.mode==='isolated-staging'?'STAGING MODE':'SAFE OPERATIONS';
  syncAuthLink();
}
function syncAuthLink(){
  const link=$('authLink');if(!link)return;
  if(state.session?.accessToken){link.href='#logout';link.textContent=state.session?.user?.email?'Sign out':'Sign out'}
  else{link.href=cfg.authUrl||'https://auth.ekodi.kr/?site=business';link.textContent='Sign in'}
}
function storedSession(){try{const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');return value?.accessToken&&value?.refreshToken?value:null}catch{return null}}
function saveSession(value){state.session=value;sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));syncAuthLink()}
function clearSession(){state.session=null;sessionStorage.removeItem(SESSION_KEY);syncAuthLink()}
function sessionExpiry(value){const explicit=Number(value?.expiresAt||0);if(explicit>0)return explicit;return Math.floor(Date.now()/1000)+Number(value?.expiresIn||3600)}
async function exchangeCentralToken(){
  const params=new URLSearchParams(location.hash.slice(1));const tokenHash=params.get('ekodi_token');if(!tokenHash)return;
  const type=params.get('ekodi_type')||'email';
  const response=await fetch('/api/auth/exchange',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tokenHash,type})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'auth_exchange_failed');
  data.expiresAt=sessionExpiry(data);saveSession(data);history.replaceState(null,'',location.pathname+location.search);
}
async function ensureAccessToken(){
  if(!state.session?.accessToken)return'';
  const now=Math.floor(Date.now()/1000);if(Number(state.session.expiresAt||0)>now+60)return state.session.accessToken;
  const response=await fetch('/api/auth/refresh',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refreshToken:state.session.refreshToken})});
  const data=await response.json();if(!response.ok){clearSession();return''}
  data.expiresAt=sessionExpiry(data);saveSession(data);return data.accessToken;
}
async function authedPost(path,body){
  const token=await ensureAccessToken();if(!token)throw Object.assign(new Error('authentication_required'),{status:401});
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body||{})});
  let data={};try{data=await response.json()}catch{}
  if(response.status===401){clearSession();syncAuthLink()}
  if(!response.ok)throw Object.assign(new Error(data.error||`http_${response.status}`),{status:response.status,data});
  return data;
}

function routeWorkspaceId(){
  const path=location.pathname.replace(/^\/+|\/+$/g,'').toLowerCase();
  if(path)return path;
  const query=new URLSearchParams(location.search).get('workspace');
  return String(query||localStorage.getItem('ekodi-business-workspace')||cfg.defaultWorkspace||'ekodibiz').toLowerCase();
}
function workspaceLabel(workspace){return workspace.classification==='internal'?'EKODI INTERNAL':'EXTERNAL CLIENT'}
function statusClass(status){return status==='available'?'live':status==='next'?'stage':'plan'}
function dataText(value,formatter){return value==null?'—':formatter?formatter(value):String(value)}
function money(n){return new Intl.NumberFormat('ko-KR',{style:'currency',currency:'KRW',maximumFractionDigits:0}).format(Number(n||0))}

function renderWorkspaceSelector(){
  const select=$('workspaceSelect');select.replaceChildren();
  state.workspaces.forEach(workspace=>{const option=document.createElement('option');option.value=workspace.id;option.textContent=workspace.name;select.append(option)});
  if(state.current)select.value=state.current.id;
}
function effectiveModules(workspace,snapshot){
  return(workspace.modules||[]).map(module=>{
    if(module.code==='CRM'&&snapshot?.sources?.salesConnected)return{...module,status:'available',statusLabel:'주문행동 집계 연결'};
    if(module.code==='SAL'&&snapshot?.sources?.salesConnected)return{...module,status:'available',statusLabel:'orders 실데이터 연결'};
    if(module.code==='FIN'&&snapshot?.finance?.connected)return{...module,status:'available',statusLabel:'재무 집계 연결'};
    if(module.code==='RPT'&&snapshot)return{...module,status:'available',statusLabel:'실데이터 브리핑 연결'};
    return module;
  })
}
function renderModules(modules=[]){
  const host=$('moduleGrid');host.replaceChildren();
  modules.forEach(module=>{
    const card=document.createElement(module.href?'a':'article');card.className=`module ${statusClass(module.status)}`;
    if(module.href){card.href=module.href;card.target='_self'}
    const code=document.createElement('span');code.className='module-code';code.textContent=module.code;
    const strong=document.createElement('strong');strong.textContent=module.name;
    const p=document.createElement('p');p.textContent=module.description;
    const small=document.createElement('small');small.textContent=module.statusLabel;
    card.append(code,strong,p,small);host.append(card);
  });
}
function renderMetrics(metrics={}){
  $('salesValue').textContent=dataText(metrics.sales,money);
  $('salesDelta').textContent=metrics.sales==null?'로그인 후 읽기 전용 매출 연결':metrics.salesDelta==null?'지난주 비교 데이터 없음':`지난주 같은 요일 대비 ${metrics.salesDelta>=0?'+':''}${metrics.salesDelta}%`;
  $('customerValue').textContent=dataText(metrics.customers);
  $('customerMeta').textContent=metrics.customers==null?'고객 행동 집계 연결 대기':`신규 ${metrics.newCustomers??0}`;
  $('repeatValue').textContent=metrics.repeatRate==null?'—':`${metrics.repeatRate}%`;
  $('repeatMeta').textContent=metrics.sales==null?'재방문 지표 연결 대기':metrics.repeatRate==null?'반복 주문 표본 부족':`목표 ${metrics.targetRepeatRate??45}%`;
  $('actionValue').textContent=dataText(metrics.openActions);
  $('actionMeta').textContent=metrics.openActions==null?'승인함 연결 대기':`승인 필요 ${metrics.pendingApprovals??0}`;
}
function dataNoticeText(workspace,snapshot,error){
  if(!cfg.dataEnabled)return'격리 스테이징입니다. 운영 DB 연결과 외부 실행은 비활성화되어 있습니다.';
  if(!state.session)return'Google 인증 후 이 워크스페이스의 실제 집계 데이터를 읽습니다. 고객 이름·전화번호는 Business OS로 노출하지 않습니다.';
  if(error?.status===403)return`${workspace.name} 워크스페이스의 데이터 권한이 없습니다. 에코디 통합인증의 조직·점포 권한을 확인하세요.`;
  if(error)return'실데이터 집계 API를 읽지 못했습니다. 외부 실행은 계속 차단되어 있습니다.';
  if(snapshot){
    const parts=['실데이터 연결','orders 읽기 전용','고객 PII 미노출'];
    parts.push(snapshot.marketing?.connected?'Marketing 집계 연결':'Marketing 집계 대기');
    parts.push(snapshot.finance?.connected?'Finance 집계 연결':'Finance 집계 대기');
    return parts.join(' · ');
  }
  return workspace.dataMessage||'운영 데이터를 연결하고 있습니다.';
}
async function loadLiveSnapshot(workspaceId){
  if(!cfg.dataEnabled||!state.session)return{snapshot:null,error:null};
  try{return{snapshot:await authedPost('/api/snapshot',{workspace:workspaceId}),error:null}}
  catch(error){console.error('Business OS snapshot',error);return{snapshot:null,error}}
}
function renderWorkspace(payload,snapshot=null,error=null){
  const workspace=payload.workspace;state.current=workspace;state.liveSnapshot=snapshot;
  state.metrics=snapshot?{...(snapshot.metrics||{}),marketing:snapshot.marketing||{},operations:snapshot.operations||{},finance:snapshot.finance||{}}:(payload.metrics||{});
  localStorage.setItem('ekodi-business-workspace',workspace.id);document.title=`${workspace.name} · EKODI Business OS`;
  $('workspaceName').textContent=workspace.name;$('workspaceEnglish').textContent=workspace.englishName;$('workspaceKind').textContent=workspaceLabel(workspace);$('heroCopy').textContent=workspace.description;
  $('dataNotice').textContent=dataNoticeText(workspace,snapshot,error);
  $('publicLink').href=workspace.publicUrl;$('publicLink').textContent=workspace.scope==='store'?'전용 AI':'에코디비즈';$('marketingLink').href=workspace.marketingUrl;
  renderWorkspaceSelector();renderMetrics(state.metrics);renderModules(effectiveModules(workspace,snapshot));refreshBrief();
}

function fallbackBrief(){
  const name=state.current?.name||'현재 워크스페이스';
  if(cfg.dataEnabled&&!state.session)return[{title:`${name} 실데이터는 로그인 후 읽습니다.`,body:'Google 통합인증을 거치면 권한 범위 안의 주문·고객행동·승인함 집계만 불러옵니다. 개인정보 원문과 외부 실행 권한은 가져오지 않습니다.'}];
  return[{title:`${name} 데이터 연결 상태를 먼저 확인하세요.`,body:state.current?.dataMessage||'아직 Business OS 집계 API에 운영 데이터가 연결되지 않았습니다.'}];
}
function renderBrief(items,meta='connection-readiness'){
  const list=$('briefList');list.replaceChildren();
  items.slice(0,4).forEach((item,index)=>{const li=document.createElement('li');const n=document.createElement('span');n.textContent=String(index+1).padStart(2,'0');const body=document.createElement('div');const strong=document.createElement('strong');strong.textContent=item.title;const p=document.createElement('p');p.textContent=item.body;body.append(strong,p);li.append(n,body);list.append(li)});
  $('briefMeta').textContent=`분석 모드: ${meta} · ${state.current?.name||'workspace'} · ${new Date().toLocaleString('ko-KR')}`;
}
async function refreshBrief(){
  const button=$('refreshBrief');button.disabled=true;button.textContent='분석 중';
  if(!state.liveSnapshot){renderBrief(fallbackBrief(),state.session?'connection-readiness':'login-required');button.disabled=false;button.textContent='다시 분석';return}
  try{
    const response=await fetch('/api/brief',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspace:state.current?.id,metrics:state.metrics})});
    if(!response.ok)throw new Error(`brief_${response.status}`);const data=await response.json();renderBrief(data.priorities||fallbackBrief(),data.mode||'rules');
  }catch{renderBrief(fallbackBrief(),'browser fallback')}
  finally{button.disabled=false;button.textContent='다시 분석'}
}
function resultText(data){
  if(data.decision==='blocked')return`자동 실행 불가 · ${data.message||data.reason}`;
  if(data.decision==='human_review')return`사람 승인 필요 · ${data.message||data.reason}`;
  if(data.decision==='draft_only')return`AI 초안 허용 · ${data.message||data.reason}`;
  return`${data.decision||'확인'} · ${data.message||data.reason||''}`;
}
async function checkAction(){
  const result=$('actionResult');const action=$('actionSelect').value;result.className='action-result';result.textContent='정책을 확인하고 있습니다.';
  try{const response=await fetch('/api/action-check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,workspace:state.current?.id,requestedBy:'human'})});const data=await response.json();const cls=data.decision==='blocked'?'blocked':data.decision==='human_review'?'review':'allowed';result.className=`action-result ${cls}`;result.textContent=resultText(data)}
  catch{result.className='action-result blocked';result.textContent='정책 확인 API에 연결하지 못했습니다. 실행은 보류합니다.'}
}
async function selectWorkspace(id,{push=true}={}){
  const workspace=state.workspaces.find(item=>item.id===id)||state.workspaces[0];if(!workspace)return;
  if(push&&location.pathname!==`/${workspace.id}`)history.pushState({workspace:workspace.id},'',`/${workspace.id}`);
  const response=await fetch(`/api/workspace/${encodeURIComponent(workspace.id)}`,{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`workspace_${response.status}`);
  const payload=await response.json();const live=await loadLiveSnapshot(workspace.id);renderWorkspace(payload,live.snapshot,live.error);
}
async function logout(){clearSession();await selectWorkspace(state.current?.id||cfg.defaultWorkspace||'ekodibiz',{push:false})}
async function boot(){
  state.session=storedSession();applyConfig();
  try{await exchangeCentralToken()}catch(error){console.error(error);clearSession();$('dataNotice').textContent='통합인증 token을 Business OS 세션으로 바꾸지 못했습니다. 다시 로그인해 주세요.'}
  syncAuthLink();
  try{const response=await fetch('/api/workspaces',{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`workspaces_${response.status}`);const data=await response.json();state.workspaces=data.workspaces||[];const requested=routeWorkspaceId();const target=state.workspaces.some(item=>item.id===requested)?requested:(data.defaultWorkspace||state.workspaces[0]?.id);await selectWorkspace(target,{push:false})}
  catch(error){console.error(error);$('dataNotice').textContent='Business OS 워크스페이스 구성을 불러오지 못했습니다. 민감한 실행은 계속 차단됩니다.';renderBrief(fallbackBrief(),'safe fallback')}
}

$('workspaceSelect').addEventListener('change',event=>selectWorkspace(event.target.value));
$('refreshBrief').addEventListener('click',refreshBrief);$('checkAction').addEventListener('click',checkAction);
$('authLink').addEventListener('click',event=>{if(state.session?.accessToken){event.preventDefault();logout()}});
window.addEventListener('popstate',()=>selectWorkspace(routeWorkspaceId(),{push:false}).catch(console.error));
boot();