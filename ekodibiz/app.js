const $=(s)=>document.querySelector(s);
const $$=(s)=>[...document.querySelectorAll(s)];
const state={goal:'',leadId:null,consult:null,order:null,mode:'write',selectedPrompt:'',progress:null};
const PROGRESS_ORDER=['discover','create','promote','sell','pay','deliver','grow'];
const CATEGORY_LABELS={growth:'성장',launch:'시작',event:'행사',repeat:'재방문',sales:'전환',recurring:'반복수익',creator:'콘텐츠'};
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const scrollBehavior=reducedMotion?'auto':'smooth';

async function api(path,body){
  const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await r.json();
  if(!r.ok)throw new Error(data.error||'request_failed');
  return data;
}
function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function showMessage(message=''){const el=$('#goalMessage');if(el)el.textContent=message;}
function setBusy(on){
  const button=$('#consultButton');
  button.disabled=on;
  button.textContent=on?'정리하는 중…':'시작하기';
}
function setMode(mode){
  state.mode=mode==='choose'?'choose':'write';
  $$('[data-start-mode]').forEach(button=>{
    const active=button.dataset.startMode===state.mode;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
  });
  $$('[data-mode-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.modePanel!==state.mode));
  showMessage('');
  if(state.mode==='write')setTimeout(()=>$('#goal')?.focus(),0);
}
function choosePrompt(button){
  state.selectedPrompt=button.dataset.prompt||'';
  $$('.goal-choice').forEach(item=>item.classList.toggle('active',item===button));
  $('#choiceSummary').textContent=state.selectedPrompt?`선택됨 · ${button.textContent.trim()}`:'아직 목표를 선택하지 않았습니다.';
  showMessage('');
}
function selectedGoal(){return state.mode==='choose'?state.selectedPrompt:$('#goal').value.trim();}
function activateJourney(){
  document.body.classList.add('journey-started');
  if(!state.progress)setProgress('discover');
}
function setProgress(step){
  if(!PROGRESS_ORDER.includes(step))return;
  state.progress=step;
  const activeIndex=PROGRESS_ORDER.indexOf(step);
  $$('[data-progress-step]').forEach(item=>{
    const itemStep=item.dataset.progressStep;
    const itemIndex=PROGRESS_ORDER.indexOf(itemStep);
    const active=itemStep===step;
    item.classList.toggle('completed',itemIndex>=0&&itemIndex<activeIndex);
    if(active)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
  });
  const activeItem=$(`[data-progress-step="${step}"]`);
  if(document.body.classList.contains('journey-started')&&activeItem?.scrollIntoView&&window.innerWidth<=640){
    activeItem.scrollIntoView({behavior:scrollBehavior,block:'nearest',inline:'center'});
  }
}
function offerCard(o,index){
  const category=CATEGORY_LABELS[o.category]||o.category;
  return `<article class="offer-card ${index===0?'recommended':''}"><div><div class="offer-card-topline"><span class="pill">${escapeHtml(category)}</span><span class="offer-rank">${index===0?'가장 잘 맞음':`추천 ${index+1}`}</span></div><h3>${escapeHtml(o.name)}</h3><p>${escapeHtml(o.summary)}</p><ul>${o.outcomes.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div><button type="button" data-offer="${escapeHtml(o.id)}">이 제안으로 계속</button></article>`;
}
function renderConsult(data){
  state.consult=data;
  state.leadId=data.leadId||null;
  $('#diagnosis').textContent=data.diagnosis;
  $('#freeNextStep').textContent=data.freeNextStep;
  $('#leadReceipt').textContent=state.leadId?`운영 접수 ${state.leadId} · AI 운영직원이 후속 준비를 시작합니다.`:'';
  const offers=(data.suggestedOffers||[]).slice(0,4);
  $('#offerHint').textContent=`현재 목표에 맞춰 우선순위가 높은 제안 ${offers.length}가지를 골랐습니다. 가격은 승인된 정책이 연결되기 전까지 임의로 만들지 않습니다.`;
  $('#offers').innerHTML=offers.map(offerCard).join('');
  $('#workspace').classList.remove('hidden');
  setProgress('discover');
  $('#workspace').scrollIntoView({behavior:scrollBehavior,block:'start'});
  $$('[data-offer]').forEach(button=>button.addEventListener('click',()=>createOffer(button.dataset.offer)));
}
async function consult(goal){
  state.goal=goal;
  activateJourney();
  setBusy(true);
  showMessage('');
  try{
    const data=await api('/api/consult',{goal});
    renderConsult(data);
    localStorage.setItem('ekodibiz.lastGoal',goal);
  }catch(e){
    showMessage('진단을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }finally{setBusy(false);}
}
async function createOffer(offerId){
  try{
    const data=await api('/api/offers',{goal:state.goal,offerId,leadId:state.leadId});
    state.order=data;
    $('#orderTitle').textContent=data.offer.name;
    $('#orderSummary').textContent=data.offer.summary;
    $('#orderOutcomes').innerHTML=data.offer.outcomes.map(x=>`<li>${escapeHtml(x)}</li>`).join('');
    $('#orderId').textContent=data.orderId;
    $('#checkoutMessage').textContent=data.operations?`AI 운영직원 작업 ${data.operations.taskCount}건 접수 · 고영향 승인 ${data.operations.humanGateCount}건 대기`:'';
    $('#orderPanel').classList.remove('hidden');
    setProgress('sell');
    $('#orderPanel').scrollIntoView({behavior:scrollBehavior,block:'start'});
    localStorage.setItem('ekodibiz.orderDraft',JSON.stringify({orderId:data.orderId,offer:data.offer,leadId:data.leadId,createdAt:data.createdAt}));
    refreshOpsStatus();
  }catch(e){
    showMessage('제안서를 만들지 못했습니다. 다른 제안을 선택하거나 잠시 후 다시 시도해 주세요.');
  }
}
async function previewExecution(){
  if(!state.order)return;
  try{
    const data=await api('/api/execution-preview',{goal:state.goal,offerId:state.order.offer.id});
    $('#executionStages').innerHTML=data.stages.map((s,i)=>`<article class="stage ${s.status}"><b>${String(i+1).padStart(2,'0')}</b><div><strong>${escapeHtml(s.label)}</strong><p>${Array.isArray(s.output)?s.output.map(escapeHtml).join(' · '):escapeHtml(s.output)}</p></div><span>${s.status==='human_gate'?'사용자 승인':s.status==='ready'?'자동 준비':'후속 실행'}</span></article>`).join('');
    $('#executionPanel').classList.remove('hidden');
    setProgress('deliver');
    $('#executionPanel').scrollIntoView({behavior:scrollBehavior,block:'start'});
  }catch(e){
    $('#checkoutMessage').textContent='실행계획을 만들지 못했습니다. 외부 실행은 시작되지 않았습니다.';
  }
}
async function checkout(){
  if(!state.order)return;
  setProgress('pay');
  try{
    const data=await api('/api/checkout-intent',{orderId:state.order.orderId});
    $('#checkoutMessage').textContent=data.message;
    if(data.checkoutUrl)location.href=data.checkoutUrl;
    refreshOpsStatus();
  }catch(e){
    $('#checkoutMessage').textContent='결제 승인 단계를 준비하지 못했습니다.';
  }
}
async function refreshOpsStatus(){
  try{
    const data=await api('/api/ops/status');
    if(!data.ok)return;
    const activeRoles=data.roles?.length||4;
    const queued=data.taskCounts?.queued||0;
    const approvals=data.taskCounts?.approval_required||0;
    $('#opsStatus').textContent=`AI 운영직원 ${activeRoles}명 가동 · 준비 ${queued} · 승인대기 ${approvals}`;
  }catch{$('#opsStatus').textContent='AI 운영직원 연결 확인 필요';}
}
function installProgressObserver(){
  if(!('IntersectionObserver'in window))return;
  const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(visible?.target?.dataset?.progressSection)setProgress(visible.target.dataset.progressSection);
  },{root:null,rootMargin:'-30% 0px -55% 0px',threshold:[0,.15,.35,.6]});
  $$('[data-progress-section]').forEach(section=>observer.observe(section));
}

$$('[data-start-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.startMode)));
$$('.goal-choice').forEach(button=>button.addEventListener('click',()=>choosePrompt(button)));
$('#goalForm').addEventListener('submit',event=>{
  event.preventDefault();
  const goal=selectedGoal();
  if(!goal){
    showMessage(state.mode==='choose'?'먼저 목표 하나를 선택해 주세요.':'이루고 싶은 목표를 한 문장으로 입력해 주세요.');
    return;
  }
  consult(goal);
});
$('#approveButton').addEventListener('click',previewExecution);
$('#checkoutButton').addEventListener('click',checkout);

(async()=>{
  installProgressObserver();
  try{const h=await api('/api/health');if(h.ok)document.body.dataset.runtime='ready';}catch{}
  await refreshOpsStatus();
  const saved=localStorage.getItem('ekodibiz.lastGoal');
  if(saved)$('#goal').value=saved;
})();
