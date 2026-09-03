const state={catalog:null,mode:'user',persona:'small-business',service:'marketing',status:'all'};
const $=selector=>document.querySelector(selector);
const $$=selector=>Array.from(document.querySelectorAll(selector));
const statusClass=status=>`status-${String(status||'').replace(/[^a-z-]/g,'')}`;

async function load(){
  const response=await fetch('/api/catalog',{headers:{accept:'application/json'}});
  if(!response.ok) throw new Error('catalog_unavailable');
  state.catalog=await response.json();
  const path=location.pathname;
  if(path==='/developer') state.mode='developer';
  if(path==='/user') state.mode='user';
  render();
}
function render(){ renderModes(); renderPersonas(); renderWorkspace(); renderStatus(); }
function renderModes(){
  $$('.mode-button').forEach(button=>button.classList.toggle('is-active',button.dataset.mode===state.mode));
  $('#mode-description').textContent=state.mode==='user'?'하고 싶은 일을 중심으로 에코디를 체험합니다.':'구현 세부사항 없이 서비스의 역할과 연결관계만 살펴봅니다.';
  $('#workspace-kicker').textContent=state.mode==='user'?'SYNTHETIC WORKSPACE':'SAFE X-RAY VIEW';
}
function renderPersonas(){
  const root=$('#persona-grid'); root.replaceChildren();
  for(const persona of state.catalog.personas){
    const button=document.createElement('button'); button.type='button'; button.className=`persona-card${persona.id===state.persona?' is-active':''}`;
    button.innerHTML=`<strong>${escapeHtml(persona.label)}</strong><span>${escapeHtml(persona.prompt)}</span><small>${escapeHtml(persona.sample)}</small>`;
    button.addEventListener('click',()=>{state.persona=persona.id; const first=visibleServices()[0]; if(first) state.service=first.id; render();});
    root.append(button);
  }
}
function visibleServices(){ return state.catalog.services.filter(service=>service.personas.includes(state.persona)); }
function renderWorkspace(){
  const persona=state.catalog.personas.find(item=>item.id===state.persona)||state.catalog.personas[0];
  $('#workspace-title').textContent=persona.sample;
  const services=visibleServices();
  if(!services.some(service=>service.id===state.service)) state.service=services[0]?.id||'';
  const nav=$('#service-list'); nav.replaceChildren();
  for(const service of services){
    const button=document.createElement('button'); button.type='button'; button.className=`service-tab${service.id===state.service?' is-active':''}`;
    button.innerHTML=`<span>${escapeHtml(service.name)}</span><small class="${statusClass(service.status)}">${escapeHtml(service.statusLabel)}</small>`;
    button.addEventListener('click',()=>{state.service=service.id; renderWorkspace();}); nav.append(button);
  }
  renderStage(services.find(service=>service.id===state.service)||services[0]);
}
function renderStage(service){
  const stage=$('#service-stage'); if(!service){stage.innerHTML='<p>체험 가능한 서비스가 없습니다.</p>';return;}
  if(state.mode==='developer'){
    stage.innerHTML=`<div class="stage-top"><div><span class="service-group">${escapeHtml(service.group)}</span><h3>${escapeHtml(service.name)}</h3></div><span class="state-pill ${statusClass(service.status)}">${escapeHtml(service.statusLabel)}</span></div><p class="stage-summary">${escapeHtml(service.summary)}</p><div class="xray"><div class="xray-label">공개 가능한 관계 투영</div>${service.flow.map((step,index)=>`<div class="xray-node"><span>${index+1}</span><strong>${escapeHtml(step)}</strong></div>${index<service.flow.length-1?'<div class="xray-arrow">↓</div>':''}`).join('')}</div><div class="boundary-note"><strong>보이지 않는 것</strong><span>소스코드 · 저장소 · 내부 API · DB · Worker · 인증 비밀 · 실제 고객 데이터</span></div>`;
  }else{
    stage.innerHTML=`<div class="stage-top"><div><span class="service-group">${escapeHtml(service.group)}</span><h3>${escapeHtml(service.name)}</h3></div><span class="state-pill ${statusClass(service.status)}">${escapeHtml(service.statusLabel)}</span></div><p class="stage-summary">${escapeHtml(service.summary)}</p><div class="simulation"><span class="simulation-label">가상 체험</span><h4>${escapeHtml(simulationTitle(service.id))}</h4><p>${escapeHtml(simulationText(service.id))}</p><button id="simulate-action" type="button">체험 실행</button><div id="simulation-result" class="simulation-result" hidden></div></div>`;
    $('#simulate-action')?.addEventListener('click',()=>simulate(service));
  }
}
function simulate(service){
  const result=$('#simulation-result'); result.hidden=false;
  result.innerHTML=`<strong>가상 실행 완료</strong><span>${escapeHtml(service.name)}의 사용자 흐름을 합성 데이터로 체험했습니다. 실제 저장·결제·게시·메시지는 발생하지 않았습니다.</span>`;
}
function simulationTitle(id){ const map={marketing:'신메뉴 홍보 준비하기',mall:'상황에 맞는 상품 추천받기',church:'이번 주 공동체 흐름 살펴보기',invest:'프로젝트 검토 흐름 시작하기',work:'오늘의 작업 흐름 만들기',messenger:'대화에서 다음 행동 연결하기',money:'금융관계 정리 순서 보기',my:'나에게 필요한 서비스 연결하기'}; return map[id]||'서비스 흐름 체험하기'; }
function simulationText(id){ const map={marketing:'봄날카페의 가상 신메뉴를 기준으로 홍보 목적과 콘텐츠 흐름을 만들어 봅니다.',mall:'가상의 필요와 관계 맥락을 기준으로 추천 이유를 먼저 살펴봅니다.',church:'가상의 교회 일정과 말씀 흐름을 기준으로 다음 활동을 살펴봅니다.'}; return map[id]||'가상의 상황을 바탕으로 이 서비스가 어떤 도움을 주는지 확인합니다.'; }
function renderStatus(){
  const groups=['all','live','beta','preparing','planned']; const labels={all:'전체',live:'운영 중',beta:'베타',preparing:'준비 중',planned:'계획'};
  const filters=$('#status-filters'); filters.replaceChildren();
  groups.forEach(group=>{const b=document.createElement('button');b.type='button';b.textContent=labels[group];b.className=group===state.status?'is-active':'';b.addEventListener('click',()=>{state.status=group;renderStatus();});filters.append(b);});
  const root=$('#status-grid'); root.replaceChildren();
  state.catalog.services.filter(service=>state.status==='all'||service.status===state.status).forEach(service=>{const card=document.createElement('article');card.className='status-card';card.innerHTML=`<div><span>${escapeHtml(service.group)}</span><strong>${escapeHtml(service.name)}</strong></div><small class="${statusClass(service.status)}">${escapeHtml(service.statusLabel)}</small><p>${escapeHtml(service.summary)}</p>`;root.append(card);});
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
$$('.mode-button').forEach(button=>button.addEventListener('click',()=>{state.mode=button.dataset.mode;history.replaceState(null,'',state.mode==='developer'?'/developer':'/user');render();}));
load().catch(()=>{$('#experience-app').innerHTML='<section class="load-error"><h1>체험 정보를 불러오지 못했습니다.</h1><p>잠시 후 다시 열어 주세요.</p></section>';});
