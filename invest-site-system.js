import { investPersonalPage, investPersonalScript } from './invest-personal-control.js';

const HEADERS={'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=60','x-content-type-options':'nosniff','referrer-policy':'same-origin'};
const SCRIPT_HEADERS={'content-type':'application/javascript; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'};

export const INVEST_ASSET_SITES=Object.freeze([
  {id:'hub',path:'/invest',name:'Invest',tag:'Investment OS',summary:'투자기회 발굴부터 Evidence·실사·연결·사후관리와 금융자산 분석까지 하나의 공통 투자 운영체계로 연결합니다.'},
  {id:'personal',path:'/invest/personal',name:'내 투자',tag:'Personal Investment OS',summary:'로그인한 개인의 투자목표·정책·관심기회·포트폴리오와 승인된 계좌연결 상태를 한 곳에서 관리합니다.'},
  {id:'opportunities',path:'/invest/opportunities',name:'투자기회',tag:'Opportunity Discovery',summary:'기업·창업·소상공인·지역·임팩트 프로젝트와 금융자산의 투자 검토 대상을 근거 중심으로 탐색합니다.'},
  {id:'projects',path:'/invest/projects',name:'기업·프로젝트',tag:'Project Investment',summary:'기업과 사업·프로젝트의 사업모델, 자금용도, IR, 주요 지표와 투자 검토 상태를 관리합니다.'},
  {id:'diligence',path:'/invest/diligence',name:'실사·Evidence',tag:'Evidence & Diligence',summary:'공식자료·재무·계약·시장근거·위험요소와 반대근거를 분리해 검증 가능한 실사 기록으로 관리합니다.'},
  {id:'matching',path:'/invest/matching',name:'투자 연결',tag:'Investor Matching',summary:'투자자·전문가·기관·인가 금융사업자와 프로젝트의 조건을 비교해 연결 후보를 제시하고 사람이 최종 결정합니다.'},
  {id:'aftercare',path:'/invest/aftercare',name:'사후관리',tag:'Post-Investment',summary:'투자 이후 사업성과·보고·약정·권리·주요 변경사항을 추적하고 이해관계자 소통 기록을 남깁니다.'},
  {id:'stock',path:'/invest/stock',name:'주식',tag:'Stock Engine',summary:'기업·시장·뉴스·퀀트·포트폴리오 AI와 멀티브로커 분석을 결합합니다.'},
  {id:'bond',path:'/invest/bond',name:'채권',tag:'Bond Engine',summary:'금리·만기·듀레이션·신용·현금흐름을 중심으로 분석합니다.'},
  {id:'real-estate',path:'/invest/real-estate',name:'부동산',tag:'Real Estate Engine',summary:'입지·가격·임대수익·공실·대출·세금·실사 자료를 종합합니다.'},
  {id:'fund',path:'/invest/fund',name:'ETF·펀드',tag:'Fund Engine',summary:'구성종목·비용·추적오차·중복노출과 자산배분을 분석합니다.'},
  {id:'alternative',path:'/invest/alternative',name:'대체투자',tag:'Alternative Engine',summary:'유동성·회수구조·상대방·구조적 위험을 우선 검증합니다.'},
  {id:'portfolio',path:'/invest/portfolio',name:'포트폴리오',tag:'Portfolio AI',summary:'모든 자산군을 통합해 노출·유동성·집중도·리밸런싱을 관리합니다.'},
  {id:'automation',path:'/invest/automation',name:'자동운용',tag:'Simulation Automation',summary:'감시→분석→반론→배분→리스크→승인 게이트를 Shadow/Simulation 우선으로 검증합니다.'}
]);

