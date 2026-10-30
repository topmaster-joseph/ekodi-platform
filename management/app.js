const cfg=window.EKODI_MANAGEMENT_CONFIG||{};
const SESSION_KEY='ekodi-management-session';
const SELECTION_KEY='ekodi-management-selection-v1';
const $=id=>document.getElementById(id);
const state={session:null,catalog:[],selection:null,spaces:[],spacesRequest:0,selectedWorkspace:null};

function storedSession(){
  try{
    const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
    if(value?.accessToken&&value?.refreshToken&&value?.user?.id&&Number(value.expiresAt||0)>Math.floor(Date.now()/1000)+30)return value;
  }catch{}
  sessionStorage.removeItem(SESSION_KEY);
  return null;
}
function activeSession(){return Boolean(state.session?.accessToken&&state.session?.user?.id&&Number(state.session?.expiresAt||0)>Math.floor(Date.now()/1000)+30)}
function selectionKey(){return activeSession()?`${SELECTION_KEY}:${state.session.user.id}`:null}
function saveSession(value){clearSpaces();state.session=value;state.selection=null;sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));renderIdentity();if(state.catalog.length)renderMemberPicker()}
function clearSession(){state.session=null;state.selection=null;clearSpaces();$('memberModuleLinks').replaceChildren();sessionStorage.removeItem(SESSION_KEY);renderIdentity()}
function storedSelection(){
  const fallback={workspaceKind:'person',modules:['chief','marketing']};
  const key=selectionKey();
  if(!key)return fallback;
  try{
    const value=JSON.parse(localStorage.getItem(key)||'null');
    if(value&&typeof value.workspaceKind==='string'&&Array.isArray(value.modules)){
      const kind=value.workspaceKind==='organization'?'institution':value.workspaceKind;
      const workspaceKind=['person','business','institution','community','project','franchise'].includes(kind)?kind:'person';
      return {workspaceKind,modules:value.modules.filter(id=>typeof id==='string'&&id.length<=48)};
    }
  }catch{}
  return fallback;
}
function authUrl(){
  const canonical=new URL('https://ekodi.kr/auth/');
  canonical.searchParams.set('site','management');
  const source=new URL(location.href);
  source.hash='';
  const valid=source.protocol==='https:'&&source.hostname==='ekodi.kr'&&(source.pathname==='/management'||source.pathname.startsWith('/management/'));
  canonical.searchParams.set('return_to',valid?source.href:'https://ekodi.kr/management/');
  return canonical.href;
}
function renderIdentity(){
  const member=activeSession();document.body.dataset.member=member?'1':'0';$('memberApp').hidden=!member;
  const auth=$('authLink');auth.href=member?'#logout':authUrl();auth.textContent=member?'로그아웃':'로그인';
  const start=document.querySelector('.cta-row .button');if(start)start.href=authUrl();
  if(member)$('memberMeta').textContent=`무료등급 · ${state.session?.user?.email||'회원'} · 기능 선택형`;
}
function clearSpaces(){
  state.spacesRequest+=1;
  state.spaces=[];
  state.selectedWorkspace=null;
  $('verifiedSpacesList').replaceChildren();
  $('selectedWorkspaceStatus').textContent='현재 작업 공간을 선택하지 않았습니다.';
  $('spacesStatus').textContent='로그인 후 내 운영 공간을 확인할 수 있습니다.';
}
function validSpaceUrl(slug){
  if(typeof slug!=='string'||!(/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(slug)))return null;
  return `https://ekodi.kr/${slug}`;
}
function storeSummaryIsValid(data,space){
  const metrics=data?.summary;
  return Boolean(data?.dataPolicy==='verified-read-only'
    &&data?.workspace?.id===space.id&&data?.workspace?.slug===space.slug
    &&data?.workspace?.kind==='store'&&metrics
    &&['canonicalMenuCount','platformListingCount','connectedChannelCount']
      .every(key=>Number.isSafeInteger(metrics[key])&&metrics[key]>=0)
    &&typeof metrics.orderEnabled==='boolean');
}
function storeKpiRow(label,value){
  const cell=document.createElement('div');cell.className='store-kpi-cell';
  const term=document.createElement('dt');term.textContent=label;
  const amount=document.createElement('dd');amount.textContent=String(value);
  cell.append(term,amount);return cell;
}
async function loadStoreSummary(space,host,button){
  if(!activeSession()||space.kind!=='store'||!validSpaceUrl(space.slug))return;
  const token=state.session.accessToken,userId=state.session.user.id,epoch=state.spacesRequest;
  if(!state.spaces.some(item=>item.id===space.id&&item.slug===space.slug&&item.kind==='store'))return;
  button.disabled=true;host.replaceChildren();host.textContent='매장 운영현황을 확인하고 있습니다.';
  const stillCurrent=()=>activeSession()&&state.session.accessToken===token
    &&state.session.user.id===userId&&epoch===state.spacesRequest
    &&state.spaces.some(item=>item.id===space.id&&item.slug===space.slug&&item.kind==='store');
  try{
    const path='/api/store-summary?slug='+encodeURIComponent(space.slug);
    const response=await fetch(path,{method:'GET',headers:{authorization:`Bearer ${token}`,accept:'application/json'},cache:'no-store'});
    if(!stillCurrent())return;
    if(response.status===401){clearSession();return}
    if(!response.ok)throw new Error('store_kpi_'+response.status);
    const data=await response.json();
    if(!stillCurrent())return;
    if(!storeSummaryIsValid(data,space))throw new Error('invalid_store_kpi_projection');
    const grid=document.createElement('dl');grid.className='store-kpi-grid';
    grid.append(
      storeKpiRow('메뉴 원본',data.summary.canonicalMenuCount),
      storeKpiRow('판매채널 등록',data.summary.platformListingCount),
      storeKpiRow('연결 채널',data.summary.connectedChannelCount),
      storeKpiRow('주문 설정',data.summary.orderEnabled?'활성':'비활성')
    );
    host.replaceChildren(grid);
  }catch(error){
    if(!stillCurrent())return;
    host.replaceChildren();host.textContent='운영현황을 확인할 수 없습니다. 잠시 후 다시 조회해 주세요.';
    console.error('management store read-only summary',error);
  }finally{if(stillCurrent())button.disabled=false}
}
function selectedVerifiedWorkspace(){
  if(!activeSession()||!state.selectedWorkspace)return null;
  return state.spaces.find(space=>space.id===state.selectedWorkspace.id
    &&space.slug===state.selectedWorkspace.slug&&space.status==='active')||null;
}
function renderSelectedWorkspace(){
  const space=selectedVerifiedWorkspace();
  $('selectedWorkspaceStatus').textContent=space
    ?`현재 작업 공간: ${space.name} · ${space.role||'member'}`
    :'현재 작업 공간을 선택하지 않았습니다.';
  const host=$('verifiedSpacesList');
  for(const card of host.children){
    const select=Array.from(card.children||[]).find(element=>element.className==='space-select');
    if(!select)continue;
    const selected=Boolean(space&&select.dataset.workspaceId===space.id&&select.dataset.workspaceSlug===space.slug);
    select.textContent=selected?'현재 작업 공간':'작업 공간으로 선택';
    select.setAttribute('aria-pressed',selected?'true':'false');
  }
}
function selectVerifiedWorkspace(space){
  if(!activeSession()||space.status!=='active')return;
  const allowed=state.spaces.some(item=>item.id===space.id&&item.slug===space.slug&&item.status==='active');
  if(!allowed)return;
  state.selectedWorkspace={id:space.id,slug:space.slug};
  renderSelectedWorkspace();
}
function renderVerifiedSpaces(){
  const host=$('verifiedSpacesList');host.replaceChildren();
  if(!activeSession())return;
  state.spaces.forEach(space=>{
    const card=document.createElement('article');card.className='verified-space';
    const name=document.createElement('strong');name.textContent=space.name;
    const role=document.createElement('small');role.textContent=`역할: ${space.role||'member'} · ${space.kind||'공간'}`;
    card.append(name,role);
    const url=validSpaceUrl(space.slug);
    if(url){const link=document.createElement('a');link.href=url;link.textContent='공간 열기';link.className='space-entry';card.append(link)}
    if(space.status==='active'&&url){
      const select=document.createElement('button');select.type='button';select.className='space-select';
      select.dataset.workspaceId=space.id;select.dataset.workspaceSlug=space.slug;
      select.textContent='작업 공간으로 선택';select.setAttribute('aria-pressed','false');
      select.addEventListener('click',()=>selectVerifiedWorkspace(space));
      card.append(select);
    }
    if(space.kind==='store'&&space.status==='active'&&url){
      const button=document.createElement('button');button.type='button';button.className='store-kpi-button';button.textContent='운영현황 조회';
      const panel=document.createElement('div');panel.className='store-kpi-panel';panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');
      button.addEventListener('click',()=>loadStoreSummary(space,panel,button));
      card.append(button,panel);
    }
    host.append(card);
  });
  renderSelectedWorkspace();
}
async function loadVerifiedSpaces(){
  if(!activeSession()){clearSpaces();return}
  const token=state.session.accessToken,userId=state.session.user.id,serial=++state.spacesRequest;
  state.spaces=[];state.selectedWorkspace=null;$('verifiedSpacesList').replaceChildren();
  $('selectedWorkspaceStatus').textContent='현재 작업 공간을 선택하지 않았습니다.';
  $('spacesStatus').textContent='중앙 회원 권한을 확인하고 있습니다.';
  try{
    const response=await fetch('/api/spaces',{method:'GET',headers:{authorization:`Bearer ${token}`,accept:'application/json'},cache:'no-store'});
    if(serial!==state.spacesRequest||!activeSession()||state.session.user.id!==userId||state.session.accessToken!==token)return;
    if(response.status===401){clearSession();return}
    if(!response.ok)throw new Error('spaces_'+response.status);
    const data=await response.json();
    if(!Array.isArray(data.spaces)||data.scope!=='authenticated-member-only')throw new Error('spaces_invalid');
    if(serial!==state.spacesRequest||!activeSession())return;
    state.spaces=data.spaces.filter(space=>space&&typeof space.id==='string'&&typeof space.name==='string'&&typeof space.slug==='string').slice(0,200);
    renderVerifiedSpaces();
    $('spacesStatus').textContent=state.spaces.length?`접근 가능한 운영 공간 ${state.spaces.length}곳 · 중앙 권한 확인 완료`:'현재 계정에 연결된 운영 공간이 없습니다.';
  }catch(error){
    if(serial!==state.spacesRequest||!activeSession())return;
    state.spaces=[];state.selectedWorkspace=null;$('verifiedSpacesList').replaceChildren();
    $('selectedWorkspaceStatus').textContent='현재 작업 공간을 선택하지 않았습니다.';
    $('spacesStatus').textContent='운영 공간을 불러오지 못했습니다. 계정이나 권한이 변경되지는 않았습니다.';
    console.error('management workspace read-only',error);
  }
}
function sessionExpiry(value){const explicit=Number(value?.expiresAt||0);return explicit>0?explicit:Math.floor(Date.now()/1000)+Number(value?.expiresIn||3600)}
async function exchangeCentralToken(){
  const params=new URLSearchParams(location.hash.slice(1));const tokenHash=params.get('ekodi_token');if(!tokenHash)return false;
  history.replaceState(null,'',location.pathname+location.search);
  const response=await fetch('/api/auth/exchange',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tokenHash,type:params.get('ekodi_type')||'email'})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'auth_exchange_failed');data.expiresAt=sessionExpiry(data);saveSession(data);history.replaceState(null,'',location.pathname+location.search);return true;
}
async function loadCatalog(){
  const response=await fetch('/api/catalog',{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`catalog_${response.status}`);const data=await response.json();state.catalog=Array.isArray(data.modules)?data.modules:[];renderPublicCatalog();renderMemberPicker();
}
function renderPublicCatalog(){
  const host=$('publicModuleGrid');host.replaceChildren();
  state.catalog.forEach(module=>{const card=document.createElement('article');card.className='module-card';card.dataset.state=module.state;const strong=document.createElement('strong');strong.textContent=module.name;const copy=document.createElement('p');copy.textContent=module.description||moduleDescription(module.id);const small=document.createElement('small');small.textContent=module.state==='existing'?'기존 서비스 연결':module.state==='foundation'?'기초 설계 · 준비 중':'준비 중';card.append(strong,copy,small);host.append(card)});
}
function moduleDescription(id){return({chief:'전체 전문 AI를 연결하고 다음 행동을 제안합니다.',marketing:'콘텐츠·캠페인·채널 운영을 맡습니다.',menu:'여러 판매채널의 메뉴 원본과 매핑을 한곳에서 관리합니다.',order:'QR·포장·배달앱 등 들어오는 주문 흐름을 관리합니다.',review:'여러 채널의 리뷰를 모아 분석하고 답변 초안을 만듭니다.',customer:'고객·재방문·휴면·관계 흐름을 관리합니다.',sales:'매출 변화와 메뉴·채널 성과를 분석합니다.',inventory:'재고·품절·발주 신호를 관리합니다.',delivery:'주문 이후 배달 배정과 상태를 관리합니다.',settlement:'채널별 정산·수수료·손익을 맞춥니다.',staff:'근무·업무·교육 흐름을 관리합니다.',booking:'예약·변경·알림·노쇼를 관리합니다.'})[id]||'전문 경영 기능을 담당합니다.'}
function renderMemberPicker(){
  if(!activeSession()){$('memberModuleLinks').replaceChildren();return}
  if(!state.selection)state.selection=storedSelection();$('workspaceKind').value=state.selection.workspaceKind||'person';const selected=new Set(state.selection.modules||[]);const host=$('memberModuleGrid');host.replaceChildren();
  state.catalog.forEach(module=>{const label=document.createElement('label');label.className='module-choice';const input=document.createElement('input');input.type='checkbox';input.value=module.id;input.checked=selected.has(module.id);const text=document.createElement('span');const strong=document.createElement('strong');strong.textContent=module.name;const small=document.createElement('small');small.textContent=module.state==='existing'?'기존 서비스 연결':module.state==='foundation'?'기초 설계 · 준비 중':'준비 중';text.append(strong,small);label.append(input,text);host.append(label)});
  renderModuleLaunches();
}
function safeModuleUrl(module){
  if(module?.id!=='marketing'||module.state!=='existing'||module.reuseExisting!==true)return null;
  try{
    const url=new URL(module.url);
    if(url.origin==='https://ekodi.kr'&&url.pathname==='/ekodibiz/marketing-ai'&&!url.search&&!url.hash&&!url.username&&!url.password)return url.href;
  }catch{}
  return null;
}
function renderModuleLaunches(){
  const host=$('memberModuleLinks');host.replaceChildren();
  if(!activeSession())return;
  let count=0;
  const selected=new Set(state.selection?.modules||[]);
  for(const module of state.catalog){
    if(!selected.has(module.id))continue;
    const url=safeModuleUrl(module);
    if(!url)continue;
    const link=document.createElement('a');link.href=url;link.className='module-launch';link.textContent=module.name+' 열기';
    host.append(link);count++;
  }
  const note=document.createElement('p');note.className='note';
  note.textContent=count?'연결 서비스에서 별도로 회원·이용권한을 확인합니다.':'선택한 전문 AI 가운데 현재 연결 가능한 서비스가 없습니다. 준비 중인 기능은 실행되지 않습니다.';
  host.append(note);
}
function saveSelection(){
  if(!activeSession()){location.assign(authUrl());return}
  const modules=[...document.querySelectorAll('#memberModuleGrid input:checked')].map(input=>input.value);state.selection={workspaceKind:$('workspaceKind').value,modules};localStorage.setItem(selectionKey(),JSON.stringify(state.selection));$('saveStatus').textContent=`이 브라우저에 저장됨 · ${modules.length}개 AI 선택 · 이용권한은 각 서비스가 별도로 확인합니다.`;renderModuleLaunches();
}
function logout(){clearSession();location.hash='';$('saveStatus').textContent='로그아웃했습니다. 기능을 이용하려면 다시 로그인해야 합니다.'}
async function boot(){
  state.session=storedSession();renderIdentity();try{await exchangeCentralToken()}catch(error){console.error('management auth exchange',error);clearSession()}
  try{await loadCatalog()}catch(error){console.error(error);$('publicModuleGrid').textContent='서비스 목록을 불러오지 못했습니다.'}
  if(activeSession())await loadVerifiedSpaces();
}

$('refreshSpaces').addEventListener('click',loadVerifiedSpaces);
$('saveSelection').addEventListener('click',saveSelection);$('logoutButton').addEventListener('click',logout);$('authLink').addEventListener('click',event=>{if(activeSession()){event.preventDefault();logout()}});
boot();
