import { buildFinancialCleanupBrief } from './core.js';

const demoAccounts = [];

const money = value => `${Number(value||0).toLocaleString('ko-KR')}원`;
const labels = {keep:'유지',review:'검토',cleanup:'정리 추천',attention:'확인 필요'};
const providerStates={available:'공식 연결 가능','contract-required':'계약 필요','legal-review':'법적 검토','configured-awaiting-approval':'설정 완료·승인 대기'};
const defaultScopes=['accounts:read','balances:read','transactions:read','autopay:read'];

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}

function render(accounts=[]){
  if(!accounts.length){
    document.querySelector('#summary').innerHTML='<article class="metric"><span>개인 원장</span><strong>실데이터 미연결</strong><small>My EKODI에서 로그인 후 확인</small></article>';
    document.querySelector('#findings').innerHTML='<p class="empty">공개 Money 화면에는 개인 잔액이나 예시 숫자를 표시하지 않습니다.</p>';
    document.querySelector('#plan').innerHTML='<p class="empty">나의 재무는 My EKODI의 개인 원장에서 확인합니다.</p>';
    return;
  }
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

function renderRefundSources(data){
  const root=document.querySelector('#refunds'),benefit=document.querySelector('#benefit-source'),status=document.querySelector('#refund-status');
  if(!root)return;
  root.innerHTML=(data.sources||[]).map(source=>`<article class="provider-card refund-source-card" data-refund-source="${escapeHtml(source.id)}"><div class="provider-top"><span class="state-chip available">공식기관</span><strong>${escapeHtml(source.name)}</strong></div><p>${escapeHtml(source.scope)}</p><div class="capabilities"><span>${escapeHtml(source.agency)}</span><span>본인인증</span></div><div class="provider-actions"><button class="primary refund-open" type="button">조회·신청 열기</button></div></article>`).join('');
  if(benefit&&data.benefit)benefit.innerHTML=`<div><strong>환급 외 받을 수 있는 혜택도 확인</strong><p>정부24 혜택알리미는 환급금과 분리하여 맞춤 혜택을 찾습니다.</p></div><a class="secondary" href="${escapeHtml(data.benefit.url)}" target="_blank" rel="noopener noreferrer">혜택알리미 열기</a>`;
  if(status)status.textContent=`${(data.sources||[]).length}개 공식 조회 경로 · ${escapeHtml(data.verifiedAt||'')} 확인`;
}
async function loadRefundSources(){try{const {response,data}=await api('/api/refunds/sources',{method:'GET',headers:{}});if(!response.ok)throw new Error('refund_sources_unavailable');renderRefundSources(data)}catch{const status=document.querySelector('#refund-status');if(status)status.textContent='공식 조회처를 불러오지 못했습니다.'}}
async function openRefundSource(sourceId){const {response,data}=await api('/api/refunds/handoff',{method:'POST',body:JSON.stringify({sourceId})});if(response.ok&&data.mode==='official-handoff'&&data.url)window.open(data.url,'_blank','noopener,noreferrer')}

function announce(){
  render();
  const target=document.querySelector('#summary');
  target.scrollIntoView({behavior:'smooth',block:'start'});
}

document.querySelector('#analyze')?.addEventListener('click',announce);

document.querySelector('#refunds')?.addEventListener('click',event=>{const card=event.target.closest('[data-refund-source]');if(card&&event.target.closest('.refund-open'))void openRefundSource(card.dataset.refundSource)});

document.querySelector('#integrations')?.addEventListener('click',event=>{
  const card=event.target.closest('[data-provider]');if(!card)return;
  const providerId=card.dataset.provider;
  if(event.target.closest('.consent-preview'))void showConsent(providerId);
  if(event.target.closest('.provider-connect'))void connectProvider(providerId);
});
render();
void loadIntegrations();
void loadRefundSources();
