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
function saveSession(value){clearSpaces();resetRequestRouting();state.session=value;state.selection=null;sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));renderIdentity();if(state.catalog.length)renderMemberPicker()}
function clearSession(){state.session=null;state.selection=null;clearSpaces();resetRequestRouting();$('memberModuleLinks').replaceChildren();sessionStorage.removeItem(SESSION_KEY);renderIdentity()}
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
  // EKODI common Shell owns header account actions; member body owns logout.
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
  renderGrowthWorkspace();
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
function buildStoreReadinessChecks(summary){
  const checks=[];
  if(summary.canonicalMenuCount===0)checks.push('메뉴 원본이 0개로 조회됩니다. 공식 매장 메뉴의 등록·동기화 상태를 확인하세요.');
  if(summary.canonicalMenuCount===0&&summary.platformListingCount>0)checks.push('판매채널 등록 항목이 있으나 공식 메뉴 원본이 0개입니다. 원본 데이터 연결·동기화를 확인하세요.');
  if(summary.connectedChannelCount===0)checks.push('연결된 판매채널이 0개로 조회됩니다. 실제 채널 사용 여부와 연결 상태를 확인하세요.');
  if(summary.canonicalMenuCount>0&&summary.platformListingCount===0)checks.push('메뉴 원본은 있으나 판매채널 등록 항목이 0개로 조회됩니다. 채널 등록 상태를 확인하세요.');
  if(!summary.orderEnabled)checks.push('주문 기능이 비활성으로 조회됩니다. 실제 운영 방식에 맞는 설정인지 확인하세요.');
  if(!checks.length)checks.push('기초 운영 지표가 확인됐습니다. 매출·재고·주문의 실적 분석은 해당 원본 데이터가 연결된 후에 판단해야 합니다.');
  return checks;
}
function renderStoreReadiness(summary){
  const section=document.createElement('div');section.className='store-readiness';
  const heading=document.createElement('strong');heading.textContent='경영비서AI · 기초 운영 점검';
  const list=document.createElement('ul');
  for(const message of buildStoreReadinessChecks(summary)){
    const item=document.createElement('li');item.textContent=message;list.append(item);
  }
  const note=document.createElement('p');note.className='note';note.textContent='확인된 KPI 4개에 대한 규칙 기반 안내입니다. 매출 예측, 주문·가격 변경 또는 자동 업무 실행은 하지 않습니다.';
  section.append(heading,list,note);
  return section;
}
function storeKpiRow(label,value){
  const cell=document.createElement('div');cell.className='store-kpi-cell';
  const term=document.createElement('dt');term.textContent=label;
  const amount=document.createElement('dd');amount.textContent=String(value);
  cell.append(term,amount);return cell;
}
const STORE_OPERATION_SECTIONS=Object.freeze([
  {id:'menu',label:'메뉴'},
  {id:'channels',label:'판매채널'},
  {id:'orders',label:'주문'},
  {id:'customers',label:'고객'},
  {id:'sales',label:'매출'},
  {id:'inventory',label:'재고'},
  {id:'settlement',label:'정산'}
]);
function validStoreOperations(value){
  if(!value||value.status!=='verified-read-only')return false;
  for(const [group,maximum] of [['menu',40],['channels',24]]){
    const record=value[group];
    if(!record||!Number.isSafeInteger(record.total)||record.total<0
      ||!Number.isSafeInteger(record.shown)||record.shown<0||record.shown>maximum
      ||record.shown>record.total||!Array.isArray(record.items)
      ||record.items.length!==record.shown)return false;
  }
  return value.menu.items.every(item=>typeof item?.name==='string'&&item.name.length>0
    &&item.name.length<=100&&typeof item.category==='string'
    &&(item.basePrice===null||(typeof item.basePrice==='number'&&Number.isFinite(item.basePrice)&&item.basePrice>=0))
    &&typeof item.availability==='string')
    &&value.channels.items.every(item=>typeof item?.provider==='string'&&item.provider.length>0
      &&item.provider.length<=50&&typeof item.name==='string'&&typeof item.connectionStatus==='string');
}
function storeOperationItem(primary,secondary){
  const item=document.createElement('li');
  const title=document.createElement('strong');title.textContent=primary;
  const note=document.createElement('span');note.textContent=secondary;
  item.append(title,note);return item;
}
const FINANCIAL_SECTION_IDS=new Set(['orders','customers','sales','settlement']);
const FINANCIAL_READ_ROLES=new Set(['store_owner','tenant_admin','platform_admin']);
function validBusinessAggregate(data,space){
  const count=n=>Number.isSafeInteger(n)&&n>=0;
  const money=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e13;
  if(!data||data.dataPolicy!=='verified-business-aggregate-read-only'
    ||data.workspace?.id!==space.id||data.workspace?.slug!==space.slug
    ||data.workspace?.kind!=='store'||data.timezone!=='Asia/Seoul'
    ||data.coverage!=='ekodi-recorded-completed-orders-only'
    ||data.source!=='business_os_store_admin_snapshot'
    ||typeof data.asOf!=='string'||!Number.isFinite(Date.parse(data.asOf))
    ||!count(data.orders?.completedCount)||!money(data.orders?.averageTicket)
    ||!money(data.sales?.recordedCompletedSales)
    ||!count(data.customers?.identifiedToday)||!count(data.customers?.newFromBaseOrders)
    ||data.customers.newFromBaseOrders>data.customers.identifiedToday
    ||!['internal-aggregate','not-connected'].includes(data.settlement?.status))return false;
  if(data.settlement.status==='internal-aggregate'
    &&!['cashIn','cashOut','costTotal'].every(key=>money(data.settlement[key])))return false;
  return true;
}
function renderBusinessAggregate(body,sectionId,data){
  const stamp=document.createElement('p');stamp.textContent=
    '조회 기준: '+new Date(data.asOf).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · 한국시간';
  body.append(stamp);
  const grid=document.createElement('dl');grid.className='store-kpi-grid';
  let disclaimer='';
  const format=n=>n.toLocaleString('ko-KR')+'원';
  if(sectionId==='orders'){
    grid.append(storeKpiRow('오늘 기록된 완료 주문',data.orders.completedCount+'건'),
      storeKpiRow('완료 주문 평균 결제액',format(data.orders.averageTicket)));
    disclaimer='에코디 시스템에 기록된 완료 주문만 집계합니다. 배달앱·POS의 모든 주문을 포함한다고 보장하지 않습니다.';
  }else if(sectionId==='sales'){
    grid.append(storeKpiRow('오늘 기록된 완료 주문액',format(data.sales.recordedCompletedSales)));
    disclaimer='에코디가 수집한 완료 주문의 합계이며, 전체 사업 매출이나 은행 입금액이 아닙니다.';
  }else if(sectionId==='customers'){
    grid.append(storeKpiRow('오늘 식별 가능한 주문 고객',data.customers.identifiedToday+'명'),
      storeKpiRow('오늘 첫 주문으로 기록된 고객',data.customers.newFromBaseOrders+'명'));
    disclaimer='기본 주문에 식별정보가 기록된 고객만 포함합니다. 외부 플랫폼 고객 전체를 나타내지 않습니다.';
  }else if(data.settlement.status==='internal-aggregate'){
    grid.append(storeKpiRow('내부 집계 현금수입',format(data.settlement.cashIn)),
      storeKpiRow('내부 집계 현금지출',format(data.settlement.cashOut)),
      storeKpiRow('내부 집계 비용',format(data.settlement.costTotal)));
    disclaimer='에코디에 등록된 일별 내부 재무 집계입니다. 은행 입금·PG 정산 검증 자료가 아닙니다.';
  }else{
    const note=document.createElement('p');note.textContent='공식 내부 일별 재무 집계가 연결되지 않았습니다. 0원으로 간주하지 않습니다.';
    body.append(note);return;
  }
  body.append(grid);
  const note=document.createElement('p');note.className='note';note.textContent=disclaimer;body.append(note);
}
function renderStoreOperations(operations,space,stillCurrent){
  const section=document.createElement('section');section.className='store-operations';
  const heading=document.createElement('strong');heading.textContent='매장 운영 상세 · 공식 원본';
  const tabs=document.createElement('div');tabs.className='store-operation-tabs';
  tabs.setAttribute('role','group');tabs.setAttribute('aria-label','운영 항목 선택');
  const body=document.createElement('div');body.className='store-operation-body';
  const valid=validStoreOperations(operations);
  const buttons=[];
  const aggregate={status:'idle',data:null};
  let activeSection='menu';
  const show=sectionId=>{
    activeSection=sectionId;
    for(const button of buttons)button.setAttribute('aria-pressed',button.dataset.section===sectionId?'true':'false');
    body.replaceChildren();
    const header=document.createElement('strong');header.textContent=STORE_OPERATION_SECTIONS.find(item=>item.id===sectionId).label;
    body.append(header);
    if(FINANCIAL_SECTION_IDS.has(sectionId)){
      const notice=document.createElement('p');
      if(!FINANCIAL_READ_ROLES.has(space.role)){
        notice.textContent='이 집계는 매장 소유자 또는 기관 관리자 권한이 필요합니다.';
        body.append(notice);return;
      }
      if(aggregate.status==='idle'){
        aggregate.status='loading';
        void loadBusinessAggregate();
      }
      if(aggregate.status==='loading'){
        notice.textContent='공식 완료 주문·경영 집계를 확인하고 있습니다.';
        body.append(notice);return;
      }
      if(aggregate.status==='forbidden'){
        notice.textContent='현재 계정은 이 매장의 집계 조회 권한이 없습니다.';
        body.append(notice);return;
      }
      if(aggregate.status!=='ready'){
        notice.textContent='공식 경영 집계를 확인할 수 없습니다. 0건 또는 0원으로 간주하지 않습니다.';
        body.append(notice);return;
      }
      renderBusinessAggregate(body,sectionId,aggregate.data);return;
    }
    if(['menu','channels'].includes(sectionId)){
      if(!valid){
        const note=document.createElement('p');note.textContent='공식 운영 데이터의 상세 목록을 확인할 수 없습니다. 현재 숫자를 0건으로 판단하지 않습니다.';body.append(note);return;
      }
      const record=operations[sectionId];
      const count=document.createElement('p');
      count.textContent=`원본 ${record.total}건 · 표시 ${record.shown}건`;
      body.append(count);
      if(record.items.length===0){const empty=document.createElement('p');empty.textContent='공식 원본에 등록된 항목이 없습니다.';body.append(empty);return}
      const list=document.createElement('ul');list.className='store-operation-list';
      for(const item of record.items){
        if(sectionId==='menu'){
          const price=item.basePrice===null?'가격 미확인':`${item.basePrice.toLocaleString('ko-KR')}원`;
          list.append(storeOperationItem(item.name,[item.category||'분류 미확인',price,item.availability||'판매 상태 미확인'].join(' · ')));
        }else list.append(storeOperationItem(item.name||item.provider,[item.provider,item.connectionStatus||'연결 상태 미확인'].join(' · ')));
      }
      body.append(list);
      if(record.total>record.shown){const note=document.createElement('p');note.textContent='목록 일부만 표시했습니다. 공식 운영 공간에서 전체 항목을 확인해 주세요.';body.append(note)}
      return;
    }
    const notice=document.createElement('p');notice.textContent='현재 이 경영플랫폼에 검증된 해당 항목의 실적 원본이 연결되지 않았습니다. 0건 또는 0원으로 표시하지 않습니다.';
    body.append(notice);
  };
  async function loadBusinessAggregate(){
    if(!stillCurrent())return;
    const token=state.session?.accessToken;
    if(!token){aggregate.status='unavailable';return}
    try{
      const path='/api/store-business-summary?slug='+encodeURIComponent(space.slug);
      const response=await fetch(path,{method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},cache:'no-store'});
      if(!stillCurrent())return;
      if(response.status===401){clearSession();return}
      if(response.status===403){aggregate.status='forbidden';}
      else if(!response.ok){aggregate.status='unavailable';}
      else{
        const data=await response.json();
        if(!stillCurrent())return;
        aggregate.data=validBusinessAggregate(data,space)?data:null;
        aggregate.status=aggregate.data?'ready':'unavailable';
      }
    }catch{
      if(!stillCurrent())return;
      aggregate.status='unavailable';
    }
    if(stillCurrent()&&FINANCIAL_SECTION_IDS.has(activeSection))show(activeSection);
  }
  for(const item of STORE_OPERATION_SECTIONS){
    const button=document.createElement('button');button.type='button';button.className='store-operation-tab';
    button.dataset.section=item.id;button.textContent=item.label;
    button.addEventListener('click',()=>show(item.id));tabs.append(button);buttons.push(button);
  }
  const note=document.createElement('p');note.className='note';note.textContent='매장 회원 권한으로 조회된 읽기 전용 정보입니다. 주문·가격·재고·정산을 변경하지 않습니다.';
  section.append(heading,tabs,body,note);
  show('menu');return section;
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
    host.replaceChildren(grid,renderStoreReadiness(data.summary),renderStoreOperations(data.operations,space,stillCurrent));
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
// Growth journey is a workspace-scoped readiness guide, not an invented cross-tenant KPI report.
function renderGrowthWorkspace(){
  const host=$('growthWorkspaceDetails'),status=$('growthWorkspaceStatus');
  if(!host||!status)return;
  host.replaceChildren();
  const space=selectedVerifiedWorkspace();
  if(!space){
    status.textContent='내 운영 공간에서 활성 상태인 공간을 먼저 선택해 주세요. 다른 조직의 정보는 조회하지 않습니다.';
    return;
  }
  const selected=new Set(state.selection?.modules||[]);
  if(!selected.has('growth')){
    status.textContent=space.name+' · AI 성장·홍보 관리 모듈을 선택해 저장하면 준비 안내를 볼 수 있습니다.';
    return;
  }
  status.textContent=space.name+' · '+space.role+' · 현재 선택한 공간의 성장 관리 준비 안내';
  const states=[
    ['검색엔진 등록·노출','공식 공급자 실측 자료 미연결'],
    ['무료·유료 홍보 게시','사이트별 실제 게시·승인 이력 미연결'],
    ['유입·문의·예약','전환 추적 데이터 미연결'],
    ['주문·매출·재방문','성과 자료 미연결']
  ];
  const list=document.createElement('dl');list.className='growth-state-list';
  for(const [label,detail] of states){
    const item=document.createElement('div');
    const name=document.createElement('dt');name.textContent=label;
    const value=document.createElement('dd');value.textContent=detail;
    item.append(name,value);list.append(item);
  }
  host.append(list);
  const isManager=['owner','admin','workspace_admin','tenant_admin','store_owner','platform_admin','manager'].includes(String(space.role||'').toLowerCase());
  const note=document.createElement('p');note.className='note';
  note.textContent=isManager
    ?'이 공간의 운영 담당자라면 사이트별 공식 홍보 연결 및 근거 확인을 진행할 수 있습니다. 실제 실행 권한은 연결 서비스에서 별도로 확인합니다.'
    :'현재 공간의 조회·실무 권한으로 안내를 확인합니다. 홍보 발행과 외부 계정 연결은 권한을 가진 관리자가 수행해야 합니다.';
  host.append(note);
  const url=validSpaceUrl(space.slug);
  if(url){
    const a=document.createElement('a');a.href=url;a.className='module-launch';
    a.textContent='선택한 운영 공간 열기';a.rel='noopener noreferrer';
    host.append(a);
  }
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
  renderGrowthWorkspace();
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
    renderGrowthWorkspace();
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
function moduleDescription(id){return({growth:'선택한 운영 공간의 검색노출·홍보·유입·매출 연결 준비 상태를 보여줍니다. 실측 데이터 연결 전에는 결과를 표시하지 않습니다.',chief:'전체 전문 AI를 연결하고 다음 행동을 제안합니다.',marketing:'콘텐츠·캠페인·채널 운영을 맡습니다.',menu:'여러 판매채널의 메뉴 원본과 매핑을 한곳에서 관리합니다.',order:'QR·포장·배달앱 등 들어오는 주문 흐름을 관리합니다.',review:'여러 채널의 리뷰를 모아 분석하고 답변 초안을 만듭니다.',customer:'고객·재방문·휴면·관계 흐름을 관리합니다.',sales:'매출 변화와 메뉴·채널 성과를 분석합니다.',inventory:'재고·품절·발주 신호를 관리합니다.',delivery:'주문 이후 배달 배정과 상태를 관리합니다.',settlement:'채널별 정산·수수료·손익을 맞춥니다.',staff:'근무·업무·교육 흐름을 관리합니다.',booking:'예약·변경·알림·노쇼를 관리합니다.'})[id]||'전문 경영 기능을 담당합니다.'}
function renderMemberPicker(){
  if(!activeSession()){$('memberModuleLinks').replaceChildren();renderGrowthWorkspace();return}
  if(!state.selection)state.selection=storedSelection();$('workspaceKind').value=state.selection.workspaceKind||'person';const selected=new Set(state.selection.modules||[]);const host=$('memberModuleGrid');host.replaceChildren();
  state.catalog.forEach(module=>{const label=document.createElement('label');label.className='module-choice';const input=document.createElement('input');input.type='checkbox';input.value=module.id;input.checked=selected.has(module.id);const text=document.createElement('span');const strong=document.createElement('strong');strong.textContent=module.name;const small=document.createElement('small');small.textContent=module.state==='existing'?'기존 서비스 연결':module.state==='foundation'?'기초 설계 · 준비 중':'준비 중';text.append(strong,small);label.append(input,text);host.append(label)});
  renderModuleLaunches();
  renderGrowthWorkspace();
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
const REQUEST_KEYWORDS=Object.freeze({
  growth:['검색노출','검색유입','추천','홍보성과','전환율','경영성과','브랜드 성장','사이트별 보고'],
  marketing:['마케팅','홍보','광고','콘텐츠','검색노출','블로그','인스타','릴스','캠페인'],
  menu:['메뉴','상품명','메뉴판','옵션','가격표'],
  order:['주문','접수','포장','주문서','qr'],
  review:['리뷰','후기','평점','댓글','답글'],
  customer:['고객','재방문','단골','회원관리','휴면'],
  sales:['매출','판매량','수익','매출액','매출분석'],
  inventory:['재고','품절','발주','재료'],
  delivery:['배달','배송','라이더','배차'],
  settlement:['정산','수수료','입금','손익'],
  staff:['직원','근무','근태','교육'],
  booking:['예약','노쇼','방문일정']
});
function resetRequestRouting(){
  const input=$('managementRequest');if(input)input.value='';
  $('requestMatches').replaceChildren();
  $('requestRoutingStatus').textContent='요청을 입력하면 관련 전문 AI를 안내합니다.';
}
function classifyManagementRequest(value){
  const normalized=String(value||'').toLowerCase().trim().slice(0,500);
  if(normalized.length<2)return [];
  return state.catalog.map((module,index)=>{
    const keywords=REQUEST_KEYWORDS[module.id]||[];
    const matched=keywords.filter(word=>normalized.includes(word));
    return {module,index,score:matched.length};
  }).filter(item=>item.score>0)
    .sort((a,b)=>b.score-a.score||a.index-b.index)
    .slice(0,3);
}
function routeManagementRequest(){
  const host=$('requestMatches');host.replaceChildren();
  const status=$('requestRoutingStatus');
  if(!activeSession()){status.textContent='로그인한 회원만 업무 안내를 사용할 수 있습니다.';return}
  const prompt=String($('managementRequest').value||'').trim().slice(0,500);
  if(prompt.length<2){status.textContent='해결하고 싶은 업무를 두 글자 이상 입력해 주세요.';return}
  if(!state.catalog.length){status.textContent='전문 AI 목록을 확인하지 못했습니다. 다시 접속해 주세요.';return}
  const matches=classifyManagementRequest(prompt);
  if(!matches.length){status.textContent='일치하는 분야를 찾지 못했습니다. 위의 전문 AI 목록에서 직접 선택해 주세요.';return}
  const chosen=new Set(state.selection?.modules||[]);
  for(const {module} of matches){
    const card=document.createElement('article');card.className='request-match';
    const title=document.createElement('h3');title.textContent=module.name;
    const stateLabel=document.createElement('small');
    stateLabel.textContent=module.state==='existing'?'기존 서비스 연결':module.state==='foundation'?'기초 설계 · 준비 중':'준비 중';
    const copy=document.createElement('p');copy.textContent=module.description||moduleDescription(module.id);
    card.append(title,stateLabel,copy);
    const link=safeModuleUrl(module);
    if(link&&chosen.has(module.id)){
      const open=document.createElement('a');open.href=link;open.className='module-launch';open.textContent=module.name+' 열기';
      card.append(open);
    }else if(link){
      const hint=document.createElement('p');hint.className='note';hint.textContent='이용할 AI 선택에서 해당 서비스를 선택·저장하면 열 수 있습니다.';
      card.append(hint);
    }else{
      const hint=document.createElement('p');hint.className='note';hint.textContent='아직 연결되지 않은 기능입니다. 업무 실행은 시작되지 않습니다.';
      card.append(hint);
    }
    host.append(card);
  }
  status.textContent=`관련 전문 분야 ${matches.length}개를 찾았습니다. 입력한 문장의 단어를 기준으로 분류한 안내이며 실제 업무를 실행하지 않았습니다.`;
}
function useRequestExample(value){
  if(!activeSession())return;
  $('managementRequest').value=value;
  routeManagementRequest();
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

$('routeRequest').addEventListener('click',routeManagementRequest);
$('exampleSales').addEventListener('click',()=>useRequestExample('매출을 늘리고 싶어요'));
$('exampleMenu').addEventListener('click',()=>useRequestExample('배달앱 메뉴를 한 번에 관리하고 싶어요'));
$('exampleReview').addEventListener('click',()=>useRequestExample('리뷰 대응이 밀렸어요'));
$('exampleOrder').addEventListener('click',()=>useRequestExample('주문을 한곳에서 보고 싶어요'));
$('refreshSpaces').addEventListener('click',loadVerifiedSpaces);
$('saveSelection').addEventListener('click',saveSelection);$('logoutButton').addEventListener('click',logout);
boot();
