(()=>{
'use strict';
const SECTION='invest';
const API='https://ekodi.kr/workspace-api';
const SESSION_KEY='ekodi_platform_session_v1';
if(!document.querySelector('link[data-ekodi-invest-admin]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/admin/invest-admin.css';l.dataset.ekodiInvestAdmin='true';document.head.append(l)}
const sites=[
  ['통합 허브','/invest'],['내 투자','/invest/personal'],['투자기회','/invest/opportunities'],['기업·프로젝트','/invest/projects'],
  ['실사·Evidence','/invest/diligence'],['투자 연결','/invest/matching'],['사후관리','/invest/aftercare'],
  ['주식','/invest/stock'],['채권','/invest/bond'],['부동산','/invest/real-estate'],['ETF·펀드','/invest/fund'],
  ['대체투자','/invest/alternative'],['포트폴리오','/invest/portfolio'],['자동운용','/invest/automation']
];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const session=()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}};
function renderReadiness(data){
  const host=document.querySelector('#investBrokerReadiness');if(!host)return;
  const rows=Array.isArray(data?.readiness)?data.readiness:[];
  if(!rows.length){host.innerHTML='<article><span>Broker Readiness Gate</span><strong>증거 없음</strong><small>브로커 연결 후 Shadow/Simulation 준비도를 판정합니다.</small></article>';return}
  host.innerHTML=rows.map(item=>{
    const stage=item.liveEligible?'LIMITED LIVE ELIGIBLE':item.limitedLivePrerequisitesReady?'전제조건 충족 · LIVE 정책잠금':item.simulationReady?'SIMULATION READY':'SHADOW';
    const blockers=Array.isArray(item.blockers)?item.blockers.length:0;
    const freshness=item?.checks?.marketDataFresh===true?'시장데이터 신선도 확인':'시장데이터 신선도 probe 필요';
    return `<article><span>${esc(item.brokerName||item.brokerId)} · ${esc(item.requiredMode||'shadow')}</span><strong>${esc(stage)}</strong><small>${esc(freshness)} · 차단 ${blockers}개 · credential 원문 비노출</small></article>`;
  }).join('');
}
async function loadReadiness(){
  const host=document.querySelector('#investBrokerReadiness');if(!host)return;
  const s=session();
  if(!s?.access_token){host.innerHTML='<article><span>Broker Readiness Gate</span><strong>로그인 세션 필요</strong><small>인증 후 현재 주체의 비밀 없는 준비도 증거를 조회합니다. 실거래는 계속 OFF입니다.</small></article>';return}
  try{
    const response=await fetch(API+'/v1/invest/automation/readiness',{headers:{authorization:'Bearer '+s.access_token}});
    if(!response.ok){host.innerHTML=`<article><span>Broker Readiness Gate</span><strong>조회 차단 ${response.status}</strong><small>권한·주체 경계를 확인하십시오. 실거래는 활성화되지 않습니다.</small></article>`;return}
    renderReadiness(await response.json());
  }catch{
    host.innerHTML='<article><span>Broker Readiness Gate</span><strong>API 확인 필요</strong><small>연결 상태를 확인하십시오. 실패 시에도 fail-closed로 실거래는 OFF입니다.</small></article>';
  }
}
function render(){
  const host=document.querySelector('#investAdminPanel');if(!host)return;
  host.innerHTML=`<div class="invest-admin-head"><div><p class="kicker">EKODI INVEST</p><h2>투자 AI 운영관리</h2><p>투자기회 발굴·기업/프로젝트·Evidence 실사·투자 연결·사후관리와 금융자산 분석을 하나의 Investment OS에서 관리합니다.</p></div><a class="secondary" href="/invest" target="_blank" rel="noopener">Invest 열기 ↗</a></div>
  <div class="invest-admin-summary"><article><small>자동운용 기본</small><strong>SHADOW</strong><span>실거래 기본 잠금</span></article><article><small>실주문</small><strong>OFF</strong><span>별도 승인·증권사 인증 필요</span></article><article><small>브로커</small><strong>Adapter</strong><span>토스·IBKR부터 확장</span></article><article><small>감사</small><strong>ON</strong><span>판단·승인·결과 추적</span></article></div>
  <section class="invest-admin-card"><div class="invest-admin-subhead"><div><small>INVESTMENT LIFECYCLE</small><h3>투자기회 → 실사 → 연결 → 사후관리</h3><p>프로젝트와 투자자는 Evidence를 기준으로 검토하며, 연결 후보 제시와 투자 실행을 분리합니다.</p></div></div><div class="invest-admin-locks"><article><span>투자기회</span><strong>발굴·분류</strong></article><article><span>기업·프로젝트</span><strong>IR·지표</strong></article><article><span>실사·Evidence</span><strong>원자료 우선</strong></article><article><span>투자 연결</span><strong>사람 최종결정</strong></article><article><span>사후관리</span><strong>성과·약정 추적</strong></article><article><span>규제 경계</span><strong>실행 분리</strong></article></div></section>
  <section class="invest-admin-card"><div class="invest-admin-subhead"><div><small>BROKER READINESS GATE</small><h3>브로커 준비도·차단요인</h3><p>비밀값은 읽거나 표시하지 않고 연결 참조·권한·시장데이터·리스크·Kill Switch·감사 증거만 판정합니다. 준비도는 실거래 승인이 아닙니다.</p></div></div><div id="investBrokerReadiness" class="invest-admin-locks"><article><span>Broker Readiness Gate</span><strong>확인 중</strong><small>실거래 OFF 유지</small></article></div></section>
  <section class="invest-admin-card"><div class="invest-admin-subhead"><div><small>SPECIALIZED SITES</small><h3>투자기회·자산 하위사이트</h3></div></div><div class="invest-admin-sites">${sites.map(([name,path])=>`<a href="${path}" target="_blank" rel="noopener"><strong>${esc(name)}</strong><span>${esc(path)}</span></a>`).join('')}</div></section>
  <section class="invest-admin-card"><div class="invest-admin-subhead"><div><small>IMMUTABLE SAFETY</small><h3>자동운용 상위 가드레일</h3></div></div><div class="invest-admin-locks"><article><span>Risk Governor</span><strong>상위 강제</strong></article><article><span>실거래 기본값</span><strong>OFF</strong></article><article><span>Credential 저장</span><strong>Core 금지</strong></article><article><span>미인가 관리형 운용</span><strong>비활성</strong></article><article><span>Kill Switch</span><strong>필수</strong></article><article><span>Audit Ledger</span><strong>필수</strong></article></div></section>`;
}
function activate(button){
  document.querySelectorAll('[data-panel]').forEach(panel=>{const visible=String(panel.dataset.panel||'').split(/\s+/).includes(SECTION);panel.hidden=!visible;panel.classList.toggle('hidden-panel',!visible)});
  document.querySelectorAll('.sidebar .nav').forEach(item=>item.classList.toggle('active',item===button));
  const title=document.querySelector('#pageTitle');if(title)title.textContent='투자 AI';
  document.querySelector('.sidebar')?.classList.remove('open');
  if(location.hash!=='#invest')history.replaceState(null,'','#invest');render();loadReadiness();
}
function install(){
  const nav=document.querySelector('.sidebar nav'),content=document.querySelector('.content');if(!nav||!content)return;
  let button=nav.querySelector('[data-section="invest"],[data-lazy-section="invest"],[data-demand-feature="invest"]');
  if(!button){button=document.createElement('button');button.type='button';button.className='nav';button.append(document.createTextNode('I '),Object.assign(document.createElement('span'),{textContent:'투자 AI'}));nav.append(button)}
  button.dataset.section=SECTION;delete button.dataset.lazySection;delete button.dataset.demandFeature;
  let section=document.querySelector('#investAdminPanel');if(!section){section=document.createElement('section');section.id='investAdminPanel';section.className='section invest-admin hidden-panel';section.dataset.panel=SECTION;section.hidden=true;content.append(section)}
  if(button.dataset.investBound!=='true'){button.dataset.investBound='true';button.addEventListener('click',()=>activate(button))}
  render();loadReadiness();
  window.dispatchEvent(new CustomEvent('ekodi-nav-changed',{detail:{feature:SECTION}}));
  const route=new URLSearchParams(location.search).get('route');if(location.hash==='#invest'||route==='invest')queueMicrotask(()=>activate(button));
}
install();window.addEventListener('ekodi-admin-ready',install);window.addEventListener('storage',event=>{if(event.key===SESSION_KEY)loadReadiness()});
window.EKODIInvestAdmin=Object.freeze({render,loadReadiness});
})();