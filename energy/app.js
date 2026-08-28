const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const WORKSPACE_API=`${SUPABASE_URL}/functions/v1/workspace-api`;
const WORKSPACE_STORAGE_KEY='ekodi_energy_workspace';
let authClientPromise=null;

function workspacePickerHref(){
  const current=new URL(location.href);current.hash='';
  const target=new URL('https://my.ekodi.kr/');
  target.searchParams.set('return_to',current.href);target.hash='workspaces';
  return target.href;
}
function energyAuthHref(){
  const current=new URL(location.href);current.hash='';
  const target=new URL('https://auth.ekodi.kr/');
  target.searchParams.set('site','energy');target.searchParams.set('return_to',current.href);
  return target.href;
}
async function workspaceAuthClient(){
  if(!authClientPromise)authClientPromise=import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm').then(({createClient})=>createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:false,persistSession:true}}));
  return authClientPromise;
}
function savedWorkspace(){try{return localStorage.getItem(WORKSPACE_STORAGE_KEY)||''}catch{return''}}
function saveWorkspace(key){try{if(key)localStorage.setItem(WORKSPACE_STORAGE_KEY,key);else localStorage.removeItem(WORKSPACE_STORAGE_KEY)}catch{}}
function setWorkspaceSwitch(workspace=null){
  const link=document.getElementById('workspaceSwitch');if(!link)return;
  link.href=workspacePickerHref();
  link.textContent=workspace?.workspace_name?`${workspace.workspace_name} ▾`:'Workspace 선택 ▾';
  link.title=workspace?.workspace_name?`현재 Workspace: ${workspace.workspace_name}`:'My EKODI에서 Workspace 선택';
}
async function verifiedWorkspaces(sb){
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token)return [];
  const response=await fetch(`${WORKSPACE_API}/workspaces?site=energy`,{headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
  if(!response.ok)throw new Error('workspace_list_failed');
  const data=await response.json();return Array.isArray(data?.workspaces)?data.workspaces:[];
}
async function validateWorkspace(sb,key){
  if(!key){saveWorkspace('');setWorkspaceSwitch();return null}
  const rows=await verifiedWorkspaces(sb);
  const selected=rows.find(row=>row?.workspace_key===key&&['active','pre_registered'].includes(String(row?.status||'')));
  if(!selected){saveWorkspace('');setWorkspaceSwitch();return null}
  saveWorkspace(selected.workspace_key);setWorkspaceSwitch(selected);return selected;
}
async function initWorkspaceSession(){
  setWorkspaceSwitch();
  try{
    const sb=await workspaceAuthClient();
    const hash=new URLSearchParams(location.hash.replace(/^#/,''));
    const token=hash.get('ekodi_token');
    const requested=hash.get('ekodi_workspace')||'';
    if(token){
      const {error}=await sb.auth.verifyOtp({token_hash:token,type:hash.get('ekodi_type')||'email'});
      const clean=new URL(location.href);clean.hash='';history.replaceState({},document.title,clean.href);
      if(error)throw error;
      await validateWorkspace(sb,requested);
      return;
    }
    const {data:{session}}=await sb.auth.getSession();
    if(session)await validateWorkspace(sb,savedWorkspace());
  }catch(error){
    console.warn('Energy workspace session unavailable',error?.message||error);
    setWorkspaceSwitch();
  }
}

const modes=[
  {label:'관찰형',help:'AI가 발전·소비·설비 상태를 관찰하고 이상을 설명합니다.'},
  {label:'제안형',help:'AI가 최적화안을 제안합니다. 설비를 직접 조작하지 않습니다.'},
  {label:'승인형',help:'사람이 승인한 예약·충전 같은 저위험 작업만 실행 대상으로 삼습니다.'},
  {label:'제한자동',help:'사전에 허용한 저위험 규칙만 자동화합니다. 안전장치·비상제어는 항상 제외됩니다.'}
];
const sample={solarNow:3.8,solarToday:14.2,homeNow:2.4,essSoc:68,essFlow:0.9,gridFlow:0.5,forecastToday:19.6,forecastSelf:72,saving:38400,health:96};
const $=(id)=>document.getElementById(id);
function money(value){return new Intl.NumberFormat('ko-KR',{style:'currency',currency:'KRW',maximumFractionDigits:0}).format(value)}
function renderSample(){
  $('solarNow').textContent=sample.solarNow.toFixed(1);$('headerSolarNow').textContent=sample.solarNow.toFixed(1);$('solarToday').textContent=sample.solarToday.toFixed(1);$('homeNow').textContent=sample.homeNow.toFixed(1);
  $('selfUse').textContent=Math.round(Math.min(100,sample.homeNow/sample.solarNow*100));$('essSoc').textContent=sample.essSoc;$('essFlow').textContent=`+${sample.essFlow.toFixed(1)}`;$('gridFlow').textContent=sample.gridFlow.toFixed(1);
  $('forecastToday').textContent=`${sample.forecastToday.toFixed(1)} kWh`;$('forecastSelf').textContent=`${sample.forecastSelf}%`;$('savingEstimate').textContent=money(sample.saving);$('healthScore').textContent=sample.health;
  $('updatedAt').textContent=`샘플 갱신 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`;
}
function renderBars(){const values=[0,1,5,18,40,66,88,100,94,72,48,22,6,0];$('bars').innerHTML=values.map((v)=>`<div class="bar" style="height:${Math.max(2,v)}%" title="상대 발전량 ${v}%"></div>`).join('')}
function setMode(value){const index=Math.max(0,Math.min(3,Number(value)||0));localStorage.setItem('ekodi-energy-mode',String(index));$('modeRange').value=String(index);$('modeLabel').textContent=modes[index].label;$('modeHelp').textContent=modes[index].help;$('permissionSchedule').textContent=index>=2?'허용 범위 내':'승인 필요';$('permissionControl').textContent=index===3?'저위험만':'차단'}
function bindNavigation(){document.querySelectorAll('.nav-link').forEach((button)=>button.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach((b)=>b.classList.remove('active'));document.querySelectorAll('.view').forEach((v)=>v.classList.remove('active'));button.classList.add('active');$(`${button.dataset.view}View`)?.classList.add('active')}))}
async function refreshInsight(){const button=$('refreshInsight');button.disabled=true;button.textContent='판단 중…';try{const response=await fetch('/api/insight',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({telemetry:sample,controlMode:Number($('modeRange').value)})});if(!response.ok)throw new Error('insight_failed');const data=await response.json();$('nextActionTitle').textContent=data.insight.title;$('nextActionBody').textContent=data.insight.body}catch{$('nextActionTitle').textContent='현재는 안전한 제안 모드로 유지합니다.';$('nextActionBody').textContent='AI 판단 API에 연결하지 못했습니다. 설비 제어는 실행되지 않았습니다.'}finally{button.disabled=false;button.textContent='AI 다시 판단'}}

