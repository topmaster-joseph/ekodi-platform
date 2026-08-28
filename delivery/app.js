const workspace=document.getElementById('memberWorkspace');
const guide=document.getElementById('publicGuide');
const form=document.getElementById('recommendForm');
const result=document.getElementById('recommendResult');
const historyList=document.getElementById('historyList');
const brief=document.getElementById('operationsBrief');
const clearButton=document.getElementById('clearHistory');
const metricOrders=document.getElementById('metricOrders');
const metricFee=document.getElementById('metricFee');
const metricDelay=document.getElementById('metricDelay');
const STORAGE_KEY='ekodi.delivery.requests.v1';
const API_PREFIX='/delivery/api';
let signedIn=false;

const money=value=>`${Math.round(Number(value)||0).toLocaleString('ko-KR')}원`;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function readHistory(){try{const rows=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(rows)?rows.slice(0,30):[]}catch{return[]}}
function writeHistory(rows){localStorage.setItem(STORAGE_KEY,JSON.stringify(rows.slice(0,30)));}
async function post(path,payload){const response=await fetch(`${API_PREFIX}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||data.reason||`request_${response.status}`);return data;}

async function renderHistory(){
  if(!signedIn)return;
  const rows=readHistory();
  metricOrders.textContent=String(rows.length);
  if(!rows.length){historyList.innerHTML='<p class="empty-state">아직 기록이 없습니다.</p>';brief.innerHTML='<p>등록된 운영 데이터가 없습니다.</p>';metricFee.textContent='0원';metricDelay.textContent='0';return;}
  historyList.innerHTML=rows.map(row=>`<article class="history-item"><div><strong>${esc(row.recommendedName)}</strong><span>${new Date(row.createdAt).toLocaleString('ko-KR')}</span></div><div><b>${money(row.deliveryFee)}</b><span>${esc(row.etaMinutes)}분 · ${esc(row.priorityLabel)}</span></div></article>`).join('');
  try{
    const operations=await post('/operations-brief',{orders:rows.map(row=>({status:'planned',deliveryFee:row.deliveryFee,etaMinutes:row.etaMinutes,targetMinutes:row.priority==='speed'?25:45}))});
    metricFee.textContent=money(operations.averageDeliveryFee);
    metricDelay.textContent=String(operations.delayed);
    brief.innerHTML=operations.messages.map(message=>`<p>${esc(message)}</p>`).join('');
  }catch(error){brief.innerHTML=`<p>운영 브리프를 계산하지 못했습니다. ${esc(error.message)}</p>`;}
}

function renderRecommendation(data){
  const recommended=data.recommended;
  const comparison=data.comparison||{};
  result.innerHTML=`<div class="recommendation"><p class="eyebrow">추천</p><h4>${esc(recommended.name)}</h4><div class="recommend-stats"><span>배달비 <b>${money(recommended.fee)}</b></span><span>예상시간 <b>${esc(recommended.etaMinutes)}분</b></span><span>신뢰도 <b>${Math.round((recommended.reliability||0)*100)}%</b></span></div><ul>${(data.rationale||[]).map(item=>`<li>${esc(item)}</li>`).join('')}</ul><p class="safety-note">이 결과는 판단지원입니다. 외부 배차는 실행되지 않았습니다.</p>${comparison.feeRate!=null?`<small>주문금액 대비 예상 배달비 ${esc(comparison.feeRate)}%</small>`:''}</div>`;
}

if(form)form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!signedIn)return;
  const fd=new FormData(form);
  const priority=String(fd.get('priority')||'balanced');
  const labels={balanced:'균형',cost:'비용',speed:'속도'};
  const payload={order:{amount:Number(fd.get('orderAmount')||0),priority},providers:[
    {id:'manual-a',name:'대행 A',fee:Number(fd.get('aFee')||0),etaMinutes:Number(fd.get('aEta')||1),reliability:.9},
    {id:'manual-b',name:'대행 B',fee:Number(fd.get('bFee')||0),etaMinutes:Number(fd.get('bEta')||1),reliability:.92},
    {id:'manual-local',name:'지역 대행',fee:Number(fd.get('cFee')||0),etaMinutes:Number(fd.get('cEta')||1),reliability:.86},
  ]};
  result.innerHTML='<p class="empty-state">비용·시간·신뢰도를 계산하는 중입니다.</p>';
  try{
    const data=await post('/recommend',payload);
    renderRecommendation(data);
    const rows=readHistory();
    rows.unshift({createdAt:new Date().toISOString(),priority,priorityLabel:labels[priority]||'균형',recommendedId:data.recommendedProviderId,recommendedName:data.recommended.name,deliveryFee:data.recommended.fee,etaMinutes:data.recommended.etaMinutes,dispatchExecuted:false});
    writeHistory(rows);
    await renderHistory();
  }catch(error){result.innerHTML=`<p class="error-state">추천 계산에 실패했습니다. ${esc(error.message)}</p>`;}
});

if(clearButton)clearButton.addEventListener('click',()=>{if(!signedIn)return;localStorage.removeItem(STORAGE_KEY);renderHistory();result.innerHTML='조건을 입력하면 비용·시간·신뢰도 균형을 계산합니다.';});

async function applyAccountState(account={}){
  signedIn=Boolean(account.signedIn);
  document.documentElement.dataset.deliveryAuth=signedIn?'signed-in':'public';
  workspace.hidden=!signedIn;
  guide.hidden=signedIn;
  if(signedIn){await renderHistory();workspace.scrollIntoView({block:'start'});}
}
window.addEventListener('ekodi:delivery-account',event=>{applyAccountState(event.detail||{});});
if(window.EKODI_DELIVERY_ACCOUNT_STATE)applyAccountState(window.EKODI_DELIVERY_ACCOUNT_STATE);
