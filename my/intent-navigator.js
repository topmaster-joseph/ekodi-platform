const form=document.querySelector('#intentPlanForm');
const input=document.querySelector('#intentPlanText');
const audience=document.querySelector('#intentPlanAudience');
const result=document.querySelector('#intentPlanResult');
const submit=document.querySelector('#intentPlanSubmit');
const examples=[...document.querySelectorAll('[data-intent-example]')];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const tierLabel=tier=>({observe:'관찰',assist:'준비·지원',execute_reversible:'자율 실행 후보',human_gate:'내 결정 필요',forbidden:'실행 금지'})[tier]||tier;
function loading(){result.innerHTML='<div class="intent-empty"><strong>필요한 능력을 조합하고 있습니다.</strong><p>등록된 Capability만 사용하고, 서비스나 AI 공급자는 그 다음에 선택합니다.</p></div>'}
function error(message='계획을 만들지 못했습니다.'){result.innerHTML=`<div class="intent-empty intent-error"><strong>${esc(message)}</strong><p>잠시 후 다시 시도하거나 원하는 결과를 조금 더 구체적으로 적어 주세요.</p></div>`}
function render(data){
 const recommendations=Array.isArray(data?.recommendations)?data.recommendations:[];
 const capabilities=Array.isArray(data?.capabilities)?data.capabilities:[];
 const showrooms=Array.isArray(data?.showrooms)?data.showrooms:[];
 const top=recommendations[0];
 const cards=recommendations.map((item,index)=>`<article class="intent-pack${index===0?' primary':''}"><small>${index===0?'추천 Workspace Pack':'함께 고려'}</small><h3>${esc(item.name||item.id)}</h3><p>${esc(item.description||'')}</p>${item.matchedSignals?.length?`<div class="intent-signals">${item.matchedSignals.map(v=>`<span>${esc(v)}</span>`).join('')}</div>`:''}</article>`).join('');
 const chips=capabilities.map(item=>`<span class="intent-capability tier-${esc(item.actionTier)}" title="${esc(item.description)}"><b>${esc(item.name)}</b><small>${esc(tierLabel(item.actionTier))}</small></span>`).join('');
 const links=showrooms.map(item=>`<a class="intent-showroom" href="${esc(item.url)}">${esc(item.name)} →</a>`).join('');
 const gated=Array.isArray(data?.humanGateCapabilities)&&data.humanGateCapabilities.length>0;
 result.innerHTML=`<div class="intent-result-head"><div><small>INTENT PLAN · ${esc(data.contract||'')}</small><strong>${esc(top?.name||'My EKODI')}</strong></div><span>${esc(data.autonomyPolicyVersion||'')}</span></div><div class="intent-pack-grid">${cards}</div><div class="intent-capability-panel"><div><small>CAPABILITIES</small><p>서비스가 아니라 필요한 능력을 먼저 조합했습니다.</p></div><div class="intent-capability-list">${chips}</div></div>${links?`<div class="intent-showrooms"><span>연결 가능한 전문 서비스</span>${links}</div>`:''}<p class="intent-safety">${gated?'중요 결정은 사용자에게 남기고, 그 외 작업은 서버 권한 재검증 후 EKODI 자율운영으로 이어집니다.':'이 계획은 서버 권한 재검증 후 허용된 범위에서 자율 실행으로 이어집니다.'}</p>`;
}
async function navigate(event){event?.preventDefault();const text=String(input?.value||'').trim();if(!text){input?.focus();return}submit.disabled=true;submit.textContent='계획 중';loading();try{const response=await fetch('/api/intent/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,audience:audience?.value||'person'})});const data=await response.json();if(!response.ok||!data?.ok)throw new Error(data?.error||`intent_${response.status}`);render(data)}catch(e){console.error('EKODI Intent OS',e);error()}finally{submit.disabled=false;submit.textContent='계획 만들기'}}
form?.addEventListener('submit',navigate);
examples.forEach(button=>button.addEventListener('click',()=>{if(input)input.value=button.dataset.intentExample||'';navigate()}));
