const cfg=window.EKODI_BUSINESS_CONFIG||{};
const $=(id)=>document.getElementById(id);
const state={workspaces:[],current:null,metrics:null};

function applyConfig(){
  if(cfg.authUrl&&$('authLink'))$('authLink').href=cfg.authUrl;
  const readiness=Number.isFinite(Number(cfg.readiness))?Math.min(100,Math.max(0,Number(cfg.readiness))):62;
  $('readinessScore').textContent=`${readiness}%`;
  $('readinessBar').style.width=`${readiness}%`;
  if($('modeBadge'))$('modeBadge').textContent=cfg.mode==='production-readonly-mvp'?'READ-ONLY OPERATIONS':cfg.mode==='isolated-staging'?'STAGING MODE':'SAFE OPERATIONS';
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
function money(n){return new Intl.NumberFormat('ko-KR',{style:'currency',currency:'KRW',maximumFractionDigits:0}).format(n)}

function renderWorkspaceSelector(){
  const select=$('workspaceSelect');
  select.replaceChildren();
  state.workspaces.forEach(workspace=>{
    const option=document.createElement('option');
    option.value=workspace.id;option.textContent=workspace.name;
    select.append(option);
  });
  if(state.current)select.value=state.current.id;
}

function renderModules(modules=[]){
  const host=$('moduleGrid');host.replaceChildren();
  modules.forEach(module=>{
    const card=document.createElement(module.href?'a':'article');
    card.className=`module ${statusClass(module.status)}`;
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
  $('salesDelta').textContent=metrics.salesDelta==null?'읽기 전용 매출 데이터 연결 대기':`비교 기준 대비 ${metrics.salesDelta>=0?'+':''}${metrics.salesDelta}%`;
  $('customerValue').textContent=dataText(metrics.customers);
  $('customerMeta').textContent=metrics.customers==null?'고객 원장 연결 대기':`신규 ${metrics.newCustomers??'—'}`;
  $('repeatValue').textContent=metrics.repeatRate==null?'—':`${metrics.repeatRate}%`;
  $('repeatMeta').textContent=metrics.repeatRate==null?'재방문 지표 연결 대기':`목표 ${metrics.targetRepeatRate??'—'}%`;
  $('actionValue').textContent=dataText(metrics.openActions);
  $('actionMeta').textContent=metrics.openActions==null?'승인함·실행이력 연결 대기':`승인 필요 ${metrics.pendingApprovals??0}`;
}

function renderWorkspace(payload){
  const workspace=payload.workspace;state.current=workspace;state.metrics=payload.metrics||{};
  localStorage.setItem('ekodi-business-workspace',workspace.id);
  document.title=`${workspace.name} · EKODI Business OS`;
  $('workspaceName').textContent=workspace.name;
  $('workspaceEnglish').textContent=workspace.englishName;
  $('workspaceKind').textContent=workspaceLabel(workspace);
  $('heroCopy').textContent=workspace.description;
  $('dataNotice').textContent=payload.dataMessage||workspace.dataMessage||'운영 데이터를 연결하고 있습니다.';
  $('publicLink').href=workspace.publicUrl;$('publicLink').textContent=workspace.scope==='store'?'전용 AI':'에코디비즈';
  $('marketingLink').href=workspace.marketingUrl;
  renderWorkspaceSelector();renderMetrics(state.metrics);renderModules(workspace.modules||[]);
  refreshBrief();
}

function fallbackBrief(){
  const name=state.current?.name||'현재 워크스페이스';
  return[{title:`${name} 데이터 연결 상태를 먼저 확인하세요.`,body:state.current?.dataMessage||'아직 Business OS 집계 API에 운영 데이터가 연결되지 않았습니다.'}];
}

function renderBrief(items,meta='connection-readiness'){
  const list=$('briefList');list.replaceChildren();
  items.slice(0,4).forEach((item,index)=>{
    const li=document.createElement('li');const n=document.createElement('span');n.textContent=String(index+1).padStart(2,'0');
    const body=document.createElement('div');const strong=document.createElement('strong');strong.textContent=item.title;
    const p=document.createElement('p');p.textContent=item.body;body.append(strong,p);li.append(n,body);list.append(li);
  });
  $('briefMeta').textContent=`분석 모드: ${meta} · ${state.current?.name||'workspace'} · ${new Date().toLocaleString('ko-KR')}`;
}

async function refreshBrief(){
  const button=$('refreshBrief');button.disabled=true;button.textContent='분석 중';
  try{
    const response=await fetch('/api/brief',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspace:state.current?.id,metrics:state.metrics})});
    if(!response.ok)throw new Error(`brief_${response.status}`);
    const data=await response.json();renderBrief(data.priorities||fallbackBrief(),data.mode||'rules');
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
  const result=$('actionResult');const action=$('actionSelect').value;
  result.className='action-result';result.textContent='정책을 확인하고 있습니다.';
  try{
    const response=await fetch('/api/action-check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,workspace:state.current?.id,requestedBy:'human'})});
    const data=await response.json();const cls=data.decision==='blocked'?'blocked':data.decision==='human_review'?'review':'allowed';
    result.className=`action-result ${cls}`;result.textContent=resultText(data);
  }catch{result.className='action-result blocked';result.textContent='정책 확인 API에 연결하지 못했습니다. 실행은 보류합니다.'}
}

async function selectWorkspace(id,{push=true}={}){
  const workspace=state.workspaces.find(item=>item.id===id)||state.workspaces[0];if(!workspace)return;
  if(push&&location.pathname!==`/${workspace.id}`)history.pushState({workspace:workspace.id},'',`/${workspace.id}`);
  const response=await fetch(`/api/workspace/${encodeURIComponent(workspace.id)}`,{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`workspace_${response.status}`);
  renderWorkspace(await response.json());
}

async function boot(){
  applyConfig();
  try{
    const response=await fetch('/api/workspaces',{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`workspaces_${response.status}`);
    const data=await response.json();state.workspaces=data.workspaces||[];
    const requested=routeWorkspaceId();const target=state.workspaces.some(item=>item.id===requested)?requested:(data.defaultWorkspace||state.workspaces[0]?.id);
    await selectWorkspace(target,{push:false});
  }catch(error){
    console.error(error);$('dataNotice').textContent='Business OS 워크스페이스 구성을 불러오지 못했습니다. 민감한 실행은 계속 차단됩니다.';renderBrief(fallbackBrief(),'safe fallback');
  }
}

$('workspaceSelect').addEventListener('change',event=>selectWorkspace(event.target.value));
$('refreshBrief').addEventListener('click',refreshBrief);
$('checkAction').addEventListener('click',checkAction);
window.addEventListener('popstate',()=>selectWorkspace(routeWorkspaceId(),{push:false}).catch(console.error));
boot();