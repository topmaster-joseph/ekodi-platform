(() => {
'use strict';
const SECTION='ai-settings';
const SETTINGS='/api/control/ai/v8/collaboration-settings';
const RESOURCE_LABELS={
  'personal-subscription':['개인 AI 구독','ChatGPT · Claude · Gemini 공식 클라이언트'],
  'personal-api':['개인 API','개인 비용 BYOK · 서버 Secret/Vault'],
  'ekodi-shared-api':['EKODI 공용 API','예산 확보 후 중앙 비용으로 운영'],
  'hosted-ai':['Hosted AI','Cloud GPU + Open Model · 필요 시 사용'],
  'core-only':['EKODI Core','AI 없이 규칙·실행·복구로 처리'],
};
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(ko,en)=>window.EKODIAdminMenu?.locale?.()==='en'?en:ko;
let snapshot=null;

async function request(path,options={}){
  if(typeof window.EKODIAdminCore?.request==='function')return window.EKODIAdminCore.request(path,options);
  const token=sessionStorage.getItem('ekodi-auth-token')||'';
  const headers={...(options.headers||{}),...(token?{authorization:`Bearer ${token}`}:{})};
  const response=await fetch(`https://ekodi.kr${path}`,{...options,headers,cache:'no-store'});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`API ${response.status}`);return data;
}
function poolKey(resource){return({'personal-subscription':'personalSubscription','personal-api':'personalApi','ekodi-shared-api':'ekodiSharedApi','hosted-ai':'hostedAi','core-only':'coreOnly'})[resource]}
function statusFor(resource){const status=snapshot?.resourceStatus||{};if(resource==='personal-subscription')return t('공식 클라이언트 노드','Official client nodes');if(resource==='personal-api'){const a=status.personalApis||{};const count=[a.openai,a.anthropic,a.gemini].filter(Boolean).length;return `${count}/3 API ${t('연결','connected')}`;}if(resource==='ekodi-shared-api')return status.ekodiSharedApi?.configured?t('연결됨','Connected'):t('미연결','Not connected');if(resource==='hosted-ai')return status.hostedAi?.configured?t('연결됨','Connected'):t('미연결','Not connected');return t('항상 사용 가능','Always available')}
function resourceCards(order=[]){const pools=snapshot?.policy?.resources?.pools||{};return order.map((resource,index)=>{const [name,desc]=RESOURCE_LABELS[resource]||[resource,''];const pool=pools[poolKey(resource)]||{};const editable=['ekodi-shared-api','hosted-ai'].includes(resource);return `<article class="ai-mgmt-resource"><div class="ai-mgmt-rank">${index+1}</div><div><strong>${esc(name)}</strong><p>${esc(desc)}</p><small>${esc(statusFor(resource))}</small></div><label class="ai-mgmt-switch">${editable?`<input type="checkbox" data-resource-toggle="${esc(resource)}" ${pool.enabled?'checked':''}>`:'<span class="locked">LOCK</span>'}<span>${pool.enabled?t('사용','ON'):t('대기','OFF')}</span></label></article>`}).join('')}
function weightRows(weights={}){return Object.entries(weights).map(([key,value])=>`<span><b>${esc(key)}</b><strong>${esc(value)}%</strong></span>`).join('')}
function learningRows(items=[]){if(!items.length)return `<p class="ai-mgmt-empty">${t('아직 저장된 학습 이벤트가 없습니다.','No learning events recorded yet.')}</p>`;return items.map(item=>`<div class="ai-mgmt-learning"><strong>${esc(item.capability||'general')}</strong><span>${esc(item.outcome)}</span><small>${esc(item.created_at||'')}</small></div>`).join('')}
function setMessage(text,error=false){const node=$('#aiManagementMessage');if(!node)return;node.textContent=text||'';node.classList.toggle('error',error)}
function show(){window.EKODIAdminPanels?.activate?.(SECTION)}

function render(){
  const root=$('#aiManagementBody');if(!root||!snapshot)return;
  const policy=snapshot.policy||{},resources=policy.resources||{},core=resources.core||{},router=resources.router||{};
  root.innerHTML=`<section class="ai-mgmt-hero"><div><small>PERSONAL-FIRST · EKODI CORE</small><h2>${t('에코디 AI 관리','EKODI AI Management')}</h2><p>${t('지금은 개인구독 AI와 개인 API를 먼저 쓰고, 성공 경험은 Core에 남깁니다. 공용 API와 Hosted AI는 예산·필요가 생길 때 켭니다.','Use personal subscriptions and APIs first now, while successful work becomes durable Core knowledge. Shared and Hosted AI stay budget-gated.')}</p></div><div class="ai-mgmt-badge">${esc(resources.strategy||'personal-first')}</div></section>`+
  `<section class="ai-mgmt-grid"><article class="ai-mgmt-card wide"><div class="ai-mgmt-card-head"><div><small>INTERACTIVE LANE</small><h3>${t('사람이 함께 있을 때','Human-present work')}</h3></div><span>${t('개인구독 우선','Subscription first')}</span></div><div class="ai-mgmt-resources">${resourceCards(resources.interactiveOrder||[])}</div></article>`+
  `<article class="ai-mgmt-card wide"><div class="ai-mgmt-card-head"><div><small>AUTONOMOUS LANE</small><h3>${t('예약·감시·복구·배포','Scheduled · monitor · recover · deploy')}</h3></div><span>${t('개인 API 우선','Personal API first')}</span></div><div class="ai-mgmt-resources">${resourceCards(resources.autonomousOrder||[])}</div></article>`;
  root.innerHTML+=`<article class="ai-mgmt-card"><div class="ai-mgmt-card-head"><div><small>ROUTER SCORE</small><h3>${t('능력 기반 라우팅','Capability routing')}</h3></div><span>100%</span></div><div class="ai-mgmt-weights">${weightRows(router.weights)}</div><p class="ai-mgmt-note">${t('공식 경로·자동화 허용·인증·데이터 정책·권한·예산을 먼저 통과한 후보만 점수화합니다.','Only candidates that pass official-path, automation, auth, data, permission and budget gates are scored.')}</p></article>`;
  root.innerHTML+=`<article class="ai-mgmt-card"><div class="ai-mgmt-card-head"><div><small>CORE LEARNING</small><h3>${t('실행 경험을 Core 자산으로','Turn execution into Core assets')}</h3></div><strong>${Number(snapshot.coreLearning?.count)||0}</strong></div><label class="ai-mgmt-check"><input id="aiMgmtLearn" type="checkbox" ${core.learnAfterSuccess?'checked':''}> ${t('검증 성공 작업을 Learning Ledger에 기록','Record verified work in the Learning Ledger')}</label><label class="ai-mgmt-check"><input id="aiMgmtRetry" type="checkbox" ${core.retryReversibleFailures?'checked':''}> ${t('가역 실패 자동 재시도','Retry reversible failures')}</label><div class="ai-mgmt-lifecycle">${(core.stateLifecycle||[]).map(state=>`<span>${esc(state)}</span>`).join('')}</div></article>`;
  root.innerHTML+=`<article class="ai-mgmt-card wide"><div class="ai-mgmt-card-head"><div><small>RECENT CORE LEARNING</small><h3>${t('최근 학습 원장','Recent learning ledger')}</h3></div><span>${t('자동 승격 금지 · 검토 후 Capability화','Reviewed promotion only')}</span></div><div class="ai-mgmt-learning-list">${learningRows(snapshot.coreLearning?.recent||[])}</div></article>`;
  root.innerHTML+=`<article class="ai-mgmt-card wide"><div class="ai-mgmt-controls"><label>${t('동시 협업 상한','Parallel collaborators')} <select id="aiMgmtParallel">${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${Number(policy.governance?.maxParallelCollaborators)===n?'selected':''}>${n}</option>`).join('')}</select></label><div><button id="aiMgmtReload" class="secondary" type="button">${t('다시 불러오기','Reload')}</button><button id="aiMgmtSave" class="primary" type="button">${t('설정 저장','Save settings')}</button></div></div><p id="aiManagementMessage" class="ai-mgmt-message" role="status"></p></article></section>`;
  bindControls();
}

function editedPolicy(){
  const policy=structuredClone(snapshot?.policy||{});policy.collaborationByDefault=true;
  policy.resources=policy.resources||{};policy.resources.pools=policy.resources.pools||{};policy.resources.core=policy.resources.core||{};
  for(const resource of ['ekodi-shared-api','hosted-ai']){
    const key=poolKey(resource);const input=$(`[data-resource-toggle="${resource}"]`);
    policy.resources.pools[key]={...(policy.resources.pools[key]||{}),enabled:Boolean(input?.checked)};
  }
  policy.resources.core.learnAfterSuccess=Boolean($('#aiMgmtLearn')?.checked);
  policy.resources.core.retryReversibleFailures=Boolean($('#aiMgmtRetry')?.checked);
  policy.governance={...(policy.governance||{}),maxParallelCollaborators:Number($('#aiMgmtParallel')?.value)||4};
  return policy;
}

async function load(){
  try{setMessage(t('AI 설정을 불러오는 중…','Loading AI settings…'));snapshot=await request(SETTINGS);render();setMessage('')}catch(error){setMessage(`${t('설정 로드 실패','Load failed')}: ${error.message}`,true)}
}
async function save(){
  try{setMessage(t('설정을 저장하는 중…','Saving settings…'));const data=await request(SETTINGS,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({policy:editedPolicy()})});snapshot=data.snapshot||data;render();setMessage(t('저장했습니다. 다음 작업부터 적용됩니다.','Saved. The policy applies to subsequent work.'))}
  catch(error){setMessage(`${t('저장 실패','Save failed')}: ${error.message}`,true)}
}
function bindControls(){
  $('#aiMgmtReload')?.addEventListener('click',load);
  $('#aiMgmtSave')?.addEventListener('click',save);
}
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
  panel.innerHTML='<div id="aiManagementBody"><p class="ai-mgmt-empty">AI 설정을 준비하는 중…</p></div>';
  content.prepend(panel);return panel;
}
function mount(){const button=installNav(),panel=installPanel();if(!button||!panel)return false;window.dispatchEvent(new CustomEvent('ekodi-feature-installed',{detail:{section:SECTION}}));if(location.hash==='#ai-settings'||location.pathname.endsWith('/ai-settings')){show();load()}return true}
function init(){if(mount())return;const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.addEventListener('ekodi-admin-context-changed',()=>{if(window.EKODIAdminPanels?.current?.()===SECTION)load()});
window.EKODIAIManagement=Object.freeze({mount,load,save,version:'1.0.0'});
})();
