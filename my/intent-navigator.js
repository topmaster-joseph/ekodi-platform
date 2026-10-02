const form=document.querySelector('#intentPlanForm');
const input=document.querySelector('#intentPlanText');
const audience=document.querySelector('#intentPlanAudience');
const result=document.querySelector('#intentPlanResult');
const resultActions=document.querySelector('[data-intent-result-actions]');
const submit=document.querySelector('#intentPlanSubmit');
const next=document.querySelector('#intentPlanNext');
const contextBack=document.querySelector('#intentPlanContextBack');
const executeBack=document.querySelector('#intentPlanExecuteBack');
const reset=document.querySelector('#intentPlanReset');
const reviewGoal=document.querySelector('#intentReviewGoal');
const reviewContext=document.querySelector('#intentReviewContext');
const examples=[...document.querySelectorAll('[data-intent-example]')];
const contextChoices=[...document.querySelectorAll('[data-intent-audience-choice]')];
const stepMarkers=[...document.querySelectorAll('[data-intent-step-marker]')];
const stepPanels=[...document.querySelectorAll('[data-intent-panel]')];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const tierLabel=tier=>({observe:'관찰',assist:'준비·지원',execute_reversible:'자율 실행 후보',human_gate:'내 결정 필요',forbidden:'실행 금지'})[tier]||tier;
const audienceLabel=value=>({person:'개인',business:'사업',organization:'기관·단체',community:'공동체',church:'교회',team:'팀'})[value]||'개인';
const activeWorkspaceKey=()=>{try{return localStorage.getItem('ekodi_my_active_workspace')||''}catch{return''}};
const accessToken=()=>String(window.EKODI_MY_AUTH?.getAccessToken?.()||'');
const stepOrder=['goal','context','execute'];
let activeStep='goal';

