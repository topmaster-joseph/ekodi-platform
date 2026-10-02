(()=>{
const PLATFORM_TOKEN_KEY='ekodi-auth-token';
const SESSION_KEY='ekodi-seonam-admin-session';
const CENTRAL_SESSION_KEY='sb-renzehysxirjilvdxacv-auth-token';
const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const state={me:null,content:[],timeline:[],voices:[],notices:[],channels:[],finance:[],baseData:null,organization:null};
const $=id=>document.getElementById(id);
const qs=(sel,root=document)=>root.querySelector(sel);
const qsa=(sel,root=document)=>[...root.querySelectorAll(sel)];
const text=(node,value)=>{if(node)node.textContent=String(value??'')};
const dateText=value=>{if(!value)return'';try{return new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return String(value)}};

function authUrl(){const u=new URL('https://ekodi.kr/auth/');u.searchParams.set('site','portal');u.searchParams.set('direct','1');u.searchParams.set('return_to',location.origin+'/seonammedi/admin/');return u.href}
function storedSession(){try{const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');return value?.accessToken?value:null}catch{return null}}
function saveSession(value){sessionStorage.setItem(SESSION_KEY,JSON.stringify(value))}
function clearSession(){sessionStorage.removeItem(SESSION_KEY)}
async function supabaseAuth(pathname,body){
  const bridge=pathname.includes('refresh_token')?'/api/seonammedi/admin/auth/refresh':'/api/seonammedi/admin/auth/exchange';
  let response=null,data={};
  try{
    response=await fetch(bridge,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
    data=await response.json().catch(()=>({}));
  }catch{}
  if(response?.ok)return data;
  if(response&&response.status<500)throw Object.assign(new Error(data.msg||data.error_description||data.error||('auth_'+response.status)),{status:response.status,data});
  try{
    const direct=await fetch(SUPABASE_URL+pathname,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
    const directData=await direct.json().catch(()=>({}));
    if(!direct.ok)throw Object.assign(new Error(directData.msg||directData.error_description||directData.error||('auth_'+direct.status)),{status:direct.status,data:directData});
    return directData;
  }catch(error){
    if(error?.status)throw error;
    throw Object.assign(new Error('로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'),{status:503});
  }
}
function normalizeSession(data,current={}){return{accessToken:data.access_token||'',refreshToken:data.refresh_token||current.refreshToken||'',expiresAt:Number(data.expires_at||0)||Math.floor(Date.now()/1000)+Number(data.expires_in||3600),user:{id:data.user?.id||current.user?.id||'',email:data.user?.email||current.user?.email||''}}}
async function exchangeHandoff(){
  const params=new URLSearchParams(location.hash.slice(1));const tokenHash=params.get('ekodi_token');if(!tokenHash)return storedSession();
  const data=await supabaseAuth('/auth/v1/verify',{token_hash:tokenHash,type:params.get('ekodi_type')||'email'});
  const session=normalizeSession(data);if(!session.accessToken)throw new Error('login_handoff_failed');saveSession(session);history.replaceState(null,'',location.pathname+location.search);return session;
}
async function userToken(){
  let session=await exchangeHandoff();if(!session?.accessToken)return'';
  const now=Math.floor(Date.now()/1000);if(!session.expiresAt||session.expiresAt>now+60)return session.accessToken;
  if(!session.refreshToken){clearSession();return''}
  try{const data=await supabaseAuth('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refreshToken});session=normalizeSession(data,session);saveSession(session);return session.accessToken}catch{clearSession();return''}
}
function centralSessionToken(){
  try{
    const raw=localStorage.getItem(CENTRAL_SESSION_KEY)||'';
    if(!raw)return'';
    const parsed=JSON.parse(raw);
    const session=parsed?.currentSession||parsed?.session||parsed;
    const access=String(session?.access_token||'');
    const expires=Number(session?.expires_at||0);
    if(!access)return'';
    if(expires&&expires<=Math.floor(Date.now()/1000)+30)return'';
    return access;
  }catch{return''}
}
async function token(){
  const platform=sessionStorage.getItem(PLATFORM_TOKEN_KEY)||'';if(platform)return platform;
  try{const handoff=await userToken();if(handoff)return handoff}catch(error){if(Number(error?.status||0)<500)throw error}
  return centralSessionToken();
}
async function api(path,options={}){
  const bearer=await token();
  const headers=new Headers(options.headers||{});if(bearer)headers.set('authorization','Bearer '+bearer);if(options.body&&!(options.body instanceof FormData)&&!headers.has('content-type'))headers.set('content-type','application/json');
  let response;try{response=await fetch(path,{...options,headers,cache:'no-store',credentials:'same-origin'})}catch{throw Object.assign(new Error('서버에 연결하지 못했습니다. 새로고침 후 다시 시도해 주세요.'),{status:503})}
  const data=await response.json().catch(()=>({}));
  if(response.status===401){sessionStorage.removeItem(PLATFORM_TOKEN_KEY);clearSession();try{localStorage.removeItem(CENTRAL_SESSION_KEY)}catch{}location.replace(authUrl());throw new Error('로그인이 만료되었습니다.')}
  if(!response.ok)throw Object.assign(new Error(data.error||'요청을 처리하지 못했습니다.'),{status:response.status,data});return data;
}
const ADMIN_ROUTE_PANELS=new Set(['dashboard','status','channels','voices','finance','notices','organization','minutes','access']);
function writeAdminRoute(panel,{org=null,records=null,replace=false}={}){
  const url=new URL(location.href);
  if(panel&&panel!=='dashboard')url.searchParams.set('panel',panel);else url.searchParams.delete('panel');
  if(panel==='organization'&&org&&ORG_GROUPS.some(item=>item.key===org))url.searchParams.set('org',org);else url.searchParams.delete('org');
  if(panel==='status'&&records==='review')url.searchParams.set('records','review');else url.searchParams.delete('records');
  const next=url.pathname+(url.searchParams.toString()?'?'+url.searchParams.toString():'');
  history[replace?'replaceState':'pushState'](null,'',next);
}
function selectRecordsAdminTab(name='timeline',{route=true,replace=false}={}){
  const tabs=qsa('[data-records-admin-tab]'),panels=qsa('[data-records-admin-panel]');
  if(!tabs.length||!panels.length)return;
  const allowed=name==='review'?'review':'timeline';
  tabs.forEach(tab=>{const active=tab.dataset.recordsAdminTab===allowed;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',active?'true':'false')});
  panels.forEach(panel=>{panel.hidden=panel.dataset.recordsAdminPanel!==allowed});
  if(route)writeAdminRoute('status',{records:allowed,replace});
}
function showPanel(name,{route=true,replace=false}={}){
  const target=ADMIN_ROUTE_PANELS.has(name)?name:'dashboard';
  qsa('[data-panel]').forEach(node=>{const active=node.dataset.panel===target;node.hidden=!active;node.classList.toggle('active',active)});
  qsa('[data-panel-target]').forEach(node=>node.classList.toggle('active',node.dataset.panelTarget===target));
  if(route)writeAdminRoute(target,{replace});
}
function restoreAdminRoute({replace=false}={}){
  const params=new URLSearchParams(location.search);
  let panel=params.get('panel')||'dashboard';
  if(!ADMIN_ROUTE_PANELS.has(panel))panel='dashboard';
  const button=qs('[data-panel-target="'+panel+'"]');
  if(button?.hidden)panel='dashboard';
  showPanel(panel,{route:false});
  if(panel==='organization')showOrgAdminTab(params.get('org')||'bidae',{route:false});
  if(panel==='status')selectRecordsAdminTab(params.get('records')==='review'?'review':'timeline',{route:false});
  if(replace)writeAdminRoute(panel,{org:panel==='organization'?(params.get('org')||'bidae'):null,records:panel==='status'?params.get('records'):null,replace:true});
}
qsa('[data-records-admin-tab]').forEach(button=>button.addEventListener('click',()=>selectRecordsAdminTab(button.dataset.recordsAdminTab)));
qsa('[data-panel-target]').forEach(button=>button.addEventListener('click',()=>showPanel(button.dataset.panelTarget)));
qsa('[data-go]').forEach(button=>button.addEventListener('click',()=>showPanel(button.dataset.go)));
addEventListener('popstate',()=>restoreAdminRoute());

function tag(label,cls=''){const span=document.createElement('span');span.className='tag '+cls;span.textContent=label;return span}
function button(label,handler,cls=''){const b=document.createElement('button');b.type='button';b.textContent=label;if(cls)b.className=cls;b.addEventListener('click',handler);return b}
function empty(label){const p=document.createElement('p');p.className='empty';p.textContent=label;return p}

function updateDashboard(){
    text($('contentCount'),state.content.length);text($('timelineCount'),state.timeline.length);text($('voiceCount'),state.voices.length);text($('noticeCount'),state.notices.length);text($('channelCount'),state.channels.length);
  const me=state.me;if(!me)return;
  const statusLabel=me.publicStatus==='public'?'공개':me.publicStatus==='private'?'비공개':'점검중';text($('publicStatus'),statusLabel);
  const perms=[];if(me.permissions?.timeline)perms.push('활동이력');if(me.permissions?.voices)perms.push('시민의견');if(me.permissions?.content)perms.push('웹검색 게시검토');if(me.permissions?.notices)perms.push('공지');if(me.permissions?.channels)perms.push('소통채널');
  text($('scopeSummary'),me.platform?'최고관리자 권한으로 이 사이트를 관리하고 있습니다.':(perms.length?perms.join('·')+' 관리 권한만 부여된 사이트 범위 관리자입니다.':'조회 권한만 있습니다.'));
  text($('adminIdentity'),me.email||'');text($('accessEmail'),me.email||'-');text($('accessRole'),me.platform?'최고관리자':'게시판 관리자');
  text($('accessPages'),me.permissions?.pages?'현재상황·조직구성 수정 가능':'권한 없음');const runHealth=$('runSiteHealth');if(runHealth)runHealth.hidden=!me.permissions?.health;text($('accessTimeline'),me.permissions?.timeline?'등록·수정·게시여부 선택 가능':'권한 없음');text($('accessVoices'),me.permissions?.voices?'접수내용 조회·상태변경·삭제 가능':'권한 없음');text($('accessFinance'),me.permissions?.finance?'회계내역 등록·수정·삭제 가능':'권한 없음');text($('accessContent'),me.permissions?.content?'분류·게시여부 선택 가능':'권한 없음');text($('accessNotice'),me.permissions?.notices?'작성·수정·삭제 가능':'권한 없음');text($('accessChannel'),me.permissions?.channels?'추가·수정·숨김·삭제 가능':'권한 없음');
  qs('[data-panel-target="status"]').hidden=!(me.permissions?.pages||me.permissions?.timeline||me.permissions?.content);qs('[data-panel-target="organization"]').hidden=!me.permissions?.pages;qs('[data-panel-target="voices"]').hidden=!me.permissions?.voices;qs('[data-panel-target="notices"]').hidden=!me.permissions?.notices;qs('[data-panel-target="channels"]').hidden=!me.permissions?.channels;qs('[data-panel-target="finance"]').hidden=!me.permissions?.finance;
}




function healthStateLabel(state){return state==='ok'?'정상':state==='warn'?'주의':'오류'}
function healthRow(label,state,detail){
  const article=document.createElement('article');article.className='health-row '+state;
  const copy=document.createElement('div');const strong=document.createElement('strong');strong.textContent=label;const small=document.createElement('small');small.textContent=detail||'';copy.append(strong,small);
  const badge=tag(healthStateLabel(state),state==='ok'?'live':state==='warn'?'warn':'error');article.append(copy,badge);return article;
}
function healthSummary(hostId,rows){const host=$(hostId);if(host)host.replaceChildren(...rows.map(row=>healthRow(row.label,row.state,row.detail)))}
async function healthFetch(path,{inspect=null}={}){
  const started=performance.now();
  try{
    const response=await fetch(path,{cache:'no-store',headers:{accept:'application/json,text/html,*/*'}});
    const ms=Math.max(0,Math.round(performance.now()-started));let state=response.ok?'ok':'error',detail='HTTP '+response.status+' · '+ms+'ms';
    if(response.ok&&inspect){const body=await response.clone().text();const checked=inspect(body,response);if(checked===false)state='warn';else if(typeof checked==='string')detail+=' · '+checked}
    return{path,state,detail,response};
  }catch(error){return{path,state:'error',detail:error?.message||'연결 실패',response:null}}
}
async function loadSiteHealth(){
  const staticHost=$('staticHealthList'),dynamicHost=$('dynamicHealthList');if(!staticHost||!dynamicHost)return;
  staticHost.innerHTML='<p class="empty">정적 상태를 확인 중입니다.</p>';dynamicHost.innerHTML='<p class="empty">동적 상태를 확인 중입니다.</p>';
  const [home,css,script,data,monitor,pageData,notices,channels]=await Promise.all([
    healthFetch('/seonammedi/',{inspect:body=>body.includes('<link rel="canonical" href="https://ekodi.kr/seonammedi/">')&&!body.includes('id="monitorBadge"')?'사용자 화면과 관리자 점검 분리됨':false}),
    healthFetch('/seonammedi/app.css'),healthFetch('/seonammedi/app.js'),
    healthFetch('/seonammedi/data.json',{inspect:body=>{try{return Boolean(JSON.parse(body)?.updatedAt)}catch{return false}}}),
    healthFetch('/api/seonammedi/monitor'),healthFetch('/api/seonammedi/page-data'),healthFetch('/api/seonammedi/notices'),healthFetch('/api/seonammedi/channels')
  ]);
  const staticRows=[
    {label:'공개 홈 경로',state:home.state,detail:home.detail},
    {label:'스타일 자산',state:css.state,detail:css.detail},
    {label:'스크립트 자산',state:script.state,detail:script.detail},
    {label:'기본 데이터 파일',state:data.state,detail:data.detail},
    {label:'공개/관리 점검 분리',state:home.state,detail:home.state==='ok'?'자동점검 정보는 관리자 화면에만 표시':'공개 홈 확인 필요'}
  ];
  healthSummary('staticHealthList',staticRows);
  let monitorBody={};try{monitorBody=monitor.response?await monitor.response.clone().json():{}}catch{}
  const lastRun=monitorBody?.lastRun||null,completed=lastRun?.completed_at?new Date(lastRun.completed_at):null;
  const ageHours=completed&&Number.isFinite(completed.getTime())?(Date.now()-completed.getTime())/36e5:null;
  let runHistoryState='ok';
  if(!lastRun)runHistoryState='warn';
  else if(lastRun.status==='failed')runHistoryState='error';
  else if(lastRun.status==='partial'||(ageHours!==null&&ageHours>30))runHistoryState='warn';
  const dynamicRows=[
    {label:'현재상황·회계 API',state:pageData.state,detail:pageData.detail},
    {label:'공지 API',state:notices.state,detail:notices.detail},
    {label:'채널 API',state:channels.state,detail:channels.detail},
    {label:'자동수집 API 현재 응답',state:monitor.state,detail:monitor.detail},
    {label:'최근 자동점검 실행',state:runHistoryState,detail:lastRun?((completed?completed.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'시간 미확인')+' · '+(lastRun.status||'상태 미확인')):'실행 기록 없음'}
  ];
  healthSummary('dynamicHealthList',dynamicRows);
  const staticState=staticRows.some(x=>x.state==='error')?'error':staticRows.some(x=>x.state==='warn')?'warn':'ok';
  const liveDynamicRows=dynamicRows.filter(x=>x.label!=='최근 자동점검 실행');
  const dynamicState=liveDynamicRows.some(x=>x.state==='error')?'error':liveDynamicRows.some(x=>x.state==='warn')?'warn':'ok';
  text($('staticHealthStatus'),healthStateLabel(staticState));text($('dynamicHealthStatus'),healthStateLabel(dynamicState));
  text($('siteHealthCheckedAt'),new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}));
  const runBadge=$('monitorRunBadge');if(runBadge){runBadge.className='tag '+(runHistoryState==='ok'?'live':runHistoryState==='warn'?'warn':'error');runBadge.textContent=healthStateLabel(runHistoryState)}
  const summary=$('monitorRunSummary');if(summary)summary.textContent=lastRun?('최근 실행 '+(completed?completed.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'-')+' · 출처 '+Number(lastRun.sources_checked||0)+'개 · 확인 '+Number(lastRun.items_seen||0)+'건 · 신규 '+Number(lastRun.new_items||0)+'건'+(lastRun.error_summary?' · 오류 '+lastRun.error_summary:'')):'아직 자동점검 실행 기록이 없습니다.';
  const recent=$('monitorRecentItems');if(recent){recent.replaceChildren();const rows=Array.isArray(monitorBody?.items)?monitorBody.items.slice(0,8):[];if(!rows.length)recent.append(empty('최근 자동수집 항목이 없습니다.'));else for(const item of rows){const article=document.createElement('article');article.className='item';const title=document.createElement('div');title.className='item-title';title.textContent=item.title||'수집 항목';const meta=document.createElement('div');meta.className='item-meta';meta.textContent=[item.publisher,item.published_at?new Date(item.published_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'',item.review_state].filter(Boolean).join(' · ');article.append(title,meta);recent.append(article)}}
}

const lines=value=>String(value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
async function baseData(){if(state.baseData)return state.baseData;const response=await fetch('/seonammedi/data.json',{cache:'no-store'});state.baseData=response.ok?await response.json():{};return state.baseData}
async function loadStatusPage(){
  if(!state.me?.permissions?.pages)return;
  const [managed,base]=await Promise.all([api('/api/seonammedi/admin/pages/status'),baseData()]);
  const rows=Array.isArray(managed.item?.data?.items)?managed.item.data.items:(base.status||[]);
  const byKey=Object.fromEntries(rows.map((x,i)=>[x.key||['official','news','daily'][i],x]));
  const form=$('statusForm');
  if(!form)return;
  for(const key of ['official','news']){const item=byKey[key]||{};form.elements[key+'Title'].value=item.title||'';form.elements[key+'Text'].value=item.text||''}
  text($('statusPageMessage'),'');
}
$('statusForm')?.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;
  const items=['official','news'].map(key=>({key,title:form.elements[key+'Title'].value.trim(),text:form.elements[key+'Text'].value.trim()}));
  try{text($('statusPageMessage'),'저장 중…');await api('/api/seonammedi/admin/pages/status',{method:'PUT',body:JSON.stringify({data:{items},visible:true})});text($('statusPageMessage'),'사용자 페이지에 반영할 현재상황을 저장했습니다.')}catch(error){text($('statusPageMessage'),error.message)}
});

const ORG_GROUPS=[
  {key:'bidae',label:'비대위',status:'active',statusLabel:''},
  {key:'mokpo',label:'목포대',status:'active',statusLabel:''},
  {key:'minhak',label:'민학비대위',status:'forming',statusLabel:'구성 논의 중 · 2026.09.30 첫 만남'}
];
const ORG_LEGACY_KEYS={bidae:'integrated',minhak:'civic'};
const cleanOrgRoleText=value=>String(value||'').replace(/\s*\([^)]*위원회\s*겸임[^)]*\)/g,'').trim();
const normalizeOrgStatusLabel=(key,value,fallback='')=>{
  const label=String(value??fallback??'').trim();
  return key!=='minhak'&&label==='운영 중'?'':label;
};
function normalizeOrgGroups(org={}){
  if(Array.isArray(org.groups)&&org.groups.length){
    const byKey=new Map(org.groups.map(group=>[group.key,group]));
    return ORG_GROUPS.map(meta=>{const found=byKey.get(meta.key)||byKey.get(ORG_LEGACY_KEYS[meta.key]);return{...(found||{}),key:meta.key,label:meta.label,status:found?.status||meta.status,statusLabel:normalizeOrgStatusLabel(meta.key,found?.statusLabel,meta.statusLabel),levels:found?.levels||[],committees:found?.committees||[],participants:found?.participants||[]}});
  }
  return ORG_GROUPS.map(meta=>meta.key==='bidae'?{key:meta.key,label:meta.label,status:meta.status,statusLabel:meta.statusLabel,levels:org.levels||[],committees:org.committees||[],participants:org.participants||[]}:{key:meta.key,label:meta.label,status:meta.status,statusLabel:meta.statusLabel,levels:[],committees:[],participants:[]});
}
function orgGroupFromForm(form,key,label){
  const level=(name,suffix)=>({name,members:lines(form.elements[key+'_'+suffix].value).map(cleanOrgRoleText).filter(Boolean)});
  const committees=lines(form.elements[key+'_committees'].value).map(row=>{const [name,...rest]=row.split('|');return{name:(name||'').trim(),lead:cleanOrgRoleText(rest.join('|'))}}).filter(x=>x.name);
  const participants=lines(form.elements[key+'_participants'].value).map(row=>{const [name,representative,url]=row.split('|').map(x=>(x||'').trim());return{name,representative,url,visible:true}}).filter(x=>x.name);
  const meta=ORG_GROUPS.find(item=>item.key===key)||{};const statusLabel=normalizeOrgStatusLabel(key,form.elements[key+'_status']?.value,meta.statusLabel||'');
  return{key,label,status:meta.status||'active',statusLabel,levels:[level('대표자회의','representatives'),level('상임공동대표단','standing'),level('집행위원회','executive')],committees,participants,participantSort:'ko-KR',publicOnly:true};
}
function orgDataWithGroup(org,key,nextGroup){
  const groups=normalizeOrgGroups(org).map(group=>group.key===key?nextGroup:group);
  const bidae=groups.find(group=>group.key==='bidae')||groups[0];
  return{...org,groups,levels:bidae.levels,committees:bidae.committees,participants:bidae.participants,participantSort:'ko-KR',publicOnly:true,schemaVersion:2};
}
function fillOrgGroup(form,group){
  const key=group.key,levels=group.levels||[];
  const members=name=>(levels.find(x=>x.name===name)?.members||[]).map(cleanOrgRoleText).filter(Boolean).join('\n');
  if(form.elements[key+'_status'])form.elements[key+'_status'].value=group.statusLabel||ORG_GROUPS.find(item=>item.key===key)?.statusLabel||'';
  form.elements[key+'_representatives'].value=members('대표자회의');
  form.elements[key+'_standing'].value=members('상임공동대표단');
  form.elements[key+'_executive'].value=members('집행위원회');
  form.elements[key+'_committees'].value=(group.committees||[]).map(x=>[x.name,cleanOrgRoleText(x.lead)].filter(Boolean).join(' | ')).join('\n');
  form.elements[key+'_participants'].value=(group.participants||[]).map(x=>[x.name,x.representative,x.url].filter(Boolean).join(' | ')).join('\n');
}
function showOrgAdminTab(key,{route=true,replace=false}={}){
  const allowed=ORG_GROUPS.some(item=>item.key===key)?key:'bidae';
  qsa('[data-org-admin-panel]').forEach(panel=>panel.hidden=panel.dataset.orgAdminPanel!==allowed);
  qsa('[data-org-admin-tab]').forEach(button=>{
    const active=button.dataset.orgAdminTab===allowed;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
  });
  const form=$('organizationForm');if(form)form.elements.orgKey.value=allowed;
  if(route)writeAdminRoute('organization',{org:allowed,replace});
}
qsa('[data-org-admin-tab]').forEach(button=>button.addEventListener('click',()=>showOrgAdminTab(button.dataset.orgAdminTab)));
async function loadOrganization(){
  if(!state.me?.permissions?.pages)return;
  const [managed,base]=await Promise.all([api('/api/seonammedi/admin/pages/organization'),baseData()]);
  const org=managed.item?.data&&Object.keys(managed.item.data).length?managed.item.data:(base.organization||{});
  state.organization=org;
  const form=$('organizationForm');
  normalizeOrgGroups(org).forEach(group=>fillOrgGroup(form,group));
  showOrgAdminTab(form.elements.orgKey.value||'bidae');
  text($('organizationMessage'),'');
}
$('organizationForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,key=form.elements.orgKey.value||'bidae';
  const meta=ORG_GROUPS.find(item=>item.key===key)||ORG_GROUPS[0];
  const save=$('saveOrganization');if(save)save.disabled=true;
  try{
    text($('organizationMessage'),meta.label+' 저장 중…');
    const latest=await api('/api/seonammedi/admin/pages/organization');
    const source=latest.item?.data&&Object.keys(latest.item.data).length?latest.item.data:(state.organization||{});
    const data=orgDataWithGroup(source,key,orgGroupFromForm(form,key,meta.label));
    await api('/api/seonammedi/admin/pages/organization',{method:'PUT',body:JSON.stringify({data,visible:true})});
    state.organization=data;
    normalizeOrgGroups(data).forEach(group=>fillOrgGroup(form,group));
    showOrgAdminTab(key);
    text($('organizationMessage'),meta.label+' 조직 정보를 저장했습니다. 다른 조직 데이터는 유지했습니다.');
  }catch(error){text($('organizationMessage'),error.message)}
  finally{if(save)save.disabled=false}
});

const moneyText=value=>new Intl.NumberFormat('ko-KR').format(Number(value||0))+'원';
function resetFinance(){const form=$('financeForm');form.reset();form.elements.id.value='';form.elements.type.value='income';form.elements.visible.checked=true;text($('financeFormTitle'),'회계내역 추가');text($('financeMessage'),'')}
function editFinance(item){const form=$('financeForm');form.elements.id.value=item.id;form.elements.date.value=item.date||'';form.elements.type.value=item.type||'income';form.elements.amount.value=String(item.amount||0);form.elements.purpose.value=item.purpose||'';form.elements.event.value=item.event||'';form.elements.evidenceStatus.value=item.evidenceStatus||'none';form.elements.note.value=item.note||'';form.elements.visible.checked=Boolean(item.visible);text($('financeFormTitle'),'회계내역 수정');showPanel('finance')}
async function deleteFinance(item){if(!confirm('이 회계내역을 삭제할까요?'))return;try{await api('/api/seonammedi/admin/finance/'+item.id,{method:'DELETE'});await loadFinance();text($('financeMessage'),'삭제했습니다.')}catch(error){text($('financeMessage'),error.message)}}
function renderFinance(){
  const host=$('financeList');host.replaceChildren();let income=0,expense=0;for(const item of state.finance){if(item.visible){if(item.type==='income')income+=item.amount;else expense+=item.amount}}
  text($('financeSummary'),'공개합계 · 수입 '+moneyText(income)+' · 지출 '+moneyText(expense)+' · 잔액 '+moneyText(income-expense));
  if(!state.finance.length){host.append(empty('등록된 회계내역이 없습니다.'));return}
  for(const item of state.finance){const article=document.createElement('article');article.className='item';const head=document.createElement('div');head.className='item-head';const left=document.createElement('div');const title=document.createElement('div');title.className='item-title';title.textContent=(item.type==='income'?'수입 ':'지출 ')+moneyText(item.amount)+' · '+item.purpose;const meta=document.createElement('div');meta.className='item-meta';meta.textContent=[item.date,item.event,item.evidenceStatus].filter(Boolean).join(' · ');left.append(title,meta);const flags=document.createElement('div');flags.append(tag(item.visible?'공개':'비공개',item.visible?'live':''));head.append(left,flags);article.append(head);if(item.note){const p=document.createElement('p');p.className='item-body';p.textContent=item.note;article.append(p)}const actions=document.createElement('div');actions.className='item-actions';actions.append(button('수정',()=>editFinance(item)),button('삭제',()=>deleteFinance(item),'danger'));article.append(actions);host.append(article)}
}
async function loadFinance(){if(!state.me?.permissions?.finance)return;const data=await api('/api/seonammedi/admin/finance');state.finance=data.items||[];renderFinance()}
$('financeForm')?.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,id=form.elements.id.value;const payload={date:form.elements.date.value,type:form.elements.type.value,amount:Number(form.elements.amount.value||0),purpose:form.elements.purpose.value,event:form.elements.event.value,evidenceStatus:form.elements.evidenceStatus.value,note:form.elements.note.value,visible:form.elements.visible.checked};
  try{text($('financeMessage'),'저장 중…');await api(id?'/api/seonammedi/admin/finance/'+id:'/api/seonammedi/admin/finance',{method:id?'PUT':'POST',body:JSON.stringify(payload)});resetFinance();await loadFinance();text($('financeMessage'),'저장했습니다.')}catch(error){text($('financeMessage'),error.message)}
});


const voiceCategoryLabel=value=>({question:'질문',proposal:'정책제안',experience:'의료경험',factcheck:'사실확인 요청',tip:'자료제보',other:'기타'})[value]||value||'기타';
const voiceStatusLabel=value=>({received:'접수됨',reviewing:'검토중',answered:'답변완료',published:'공개',archived:'보관'})[value]||value||'접수됨';
function editVoice(item){
  const form=$('voiceEditForm');if(!form)return;
  form.hidden=false;
  form.elements.id.value=String(item.id||'');
  form.elements.category.value=item.category||'other';
  form.elements.displayName.value=item.displayName||'';
  form.elements.contact.value=item.contact||'';
  form.elements.message.value=item.message||'';
  form.elements.status.value=item.status||'received';
  text($('voiceConsentNote'),item.publicConsent?'작성자가 공개 가능성에 동의했습니다.':'작성자가 공개에 동의하지 않았습니다. 관리자 수정은 가능하지만 공개 상태로 전환할 수 없습니다.');
  form.scrollIntoView({behavior:'smooth',block:'start'});
  form.elements.message.focus();
}
function closeVoiceEditor(){const form=$('voiceEditForm');if(!form)return;form.reset();form.elements.id.value='';form.hidden=true;text($('voiceConsentNote'),'')}
async function updateVoiceStatus(item,status){
  try{text($('voiceMessage'),'처리 중…');await api('/api/seonammedi/admin/voices/'+item.id,{method:'PUT',body:JSON.stringify({status})});text($('voiceMessage'),'처리 상태를 반영했습니다.');await loadVoices()}catch(error){$('voiceMessage')?.classList.add('error');text($('voiceMessage'),error.data?.message||error.message)}
}
async function deleteVoice(item){
  if(!confirm('이 시민 의견을 삭제할까요? 삭제 후에는 관리자 목록에서도 사라집니다.'))return;
  try{await api('/api/seonammedi/admin/voices/'+item.id,{method:'DELETE'});text($('voiceMessage'),'삭제했습니다.');await loadVoices()}catch(error){$('voiceMessage')?.classList.add('error');text($('voiceMessage'),error.message)}
}
function renderVoices(){
  const host=$('voiceList');host.replaceChildren();const filter=$('voiceStatusFilter')?.value||'all';const rows=filter==='all'?state.voices:state.voices.filter(item=>item.status===filter);if(!rows.length){host.append(empty('해당 조건의 시민 의견이 없습니다.'));return}
  for(const item of rows){
    const article=document.createElement('article');article.className='item voice-item';
    const head=document.createElement('div');head.className='item-head';const left=document.createElement('div');const title=document.createElement('div');title.className='item-title';title.textContent=(item.displayName||'익명')+' · '+voiceCategoryLabel(item.category);const meta=document.createElement('div');meta.className='item-meta';meta.textContent=dateText(item.createdAt);left.append(title,meta);const flags=document.createElement('div');flags.append(tag(voiceStatusLabel(item.status),item.status==='published'?'live':''),tag(item.publicConsent?'공개동의':'비공개요청'));head.append(left,flags);article.append(head);
    const body=document.createElement('p');body.className='item-body';body.textContent=item.message||'';article.append(body);
    const privateBox=document.createElement('div');privateBox.className='voice-private';privateBox.textContent='관리자 전용 연락처: '+(item.contact||'미입력');article.append(privateBox);
    const actions=document.createElement('div');actions.className='item-actions';const select=document.createElement('select');for(const [value,label] of [['received','접수됨'],['reviewing','검토중'],['answered','답변완료'],['published','공개'],['archived','보관']]){const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=item.status===value;if(value==='published'&&!item.publicConsent)option.disabled=true;select.append(option)}select.addEventListener('change',()=>updateVoiceStatus(item,select.value));actions.append(select,button('수정',()=>editVoice(item)),button('삭제',()=>deleteVoice(item),'danger'));article.append(actions);host.append(article);
  }
}
async function loadVoices(){if(!state.me?.permissions?.voices)return;const data=await api('/api/seonammedi/admin/voices');state.voices=data.items||[];renderVoices();updateDashboard()}
$('voiceEditForm')?.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,id=Number(form.elements.id.value||0);if(!id)return;
  const payload={category:form.elements.category.value,displayName:form.elements.displayName.value,contact:form.elements.contact.value,message:form.elements.message.value,status:form.elements.status.value};
  const msg=$('voiceMessage');msg?.classList.remove('error');text(msg,'수정 저장 중…');
  try{
    await api('/api/seonammedi/admin/voices/'+id,{method:'PUT',body:JSON.stringify(payload)});
    closeVoiceEditor();await loadVoices();text(msg,'시민의견을 수정했습니다.');
  }catch(error){msg?.classList.add('error');text(msg,error.data?.message||error.message)}
});
$('voiceEditCancel')?.addEventListener('click',closeVoiceEditor);


function resetTimeline(){
  const form=$('timelineForm');form.reset();form.elements.id.value='';form.elements.status.value='published';form.elements.sortOrder.value=String(state.timeline.length);text($('timelineFormTitle'),'활동이력 추가');text($('timelineMessage'),'');
}
function editTimeline(item){
  const form=$('timelineForm');form.elements.id.value=item.id;form.elements.date.value=item.date||'';form.elements.category.value=item.category||'';form.elements.title.value=item.title||'';form.elements.summary.value=item.summary||'';form.elements.evidence.value=item.evidence||'';form.elements.sortOrder.value=String(item.sortOrder??0);form.elements.status.value=item.status||'draft';text($('timelineFormTitle'),'활동이력 수정');showPanel('status');selectRecordsAdminTab('timeline');form.elements.title.focus();
}
async function deleteTimeline(item){
  if(!confirm('이 활동이력을 삭제할까요?'))return;
  try{await api('/api/seonammedi/admin/timeline/'+item.id,{method:'DELETE'});await loadTimeline();text($('timelineMessage'),'삭제했습니다.')}catch(error){text($('timelineMessage'),error.message);$('timelineMessage').classList.add('error')}
}
function renderTimeline(){
  const host=$('timelineAdminList');host.replaceChildren();if(!state.timeline.length){host.append(empty('등록된 활동이력이 없습니다.'));return}
  for(const item of state.timeline){
    const article=document.createElement('article');article.className='item';
    const head=document.createElement('div');head.className='item-head';
    const left=document.createElement('div');const titleNode=document.createElement('div');titleNode.className='item-title';titleNode.textContent=item.title||'제목 없음';
    const meta=document.createElement('div');meta.className='item-meta';meta.textContent=[item.date,item.category,item.evidence].filter(Boolean).join(' · ');left.append(titleNode,meta);
    const flags=document.createElement('div');flags.append(tag(item.status==='published'?'공개':'비공개',item.status==='published'?'live':''));head.append(left,flags);article.append(head);
    if(item.summary){const p=document.createElement('p');p.className='item-body';p.textContent=item.summary.length>500?item.summary.slice(0,500)+'…':item.summary;article.append(p)}
    const actions=document.createElement('div');actions.className='item-actions';actions.append(button('수정',()=>editTimeline(item)),button(item.status==='published'?'비공개로':'공개로',async()=>{try{await api('/api/seonammedi/admin/timeline/'+item.id,{method:'PUT',body:JSON.stringify({status:item.status==='published'?'draft':'published'})});await loadTimeline()}catch(error){text($('timelineMessage'),error.message)}}),button('삭제',()=>deleteTimeline(item),'danger'));article.append(actions);host.append(article);
  }
}
async function loadTimeline(){if(!state.me?.permissions?.timeline)return;const data=await api('/api/seonammedi/admin/timeline');state.timeline=data.items||[];renderTimeline();updateDashboard()}

function renderContent(){
  const host=$('contentList');host.replaceChildren();if(!state.content.length){host.append(empty('최근 웹검색 수집 후보가 없습니다.'));return}
  for(const item of state.content){
    const article=document.createElement('article');article.className='item';
    const head=document.createElement('div');head.className='item-head';
    const left=document.createElement('div');const a=document.createElement('a');a.className='item-title';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.title||'제목 없음';
    const meta=document.createElement('div');meta.className='item-meta';meta.textContent=[item.publisher,dateText(item.publishedAt),item.queryLabel].filter(Boolean).join(' · ');left.append(a,meta);
    const controls=document.createElement('div');controls.className='content-review-controls';
    const select=document.createElement('select');select.setAttribute('aria-label','분류');for(const [value,label] of [['official','공식기록'],['news','관련보도']]){const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=item.category===value;select.append(option)}
    const checkLabel=document.createElement('label');checkLabel.className='check';const check=document.createElement('input');check.type='checkbox';check.checked=item.reviewState==='published';checkLabel.append(check,document.createTextNode(' 게시'));
    const save=button('적용',async()=>{try{text($('contentMessage'),'저장 중…');await api('/api/seonammedi/admin/content/'+item.id,{method:'PUT',body:JSON.stringify({state:check.checked?'published':'rejected',category:select.value})});text($('contentMessage'),'게시 상태를 반영했습니다.');await loadContent()}catch(error){text($('contentMessage'),error.message)}},'primary');
    controls.append(select,checkLabel,save);head.append(left,controls);article.append(head);host.append(article);
  }
}
async function loadContent(){if(!state.me?.permissions?.content)return;const data=await api('/api/seonammedi/admin/content');state.content=data.items||[];renderContent();updateDashboard()}

function resetNotice(){
  const form=$('noticeForm');form.reset();form.elements.id.value='';form.elements.status.value='published';text($('noticeFormTitle'),'공지 작성');text($('noticeMessage'),'');
}
function editNotice(item){
  const form=$('noticeForm');form.elements.id.value=item.id;form.elements.title.value=item.title||'';form.elements.body.value=item.body||'';form.elements.status.value=item.status||'draft';form.elements.pinned.checked=Boolean(item.pinned);form.elements.kind.value=item.kind||'notice';form.elements.featured.checked=Boolean(item.featured);form.elements.eventStart.value=item.eventStart?String(item.eventStart).slice(0,16):'';form.elements.eventEnd.value=item.eventEnd?String(item.eventEnd).slice(0,16):'';text($('noticeFormTitle'),'공지 수정');showPanel('notices');form.elements.title.focus();
}
async function deleteNotice(item){
  if(!confirm('이 공지를 삭제할까요?'))return;
  try{await api('/api/seonammedi/admin/notices/'+item.id,{method:'DELETE'});await loadNotices();text($('noticeMessage'),'삭제했습니다.')}catch(error){text($('noticeMessage'),error.message);$('noticeMessage').classList.add('error')}
}
function renderNotices(){
  const host=$('noticeList');host.replaceChildren();if(!state.notices.length){host.append(empty('등록된 공지가 없습니다.'));return}
  for(const item of state.notices){
    const article=document.createElement('article');article.className='item';
    const head=document.createElement('div');head.className='item-head';
    const left=document.createElement('div');const titleNode=document.createElement('div');titleNode.className='item-title';titleNode.textContent=item.title;
    const meta=document.createElement('div');meta.className='item-meta';meta.textContent=dateText(item.publishedAt||item.updatedAt);left.append(titleNode,meta);
    const flags=document.createElement('div');flags.append(tag(item.status==='published'?'공개':'초안',item.status==='published'?'live':''));if(item.pinned)flags.append(tag('상단고정'));if(item.featured)flags.append(tag('첫화면','live'));if(item.kind==='event')flags.append(tag('행사'));
    head.append(left,flags);article.append(head);
    if(item.body){const body=document.createElement('p');body.className='item-body';body.textContent=item.body.length>500?item.body.slice(0,500)+'…':item.body;article.append(body)}
    const actions=document.createElement('div');actions.className='item-actions';actions.append(button('수정',()=>editNotice(item)),button('삭제',()=>deleteNotice(item),'danger'));article.append(actions);host.append(article);
  }
}
async function loadNotices(){if(!state.me?.permissions?.notices)return;const data=await api('/api/seonammedi/admin/notices');state.notices=data.items||[];renderNotices();updateDashboard()}

function resetChannel(){
  const form=$('channelForm');form.reset();form.elements.id.value='';form.elements.platform.value='youtube';form.elements.category.value='official';form.elements.sortOrder.value='0';form.elements.visible.checked=true;text($('channelFormTitle'),'채널 추가');text($('channelMessage'),'');
}
function editChannel(item){
  const form=$('channelForm');form.elements.id.value=item.id;form.elements.platform.value=item.platform||'other';form.elements.name.value=item.name||'';form.elements.url.value=item.url||'';form.elements.previewUrl.value=item.previewUrl||'';form.elements.category.value=item.category||'other';form.elements.sortOrder.value=String(item.sortOrder||0);form.elements.official.checked=Boolean(item.official);form.elements.visible.checked=Boolean(item.visible);form.elements.note.value=item.note||'';text($('channelFormTitle'),'채널 수정');showPanel('channels');form.elements.name.focus();
}
async function deleteChannel(item){
  if(!confirm('이 채널 연결을 삭제할까요?'))return;
  try{await api('/api/seonammedi/admin/channels/'+item.id,{method:'DELETE'});await loadChannels();text($('channelMessage'),'삭제했습니다.')}catch(error){text($('channelMessage'),error.message);$('channelMessage').classList.add('error')}
}
async function toggleChannelVisibility(item){
  const next=!Boolean(item.visible),msg=$('channelMessage');msg.classList.remove('error');text(msg,next?'사이트 표시를 켜는 중…':'사이트 표시를 끄는 중…');
  try{await api('/api/seonammedi/admin/channels/'+item.id,{method:'PUT',body:JSON.stringify({visible:next})});text(msg,next?'사이트 표시를 켰습니다.':'사이트 표시를 껐습니다.');await loadChannels()}catch(error){msg.classList.add('error');text(msg,error.message)}
}
function platformLabel(value){return({youtube:'YouTube',instagram:'Instagram',facebook:'Facebook',tiktok:'TikTok',blog:'블로그',website:'웹사이트',other:'기타'})[value]||value}
function categoryLabel(value){return({official:'공식채널','related-org':'관련기관',media:'언론·자료',civic:'시민·단체',other:'기타'})[value]||value}
function renderChannels(){
  const host=$('channelList');host.replaceChildren();if(!state.channels.length){host.append(empty('등록된 채널이 없습니다.'));return}
  for(const item of state.channels){
    const article=document.createElement('article');article.className='item';const head=document.createElement('div');head.className='item-head';
    const left=document.createElement('div');const a=document.createElement('a');a.className='item-title';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.name;
    const meta=document.createElement('div');meta.className='item-meta';meta.textContent=platformLabel(item.platform)+' · '+categoryLabel(item.category);left.append(a,meta);
    const flags=document.createElement('div');if(item.official)flags.append(tag('공식','official'));flags.append(tag(item.visible?'표시':'숨김',item.visible?'live':''));head.append(left,flags);article.append(head);
    if(item.note){const p=document.createElement('p');p.className='item-body';p.textContent=item.note;article.append(p)}
    const actions=document.createElement('div');actions.className='item-actions';actions.append(button(item.visible?'사이트 숨기기':'사이트 표시',()=>toggleChannelVisibility(item)),button('수정',()=>editChannel(item)),button('삭제',()=>deleteChannel(item),'danger'));article.append(actions);host.append(article);
  }
}
async function loadChannels(){if(!state.me?.permissions?.channels)return;const data=await api('/api/seonammedi/admin/channels');state.channels=data.items||[];renderChannels();updateDashboard()}

$('timelineForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,id=form.elements.id.value;const payload={date:form.elements.date.value,category:form.elements.category.value,title:form.elements.title.value,summary:form.elements.summary.value,evidence:form.elements.evidence.value,sortOrder:Number(form.elements.sortOrder.value||0),status:form.elements.status.value};
  const msg=$('timelineMessage');msg.classList.remove('error');text(msg,'저장 중…');
  try{await api(id?'/api/seonammedi/admin/timeline/'+id:'/api/seonammedi/admin/timeline',{method:id?'PUT':'POST',body:JSON.stringify(payload)});text(msg,'저장했습니다.');resetTimeline();await loadTimeline()}catch(error){msg.classList.add('error');text(msg,error.message)}
});
$('noticeForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,id=form.elements.id.value;const payload=new FormData();payload.set('title',form.elements.title.value);payload.set('body',form.elements.body.value);payload.set('status',form.elements.status.value);payload.set('pinned',String(form.elements.pinned.checked));payload.set('kind',form.elements.kind.value);payload.set('featured',String(form.elements.featured.checked));payload.set('eventStart',form.elements.eventStart.value);payload.set('eventEnd',form.elements.eventEnd.value);if(form.elements.image.files?.[0])payload.set('image',form.elements.image.files[0]);
  const msg=$('noticeMessage');msg.classList.remove('error');text(msg,'저장 중…');
  try{await api(id?'/api/seonammedi/admin/notices/'+id:'/api/seonammedi/admin/notices',{method:id?'PUT':'POST',body:payload});text(msg,'저장했습니다.');resetNotice();await loadNotices()}catch(error){msg.classList.add('error');text(msg,error.message)}
});
$('channelForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,id=form.elements.id.value;const payload={platform:form.elements.platform.value,name:form.elements.name.value,url:form.elements.url.value,previewUrl:form.elements.previewUrl.value,category:form.elements.category.value,sortOrder:Number(form.elements.sortOrder.value||0),official:form.elements.official.checked,visible:form.elements.visible.checked,note:form.elements.note.value};
  const msg=$('channelMessage');msg.classList.remove('error');text(msg,'저장 중…');
  try{await api(id?'/api/seonammedi/admin/channels/'+id:'/api/seonammedi/admin/channels',{method:id?'PUT':'POST',body:JSON.stringify(payload)});text(msg,'저장했습니다.');resetChannel();await loadChannels()}catch(error){msg.classList.add('error');text(msg,error.message)}
});
$('reloadTimeline').addEventListener('click',()=>loadTimeline().catch(()=>{}));$('reloadVoices').addEventListener('click',()=>loadVoices().catch(()=>{}));$('voiceStatusFilter').addEventListener('change',renderVoices);$('reloadStatusPage')?.addEventListener('click',()=>loadStatusPage().catch(()=>{}));$('reloadOrganization')?.addEventListener('click',()=>loadOrganization().catch(()=>{}));$('reloadFinance')?.addEventListener('click',()=>loadFinance().catch(()=>{}));$('financeReset')?.addEventListener('click',resetFinance);$('timelineReset').addEventListener('click',resetTimeline);$('reloadContent').addEventListener('click',()=>loadContent().catch(()=>{}));$('noticeReset').addEventListener('click',resetNotice);$('channelReset').addEventListener('click',resetChannel);$('reloadNotices').addEventListener('click',()=>loadNotices().catch(()=>{}));$('reloadChannels').addEventListener('click',()=>loadChannels().catch(()=>{}));
$('reloadSiteHealth')?.addEventListener('click',()=>loadSiteHealth().catch(()=>{}));
$('runSiteHealth')?.addEventListener('click',async()=>{
  const button=$('runSiteHealth');if(!button)return;
  const original=button.textContent;button.disabled=true;button.textContent='실행 중…';
  try{
    const data=await api('/api/seonammedi/admin/monitor/run',{method:'POST'});
    const result=data?.result||{};
    text($('monitorRunSummary'),'수동 실행 완료 · 출처 '+Number(result.checked||0)+'개 · 확인 '+Number(result.seen||0)+'건 · 신규 '+Number(result.added||0)+'건');
    await loadSiteHealth();
  }catch(error){
    const summary=$('monitorRunSummary');if(summary)summary.textContent='자동점검 실행 실패 · '+error.message;
  }finally{button.disabled=false;button.textContent=original}
});
$('refreshAll').addEventListener('click',()=>init(true));$('changeAccount').addEventListener('click',()=>{sessionStorage.removeItem(PLATFORM_TOKEN_KEY);clearSession();try{localStorage.removeItem(CENTRAL_SESSION_KEY)}catch{}location.assign(authUrl())});

