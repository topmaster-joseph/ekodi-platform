import './ai-commons-admin.js';
(() => {
'use strict';
const SECTION='common-services';
const CONTROL='https://ekodi.kr';
const TOKEN_KEY='ekodi-auth-token';
const SERVICE_PARAM='service';
const AUTHORITY_CONTEXT='Person + Workspace + Role + Capability';
const ENGINE_SECTION_FILTER=Object.freeze({
  'engine-all':'all',
  'engine-core':'core',
  'engine-common':'common',
  'engine-operations':'operations',
  'engine-professional':'professional',
  'engine-ai':'ai',
  'engine-integration':'integration',
  'engine-preview':'preview',
  'service-modules':'service-modules',
});
const ENGINE_CATEGORY_LABELS=Object.freeze({
  all:'전체 엔진',core:'핵심 엔진',common:'공통 엔진',operations:'운영 엔진',
  professional:'전문 엔진',ai:'AI 엔진',integration:'연동 엔진',preview:'체험·준비 중',
  'service-modules':'공통·전문 모듈',
});
const PANEL_TARGETS=[SECTION,...Object.keys(ENGINE_SECTION_FILTER)].join(' ');
const style=document.createElement('link');style.rel='stylesheet';style.href='common-services-admin.css';style.dataset.ekodiCommonServicesStyle='1';document.head.append(style);
const SERVICES=Object.freeze([
  {id:'auth',name:'인증 엔진',domain:'ekodi.kr/auth',category:'core',kind:'engine',layer:'Core',role:'통합인증 · SSO · 계정',manage:'admins',availability:'기본제공',applyRule:'필수',cost:'기본 제공',critical:true,operatorOnly:true},
  {id:'permission',name:'권한 엔진',domain:'ekodi.kr/api',category:'core',kind:'engine',layer:'Core',role:'역할 · 등급 · Capability 권한',manage:'admins',availability:'기본제공',applyRule:'필수',cost:'기본 제공',critical:true,operatorOnly:true},
  {id:'data',name:'데이터 엔진',domain:'ekodi.kr/api',category:'core',kind:'engine',layer:'Core',role:'공통 데이터 계약 · 사이트별 격리',manage:'storage',availability:'기본제공',applyRule:'필수',cost:'기본 제공',critical:true,operatorOnly:true},
  {id:'notification',name:'알림 엔진',domain:'ekodi.kr/api',category:'core',kind:'engine',layer:'Core',role:'알림 · 상태 변경 전달',manage:'communication',availability:'기본제공',applyRule:'필수',cost:'기본 제공',operatorOnly:false},

  {id:'participant',name:'참가자 엔진',domain:'ekodi.kr/api',controlId:'api',category:'common',kind:'engine',layer:'Common',role:'Activity · Person · 중복방지 · 참가상태',manage:'community',availability:'제공',applyRule:'선택',cost:'기본 제공',operatorOnly:false},
  {id:'member',name:'회원 엔진',domain:'ekodi.kr/api',controlId:'api',category:'common',kind:'engine',layer:'Common',role:'회원 · 가입 · 등급 · 사이트별 관계',manage:'ai-membership',availability:'제공',applyRule:'선택',cost:'기본 제공',operatorOnly:false},
  {id:'content',name:'콘텐츠 엔진',domain:'ekodi.kr/api',controlId:'api',category:'common',kind:'engine',layer:'Common',role:'게시물 · 미디어 · 다국어 콘텐츠',manage:'books',availability:'제공',applyRule:'선택',cost:'기본 제공',operatorOnly:false},
  {id:'application-reservation',name:'신청·예약 엔진',domain:'ekodi.kr/api',controlId:'api',category:'common',kind:'engine',layer:'Common',role:'신청 · 대기 · 승인 · 예약',manage:'community',availability:'제공',applyRule:'선택',cost:'기본 제공',operatorOnly:false},
  {id:'payment-receipt-confirmation',name:'지급·수령 확인 엔진',domain:'ekodi.kr/api',controlId:'api',category:'common',kind:'engine',layer:'Common',role:'지급확인 · 수령확인 · 거래연결 · 발급 · 검증 · 감사',manage:'confirmations',availability:'제공',applyRule:'선택',cost:'기본 제공',operatorOnly:false},

  {id:'admin-engine',name:'관리자 엔진',domain:'ekodi.kr/admin',category:'operations',kind:'engine',layer:'Operations',role:'공통 관리자 Shell · 관리 작업대',manage:'public-site-controls',availability:'기본제공',applyRule:'필수',cost:'기본 제공',critical:true,operatorOnly:true},
  {id:'observability',name:'상태관측 엔진',domain:'ekodi.kr/admin',category:'operations',kind:'engine',layer:'Operations',role:'상태 · 오류 · 경고 · 관측',manage:'health',availability:'기본제공',applyRule:'필수',cost:'기본 제공',operatorOnly:true},
  {id:'deployment',name:'배포 엔진',domain:'ekodi.kr/admin',category:'operations',kind:'engine',layer:'Operations',role:'검증 · 배포 · 작업 대기열',manage:'deployments',availability:'기본제공',applyRule:'승인',cost:'기본 제공',operatorOnly:true},
  {id:'audit',name:'감사기록 엔진',domain:'ekodi.kr/api',category:'operations',kind:'engine',layer:'Operations',role:'변경 · 접근 · 승인 · 감사 기록',manage:'policies',availability:'기본제공',applyRule:'필수',cost:'기본 제공',critical:true,operatorOnly:true},

  {id:'live',name:'라이브방송 서비스',domain:'ekodi.kr/live',category:'professional',kind:'service',layer:'Professional',role:'방송 · 송출 · 발표 · 참여',manage:'communication',availability:'제공',applyRule:'선택',cost:'사용량에 따라 집계',operatorOnly:false},
  {id:'publishing',name:'출판 엔진',domain:'ekodi.kr/publishing',category:'professional',kind:'engine',layer:'Professional',role:'출판 · 도서 · 제작 운영',manage:'books',availability:'제공',applyRule:'선택',cost:'서비스별 집계',operatorOnly:false},
  {id:'insurance-engine',name:'보험업무 엔진',domain:'ekodi.kr/insurance',controlId:'insurance',category:'professional',kind:'engine',layer:'Professional',role:'보험 상담 · 설계사 · 업무 운영',manage:'insurance',availability:'제공',applyRule:'선택',cost:'서비스별 집계',operatorOnly:false},
  {id:'auto-sales',name:'자동영업 엔진',domain:'ekodi.kr/ekodibiz/marketing-ai',category:'professional',kind:'engine',layer:'Professional',role:'자동 영업 · 제휴 · 성과 추적',manage:'marketing-ai',availability:'제공',applyRule:'선택',cost:'사용량에 따라 집계',operatorOnly:false},

  {id:'ai',name:'AI 대화·업무지원 엔진',domain:'ekodi.kr/ai',category:'ai',kind:'engine',layer:'AI',role:'AI 실행 · 작업노드 · 공급자 라우팅',manage:'ai-settings',availability:'제공',applyRule:'승인',cost:'공급자 사용량 기반',critical:true,operatorOnly:true},
  {id:'ai-translation',name:'AI 번역 엔진',domain:'ekodi.kr/ai',category:'ai',kind:'engine',layer:'AI',role:'게시 · 화면 · 콘텐츠 번역',manage:'ai-settings',availability:'제공',applyRule:'승인',cost:'공급자 사용량 기반',operatorOnly:false},
  {id:'ai-content',name:'AI 콘텐츠 엔진',domain:'ekodi.kr/ai',category:'ai',kind:'engine',layer:'AI',role:'문서 · 게시 · 콘텐츠 생성 지원',manage:'ai-settings',availability:'제공',applyRule:'승인',cost:'공급자 사용량 기반',operatorOnly:false},
  {id:'ai-video',name:'AI 영상 엔진',domain:'ekodi.kr/ai',category:'ai',kind:'engine',layer:'AI',role:'영상 · 자막 · 미디어 생성 지원',manage:'ai-settings',availability:'승인 필요',applyRule:'승인',cost:'공급자 사용량 기반',operatorOnly:false},
  {id:'ai-recommendation',name:'AI 추천 엔진',domain:'ekodi.kr/ai',category:'ai',kind:'engine',layer:'AI',role:'사이트 · 콘텐츠 · 상품 추천',manage:'ai-settings',availability:'제공',applyRule:'승인',cost:'공급자 사용량 기반',operatorOnly:false},
  {id:'ai-analysis',name:'AI 분석 엔진',domain:'ekodi.kr/ai',category:'ai',kind:'engine',layer:'AI',role:'운영 · 데이터 · 성과 분석 지원',manage:'ai-settings',availability:'제공',applyRule:'승인',cost:'공급자 사용량 기반',operatorOnly:false},
  {id:'ai-automation',name:'AI 자동화 엔진',domain:'ekodi.kr/ai',category:'ai',kind:'engine',layer:'AI',role:'반복 업무 · 조건 실행 · 작업 오케스트레이션',manage:'ai-settings',availability:'승인 필요',applyRule:'승인',cost:'공급자 사용량 기반',operatorOnly:true},

  {id:'openai-integration',name:'OpenAI 연동',domain:'ekodi.kr/ai',category:'integration',kind:'provider',layer:'Integration',role:'외부 AI 공급자 연결',manage:'ai-settings',availability:'승인 필요',applyRule:'승인',cost:'외부 API 사용량 기반',operatorOnly:true},
  {id:'gemini-integration',name:'Gemini 연동',domain:'ekodi.kr/ai',category:'integration',kind:'provider',layer:'Integration',role:'외부 AI 공급자 연결',manage:'ai-settings',availability:'승인 필요',applyRule:'승인',cost:'외부 API 사용량 기반',operatorOnly:true},
  {id:'external-account',name:'외부계정 연동 엔진',domain:'ekodi.kr/api',category:'integration',kind:'engine',layer:'Integration',role:'외부 계정 · OAuth 연결',manage:'admins',availability:'승인 필요',applyRule:'승인',cost:'연동별 집계',operatorOnly:true},
  {id:'domain-integration',name:'도메인 연동 엔진',domain:'ekodi.kr/admin',category:'integration',kind:'engine',layer:'Integration',role:'사용자 도메인 · DNS 연결',manage:'public-site-controls',availability:'승인 필요',applyRule:'승인',cost:'도메인별 집계',operatorOnly:true},
  {id:'pay',name:'결제 연동 엔진',domain:'ekodi.kr/pay',category:'integration',kind:'engine',layer:'Integration',role:'결제 · 정산 · 귀속',manage:'finance',availability:'승인 필요',applyRule:'승인',cost:'결제·공급자 기준',critical:true,operatorOnly:true},
  {id:'external-api',name:'외부 API 연동 엔진',domain:'ekodi.kr/api',category:'integration',kind:'engine',layer:'Integration',role:'외부 서비스 API 연결',manage:'ai-module-spec',availability:'승인 필요',applyRule:'승인',cost:'연동별 집계',operatorOnly:true},

  {id:'experience',name:'체험서비스',domain:'ekodi.kr/experience',category:'preview',kind:'service',layer:'Preview',role:'합성 데이터 기반 체험 · 검증',manage:'capabilities',availability:'체험',applyRule:'선택',cost:'기본 제공',operatorOnly:false},
  {id:'future-engine',name:'준비 중 엔진',domain:'ekodi.kr/api',category:'preview',kind:'engine',layer:'Preview',role:'아직 운영 적용 전인 공통 기능',manage:'capabilities',availability:'준비 중',applyRule:'사용 불가',cost:'—',operatorOnly:true},
]);
const state={overview:null,ai:null,tasks:[],nodes:[],selected:'ai',detailOpen:false,category:'all',busy:false,query:'',statusFilter:'all',pairGrant:null};
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayAddress=domain=>window.EKODIAdminSurfaceLabels?.label?.(domain)||domain;
const token=()=>{try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}};
const authHeaders=()=>token()?{authorization:`Bearer ${token()}`}:{ };
function panel(){return $('#commonServicesPanel')}
function safeService(value){const id=String(value||'').trim().toLowerCase();return SERVICES.some(item=>item.id===id)?id:'ai'}
function selectedFromUrl(){return safeService(new URLSearchParams(location.search).get(SERVICE_PARAM)||state.selected)}
function categoryFromSection(section=window.EKODIAdminPanels?.current?.()){return ENGINE_SECTION_FILTER[String(section||'').trim()]||'all'}
function categoryServices(){if(state.category==='all')return SERVICES;if(state.category==='service-modules')return SERVICES.filter(item=>item.category==='common'||item.category==='professional');return SERVICES.filter(item=>item.category===state.category)}
function visibleServices(){const query=state.query.trim().toLowerCase();return categoryServices().filter(service=>{const runtime=serviceState(service);const matchesQuery=!query||[service.name,service.domain,service.role,service.layer,kindLabel(service.kind,service.category)].some(value=>String(value||'').toLowerCase().includes(query));if(!matchesQuery)return false;if(state.statusFilter==='healthy')return runtime.key==='healthy';if(state.statusFilter==='attention')return runtime.key==='attention'||runtime.key==='critical';if(state.statusFilter==='standby')return runtime.key==='standby';if(state.statusFilter==='approval')return service.applyRule==='승인'||String(service.availability||'').includes('승인');return true})}
function syncCategory(section=window.EKODIAdminPanels?.current?.()){state.category=categoryFromSection(section);const available=categoryServices();if(!available.some(item=>item.id===state.selected))state.selected=available[0]?.id||state.selected}
function kindLabel(kind,category=''){if(kind==='provider')return'외부 공급자 연동';if(kind==='service')return'독립 서비스';if(category==='professional')return'전문 엔진';if(category==='common')return'공통 엔진';return'엔진'}
async function centralSessionInvalid(){
  const current=token();
  if(!current)return true;
  try{
    const response=await fetch(`${CONTROL}/api/session`,{headers:{authorization:`Bearer ${current}`,accept:'application/json'},cache:'no-store'});
    if(response.status===401||response.status===403)return true;
    if(!response.ok)return false; // Network or Control API errors cannot invalidate a local login.
    const data=await response.json().catch(()=>({}));
    return data.authenticated===false;
  }catch{return false}
}
async function jsonFetch(url,options={}){
  const headers={accept:'application/json',...authHeaders(),...(options.headers||{})};
  if(options.body&&!headers['content-type'])headers['content-type']='application/json';
  const response=await fetch(url,{...options,headers,cache:'no-store'});
  let data={};try{data=await response.json()}catch{}
  if(response.status===401){
    // An AI/service 401 is not proof the central Admin login has expired.
    if(await centralSessionInvalid()){
      window.EKODIAdminCore?.showLogin?.('관리자 세션 만료 · 다시 로그인');
      throw Object.assign(new Error('admin_session_required'),{status:401});
    }
    throw Object.assign(new Error('해당 서비스 인증 확인 실패 · 관리자 로그인은 유지됩니다.'),{status:401,code:data?.error||'service_auth_unavailable'});
  }
  if(response.status===403){
    // A denied service capability must never log out an authenticated admin.
    throw Object.assign(new Error('해당 서비스에 대한 접근 권한이 없습니다. 관리자 로그인은 유지됩니다.'),{status:403,code:data?.error||'service_capability_denied'});
  }
  if(!response.ok)throw Object.assign(new Error(data.error||`HTTP ${response.status}`),{status:response.status});
  return data;
}
const control=(path,options)=>jsonFetch(`${CONTROL}${path}`,options);
// AI runtime has its own canonical /ai/api routes; the generic Control API
// does not implement the legacy common-services/ai forwarding endpoint.
const common=(path,options)=>jsonFetch(`/ai/api/${String(path).replace(/^ai\//,'')}`,options);
function serviceMap(){const map=new Map();for(const item of state.overview?.services||[]){if(item?.id)map.set(`id:${String(item.id).toLowerCase()}`,item);if(item?.domain)map.set(`domain:${String(item.domain).toLowerCase()}`,item)}return map}
function serviceRow(service){const map=serviceMap();return(service.controlId?map.get(`id:${String(service.controlId).toLowerCase()}`):null)||map.get(`domain:${String(service.domain||'').toLowerCase()}`)||null}
function formatCheckTime(value){if(!value)return'미점검';const date=new Date(value);return Number.isNaN(date.getTime())?'미점검':date.toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function latestCheckedAt(services=visibleServices()){const values=services.map(service=>serviceRow(service)?.latest?.checkedAt).filter(Boolean).map(value=>new Date(value).getTime()).filter(Number.isFinite);return values.length?new Date(Math.max(...values)).toISOString():''}
function runtimeScope(service){return service.category==='common'?'공유 API 런타임':service.controlId?'서비스 Control 상태':'전문 서비스 경로'}
function serviceState(service){if(service.id==='ai'&&state.ai?.ok)return{key:'healthy',label:'정상',note:`${state.ai.config?.architectureVersion?'v'+state.ai.config.architectureVersion:'v1.8'} · ${state.ai.stateStore==='ready'?'상태저장 연결':'상태저장 확인'}`,checkedAt:''};const row=serviceRow(service);if(!row)return{key:'standby',label:'미점검',note:'개별 런타임 상태 연결 대기',checkedAt:''};if(!row.monitorEnabled)return{key:'standby',label:'미점검',note:'Control 모니터링 미설정',checkedAt:row.latest?.checkedAt||''};const status=row.latest?.status||'pending';if(status==='offline')return{key:'critical',label:'장애',note:row.latest?.detail||row.latest?.error||'응답 없음',checkedAt:row.latest?.checkedAt||''};if(status==='degraded')return{key:'attention',label:'주의',note:row.latest?.detail||row.latest?.error||'부분 장애',checkedAt:row.latest?.checkedAt||''};if(status==='online')return{key:'healthy',label:'정상',note:Number(row.latest?.responseTime||0)?`${row.latest.responseTime} ms`:'정상 응답',checkedAt:row.latest?.checkedAt||''};return{key:'standby',label:'미점검',note:'최근 점검 결과 없음',checkedAt:row.latest?.checkedAt||''}}
function activationState(service){const row=serviceRow(service);if(row?.state==='paused')return{key:'disabled',label:'일시정지',note:'Control에서 중지됨'};if(row?.state==='planned')return{key:'gated',label:'준비',note:'Control에서 계획 상태'};if(service.applyRule==='사용 불가'||service.availability==='준비 중')return{key:'disabled',label:'비활성',note:'운영 적용 전'};if(service.applyRule==='승인'||String(service.availability||'').includes('승인'))return{key:'gated',label:'승인형',note:'승인 후 활성화'};return{key:'enabled',label:'활성',note:row?.state==='active'?'Control 활성':'사용 가능'}}
function clearServiceUrl(){const u=new URL(location.href);u.searchParams.delete(SERVICE_PARAM);history.replaceState({},document.title,u.pathname+u.search+u.hash)}
function syncServiceUrl(serviceId){const u=new URL(location.href);u.searchParams.set(SERVICE_PARAM,serviceId);history.replaceState({},document.title,`${u.pathname}${u.search}${u.hash}`)}
function installPanel(){
  if(panel())return true;
  const content=$('.content');if(!content)return false;
  const section=document.createElement('section');
  section.id='commonServicesPanel';
  section.className='section common-services-panel hidden-panel';
  section.dataset.panel=PANEL_TARGETS;
  section.dataset.authorityContext=AUTHORITY_CONTEXT;
  section.hidden=true;
  section.innerHTML=
    '<div class="common-services-head"><h2 id="commonServicesTitle">서비스 엔진</h2>'+
    '<div class="common-services-actions"><span id="commonServicesCheckedAt">점검 기록 확인 중</span><button id="commonServicesRefresh" class="secondary" type="button">전체 점검</button></div></div>'+
    '<div id="commonServicesSummary" class="common-services-summary" aria-label="엔진 상태 요약"></div>'+
    '<div class="common-services-toolbar"><label class="common-services-search"><span class="sr-only">엔진 검색</span><input id="commonServicesSearch" type="search" placeholder="엔진 이름·역할 검색" autocomplete="off"></label>'+
    '<label class="common-services-filter"><span class="sr-only">상태 필터</span><select id="commonServicesStatusFilter" aria-label="상태 필터"><option value="all">전체 상태</option><option value="healthy">정상</option><option value="attention">주의·장애</option><option value="standby">미점검</option><option value="approval">승인형</option></select></label></div>'+
    '<div class="common-services-layout"><div class="common-services-list-wrap"><div class="common-services-list-head" aria-hidden="true"><span>서비스 엔진</span><span>점검 상태</span><span>상세</span></div><div id="commonServicesGrid" class="common-services-grid"></div></div>'+
    '<section id="commonServiceDetail" class="common-service-detail" aria-live="polite" hidden></section></div>';
  content.prepend(section);
  section.querySelector('#commonServicesRefresh')?.addEventListener('click',()=>refresh(true));
  section.querySelector('#commonServicesSearch')?.addEventListener('input',event=>{state.query=event.target.value||'';renderGrid()});
  section.querySelector('#commonServicesStatusFilter')?.addEventListener('change',event=>{state.statusFilter=event.target.value||'all';renderGrid()});
  return true;
}
function renderHeader(){
  const moduleMode=state.category==='service-modules';
  const host=panel();host?.classList.toggle('module-health-mode',moduleMode);
  const title=$('#commonServicesTitle');if(title)title.textContent=moduleMode?'공통·전문 모듈':'서비스 엔진';
  const head=host?.querySelector('.common-services-list-head');
  if(head)head.innerHTML=moduleMode?'<span>서비스 모듈</span><span>점검 상태</span><span>활성 상태</span><span>상세</span>':'<span>서비스 엔진</span><span>점검 상태</span><span>상세</span>';
  const checked=$('#commonServicesCheckedAt');
  if(checked){const latest=latestCheckedAt();checked.textContent=latest?'최근 점검 '+formatCheckTime(latest):'점검 기록 없음'}
}
function renderSummary(){
  const host=$('#commonServicesSummary');if(!host)return;
  const visible=categoryServices();
  const states=visible.map(service=>serviceState(service));
  const healthy=states.filter(item=>item.key==='healthy').length;
  const attention=states.filter(item=>item.key==='attention'||item.key==='critical').length;
  const standby=states.filter(item=>item.key==='standby').length;
  host.innerHTML=
    '<article><small>전체</small><strong>'+visible.length+'</strong></article>'+
    '<article><small>정상</small><strong>'+healthy+'</strong></article>'+
    '<article class="'+(attention?'warn':'')+'"><small>점검 필요</small><strong>'+(attention+standby)+'</strong><span>미점검 '+standby+' · 주의·장애 '+attention+'</span></article>';
}
function serviceCard(service){
  const s=serviceState(service),a=activationState(service);
  const moduleMode=state.category==='service-modules';
  const button=document.createElement('button');
  button.type='button';
  button.className='common-service-card '+s.key+(state.detailOpen&&state.selected===service.id?' selected':'');
  button.setAttribute('aria-pressed',state.detailOpen&&state.selected===service.id?'true':'false');
  button.setAttribute('aria-label',service.name+', '+service.role+', 런타임 '+s.label+', 활성 '+a.label+', 상세 열기');
  button.innerHTML=
    '<span class="common-service-identity"><b>'+esc(service.name)+'</b><small>'+esc(service.role)+'</small></span>'+
    '<span class="common-service-runtime"><i class="status '+esc(s.key)+'">'+esc(s.label)+'</i></span>'+
    (moduleMode?'<span class="common-service-activation"><b>'+esc(a.label)+'</b></span>':'')+
    '<span class="common-service-open">상세</span>';
  button.addEventListener('click',()=>{state.selected=service.id;state.detailOpen=true;syncServiceUrl(service.id);render();$('#commonServiceDetail')?.scrollIntoView?.({behavior:'smooth',block:'nearest'})});
  return button;
}
function renderGrid(){const host=$('#commonServicesGrid');if(!host)return;host.replaceChildren();const visible=visibleServices();const count=$('#commonServicesVisibleCount');if(count)count.textContent=`${visible.length} / ${categoryServices().length}개 표시`;if(!visible.length){const empty=document.createElement('p');empty.className='common-services-no-results';empty.textContent='조건에 맞는 서비스 엔진이 없습니다.';host.append(empty);return}if(state.category==='service-modules'){for(const category of ['common','professional']){const items=visible.filter(service=>service.category===category);if(!items.length)continue;const group=document.createElement('section');group.className='module-service-group';group.innerHTML=`<div class="module-service-group-head"><div><small>${category==='common'?'COMMON':'PROFESSIONAL'}</small><strong>${category==='common'?'공통 서비스':'전문 서비스'}</strong></div><span>${items.length}개</span></div><div class="module-service-list"></div>`;const list=group.querySelector('.module-service-list');for(const service of items)list.append(serviceCard(service));host.append(group)}return}for(const service of visible)host.append(serviceCard(service))}
function routeButton(section,label='관리 메뉴 열기'){return `<button type="button" class="secondary" data-common-route="${esc(section)}">${esc(label)}</button>`}
function genericDetail(service){
  const s=serviceState(service),a=activationState(service);
  return '<div class="common-detail-head"><div><h3>'+esc(service.name)+'</h3><p>'+esc(service.role)+'</p></div><span class="status '+esc(s.key)+'">'+esc(s.label)+'</span></div>'+
    '<div class="common-detail-policy"><article><small>운영 상태</small><strong>'+esc(s.label)+'</strong><span>'+esc(s.note)+'</span></article>'+
    '<article><small>기능 활성</small><strong>'+esc(a.label)+'</strong><span>'+esc(a.note)+'</span></article>'+
    '<article><small>적용 · 비용</small><strong>'+esc(service.applyRule)+'</strong><span>'+esc(service.cost)+'</span></article>'+
    '<article><small>관리 경로</small><strong>'+esc(displayAddress(service.domain))+'</strong><span>'+(s.checkedAt?'최근 점검 '+esc(formatCheckTime(s.checkedAt)):'런타임 개별 점검 미확인')+'</span></article></div>'+
    '<div class="common-detail-actions">'+routeButton(service.manage,'세부 관리')+'</div>';
}
function taskStatus(value){return({queued:'대기',allocating:'브랜치 할당',running:'실행',approval_required:'승인 대기',completed:'완료',failed:'실패',blocked_policy:'정책 차단'})[value]||value||'-'}
function aiTaskRows(){if(!state.tasks.length)return'<p class="common-empty">아직 AI 작업이 없습니다.</p>';return state.tasks.slice(0,12).map(task=>`<article class="ai-task-row"><div><strong>${esc(task.title||task.id)}</strong><small>${esc(task.id)} · ${esc(task.mode||'')}</small></div><span>${esc(taskStatus(task.state))}</span>${task.state==='approval_required'?`<button type="button" data-ai-approve="${esc(task.id)}">결과 승인</button>`:''}</article>`).join('')}
function activePairGrant(){const grant=state.pairGrant;if(!grant)return null;if(!Number.isFinite(grant.expiresAt)||Date.now()>=grant.expiresAt){state.pairGrant=null;return null}return grant}
function pairGrantMessage(){const grant=activePairGrant();return grant?`연결코드 ${grant.code} · ${new Date(grant.expiresAt).toLocaleTimeString('ko-KR')} 만료`:''}
function aiNodeRows(){if(!state.nodes.length)return'<p class="common-empty">연결된 계정형 작업노드가 없습니다.</p>';return state.nodes.map(node=>`<article class="ai-node-row"><div><strong>${esc(node.name||node.id)}</strong><small>${esc(node.id)}</small></div><span>${node.online?'온라인':'오프라인'} · ${esc((node.providers||[]).join(', ')||'AI 미감지')}</span></article>`).join('')}
function aiDetail(service){const s=serviceState(service);const config=state.ai?.config||{};const providers=state.ai?.providers||[];return `<div class="common-detail-head"><div><small>AUTONOMOUS · ADMIN CONTROL</small><h3>AI Control Runtime</h3><p>AI Core는 내부 실행 엔진이며 사용자 대표 주소로 노출하지 않습니다. 관리자 UI는 이 화면에서만 제공합니다.</p></div><span class="status ${esc(s.key)}">${esc(s.label)}</span></div><div class="common-detail-policy"><article><small>운영구조</small><strong>${esc(config.architectureVersion?'v'+config.architectureVersion:'v1.8')}</strong><span>Sovereign → Autonomous → Agentic → Services</span></article><article><small>작업 실행</small><strong>${config.taskExecutionEnabled?'활성':'비활성'}</strong><span>Human approval required</span></article><article><small>브랜치 할당</small><strong>${config.branchAllocationEnabled?'자동':'비활성'}</strong><span>독립 개발 경계</span></article><article><small>상태저장</small><strong>${state.ai?.stateStore==='ready'?'연결됨':'확인 필요'}</strong><span>AI 운영 원장</span></article></div><div class="ai-runtime-block"><div class="common-subhead"><div><small>PROVIDERS</small><h4>실행 공급자</h4></div><span>${providers.length}개</span></div><div class="ai-provider-list">${providers.map(p=>`<span class="provider ${p.available?'ready':''}">${esc(p.id)} · ${p.available?'사용 가능':'대기'}</span>`).join('')||'<span class="common-empty">공급자 상태 없음</span>'}</div></div><div class="ai-runtime-block"><div class="common-subhead"><div><small>COMMAND</small><h4>관리자 작업 실행</h4></div><span>AI:OPERATE</span></div><div class="ai-command-form"><input id="commonAiTitle" placeholder="작업 제목"><textarea id="commonAiPrompt" rows="4" placeholder="AI에게 실행할 운영 명령"></textarea><div class="ai-command-options"><select id="commonAiMode"><option value="primary-review">Primary + Review</option><option value="single">Single</option><option value="parallel">Parallel</option></select><label><input id="commonAiBranch" type="checkbox" checked> 코드 작업은 독립 브랜치</label><button id="commonAiRun" class="primary" type="button" ${config.taskExecutionEnabled?'':'disabled'}>${config.taskExecutionEnabled?'작업 생성 · 실행':'현재 실행 비활성'}</button></div><p id="commonAiCommandStatus" class="common-inline-status"></p></div></div><div class="ai-runtime-columns"><section class="ai-runtime-block"><div class="common-subhead"><div><small>TASKS</small><h4>최근 작업</h4></div><button id="commonAiTasksRefresh" class="ghost" type="button">↻</button></div><div id="commonAiTasks">${aiTaskRows()}</div></section><section class="ai-runtime-block"><div class="common-subhead"><div><small>ACCOUNT NODES</small><h4>계정형 작업노드</h4></div><button id="commonAiPair" class="secondary" type="button">연결코드 발급</button></div><p id="commonAiPairCode" class="common-inline-status">${esc(pairGrantMessage())}</p><p class="common-inline-status">계정형 노드는 EKODI 자체 Device Agent와 별도로 등록됩니다. 3번 PC에서 공식 노드 등록 스크립트를 실행한 뒤 발급 코드를 직접 입력하세요. 코드를 URL이나 로그에 기록하지 마세요.</p><div id="commonAiNodes">${aiNodeRows()}</div></section></div><div class="common-detail-actions">${routeButton('ai-settings','AI 설정 관리')}</div>`}
function bindDetail(){const detail=$('#commonServiceDetail');if(!detail)return;detail.querySelector('#commonServiceDetailClose')?.addEventListener('click',()=>{state.detailOpen=false;clearServiceUrl();render()});detail.querySelectorAll('[data-common-route]').forEach(button=>button.addEventListener('click',()=>{const section=button.dataset.commonRoute;window.EKODIAdminPanels?.activate?.(section);location.hash=`#${section}`}));detail.querySelector('#commonAiRun')?.addEventListener('click',runAiTask);detail.querySelector('#commonAiPair')?.addEventListener('click',pairNode);detail.querySelector('#commonAiTasksRefresh')?.addEventListener('click',()=>refreshAi());detail.querySelectorAll('[data-ai-approve]').forEach(button=>button.addEventListener('click',()=>approveTask(button.dataset.aiApprove)))}
function renderDetail(){
  const detail=$('#commonServiceDetail');if(!detail)return;
  if(!state.detailOpen){detail.hidden=true;detail.replaceChildren();return}
  const service=SERVICES.find(item=>item.id===state.selected);
  if(!service){detail.hidden=true;detail.replaceChildren();return}
  detail.hidden=false;
  detail.innerHTML='<div class="common-service-detail-top"><strong>엔진 상세</strong><button id="commonServiceDetailClose" type="button" class="secondary">닫기</button></div>'+(service.id==='ai'?aiDetail(service):genericDetail(service));
  bindDetail();
}
function render(){syncCategory();renderHeader();renderSummary();renderGrid();renderDetail();window.dispatchEvent(new CustomEvent('ekodi-common-services-rendered',{detail:{service:state.selected,category:state.category}}))}
// A navigation or reload cancels in-flight fetches with "TypeError: Failed to fetch";
// that is expected page teardown, not an AI runtime fault, so it must not be logged as one.
let pageUnloading=false;
for(const eventName of ['pagehide','beforeunload'])window.addEventListener(eventName,()=>{pageUnloading=true});
window.addEventListener('pageshow',()=>{pageUnloading=false});
function isUnloadAbort(error){return pageUnloading||error?.name==='AbortError'}
async function refreshAi(){try{const [status,tasks,nodes]=await Promise.all([common('ai/status'),common('ai/tasks'),common('ai/nodes')]);state.ai=status;state.tasks=tasks.tasks||[];state.nodes=nodes.nodes||[]}catch(error){if(isUnloadAbort(error))return;console.error('[EKODI Common Services] AI runtime',error);state.ai={ok:false,error:error.message};state.tasks=[];state.nodes=[]}render()}
async function refresh(force=false){if(state.busy)return;state.busy=true;const button=$('#commonServicesRefresh');if(button)button.disabled=true;try{state.overview=await control(force?'/api/control/check':'/api/control/overview',{method:force?'POST':'GET'}).catch(error=>({error:error.message,services:[]}));await refreshAi()}finally{state.busy=false;if(button)button.disabled=false;render()}}
async function runAiTask(){const title=$('#commonAiTitle')?.value.trim()||'';const prompt=$('#commonAiPrompt')?.value.trim()||'';const status=$('#commonAiCommandStatus');if(!prompt){if(status)status.textContent='운영 명령을 입력해 주세요.';return}const button=$('#commonAiRun');if(button)button.disabled=true;if(status)status.textContent='작업 생성 중';try{const created=await common('ai/tasks',{method:'POST',body:JSON.stringify({title,prompt,mode:$('#commonAiMode')?.value||'primary-review',needsCodeBranch:Boolean($('#commonAiBranch')?.checked)})});await common(`ai/tasks/${encodeURIComponent(created.task.id)}/run`,{method:'POST'});if(status)status.textContent=`${created.task.id} 실행 시작`;await refreshAi()}catch(error){if(status)status.textContent=`실행 실패: ${error.message}`}finally{if(button)button.disabled=false}}
async function approveTask(id){try{await common(`ai/tasks/${encodeURIComponent(id)}/approve`,{method:'POST'});await refreshAi()}catch(error){alert(`승인 실패: ${error.message}`)}}
async function pairNode(){const output=$('#commonAiPairCode');state.pairGrant=null;if(output)output.textContent='연결코드 발급 중';try{const data=await common('ai/nodes/pair',{method:'POST',body:'{}'});const code=String(data.code||'');const expiry=Date.parse(String(data.expiresAt||''));if(!/^[A-HJ-NP-Z2-9]{10}$/.test(code)||!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+15*60*1000)throw new Error('invalid_pairing_response');const grant={code,expiresAt:expiry};state.pairGrant=grant;await refreshAi();setTimeout(()=>{if(state.pairGrant!==grant)return;state.pairGrant=null;const status=$('#commonAiPairCode');if(status)status.textContent='연결코드가 만료됐습니다. 새 코드를 발급하세요.'},Math.max(0,expiry-Date.now()));}catch(error){state.pairGrant=null;const status=$('#commonAiPairCode');if(status)status.textContent=`연결코드 발급 실패: ${error.message}`}}
function mount(){if(!installPanel())return null;state.selected=selectedFromUrl();state.detailOpen=Boolean(new URLSearchParams(location.search).get(SERVICE_PARAM));render();return panel()}
function activate(section=window.EKODIAdminPanels?.current?.()){const mounted=mount();if(!mounted)return null;mounted.hidden=false;mounted.classList.remove('hidden-panel');mounted.dataset.adminListLayout='single';state.selected=selectedFromUrl();state.detailOpen=state.detailOpen||Boolean(new URLSearchParams(location.search).get(SERVICE_PARAM));syncCategory(section);render();if(!state.busy)void refresh();return mounted}
window.addEventListener('ekodi-admin-section-changed',event=>{const section=String(event.detail?.section||'');if(section===SECTION||ENGINE_SECTION_FILTER[section]){state.category=ENGINE_SECTION_FILTER[section]||'all';syncCategory();render()}});
mount();
window.EKODICommonServicesAdmin=Object.freeze({mount,activate,refresh:()=>refresh(true),category:()=>state.category});
})();
