(()=>{
'use strict';
const SECTION='invest';
if(!document.querySelector('link[data-ekodi-invest-admin]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/admin/invest-admin.css';l.dataset.ekodiInvestAdmin='true';document.head.append(l)}
const sites=[
  ['통합 허브','/invest'],['주식','/invest/stock'],['채권','/invest/bond'],['부동산','/invest/real-estate'],
  ['ETF·펀드','/invest/fund'],['대체투자','/invest/alternative'],['포트폴리오','/invest/portfolio'],['자동운용','/invest/automation']
];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){
  const host=document.querySelector('#investAdminPanel');if(!host)return;
  host.innerHTML=`<div class="invest-admin-head"><div><p class="kicker">EKODI INVEST</p><h2>투자 AI 운영관리</h2><p>자산군별 전문 AI는 분리하고 Portfolio AI·Risk Governor·Broker Hub·Audit Ledger를 공통 코어로 관리합니다.</p></div><a class="secondary" href="/invest" target="_blank" rel="noopener">Invest 열기 ↗</a></div>
  <div class="invest-admin-summary"><article><small>자동운용 기본</small><strong>SHADOW</strong><span>실거래 기본 잠금</span></article><article><small>실주문</small><strong>OFF</strong><span>별도 승인·증권사 인증 필요</span></article><article><small>브로커</small><strong>Adapter</strong><span>토스·IBKR부터 확장</span></article><article><small>감사</small><strong>ON</strong><span>판단·승인·결과 추적</span></article></div>
  <section class="invest-admin-card"><div class="invest-admin-subhead"><div><small>SPECIALIZED SITES</small><h3>자산군별 하위사이트</h3></div></div><div class="invest-admin-sites">${sites.map(([name,path])=>`<a href="${path}" target="_blank" rel="noopener"><strong>${esc(name)}</strong><span>${esc(path)}</span></a>`).join('')}</div></section>
  <section class="invest-admin-card"><div class="invest-admin-subhead"><div><small>IMMUTABLE SAFETY</small><h3>자동운용 상위 가드레일</h3></div></div><div class="invest-admin-locks"><article><span>Risk Governor</span><strong>상위 강제</strong></article><article><span>실거래 기본값</span><strong>OFF</strong></article><article><span>Credential 저장</span><strong>Core 금지</strong></article><article><span>미인가 관리형 운용</span><strong>비활성</strong></article><article><span>Kill Switch</span><strong>필수</strong></article><article><span>Audit Ledger</span><strong>필수</strong></article></div></section>`;
}
function activate(button){
  document.querySelectorAll('[data-panel]').forEach(panel=>{const visible=String(panel.dataset.panel||'').split(/\s+/).includes(SECTION);panel.hidden=!visible;panel.classList.toggle('hidden-panel',!visible)});
  document.querySelectorAll('.sidebar .nav').forEach(item=>item.classList.toggle('active',item===button));
  const title=document.querySelector('#pageTitle');if(title)title.textContent='투자 AI';
  document.querySelector('.sidebar')?.classList.remove('open');
  if(location.hash!=='#invest')history.replaceState(null,'','#invest');render();
}
function install(){
  const nav=document.querySelector('.sidebar nav'),content=document.querySelector('.content');if(!nav||!content)return;
  let button=nav.querySelector('[data-section="invest"],[data-lazy-section="invest"],[data-demand-feature="invest"]');
  if(!button){button=document.createElement('button');button.type='button';button.className='nav';button.append(document.createTextNode('I '),Object.assign(document.createElement('span'),{textContent:'투자 AI'}));nav.append(button)}
  button.dataset.section=SECTION;delete button.dataset.lazySection;delete button.dataset.demandFeature;
  let section=document.querySelector('#investAdminPanel');if(!section){section=document.createElement('section');section.id='investAdminPanel';section.className='section invest-admin hidden-panel';section.dataset.panel=SECTION;section.hidden=true;content.append(section)}
  if(button.dataset.investBound!=='true'){button.dataset.investBound='true';button.addEventListener('click',()=>activate(button))}
  window.dispatchEvent(new CustomEvent('ekodi-nav-changed',{detail:{feature:SECTION}}));
  const route=new URLSearchParams(location.search).get('route');if(location.hash==='#invest'||route==='invest')queueMicrotask(()=>activate(button));
}
install();window.addEventListener('ekodi-admin-ready',install);
window.EKODIInvestAdmin=Object.freeze({render});
})();