export function investSiteForPath(pathname){const path=String(pathname||'').replace(/\/+$/,'')||'/';return INVEST_ASSET_SITES.find(site=>site.path===path)||null}
export function isInvestPath(pathname){const path=String(pathname||'');return path==='/invest'||path==='/invest/'||path.startsWith('/invest/')}
function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function nav(active){return INVEST_ASSET_SITES.map(site=>`<a class="${site.id===active?'active':''}" href="${site.path}">${esc(site.name)}</a>`).join('')}
function engineCards(site){
  if(site.id==='hub')return INVEST_ASSET_SITES.filter(item=>!['hub'].includes(item.id)).map(item=>`<a class="card" href="${item.path}"><small>${esc(item.tag)}</small><h3>${esc(item.name)}</h3><p>${esc(item.summary)}</p></a>`).join('');
  const common=[['전문 AI','자산별 전문 AI가 독립적으로 근거와 위험을 평가합니다.'],['반론 AI','반대 근거와 판단 무효화 조건을 별도로 보존합니다.'],['Risk Governor','집중도·손실·레버리지·데이터 신선도·승인 조건을 상위에서 강제합니다.'],['Audit Ledger','판단·승인·실행·성과를 감사 가능한 참조로 남깁니다.']];
  if(site.id==='opportunities')common.splice(0,0,['기회 분류','기업·창업·소상공인·지역·임팩트·금융자산을 같은 검토 형식으로 정리하되 서로 다른 위험 특성을 유지합니다.']);
  if(site.id==='projects')common.splice(0,0,['IR 준비','사업모델·팀·시장·재무·자금용도·회수구조를 투자 검토 자료와 연결합니다.']);
  if(site.id==='diligence')common.splice(0,0,['Evidence Room','원자료·출처·확인일·검증상태·반대근거를 분리 보관해 AI 판단보다 근거가 먼저 보이게 합니다.']);
  if(site.id==='matching')common.splice(0,0,['Connection Gate','조건이 맞는 연결 후보만 제시하며 투자 권유·중개·체결로 자동 전환하지 않습니다.']);
  if(site.id==='aftercare')common.splice(0,0,['성과 추적','약정된 지표와 실제 사업성과·주요 변경사항·보고 이력을 지속적으로 비교합니다.']);
  if(site.id==='stock')common.splice(2,0,['Multi-Broker Hub','공식 API가 검증된 증권사 연결을 계좌별 권한으로 분리하며 라이브 주문은 기본 비활성화합니다.']);
  if(site.id==='portfolio')common.splice(1,0,['통합 배분','주식·채권·부동산·ETF·대체투자를 전체 자산 관점에서 조정합니다.']);
  if(site.id==='automation')common.splice(1,0,['Supervisor AI','거래빈도·성과열화·체결오차·시장체제 변화를 감시하고 Safe Mode/Halt를 발동합니다.']);
  return common.map(([title,body])=>`<article class="card"><small>${esc(site.tag)}</small><h3>${esc(title)}</h3><p>${esc(body)}</p></article>`).join('');
}
function loop(){return `<div class="loop"><span>시장감시</span><b>→</b><span>기회발견</span><b>→</b><span>전문분석</span><b>→</b><span>반론검증</span><b>→</b><span>자산배분</span><b>→</b><span>리스크심사</span><b>→</b><span>집행</span><b>→</b><span>체결감시</span><b>→</b><span>성과평가</span><b>→</b><span>리밸런싱</span></div>`}
export function investSitePage(site){
  const automation=site.id==='automation';
  const stock=site.id==='stock';
  const status=automation?'<section class="statusbox"><div><small>AUTOMATION STATUS</small><h2 id="autoState">로그인 후 운용 상태를 확인합니다.</h2><p id="autoDetail">실거래는 기본 잠금이며, 모의운용과 Shadow 검증이 우선입니다.</p></div><a class="button" href="/invest/admin">관리</a></section>':'';
  const broker=stock?'<section class="statusbox"><div><small>MULTI-BROKER</small><h2>증권사는 선택·병행 가능한 Adapter 방식</h2><p>토스증권·IBKR를 시작으로 공식 API가 검증된 증권사만 연결합니다. 계좌별 조회·주문 권한을 분리합니다.</p></div><div><a class="button" href="/invest/personal">내 투자관리</a></div></section>':'';
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EKODI Invest · ${esc(site.name)}</title><style>
:root{color-scheme:dark;--bg:#07120d;--panel:#0e2118;--line:#294735;--accent:#d8eb78;--text:#f7f9f4;--muted:#adbbb1}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 90% 0,#1b3825 0,transparent 34rem),var(--bg);color:var(--text);font:15px/1.65 Inter,system-ui,sans-serif}a{color:inherit;text-decoration:none}.wrap{max-width:1220px;margin:auto;padding:24px 20px 70px}.top{display:flex;align-items:center;justify-content:space-between;gap:18px}.brand{font-weight:900;letter-spacing:.08em}.admin{font-size:13px;color:var(--accent)}nav{display:flex;flex-wrap:wrap;gap:7px;margin:26px 0}nav a{padding:8px 11px;border:1px solid var(--line);border-radius:999px;color:var(--muted)}nav a.active{background:var(--accent);color:#0b1711;border-color:var(--accent)}.hero{padding:42px 0 28px;max-width:900px}.eyebrow,small{color:var(--accent);font-weight:800;letter-spacing:.11em}.hero h1{font-size:clamp(36px,6vw,68px);line-height:1.02;letter-spacing:-.045em;margin:10px 0 18px}.hero p,.card p,.statusbox p{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card,.statusbox{border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.025);padding:18px}.card h3,.statusbox h2{margin:5px 0 7px}.statusbox{display:flex;justify-content:space-between;gap:18px;align-items:center;margin:18px 0}.button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 15px;border-radius:12px;background:var(--accent);color:#0b1711;font-weight:800;white-space:nowrap}.loop{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:18px 0 24px}.loop span{border:1px solid var(--line);border-radius:12px;padding:9px 11px;background:var(--panel)}.loop b{color:var(--accent)}.policy{margin-top:26px;padding:18px;border-left:3px solid var(--accent);background:rgba(216,235,120,.04);color:var(--muted)}footer{margin-top:34px;color:var(--muted);font-size:12px}@media(max-width:760px){.top{align-items:flex-start}.grid{grid-template-columns:1fr}.statusbox{align-items:flex-start;flex-direction:column}.hero{padding-top:28px}}
</style></head><body><main class="wrap" data-ekodi-invest-site="${esc(site.id)}"><header class="top"><a class="brand" href="/invest">EKODI · INVEST</a><a class="admin" href="/invest/admin">관리자</a></header><nav>${nav(site.id)}</nav><section class="hero"><div class="eyebrow">${esc(site.tag)}</div><h1>${esc(site.name)}<br>전문 AI 운용</h1><p>${esc(site.summary)}</p></section>${automation?loop():''}${status}${broker}<section class="grid">${engineCards(site)}</section><div class="policy"><strong>Evidence First · Analysis & Connection Only</strong><br>EKODI Invest는 투자기회 탐색·분석·실사·연결·사후관리를 지원합니다. 투자금 수취·수탁·증권 중개·투자일임·수익보장을 자체 실행하지 않으며, 인허가가 필요한 거래는 적법한 외부 금융주체 경계를 통과해야 합니다. 자동운용 기본값은 Shadow/Simulation이고 라이브 주문은 별도 적법성·권한·Risk Governor 검증 전 활성화되지 않습니다.</div><footer>EKODI Invest · Specialized AI · Portfolio · Risk · Broker · Audit</footer>${automation?'<script src="/invest/assets/app.js" defer></script>':''}</main></body></html>`,{headers:HEADERS});
}
export function investSiteScript(){return new Response(`(()=>{'use strict';const S='ekodi_platform_session_v1';function session(){try{return JSON.parse(localStorage.getItem(S)||'null')}catch{return null}}async function load(){const s=session(),state=document.getElementById('autoState'),detail=document.getElementById('autoDetail');if(!state||!detail)return;if(!s?.access_token){state.textContent='Shadow / Simulation 기본';detail.textContent='로그인하면 개인 또는 승인된 Workspace의 실제 운용정책 상태를 확인할 수 있습니다.';return}try{const r=await fetch('/workspace-api/v1/invest/automation/status',{headers:{authorization:'Bearer '+s.access_token}});const d=await r.json();if(!r.ok)throw new Error(d.error||'STATUS_FAILED');state.textContent=(d.policy?.mode||'shadow').toUpperCase()+' · '+(d.policy?.state||'ready');detail.textContent='실거래 기본 잠금 '+(d.policy?.liveTradingEnabled?'해제':'유지')+' · 전략 '+Number(d.strategyCount||0)+'개 · 최근 순환 '+(d.lastCycle?.status||'없음')}catch(e){state.textContent='운용 상태 확인 필요';detail.textContent=String(e.message||e)}}load();})();`,{headers:SCRIPT_HEADERS})}

export function investAdminHandoff(request){const target=new URL('/admin/',request.url);target.searchParams.set('route','invest');target.searchParams.set('source','/invest/admin');return new Response(null,{status:302,headers:{location:target.toString(),'cache-control':'no-store','x-content-type-options':'nosniff'}})}

export function routeInvestSite(request){
  if(!['GET','HEAD'].includes(request.method))return null;
  const url=new URL(request.url),path=url.pathname.replace(/\/+$/,'')||'/';
  if(path==='/invest/admin')return investAdminHandoff(request);
  if(path==='/invest/personal')return investPersonalPage();
  if(path==='/invest/assets/personal.js')return investPersonalScript();
  if(path==='/invest/assets/app.js')return investSiteScript();
  const site=investSiteForPath(path);if(!site)return isInvestPath(path)?new Response('Not Found',{status:404,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}}):null;
  return investSitePage(site);
}