function installDistributedEnergyPlatform(){
  if(document.getElementById('connectView'))return;
  document.title='Energy AI · 분산에너지 관리 플랫폼';
  const intro=document.querySelector('.flow-intro');
  if(intro){
    intro.querySelector('.eyebrow').textContent='AI DISTRIBUTED ENERGY PLATFORM';
    intro.querySelector('h1').innerHTML='에너지를 보여주는 데서 멈추지 않고,<br><em>절감·관리·연결까지 이어갑니다.</em>';
    intro.querySelector('p').textContent='개인은 무료 진단으로 시작하고, 사업장과 설치·관리업체는 여러 설비를 한 화면에서 운영합니다. 실제 데이터는 본인·계약·장치 권한이 확인된 연결만 읽습니다.';
  }

  const nav=document.querySelector('.topbar nav');
  const addNav=(label,view,before='insights')=>{if(nav?.querySelector(`[data-view="${view}"]`))return;const button=document.createElement('button');button.className='nav-link';button.dataset.view=view;button.textContent=label;const anchor=nav?.querySelector(`[data-view="${before}"]`);anchor?nav.insertBefore(button,anchor):nav?.appendChild(button)};
  addNav('Connect','connect','solar');
  addNav('Business','business','insights');

  const overview=$('overviewView');
  const market=document.createElement('section');
  market.className='market-entry';
  market.innerHTML=`
    <a class="market-card consumer" href="#" data-open-view="connect"><span>01</span><b>개인 무료 Energy Check</b><small>본인인증 + 주소로 시작</small></a>
    <a class="market-card business" href="#" data-open-view="business"><span>02</span><b>사업장 Energy AI</b><small>피크·요금·설비 이상 관리</small></a>
    <a class="market-card fleet" href="#" data-open-view="business"><span>03</span><b>설치·관리업체 Fleet</b><small>여러 고객 설비를 한 화면에</small></a>`;
  overview?.querySelector('.recommendation')?.after(market);

  const connect=document.createElement('section');
  connect.id='connectView';connect.className='view';
  connect.innerHTML=`
    <div class="section-head"><div><span class="eyebrow">FREE ENERGY CHECK</span><h2>주소 하나로 시작하고, 권한은 하나씩 확인합니다.</h2></div><span class="status good">무료 시작</span></div>
    <div class="connect-hero panel">
      <div><h3>우리 집 Energy Workspace 만들기</h3><p>처음에는 본인인증과 주소만 받습니다. 그 뒤 한전·계량기·태양광 인버터·ESS·EV가 공식적으로 연결 가능한지 확인하고, 필요한 경우에만 추가 인증을 요청합니다.</p></div>
      <a id="energyAuthStart" class="primary-action" href="${energyAuthHref()}">본인인증으로 시작</a>
    </div>
    <div class="connect-steps">
      <article><b>1</b><h3>본인인증</h3><p>EKODI 계정으로 사람을 확인합니다.</p></article>
      <article><b>2</b><h3>주소 등록</h3><p>집·상가·교회·사업장을 하나의 Energy Workspace로 묶습니다.</p></article>
      <article><b>3</b><h3>공식 데이터 연결</h3><p>계약·계량기·인버터·ESS·EV 권한을 각각 확인합니다.</p></article>
    </div>
    <article class="panel connector-board"><div class="panel-head"><h3>Connector Layer</h3><span>현재는 연동 준비 단계</span></div>
      <div class="connector-grid">
        <div><span class="connector-icon">⚡</span><b>전력계량 · AMI</b><small>고객 동의·계약 확인 후 읽기</small><em>준비</em></div>
        <div><span class="connector-icon">☀</span><b>Solar Inverter</b><small>제조사 API·게이트웨이 연결</small><em>준비</em></div>
        <div><span class="connector-icon">▰</span><b>ESS · PCS/BMS</b><small>상태 읽기부터 단계적 연결</small><em>준비</em></div>
        <div><span class="connector-icon">EV</span><b>EV · Charger</b><small>충전 상태·예약부터 연결</small><em>준비</em></div>
      </div>
    </article>
    <div class="privacy-note">주소만으로 타인의 전력 데이터를 조회하지 않습니다. 실제 데이터는 인증된 사용자와 해당 계약·장치 권한이 확인된 경우에만 연결합니다.</div>`;

  const business=document.createElement('section');
  business.id='businessView';business.className='view';
  business.innerHTML=`
    <div class="section-head"><div><span class="eyebrow">BUSINESS MODEL · PILOT</span><h2>돈을 내는 첫 고객은 사업장과 설치·관리업체입니다.</h2></div><span class="status">Pilot</span></div>
    <div class="business-products">
      <article class="product-card"><span>BUSINESS ENERGY AI</span><h3>사업장 에너지 운영</h3><p>전기요금·피크·태양광·ESS·설비 이상을 한 화면에서 보고, AI가 절감 우선순위를 제안합니다.</p><ul><li>월간 절감 리포트</li><li>피크 시간 탐지</li><li>설비 이상 알림</li><li>태양광·ESS 최적화 제안</li></ul><b class="revenue-chip">월 SaaS 후보</b></article>
      <article class="product-card priority"><span>INSTALLER FLEET · 1ST PRIORITY</span><h3>설치·관리업체 고객 설비 관리</h3><p>여러 고객의 발전량·통신·이상징후를 한 화면에서 관리해 전화·수기점검·장애 대응 시간을 줄입니다.</p><ul><li>고객 사이트 상태판</li><li>발전 급락·통신 장애 탐지</li><li>A/S 우선순위</li><li>고객별 리포트</li></ul><b class="revenue-chip">사이트 수 기반 SaaS 후보</b></article>
      <article class="product-card"><span>LOCAL ENERGY NETWORK</span><h3>상권·마을·기관 에너지 네트워크</h3><p>개별 정보는 보호하면서 집계된 에너지 흐름과 절감성과를 지역 단위로 관리합니다.</p><ul><li>상권·기관 통합 대시보드</li><li>탄소·절감 지표</li><li>설비 개선 사업 연계</li><li>향후 DR·VPP 제휴 기반</li></ul><b class="revenue-chip">구축비 + 관리비 후보</b></article>
    </div>
    <article class="panel fleet-demo"><div class="panel-head"><div><span class="eyebrow">INSTALLER FLEET DEMO</span><h3>10~30개 실제 사이트로 먼저 검증</h3></div><span>DEMO · 실제 고객 데이터 아님</span></div>
      <div class="fleet-table" role="table" aria-label="설치업체 Fleet 데모">
        <div class="fleet-row head" role="row"><span>Site</span><span>Output</span><span>Status</span><span>Next action</span></div>
        <div class="fleet-row" role="row"><b>Site A · 5kW</b><span>4.2 kW</span><em class="ok">정상</em><span>관찰</span></div>
        <div class="fleet-row" role="row"><b>Site B · 8kW</b><span>3.1 kW</span><em class="warn">출력 저하</em><span>원인 확인</span></div>
        <div class="fleet-row" role="row"><b>Site C · 6kW</b><span>—</span><em class="danger">통신 끊김</em><span>A/S 우선</span></div>
        <div class="fleet-row" role="row"><b>Site D · 12kW</b><span>9.8 kW</span><em class="ok">정상</em><span>관찰</span></div>
      </div>
    </article>
    <article class="revenue-loop panel"><div><span class="eyebrow">REVENUE LOOP</span><h3>무료 진단 → 실제 연결 → 관리 → 개선 → 거래</h3><p>가정용 무료 진단은 유입구, 사업장·설치업체 SaaS는 첫 매출, 태양광·ESS·EV 개선 연계는 거래 수익, DR·VPP는 충분한 자원이 모인 뒤 제휴로 확장합니다.</p></div><a class="primary-action secondary" href="https://biz.ekodi.kr">파일럿 상담</a></article>`;

  overview?.after(connect);
  $('insightsView')?.before(business);

  const style=document.createElement('style');
  style.id='distributedEnergyPlatformStyles';
  style.textContent=`
    .market-entry{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0 0}.market-card{display:flex;flex-direction:column;min-height:104px;padding:15px 16px;border:1px solid rgba(122,160,181,.14);border-radius:15px;background:rgba(12,31,44,.64);text-decoration:none;color:var(--paper);transition:.2s ease}.market-card:hover{transform:translateY(-2px);border-color:rgba(246,196,83,.28)}.market-card span{font-size:9px;letter-spacing:.15em;color:var(--sun)}.market-card b{margin:9px 0 4px;font-size:14px}.market-card small{color:var(--muted);font-size:10px}.connect-hero{display:flex;align-items:center;justify-content:space-between;gap:28px;padding:25px;margin-bottom:12px;background:linear-gradient(112deg,rgba(246,196,83,.08),rgba(13,32,46,.82) 42%,rgba(67,185,255,.05))}.connect-hero h3{font-size:23px;margin:0 0 8px}.connect-hero p{max-width:760px;margin:0;color:#aebfc7;line-height:1.65;font-size:12px}.primary-action{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border:1px solid rgba(246,196,83,.35);border-radius:11px;background:var(--sun);color:#14212a;text-decoration:none;font-size:12px;font-weight:900;white-space:nowrap}.primary-action.secondary{background:transparent;color:var(--sun)}.connect-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}.connect-steps article{padding:18px;border:1px solid rgba(122,160,181,.14);border-radius:15px;background:rgba(12,31,44,.64)}.connect-steps article>b{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:var(--sun-soft);color:var(--sun);font-size:11px}.connect-steps h3{margin:12px 0 5px;font-size:15px}.connect-steps p{margin:0;color:var(--muted);font-size:10px;line-height:1.5}.connector-board{margin-top:12px}.connector-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.connector-grid>div{position:relative;padding:15px;border:1px solid rgba(255,255,255,.05);border-radius:12px;background:rgba(255,255,255,.025)}.connector-grid b,.connector-grid small{display:block}.connector-grid b{margin:9px 0 5px;font-size:12px}.connector-grid small{color:var(--muted);font-size:9px;line-height:1.45}.connector-grid em{position:absolute;right:10px;top:10px;padding:4px 6px;border-radius:999px;background:rgba(255,255,255,.045);color:var(--muted);font-style:normal;font-size:8px}.connector-icon{display:grid;place-items:center;width:31px;height:31px;border-radius:9px;background:var(--electric-soft);color:var(--electric);font-weight:900;font-size:11px}.privacy-note{margin-top:10px;padding:11px 13px;border-left:2px solid var(--storage);background:rgba(115,214,115,.04);color:#9fb7a3;font-size:10px;line-height:1.55}.business-products{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}.product-card{position:relative;padding:21px;border:1px solid rgba(122,160,181,.17);border-radius:18px;background:rgba(13,32,46,.72)}.product-card.priority{border-color:rgba(246,196,83,.34);background:linear-gradient(145deg,rgba(246,196,83,.075),rgba(13,32,46,.8))}.product-card>span{font-size:9px;letter-spacing:.13em;color:var(--sun);font-weight:800}.product-card h3{margin:8px 0 7px;font-size:19px}.product-card p{margin:0;color:#aebfc7;font-size:11px;line-height:1.55}.product-card ul{padding-left:16px;margin:15px 0 17px;color:var(--muted);font-size:10px;line-height:1.9}.revenue-chip{display:inline-block;padding:6px 8px;border:1px solid rgba(115,214,115,.16);border-radius:999px;background:var(--storage-soft);color:var(--storage);font-size:9px}.fleet-demo{margin-top:12px}.fleet-demo .panel-head h3{margin:5px 0 0}.fleet-table{overflow:hidden;border:1px solid rgba(255,255,255,.05);border-radius:12px}.fleet-row{display:grid;grid-template-columns:1.4fr .8fr .8fr .9fr;align-items:center;gap:8px;min-height:44px;padding:0 13px;border-top:1px solid rgba(255,255,255,.045);font-size:10px}.fleet-row:first-child{border-top:0}.fleet-row.head{color:var(--muted);background:rgba(255,255,255,.025);font-size:9px}.fleet-row em{justify-self:start;padding:5px 7px;border-radius:999px;font-style:normal}.fleet-row .ok{color:var(--storage);background:var(--storage-soft)}.fleet-row .warn{color:var(--sun);background:var(--sun-soft)}.fleet-row .danger{color:var(--danger);background:rgba(255,140,124,.09)}.revenue-loop{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:12px;background:linear-gradient(112deg,rgba(67,185,255,.055),rgba(13,32,46,.8))}.revenue-loop h3{margin:6px 0;font-size:19px}.revenue-loop p{margin:0;max-width:850px;color:#aebfc7;font-size:11px;line-height:1.6}
    @media(max-width:980px){.market-entry,.business-products,.connector-grid{grid-template-columns:1fr 1fr}.business-products .product-card:last-child{grid-column:1/-1}.connect-hero,.revenue-loop{align-items:flex-start;flex-direction:column}.connect-steps{grid-template-columns:1fr 1fr 1fr}}
    @media(max-width:640px){.market-entry,.business-products,.connector-grid,.connect-steps{grid-template-columns:1fr}.business-products .product-card:last-child{grid-column:auto}.fleet-row{grid-template-columns:1.3fr .8fr .9fr}.fleet-row>:last-child{display:none}.primary-action{width:100%}}
  `;
  document.head.appendChild(style);

  document.querySelectorAll('[data-open-view]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();const view=link.dataset.openView;document.querySelector(`.nav-link[data-view="${view}"]`)?.click();window.scrollTo({top:0,behavior:'smooth'})}));
}

void initWorkspaceSession();
window.addEventListener('DOMContentLoaded',()=>{installDistributedEnergyPlatform();bindNavigation();renderSample();renderBars();setMode(localStorage.getItem('ekodi-energy-mode')??'1');$('modeRange').addEventListener('input',(event)=>setMode(event.target.value));$('refreshInsight').addEventListener('click',refreshInsight)});