async function init(refresh=false){
  try{
    state.me=await api('/api/seonammedi/admin/me');if(location.hash.includes('ekodi_token='))history.replaceState(null,'',location.pathname+location.search);updateDashboard();
    await Promise.all([loadSiteHealth(),state.me.permissions?.pages?loadStatusPage():Promise.resolve(),state.me.permissions?.pages?loadOrganization():Promise.resolve(),state.me.permissions?.timeline?loadTimeline():Promise.resolve(),state.me.permissions?.voices?loadVoices():Promise.resolve(),state.me.permissions?.content?loadContent():Promise.resolve(),state.me.permissions?.notices?loadNotices():Promise.resolve(),state.me.permissions?.channels?loadChannels():Promise.resolve(),state.me.permissions?.finance?loadFinance():Promise.resolve()]);
    restoreAdminRoute({replace:true});
    if(refresh)text($('scopeSummary'),state.me.platform?'최고관리자 권한으로 최신 상태를 확인했습니다.':'게시판 관리자 권한으로 최신 상태를 확인했습니다.');
  }catch(error){
    if(error.status===403){const main=$('main');main.replaceChildren();const box=document.createElement('section');box.className='card placeholder';const h=document.createElement('strong');h.textContent='관리 권한이 없습니다';const p=document.createElement('p');p.textContent='이 Google 계정에는 서남권 국립의대 소통센터 관리 권한이 등록되어 있지 않습니다.';const a=document.createElement('a');a.href=authUrl();a.textContent='다른 Google 계정으로 로그인';box.append(h,p,a);main.append(box);return}
    text($('adminIdentity'),'연결 오류');
    text($('scopeSummary'),'관리자 정보를 불러오지 못했습니다. 새로고침하거나 계정을 다시 연결해 주세요.');
    const voiceMessage=$('voiceMessage');if(voiceMessage){voiceMessage.classList.add('error');text(voiceMessage,error.data?.message||error.message||'관리자 정보를 불러오지 못했습니다. 다시 로그인해 주세요.')}
    console.error(error);
  }
}
init();
})();