function syncReview(){
 const text=String(input?.value||'').trim();
 if(reviewGoal)reviewGoal.textContent=text||'원하는 일을 입력해 주세요.';
 if(reviewContext)reviewContext.textContent=`현재 맥락 · ${audienceLabel(audience?.value||'person')}`;
}
function setStep(step){
 if(!['goal','context','execute','result'].includes(step))step='goal';
 activeStep=step;
 if(form)form.dataset.intentStage=step;
 stepPanels.forEach(panel=>panel.hidden=panel.dataset.intentPanel!==step);
 stepMarkers.forEach(marker=>{
  const index=stepOrder.indexOf(marker.dataset.intentStepMarker||'');
  const current=stepOrder.indexOf(step);
  if(step==='result'){marker.removeAttribute('aria-current');marker.dataset.complete='true';return}
  marker.dataset.complete=String(index<current);
  if(index===current)marker.setAttribute('aria-current','step');else marker.removeAttribute('aria-current');
 });
 if(result)result.hidden=step!=='result';
 if(resultActions)resultActions.hidden=step!=='result';
 if(step==='execute')syncReview();
}
function chooseAudience(value,{advance=true}={}){
 if(!audience)return;
 audience.value=value;
 contextChoices.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.intentAudienceChoice===value)));
 syncReview();
 if(advance)setStep('execute');
}
function requireGoal(){
 const text=String(input?.value||'').trim();
 if(text)return text;
 input?.focus();
 return '';
}
function loading(){
 if(result){result.hidden=false;result.innerHTML='<div class="intent-empty"><strong>필요한 능력을 조합하고 있습니다.</strong><p>현재 권한과 Workspace를 확인하고 실행 가능한 다음 단계만 준비합니다.</p></div>'}
}
function error(message='계획을 만들지 못했습니다.'){
 if(result){result.hidden=false;result.innerHTML=`<div class="intent-empty intent-error"><strong>${esc(message)}</strong><p>잠시 후 다시 시도하거나 원하는 결과를 조금 더 구체적으로 적어 주세요.</p></div>`}
}
function render(data){
 const recommendations=Array.isArray(data?.recommendations)?data.recommendations:[];
 const capabilities=Array.isArray(data?.capabilities)?data.capabilities:[];
 const showrooms=Array.isArray(data?.showrooms)?data.showrooms:[];
 const top=recommendations[0];
 const cards=recommendations.map((item,index)=>`<article class="intent-pack${index===0?' primary':''}"><small>${index===0?'추천 Workspace Pack':'함께 고려'}</small><h3>${esc(item.name||item.id)}</h3><p>${esc(item.description||'')}</p>${item.matchedSignals?.length?`<div class="intent-signals">${item.matchedSignals.map(v=>`<span>${esc(v)}</span>`).join('')}</div>`:''}</article>`).join('');
 const chips=capabilities.map(item=>`<span class="intent-capability tier-${esc(item.actionTier)}" title="${esc(item.description)}"><b>${esc(item.name)}</b><small>${esc(tierLabel(item.actionTier))}</small></span>`).join('');
 const links=showrooms.map(item=>`<a class="intent-showroom" href="${esc(item.url)}">${esc(item.name)} →</a>`).join('');
 const gated=Array.isArray(data?.humanGateCapabilities)&&data.humanGateCapabilities.length>0;
 if(result)result.innerHTML=`<div class="intent-result-head"><div><small>INTENT PLAN · ${esc(data.contract||'')}</small><strong>${esc(top?.name||'My EKODI')}</strong></div><span>${esc(data.autonomyPolicyVersion||'')}</span></div><div class="intent-pack-grid">${cards}</div><div class="intent-capability-panel"><div><small>CAPABILITIES</small><p>서비스가 아니라 필요한 능력을 먼저 조합했습니다.</p></div><div class="intent-capability-list">${chips}</div></div>${links?`<div class="intent-showrooms"><span>연결 가능한 전문 서비스</span>${links}</div>`:''}<p class="intent-safety">${gated?'중요 결정은 사용자에게 남기고, 그 외 작업은 서버 권한 재검증 후 EKODI 자율운영으로 이어집니다.':'이 계획은 서버 권한 재검증 후 허용된 범위에서 자율 실행으로 이어집니다.'}</p>`;
}
function renderExecution(data){
 if(!result)return;
 const existing=result.querySelector('.intent-execution-status');existing?.remove();
 const box=document.createElement('div');box.className='intent-execution-status';
 const summary=data?.summary||{};
 box.innerHTML=`<strong>EKODI 안전 실행 연결</strong><p>서버에서 Workspace 권한을 다시 확인했습니다. 안전한 관찰·준비 작업 ${Number(summary.executed||0)}개를 처리했고, 전용 adapter가 필요한 작업 ${Number(summary.requiresAdapter||0)}개와 사용자 결정이 필요한 작업 ${Number(summary.humanGate||0)}개는 경계에서 멈췄습니다.</p><small>${esc(data?.authority?.workspace_key||'verified workspace')} · ${esc(data?.authority?.role||'member')}</small>`;
 result.append(box);
}
async function continueExecution(text){
 const token=accessToken(),workspaceKey=activeWorkspaceKey();if(!token||!workspaceKey)return;
 try{
  const response=await fetch('/my/api/intent/execute',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({text,audience:audience?.value||'person',workspace_key:workspaceKey})});
  const data=await response.json();
  if(response.ok&&data?.ok)renderExecution(data);
  else if(response.status===401||response.status===403)console.info('EKODI Intent execution requires renewed workspace authority');
 }catch(e){console.warn('EKODI Intent execution bridge',e)}
}
async function navigate(event){
 event?.preventDefault();
 const text=requireGoal();if(!text)return;
 if(activeStep!=='execute'){setStep(activeStep==='goal'?'context':'execute');return}
 if(submit){submit.disabled=true;submit.textContent='준비 중'}
 setStep('result');loading();
 try{
  const response=await fetch('/my/api/intent/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,audience:audience?.value||'person'})});
  const data=await response.json();
  if(!response.ok||!data?.ok)throw new Error(data?.error||`intent_${response.status}`);
  render(data);await continueExecution(text);
 }catch(e){console.error('EKODI Intent OS',e);error()}
 finally{if(submit){submit.disabled=false;submit.innerHTML='실행 시작 <span aria-hidden="true">→</span>'}}
}
next?.addEventListener('click',()=>{if(requireGoal())setStep('context')});
contextBack?.addEventListener('click',()=>setStep('goal'));
executeBack?.addEventListener('click',()=>setStep('context'));
reset?.addEventListener('click',()=>{if(input)input.value='';chooseAudience('person',{advance:false});if(result)result.innerHTML='';setStep('goal');input?.focus()});
contextChoices.forEach(button=>button.addEventListener('click',()=>chooseAudience(button.dataset.intentAudienceChoice||'person')));
stepMarkers.forEach(marker=>marker.addEventListener('click',()=>{
 const target=marker.dataset.intentStepMarker||'goal';
 if(target==='goal'){setStep('goal');return}
 if(target==='context'){if(requireGoal())setStep('context');return}
 if(target==='execute'&&requireGoal())setStep('execute');
}));
form?.addEventListener('submit',navigate);
examples.forEach(button=>button.addEventListener('click',()=>{if(input)input.value=button.dataset.intentExample||'';if(requireGoal())setStep('context')}));
chooseAudience(audience?.value||'person',{advance:false});
setStep('goal');
