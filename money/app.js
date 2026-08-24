import { buildFinancialCleanupBrief } from './core.js';

const demoAccounts = [
  {id:'a1',institution:'국민은행',alias:'생활계좌',balance:1324000,inactiveDays:2,autoDebits:[{name:'통신비',amount:62000},{name:'보험료',amount:89000}],primary:true},
  {id:'a2',institution:'농협',alias:'예전 생활비',balance:67300,inactiveDays:482,autoDebits:[]},
  {id:'a3',institution:'신한은행',alias:'모임통장',balance:120120,inactiveDays:395,autoDebits:[{name:'정기후원',amount:10000}]},
  {id:'a4',institution:'우리은행',alias:'예전 급여계좌',balance:0,inactiveDays:228,autoDebits:[],linkedCard:true},
  {id:'a5',institution:'하나은행',alias:'대출연결계좌',balance:24000,inactiveDays:560,autoDebits:[],linkedLoan:true}
];

const money = value => `${Number(value||0).toLocaleString('ko-KR')}원`;
const labels = {keep:'유지',review:'검토',cleanup:'정리 추천',attention:'확인 필요'};
const providerStates={available:'공식 연결 가능','contract-required':'계약 필요','legal-review':'법적 검토','configured-awaiting-approval':'설정 완료·승인 대기'};
const defaultScopes=['accounts:read','balances:read','transactions:read','autopay:read'];

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}

function render(accounts=demoAccounts){
  const brief=buildFinancialCleanupBrief(accounts,'a1');
  const s=brief.summary;
  document.querySelector('#summary').innerHTML = `
    <article class="metric"><span>연결 계좌</span><strong>${s.accounts}</strong><small>예시 분석</small></article>
    <article class="metric"><span>정리·확인 후보</span><strong>${s.actionable}</strong><small>AI 판단 후보</small></article>
    <article class="metric"><span>자동이체 연결</span><strong>${s.autoDebits}</strong><small>해지 전 우선 확인</small></article>
    <article class="metric"><span>표시 잔액</span><strong>${money(s.balance)}</strong><small>예시 데이터 기준</small></article>`;

  document.querySelector('#findings').innerHTML = brief.plan.findings.map(({status,reason,account})=>`
    <div class="finding ${status}">
      <div class="finding-top"><span class="badge">${labels[status]}</span><strong>${escapeHtml(account.institution)} · ${escapeHtml(account.alias)}</strong></div>
      <p>${escapeHtml(reason)}</p>
      <div class="meta"><span>미사용 ${account.inactiveDays.toLocaleString('ko-KR')}일</span><span>잔액 ${money(account.balance)}</span><span>자동이체 ${account.autoDebits.length}건</span></div>
    </div>`).join('');

  const steps=brief.plan.steps;
  document.querySelector('#plan').innerHTML = steps.length ? steps.map((step,index)=>`
    <div class="step">
      <span class="step-index">${index+1}</span>
      <div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.reason)}</p><span class="gate">본인 승인 필요</span></div>
    </div>`).join('') : '<p class="empty">현재 예시에서는 추가 정리 단계가 없습니다.</p>';
}

async function api(path,options={}){
  const response=await fetch(path,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  return {response,data};
}

function providerButton(provider){
  if(provider.id==='accountinfo')return '<button class="primary provider-connect" type="button">공식 서비스 열기</button>';
  return '<button class="secondary provider-connect" type="button">연결 준비 상태 확인</button>';
}

function renderProviders(readiness){
  const root=document.querySelector('#integrations');
  if(!root)return;
  root.innerHTML=readiness.providers.map(provider=>`
    <article class="provider-card" data-provider="${escapeHtml(provider.id)}">
      <div class="provider-top"><span class="state-chip ${escapeHtml(provider.state)}">${escapeHtml(providerStates[provider.state]||provider.state)}</span><strong>${escapeHtml(provider.name)}</strong></div>
      <p>${escapeHtml(provider.note)}</p>
      <div class="capabilities">${provider.capabilities.slice(0,5).map(item=>`<span>${escapeHtml(item)}</span>`).join('')}</div>
      <div class="provider-actions">${providerButton(provider)}<button class="ghost consent-preview" type="button">동의 범위 보기</button></div>
    </article>`).join('');
}

async function loadIntegrations(){
  const status=document.querySelector('#integration-status');
  try{
    const {response,data}=await api('/api/integrations',{method:'GET',headers:{}});
    if(!response.ok)throw new Error('integration_status_unavailable');
    renderProviders(data);
    if(status)status.textContent=data.openBankingConfigured?'오픈뱅킹 어댑터: 승인 대기':'오픈뱅킹 어댑터: 계약 전 안전 대기';
  }catch{
    if(status)status.textContent='연동상태를 불러오지 못했습니다. 금융 실행 기능은 계속 차단되어 있습니다.';
  }
}

async function showConsent(providerId){
  const box=document.querySelector('#consent-detail');
  if(!box)return;
  const {response,data}=await api('/api/consent/preview',{method:'POST',body:JSON.stringify({providerId,scopes:defaultScopes})});
  if(!response.ok){box.innerHTML='<p class="empty">동의 구조를 확인할 수 없습니다.</p>';return;}
  box.innerHTML=`<div class="consent-panel"><strong>${escapeHtml(data.provider.name)} 연결 동의 미리보기</strong><p>${escapeHtml(data.purpose)}</p><div class="meta">${data.scopes.map(scope=>`<span>${escapeHtml(scope)}</span>`).join('')}</div><p><b>수집:</b> ${escapeHtml(data.collection)}</p><p><b>보관:</b> ${escapeHtml(data.retention)}</p><p><b>실행:</b> ${escapeHtml(data.execution)}</p><span class="gate">언제든 철회 가능 · 금융행위 별도 승인</span></div>`;
  box.scrollIntoView({behavior:'smooth',block:'nearest'});
}

async function connectProvider(providerId){
  const {response,data}=await api('/api/connect/begin',{method:'POST',body:JSON.stringify({providerId,scopes:defaultScopes})});
  if(response.ok&&data.mode==='official-handoff'&&data.url){window.open(data.url,'_blank','noopener,noreferrer');return;}
  const box=document.querySelector('#consent-detail');
  if(box)box.innerHTML=`<div class="consent-panel"><strong>아직 실제 API 연결 전입니다.</strong><p>${escapeHtml(data.message||'정식 계약과 보안검토가 완료된 뒤 활성화됩니다.')}</p><span class="state-chip">${escapeHtml(providerStates[data.state]||data.state||'준비중')}</span></div>`;
}

function announce(){
  render();
  const target=document.querySelector('#summary');
  target.scrollIntoView({behavior:'smooth',block:'start'});
}

document.querySelector('#analyze')?.addEventListener('click',announce);
document.querySelector('#load-demo')?.addEventListener('click',render);
document.querySelector('#integrations')?.addEventListener('click',event=>{
  const card=event.target.closest('[data-provider]');if(!card)return;
  const providerId=card.dataset.provider;
  if(event.target.closest('.consent-preview'))void showConsent(providerId);
  if(event.target.closest('.provider-connect'))void connectProvider(providerId);
});
render();
void loadIntegrations();
