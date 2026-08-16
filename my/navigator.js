const form=document.querySelector('#navigatorForm');
const input=document.querySelector('#navigatorText');
const audience=document.querySelector('#navigatorAudience');
const result=document.querySelector('#navigatorResult');
const submit=document.querySelector('#navigatorSubmit');
const examples=[...document.querySelectorAll('[data-navigator-example]')];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);

function renderLoading(){
  result.innerHTML='<div class="navigator-empty"><strong>필요한 길을 찾고 있습니다.</strong><p>직업명을 정하는 대신 지금 하려는 일을 기준으로 전문 AI 능력을 조합합니다.</p></div>';
}

function renderError(){
  result.innerHTML='<div class="navigator-empty"><strong>지금은 경로를 만들지 못했습니다.</strong><p>잠시 후 다시 시도하거나, 하고 싶은 일을 조금 더 구체적으로 적어 주세요.</p></div>';
}

function render(data){
  const recommendations=Array.isArray(data?.recommendations)?data.recommendations:[];
  const capabilities=Array.isArray(data?.capabilities)?data.capabilities:[];
  const showrooms=Array.isArray(data?.showrooms)?data.showrooms:[];
  const gated=new Set(Array.isArray(data?.humanGateCapabilities)?data.humanGateCapabilities:[]);
  const top=recommendations[0];
  const packCards=recommendations.map((item,index)=>`<article class="path-card${index===0?' primary-path':''}"><small>${index===0?'가장 가까운 시작점':'함께 연결할 수 있는 영역'}</small><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p>${item.matchedSignals?.length?`<div class="path-signals">${item.matchedSignals.map(signal=>`<span>${esc(signal)}</span>`).join('')}</div>`:''}</article>`).join('');
  const capabilityChips=capabilities.slice(0,14).map(item=>`<span class="capability-chip${gated.has(item.id)?' gated':''}" title="${esc(item.description)}">${esc(item.name)}${gated.has(item.id)?' · 확인필요':''}</span>`).join('');
  const showroomLinks=showrooms.slice(0,5).map(item=>`<a class="showroom-link" href="${esc(item.url)}">${esc(item.name)} <span>↗</span></a>`).join('');
  result.innerHTML=`<div class="navigator-result-head"><div><small>MY PATH</small><strong>${esc(top?.name||'My EKODI 기본')}</strong></div><span>추천만 합니다 · 자동 실행 없음</span></div><div class="path-grid">${packCards}</div><div class="capability-panel"><div><small>뒤에서 함께 작동할 전문 AI</small><p>모듈 이름을 외울 필요는 없습니다. My EKODI가 필요한 능력을 묶어 사용하도록 돕습니다.</p></div><div class="capability-list">${capabilityChips||'<span class="capability-chip">AI 길찾기</span>'}</div></div>${showroomLinks?`<div class="showroom-row"><span>전문 영역을 직접 보고 싶다면</span>${showroomLinks}</div>`:''}${gated.size?'<p class="navigator-safety">계약, 권리, 보험 등 중요한 결정은 AI가 임의로 실행하지 않고 사람의 확인을 거칩니다.</p>':''}`;
}

async function navigate(event){
  event?.preventDefault();
  const text=String(input?.value||'').trim();
  if(!text){input?.focus();return}
  submit.disabled=true;
  submit.textContent='찾는 중…';
  renderLoading();
  try{
    const response=await fetch('/api/navigator',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,audience:audience?.value||'person'})});
    if(!response.ok)throw new Error(`navigator ${response.status}`);
    const data=await response.json();
    if(!data?.ok)throw new Error('navigator response');
    render(data);
  }catch(error){
    console.error('My EKODI navigator',error);
    renderError();
  }finally{
    submit.disabled=false;
    submit.textContent='내 길 찾기';
  }
}

form?.addEventListener('submit',navigate);
examples.forEach(button=>button.addEventListener('click',()=>{if(input)input.value=button.dataset.navigatorExample||'';navigate()}));