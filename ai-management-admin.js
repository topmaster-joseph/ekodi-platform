(() => {
'use strict';
const SECTION='ai-settings';
const SETTINGS='/api/control/ai/v8/collaboration-settings';
const RUNTIME='/api/control/common-services/ai/status';
const RESOURCE_LABELS={
  'personal-subscription':['개인 AI 구독','ChatGPT · Claude · Gemini 공식 클라이언트'],
  'personal-api':['개인 API','개인 비용 BYOK · 서버 Secret/Vault'],
  'ekodi-shared-api':['EKODI 공용 API','예산 확보 후 중앙 비용으로 운영'],
  'hosted-ai':['Hosted AI','Cloud GPU + Open Model · 필요 시 사용'],
  'core-only':['EKODI Core','AI 없이 규칙·실행·복구로 처리'],
};
const PROVIDER_WEIGHT_LABELS={taskFit:'업무 적합도',reliability:'신뢰도',cost:'비용',latency:'속도',health:'최근 상태',load:'부하',quality:'품질'};
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(ko,en)=>window.EKODIAdminMenu?.locale?.()==='en'?en:ko;
let snapshot=null,runtime=null,audit=[];
async function request(path,options={}){
  if(typeof window.EKODIAdminCore?.request==='function')return window.EKODIAdminCore.request(path,options);
  const token=sessionStorage.getItem('ekodi-auth-token')||'';
  const headers={...(options.headers||{}),...(token?{authorization:`Bearer ${token}`}:{})};
  const response=await fetch(`https://ekodi.kr${path}`,{...options,headers,cache:'no-store'});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||data.code||`API ${response.status}`);return data;
}
function poolKey(resource){return({'personal-subscription':'personalSubscription','personal-api':'personalApi','ekodi-shared-api':'ekodiSharedApi','hosted-ai':'hostedAi','core-only':'coreOnly'})[resource]}
function statusFor(resource){
  const status=snapshot?.resourceStatus||{};
  if(resource==='personal-subscription')return t('공식 클라이언트 노드','Official client nodes');
  if(resource==='personal-api'){const a=status.personalApis||{};const count=[a.openai,a.anthropic,a.gemini].filter(Boolean).length;return `${count}/3 API ${t('연결','connected')}`;}
  if(resource==='ekodi-shared-api')return status.ekodiSharedApi?.configured?t('연결됨','Connected'):t('미연결','Not connected');
  if(resource==='hosted-ai')return status.hostedAi?.configured?t('연결됨','Connected'):t('미연결','Not connected');
  return t('항상 사용 가능','Always available');
}
function resourceCards(order=[]){const pools=snapshot?.policy?.resources?.pools||{};return order.map((resource,index)=>{const [name,desc]=RESOURCE_LABELS[resource]||[resource,''];const pool=pools[poolKey(resource)]||{};const editable=['ekodi-shared-api','hosted-ai'].includes(resource);return `<article class="ai-mgmt-resource"><div class="ai-mgmt-rank">${index+1}</div><div><strong>${esc(name)}</strong><p>${esc(desc)}</p><small>${esc(statusFor(resource))}</small></div><label class="ai-mgmt-switch">${editable?`<input type="checkbox" data-resource-toggle="${esc(resource)}" ${pool.enabled?'checked':''}>`:'<span class="locked">LOCK</span>'}<span>${pool.enabled?t('사용','ON'):t('대기','OFF')}</span></label></article>`}).join('')}
function weightRows(weights={}){return Object.entries(weights).map(([key,value])=>`<span><b>${esc(key)}</b><strong>${esc(value)}%</strong></span>`).join('')}
function providerWeightRows(weights={}){return Object.entries(PROVIDER_WEIGHT_LABELS).map(([key,label])=>`<label><span>${esc(label)}</span><input type="number" min="0" max="100" step="1" data-provider-weight="${key}" value="${Math.round((Number(weights[key])||0)*100)}"><small>${esc(key)}</small></label>`).join('')}
function successRate(metric){const total=Number(metric?.totalRuns)||0;return total?`${Math.round((Number(metric.successfulRuns)||0)/total*100)}%`:t('기록 없음','No history')}
function providerRows(){const providers=runtime?.providers||[];if(!providers.length)return `<p class="ai-mgmt-empty">${t('공급자 상태 정보가 없습니다.','No provider status available.')}</p>`;return `<div class="ai-mgmt-provider-table"><div class="ai-mgmt-provider-head"><span>${t('공급자','Provider')}</span><span>${t('상태','Status')}</span><span>${t('모델','Model')}</span><span>${t('비용','Cost')}</span><span>${t('성공률','Success')}</span><span>${t('평균응답','Latency')}</span></div>${providers.map(provider=>{const m=provider.routerMetrics||{};const state=provider.routingEnabled===false?t('정책 제외','Policy off'):provider.available?t('사용 가능','Ready'):t('미연결','Not connected');return `<div class="ai-mgmt-provider-row"><span><strong>${esc(provider.id)}</strong><small>${esc(provider.kind||'')}</small></span><span>${esc(state)}</span><span>${esc(provider.model||'-')}</span><span>${esc(provider.costClass||'-')}</span><span>${esc(successRate(m))}</span><span>${m.averageLatencyMs!=null?esc(Math.round(m.averageLatencyMs)+' ms'):'-'}</span></div>`}).join('')}</div>`}
function roleRows(policy){return Object.entries(policy?.openai?.roles||{}).map(([name,role])=>`<div class="ai-mgmt-role" data-ai-role="${esc(name)}"><label><input type="checkbox" data-field="enabled" ${role.enabled?'checked':''}> <strong>${esc(name)}</strong></label><select data-field="profile">${['fast','balanced','deep'].map(value=>`<option value="${value}" ${role.profile===value?'selected':''}>${value}</option>`).join('')}</select><span>${esc(role.risk||'read_only')}</span></div>`).join('')}
function learningRows(items=[]){if(!items.length)return `<p class="ai-mgmt-empty">${t('아직 저장된 학습 이벤트가 없습니다.','No learning events recorded yet.')}</p>`;return items.map(item=>`<div class="ai-mgmt-learning"><strong>${esc(item.capability||'general')}</strong><span>${esc(item.outcome)}</span><small>${esc(item.created_at||'')}</small></div>`).join('')}
function auditRows(){if(!audit.length)return `<p class="ai-mgmt-empty">${t('설정 변경 이력이 없습니다.','No settings audit yet.')}</p>`;return audit.slice(0,8).map(item=>`<div class="ai-mgmt-audit"><strong>rev ${esc(item.revision)}</strong><span>${esc(item.action||'update')} · ${esc(item.actor||'admin')}</span><small>${esc(item.created_at||'')}</small></div>`).join('')}
function setMessage(text,error=false){const node=$('#aiManagementMessage');if(!node)return;node.textContent=text||'';node.classList.toggle('error',error)}
function show(){window.EKODIAdminPanels?.activate?.(SECTION)}
function render(){
  const root=$('#aiManagementBody');if(!root||!snapshot)return;
  const policy=snapshot.policy||{},resources=policy.resources||{},core=resources.core||{},resourceRouter=resources.router||{},providerRouter=policy.router||runtime?.routerScorePolicy||{};
  root.innerHTML=`<section class="ai-mgmt-hero"><div><small>PERSONAL-FIRST · EKODI CORE · ORCHESTRATION</small><h2>${t('에코디 AI 관리','EKODI AI Management')}</h2><p>${t('개인구독·개인 API·공용 API·Hosted AI·Core의 사용 순서와 Provider Router Score를 한곳에서 관리합니다.','Manage resource priority and provider Router Score from one control surface.')}</p></div><div class="ai-mgmt-badge">${esc(resources.strategy||'personal-first')}</div></section>`+
  `<section class="ai-mgmt-grid"><article class="ai-mgmt-card wide"><div class="ai-mgmt-card-head"><div><small>INTERACTIVE LANE</small><h3>${t('사람이 함께 있을 때','Human-present work')}</h3></div><span>${t('개인구독 우선','Subscription first')}</span></div><div class="ai-mgmt-resources">${resourceCards(resources.interactiveOrder||[])}</div></article>`+
  `<article class="ai-mgmt-card wide"><div class="ai-mgmt-card-head"><div><small>AUTONOMOUS LANE</small><h3>${t('예약·감시·복구·배포','Scheduled · monitor · recover · deploy')}</h3></div><span>${t('개인 API 우선','Personal API first')}</span></div><div class="ai-mgmt-resources">${resourceCards(resources.autonomousOrder||[])}</div></article>`;
  root.innerHTML+=`<article class="ai-mgmt-card"><div class="ai-mgmt-card-head"><div><small>RESOURCE ROUTER</small><h3>${t('자원 계층 선발','Resource-class routing')}</h3></div><span>HARD GATES</span></div><div class="ai-mgmt-weights">${weightRows(resourceRouter.weights)}</div><p class="ai-mgmt-note">${t('공식 경로·자동화 허용·인증·데이터 정책·권한·예산을 통과한 자원만 다음 단계로 보냅니다.','Only resources passing official-path, automation, auth, data, permission and budget gates continue.')}</p></article>`;
  root.innerHTML+=`<article class="ai-mgmt-card"><div class="ai-mgmt-card-head"><div><small>PROVIDER ROUTER SCORE</small><h3>${t('AI 공급자 동적 배정','Dynamic provider routing')}</h3></div><span>v${esc(runtime?.routerScorePolicy?.version||snapshot.routerScore?.algorithmVersion||'-')}</span></div><div class="ai-mgmt-provider-weights">${providerWeightRows(providerRouter.weights||{})}</div><p class="ai-mgmt-note">${t('입력값은 저장 시 100%로 자동 정규화됩니다. Origin AI는 점수와 별개로 최종 응답 경로를 유지합니다.','Weights normalize to 100% on save. Origin AI remains the final response lane.')}</p></article>`;
  root.innerHTML+=`<article class="ai-mgmt-card wide"><div class="ai-mgmt-card-head"><div><small>PROVIDERS · METRICS</small><h3>${t('연결·비용·성과','Connectivity · cost · performance')}</h3></div><span>${esc(runtime?.routerScorePolicy?.historyWindowHours||168)}h</span></div>${providerRows()}</article>`;
  root.innerHTML+=`<article class="ai-mgmt-card"><div class="ai-mgmt-card-head"><div><small>OPENAI ROLE PROFILES</small><h3>${t('역할별 모델 프로필','Role model profiles')}</h3></div><span>SERVER MODEL SLOTS</span></div><label class="ai-mgmt-check"><input id="aiMgmtOpenAi" type="checkbox" ${policy.openai?.enabled!==false?'checked':''}> ${t('OpenAI API를 협업 풀에 사용','Use OpenAI API in collaboration pool')}</label><div class="ai-mgmt-role-list">${roleRows(policy)}</div></article>`;
  root.innerHTML+=`<article class="ai-mgmt-card"><div class="ai-mgmt-card-head"><div><small>CORE LEARNING</small><h3>${t('실행 경험을 Core 자산으로','Turn execution into Core assets')}</h3></div><strong>${Number(snapshot.coreLearning?.count)||0}</strong></div><label class="ai-mgmt-check"><input id="aiMgmtLearn" type="checkbox" ${core.learnAfterSuccess?'checked':''}> ${t('검증 성공 작업을 Learning Ledger에 기록','Record verified work in the Learning Ledger')}</label><label class="ai-mgmt-check"><input id="aiMgmtRetry" type="checkbox" ${core.retryReversibleFailures?'checked':''}> ${t('가역 실패 자동 재시도','Retry reversible failures')}</label><div class="ai-mgmt-lifecycle">${(core.stateLifecycle||[]).map(state=>`<span>${esc(state)}</span>`).join('')}</div></article>`;
  root.innerHTML+=`<article class="ai-mgmt-card wide"><div class="ai-mgmt-card-head"><div><small>RECENT CORE LEARNING</small><h3>${t('최근 학습 원장','Recent learning ledger')}</h3></div><span>${t('검토 후 Capability화','Reviewed promotion only')}</span></div><div class="ai-mgmt-learning-list">${learningRows(snapshot.coreLearning?.recent||[])}</div></article>`;
  root.innerHTML+=`<article class="ai-mgmt-card wide"><div class="ai-mgmt-card-head"><div><small>POLICY AUDIT</small><h3>${t('설정 변경 이력','Settings audit')}</h3></div><span>SUPER_ADMIN WRITE</span></div><div class="ai-mgmt-audit-list">${auditRows()}</div></article>`;
  root.innerHTML+=`<article class="ai-mgmt-card wide"><div class="ai-mgmt-controls"><div class="ai-mgmt-control-grid"><label>${t('병렬 협업자 수','Parallel collaborators')} <select id="aiMgmtParallel">${[1,2,3,4].map(n=>`<option value="${n}" ${Number(policy.governance?.maxParallelCollaborators||4)===n?'selected':''}>${n} + Origin AI</option>`).join('')}</select></label><label><input id="aiMgmtLiveVerify" type="checkbox" ${policy.execution?.requireLiveProductionVerification!==false?'checked':''}> ${t('운영 실서비스 검증 필수','Require live production verification')}</label><label><input id="aiMgmtLocalFallback" type="checkbox" ${policy.execution?.localFallback?.enabled!==false?'checked':''}> ${t('승인 사유 시 Local fallback','Allow approved local fallback')}</label></div><div><button id="aiMgmtReload" class="secondary" type="button">${t('다시 불러오기','Reload')}</button><button id="aiMgmtSave" class="primary" type="button">${t('설정 저장','Save settings')}</button></div></div><div class="ai-mgmt-guards"><span>Collaboration ON · LOCK</span><span>Cloud First · LOCK</span><span>Origin AI · LOCK</span><span>Destructive Human Gate · LOCK</span><span>Secret Server Only · LOCK</span></div><p id="aiManagementMessage" class="ai-mgmt-message" role="status"></p></article></section>`;
  bindControls();
}
function editedPolicy(){
  const policy=structuredClone(snapshot?.policy||{});policy.collaborationByDefault=true;
  policy.resources=policy.resources||{};policy.resources.pools=policy.resources.pools||{};policy.resources.core=policy.resources.core||{};
  for(const resource of ['ekodi-shared-api','hosted-ai']){const key=poolKey(resource);const input=$(`[data-resource-toggle="${resource}"]`);policy.resources.pools[key]={...(policy.resources.pools[key]||{}),enabled:Boolean(input?.checked)}}
  policy.resources.core.learnAfterSuccess=Boolean($('#aiMgmtLearn')?.checked);policy.resources.core.retryReversibleFailures=Boolean($('#aiMgmtRetry')?.checked);
  policy.router=policy.router||{};policy.router.weights=policy.router.weights||{};document.querySelectorAll('[data-provider-weight]').forEach(input=>{policy.router.weights[input.dataset.providerWeight]=(Number(input.value)||0)/100});
  policy.openai={...(policy.openai||{}),enabled:Boolean($('#aiMgmtOpenAi')?.checked),roles:{...(policy.openai?.roles||{})}};
  document.querySelectorAll('[data-ai-role]').forEach(row=>{const name=row.dataset.aiRole;if(!policy.openai.roles[name])return;policy.openai.roles[name].enabled=Boolean(row.querySelector('[data-field="enabled"]')?.checked);policy.openai.roles[name].profile=row.querySelector('[data-field="profile"]')?.value||policy.openai.roles[name].profile});
  policy.execution={...(policy.execution||{}),cloudFirst:true,order:['cloud','remote','local'],requireLiveProductionVerification:Boolean($('#aiMgmtLiveVerify')?.checked),localFallback:{...(policy.execution?.localFallback||{}),enabled:Boolean($('#aiMgmtLocalFallback')?.checked)}};
  policy.governance={...(policy.governance||{}),maxParallelCollaborators:Number($('#aiMgmtParallel')?.value)||4};
  return policy;
}
async function load(){
  try{setMessage(t('AI 설정을 불러오는 중…','Loading AI settings…'));const [settings,status,auditData]=await Promise.all([request(SETTINGS),request(RUNTIME).catch(()=>null),request(SETTINGS+'/audit?limit=10').catch(()=>({audit:[]}))]);snapshot=settings;runtime=status;audit=auditData.audit||[];render();setMessage('')}
  catch(error){setMessage(`${t('설정 로드 실패','Load failed')}: ${error.message}`,true)}
}
async function save(){
  try{setMessage(t('설정을 저장하는 중…','Saving settings…'));await request(SETTINGS,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({policy:editedPolicy()})});await load();setMessage(t('저장했습니다. 다음 작업부터 Router와 협업 정책에 적용됩니다.','Saved. Router and collaboration policy apply to subsequent work.'))}
  catch(error){setMessage(`${t('저장 실패','Save failed')}: ${error.message}`,true)}
}
function bindControls(){$('#aiMgmtReload')?.addEventListener('click',load);$('#aiMgmtSave')?.addEventListener('click',save)}
function installNav(){
  const nav=$('.sidebar nav');if(!nav)return null;
  let button=nav.querySelector('[data-section="ai-settings"],[data-lazy-section="ai-settings"]');
  if(!button){button=document.createElement('button');button.type='button';button.className='nav';button.dataset.section=SECTION;button.innerHTML='⚙ <span>'+esc(t('에코디 AI 관리','EKODI AI Management'))+'</span>';nav.append(button)}
  button.dataset.section=SECTION;delete button.dataset.lazySection;
  if(button.dataset.aiManagementBound!=='true'){button.dataset.aiManagementBound='true';button.addEventListener('click',event=>{event.preventDefault();show();load()})}
  return button;
}
function installPanel(){
  let panel=$('#aiManagementPanel');if(panel)return panel;const content=$('.content');if(!content)return null;
  panel=document.createElement('section');panel.id='aiManagementPanel';panel.className='section ai-management-panel hidden-panel';panel.dataset.panel=SECTION;panel.hidden=true;
  panel.innerHTML='<div id="aiManagementBody"><p class="ai-mgmt-empty">AI 설정을 준비하는 중…</p></div>';content.prepend(panel);return panel;
}
function mount(){const button=installNav(),panel=installPanel();if(!button||!panel)return false;window.dispatchEvent(new CustomEvent('ekodi-feature-installed',{detail:{section:SECTION}}));if(location.hash==='#ai-settings'||location.pathname.endsWith('/ai-settings')){show();load()}return true}
function init(){if(mount())return;const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.addEventListener('ekodi-admin-context-changed',()=>{if(window.EKODIAdminPanels?.current?.()===SECTION)load()});
window.EKODIAIManagement=Object.freeze({mount,load,save,version:'1.1.0'});
})();
