import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { applyPreferenceAction, buildPersonalizedServiceView, normalizePreference, normalizeSignal } from './progressive-personalization.js';

const cfg=window.EKODI_MY_CONFIG||{};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const MODES={writer:'Writer',video:'Video',podcast:'Podcast',lecture:'Educator',research:'Research',visual:'Visual',mission:'Mission',ai:'AI Creator'};
const SERVICES=[
 ['church','에코디교회','https://church.ekodi.kr'],['biz','에코디비즈','https://biz.ekodi.kr'],['books','출판','https://books.ekodi.kr'],['author','Creator AI','https://author.ekodi.kr'],['lab','에코디연구소','https://lab.ekodi.kr'],['community','커뮤니티','https://community.ekodi.kr'],['work','EKODI Work','https://work.ekodi.kr'],['social','EKODI Social','https://social.ekodi.kr'],['energy','Energy AI','https://energy.ekodi.kr'],['business','Business OS','https://business.ekodi.kr'],['mall','에코디몰','https://ekodi.kr/ekodibiz/mall'],['marketing','Marketing AI','https://marketing.ekodi.kr']
];
const OPEN_SSO_SITES=new Set(['social','energy']);
const SSO_SITES=new Set(['church','biz','books','author','lab','community','work','business','mall','marketing','social','energy']);
const TARGETABLE_WORKSPACE_SITES=new Set(['church','biz','books','lab','mall','marketing','social','energy']);
const WORKSPACE_ENTRY_PRIORITY=['biz','marketing','mall','church','books','lab','business','community','work','author','social','energy'];
const authUrl=cfg.authUrl||'https://auth.ekodi.kr/?site=my';
const enabled=Boolean(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey);
const PROFILE_API=enabled?`${cfg.supabaseUrl}/functions/v1/profile-api`:'';
const sb=enabled?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true}}):null;
let session=null,items=[],access=new Map(),workspaces=new Map(),filter='all',activeWorkspaceKey='',profile=null,linkedIdentities=[],profileError='';
let personalizationPreferences=new Map(),personalizationSignals=[],ephemeralSignals=[],discoveryOpen=false;
window.EKODI_MY_AUTH={getAccessToken:()=>session?.access_token||''};
window.EKODI_MY_AUTH=Object.freeze({getAccessToken:()=>String(session?.access_token||''),isSignedIn:()=>Boolean(session?.access_token)});

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const mode=v=>MODES[v]?v:'writer';
const plan=v=>({free:'Free',basic:'Basic',pro:'Pro',enterprise:'Business',standard:'Standard'})[String(v||'free').toLowerCase()]||String(v||'Free');
const paid=v=>['standard','basic','pro','enterprise'].includes(String(v||'').toLowerCase());
const storedWorkspace=()=>{try{return localStorage.getItem('ekodi_my_active_workspace')||''}catch{return''}};
const rememberWorkspace=value=>{try{if(value)localStorage.setItem('ekodi_my_active_workspace',value);else localStorage.removeItem('ekodi_my_active_workspace')}catch{}};
const serviceDefinition=id=>SERVICES.find(([sid])=>sid===id)||null;
function requestedReturnTarget(){
 const raw=new URLSearchParams(location.search).get('return_to');
 if(!raw)return null;
 try{
  const target=new URL(raw);
  const service=SERVICES.find(([, ,url])=>new URL(url).origin===target.origin);
  return service?{id:service[0],url:target.href}:null;
 }catch{return null}
}
function discardUnsafeReturnTarget(){
 const params=new URLSearchParams(location.search);
 if(!params.has('return_to')||requestedReturnTarget())return;
 params.delete('return_to');
 const query=params.toString();
 history.replaceState({},document.title,`${location.pathname}${query?`?${query}`:''}${location.hash}`);
}
discardUnsafeReturnTarget();

async function handoff(){
 if(!sb||!location.hash.startsWith('#'))return;
 const p=new URLSearchParams(location.hash.slice(1)),token=p.get('ekodi_token');
 if(!token)return;
 const {error}=await sb.auth.verifyOtp({token_hash:token,type:p.get('ekodi_type')||'email'});
 history.replaceState({},document.title,`${location.pathname}${location.search}`);
 if(error)throw error;
}
function authUi(){
 const label=session?'로그아웃':'Google로 시작';
 for(const b of [$('#authButton'),$('#accountAuthButton')])if(b){b.disabled=!enabled;b.textContent=enabled?label:'격리 스테이징'}
}
function uniqueWorkspaces(){
 const map=new Map();
 for(const [sid,rows] of workspaces)for(const row of rows||[]){
  const key=row.workspace_key||`${sid}:${row.workspace_name||'workspace'}`;
  const found=map.get(key)||{...row,services:[],targets:[]};
  if(!found.services.includes(sid))found.services.push(sid);
  if(!found.targets.some(target=>target.site===sid))found.targets.push({site:sid,status:row.status||'',source:row.source||'',requires_handoff:row.requires_handoff===true});
  if(paid(row.plan)&&!paid(found.plan))found.plan=row.plan;
  map.set(key,found);
 }
 return [...map.values()];
}
function ensureActiveWorkspace(){
 const rows=uniqueWorkspaces();
 if(!rows.length){activeWorkspaceKey='';rememberWorkspace('');return null}
 const preferred=activeWorkspaceKey||storedWorkspace();
 const selected=rows.find(w=>w.workspace_key===preferred)||rows.find(w=>w.workspace_kind==='personal')||rows[0];
 activeWorkspaceKey=selected.workspace_key;rememberWorkspace(activeWorkspaceKey);return selected;
}
function activeWorkspace(){return uniqueWorkspaces().find(w=>w.workspace_key===activeWorkspaceKey)||ensureActiveWorkspace()}
function connected(id){
 const a=access.get(id)||{},rows=workspaces.get(id)||[];
 return ['active','pre_registered'].includes(a.status)||rows.some(r=>r.source==='synthetic'||r.status==='active');
}
const PERSONALIZATION_STORAGE_PREFIX='ekodi_my_personalization_v1';
const personalizationStorageKey=()=>session?.user?.id?`${PERSONALIZATION_STORAGE_PREFIX}:${session.user.id}`:'';
const serviceObjects=()=>SERVICES.map(([id,name,url],index)=>({id,name,url,order:index}));
const knownService=id=>SERVICES.some(([serviceId])=>serviceId===id);
function readLocalPreferences(){
 const key=personalizationStorageKey();if(!key)return new Map();
 try{const rows=JSON.parse(localStorage.getItem(key)||'[]');return new Map((Array.isArray(rows)?rows:[]).map(row=>{const pref=normalizePreference(row);return[pref.service_id,pref]}).filter(([id])=>knownService(id)))}catch{return new Map()}
}
function writeLocalPreferences(){
 const key=personalizationStorageKey();if(!key)return;
 try{localStorage.setItem(key,JSON.stringify([...personalizationPreferences.values()]))}catch{}
}
function personalizationView(){
 const current=activeWorkspace();
 return buildPersonalizedServiceView({services:serviceObjects(),connectedIds:SERVICES.filter(([id])=>connected(id)).map(([id])=>id),workspaceIds:current?.services||[],preferences:[...personalizationPreferences.values()],signals:[...personalizationSignals,...ephemeralSignals]});
}
function serviceRoute(id,url){
 const open=OPEN_SSO_SITES.has(id);
 if(!session||!SSO_SITES.has(id)||(!connected(id)&&!open))return url;
 const target=new URL('https://auth.ekodi.kr/');
 target.searchParams.set('site',id);target.searchParams.set('return_to',url);
 const current=activeWorkspace();
 if(current&&TARGETABLE_WORKSPACE_SITES.has(id)&&(current.services?.includes(id)||open))target.searchParams.set('workspace',current.workspace_key);
 return target.href;
}
function workspaceDestination(workspace){
 if(!workspace)return null;
 const contextual=requestedReturnTarget();
 if(contextual&&(workspace.services?.includes(contextual.id)||OPEN_SSO_SITES.has(contextual.id)))return contextual;
 const exactSites=(workspace.targets||[]).filter(target=>target.requires_handoff&&TARGETABLE_WORKSPACE_SITES.has(target.site)&&['active','pre_registered'].includes(String(target.status||''))).map(target=>target.site);
 const exactId=WORKSPACE_ENTRY_PRIORITY.find(id=>exactSites.includes(id));
 if(exactId){const service=serviceDefinition(exactId);return service?{id:service[0],url:service[2]}:null}
 if(workspace.workspace_kind==='personal')return null;
 const fallbackId=WORKSPACE_ENTRY_PRIORITY.find(id=>workspace.services?.includes(id)&&connected(id))||workspace.services?.find(id=>connected(id));
 const fallback=serviceDefinition(fallbackId);
 return fallback?{id:fallback[0],url:fallback[2]}:null;
}
function setActiveWorkspace(key){
 const selected=uniqueWorkspaces().find(w=>w.workspace_key===key);
 if(!selected)return null;
 activeWorkspaceKey=key;rememberWorkspace(key);identityUi();workspaceUi();platformUi();return selected;
}
function enterWorkspace(key){
 const selected=setActiveWorkspace(key);
 if(!selected)return;
 const destination=workspaceDestination(selected);
 if(destination)location.assign(serviceRoute(destination.id,destination.url));
}
function identityUi(){
 const email=session?.user?.email||'',meta=session?.user?.user_metadata||{},current=activeWorkspace();
 $('#identityName').textContent=session?(profile?.display_name||meta.full_name||meta.name||email.split('@')[0]||'EKODI Member'):'로그인 전';
 $('#identityEmail').textContent=session?'EKODI 통합 로그인 연결됨':'Google 인증 후 연결됩니다.';
 $('#workspaceKey').textContent=current?.workspace_key||(session?'workspace: connected':'workspace:…');
 $('#workspaceSummary').textContent=current?`${current.workspace_name||'내 Workspace'} · ${plan(current.plan)} · ${current.role||'member'}`:'로그인하면 마지막으로 사용한 공간을 기억하고 다른 공간으로 즉시 전환할 수 있습니다.';
 const paidCount=[...access.values()].filter(a=>paid(a.plan)).length;
 $('#accountPlan').textContent=session?(paidCount?`${paidCount} Paid Plan${paidCount>1?'s':''}`:'Free Member'):'Guest';
 $('#accountLoginText').textContent=email?`${email}로 EKODI 통합 로그인에 연결되어 있습니다. 다른 서비스에서는 이 로그인 상태를 재사용합니다.`:'로그인 전입니다.';
}
function profileUi(){
 const input=$('#displayName'),save=$('#saveProfile'),status=$('#profileStatus'),host=$('#linkedIdentityList');
 if(!input||!save||!status||!host)return;
 if(!enabled){input.disabled=true;save.disabled=true;status.textContent='격리 스테이징에서는 실제 개인 데이터를 읽지 않습니다.';host.innerHTML='<span class="identity-row muted-row">개인 데이터 연결이 비활성화되어 있습니다.</span>';return}
 if(!session){input.value='';input.disabled=true;save.disabled=true;status.className='profile-status';status.textContent='로그인하면 내 기본정보를 확인하고 수정할 수 있습니다.';host.innerHTML='<span class="identity-row muted-row">로그인 후 연결 계정을 확인합니다.</span>';return}
 if(profileError){input.value='';input.disabled=true;save.disabled=true;status.className='profile-status error';status.textContent=profileError;host.innerHTML='<span class="identity-row muted-row">연결 계정을 불러오지 못했습니다.</span>';return}
 input.disabled=false;save.disabled=false;input.value=profile?.display_name||'';status.className='profile-status';status.textContent='이 이름은 개인 정체성에 사용되며 사업장·단체 이름과 분리됩니다.';
 host.innerHTML=linkedIdentities.length?linkedIdentities.map(identity=>`<span class="identity-row"><span>${esc(identity.email||'Google 계정')}</span>${identity.is_primary?'<b>기본 계정</b>':'<b>연결 계정</b>'}</span>`).join(''):'<span class="identity-row muted-row">연결된 Google 계정이 없습니다.</span>';
}
function summaryUi(){
 const connectedCount=session?SERVICES.filter(([id])=>connected(id)).length:0;
 $('#serviceCount').textContent=String(connectedCount);
 $('#paidCount').textContent=String(SERVICES.filter(([id])=>paid(access.get(id)?.plan)||(workspaces.get(id)||[]).some(w=>paid(w.plan))).length);
 $('#workspaceCount').textContent=String(uniqueWorkspaces().length);
 $('#creatorCount').textContent=String(items.length);
}
function workspaceUi(){
 const host=$('#workspaceList');
 if(!enabled){host.innerHTML='<div class="empty"><strong>격리 스테이징에서는 실제 Workspace를 읽지 않습니다.</strong></div>';return}
 if(!session){host.innerHTML='<div class="empty"><strong>Google 인증 후 Workspace를 확인할 수 있습니다.</strong></div>';return}
 const rows=uniqueWorkspaces();ensureActiveWorkspace();
 if(!rows.length){host.innerHTML='<div class="empty"><strong>아직 연결된 Workspace가 없습니다.</strong><p>개인 서비스를 시작하거나 기관 초대를 받으면 여기에 나타납니다.</p></div>';return}
 host.innerHTML=rows.map(w=>{const destination=workspaceDestination(w),action=destination?'열기 →':w.workspace_kind==='personal'?'현재 My 공간':'선택';return `<button class="workspace-card workspace-button${w.workspace_key===activeWorkspaceKey?' selected':''}" type="button" data-workspace-key="${esc(w.workspace_key)}"><span class="workspace-icon">${w.workspace_kind==='business'?'사':w.workspace_kind==='organization'?'기':'개'}</span><span class="workspace-body"><small>${esc(w.workspace_kind||'personal')}</small><h3>${esc(w.workspace_name||'내 Workspace')}</h3><p>${esc((w.services||[]).join(' · '))}</p><span class="meta"><span>${esc(plan(w.plan))}</span><span>${esc(w.role||'member')}</span>${w.workspace_key===activeWorkspaceKey?'<span>현재 공간</span>':''}<span>${esc(action)}</span></span></span></button>`}).join('');
 host.querySelectorAll('[data-workspace-key]').forEach(button=>button.addEventListener('click',()=>enterWorkspace(button.dataset.workspaceKey||'')));
}
async function loadPersonalization(){
 personalizationPreferences=readLocalPreferences();personalizationSignals=[];ephemeralSignals=[];
 if(!sb||!session)return;
 const [prefResult,signalResult]=await Promise.all([
  sb.from('my_personalization_preferences').select('service_id,state,interest_score,last_engaged_at,dismissed_until,activated_at,updated_at'),
  sb.from('my_personalization_signals').select('service_id,source,signal_type,weight,created_at,expires_at').order('created_at',{ascending:false}).limit(100)
 ]);
 if(!prefResult.error){personalizationPreferences=new Map((prefResult.data||[]).map(row=>{const pref=normalizePreference(row);return[pref.service_id,pref]}));writeLocalPreferences()}else console.warn('personalization preferences fallback',prefResult.error);
 if(!signalResult.error)personalizationSignals=(signalResult.data||[]).map(normalizeSignal).filter(Boolean);else console.warn('personalization signals unavailable',signalResult.error);
}
async function personalize(serviceId,action){
 if(!session||!knownService(serviceId))return;
 const current=personalizationPreferences.get(serviceId)||{service_id:serviceId};
 const optimistic=applyPreferenceAction(current,action);
 personalizationPreferences.set(serviceId,optimistic);writeLocalPreferences();platformUi();
 window.dispatchEvent(new CustomEvent('ekodi:personalization-updated',{detail:{serviceId,action,view:personalizationView()}}));
 if(!sb)return;
 const {data,error}=await sb.rpc('set_my_personalization_preference',{p_service_id:serviceId,p_action:action});
 if(error){console.warn('personalization preference fallback',error);return}
 const row=Array.isArray(data)?data[0]:data;if(row){const saved=normalizePreference(row);personalizationPreferences.set(saved.service_id,saved);writeLocalPreferences();platformUi()}
}
function progressiveSurfaceUi(){
 const selected=new Set([...personalizationPreferences.values()].filter(pref=>['active','pinned'].includes(pref.state)).map(pref=>pref.service_id));
 document.querySelectorAll('[data-progressive-services]').forEach(section=>{
  const ids=String(section.dataset.progressiveServices||'').split(',').map(value=>value.trim()).filter(Boolean);
  const direct=location.hash===`#${section.id}`;
  const hasContent=section.id==='creator'&&items.length>0;
  section.hidden=!(direct||hasContent||ids.some(id=>selected.has(id)));
 });
}
function serviceCard(item,{recommended=false,discovery=false}={}){
 const {id,name,url}=item,a=access.get(id)||{},rows=workspaces.get(id)||[],on=connected(id),open=OPEN_SSO_SITES.has(id),ready=on||open,current=activeWorkspace();
 const best=rows.find(w=>w.workspace_key===current?.workspace_key)||rows.find(w=>paid(w.plan))||rows[0],p=best?.plan||a.plan||'free',route=serviceRoute(id,url);
 const inCurrent=Boolean(current?.services?.includes(id))||open;
 const description=recommended?'최근 관심과 현재 맥락을 바탕으로 제안합니다. 추가하기 전에는 홈에 고정하지 않습니다.':open?'현재 Workspace를 유지한 채 바로 열 수 있는 공용 서비스입니다.':on?(inCurrent?'현재 Workspace와 연결된 서비스입니다.':'통합 로그인으로 연결된 서비스입니다.'):'필요할 때 자유롭게 시작할 수 있습니다.';
 const badge=item.state==='pinned'?'고정':recommended?'추천':ready?plan(p):'Available';
 const pinAction=item.state==='pinned'?'unpin':'pin',pinLabel=item.state==='pinned'?'고정 해제':'항상 보기';
 const primary=ready?'열기':'둘러보기';
 const actions=recommended?`<button class="mini-action primary-mini" type="button" data-personalize-action="activate" data-service-id="${esc(id)}">내 에코디에 추가</button><button class="mini-action" type="button" data-personalize-action="dismiss" data-service-id="${esc(id)}">지금은 숨기기</button>`:`<button class="mini-action" type="button" data-personalize-action="${pinAction}" data-service-id="${esc(id)}">${pinLabel}</button>${!on&&item.state==='active'?`<button class="mini-action" type="button" data-personalize-action="dismiss" data-service-id="${esc(id)}">홈에서 숨기기</button>`:''}`;
 const restore=discovery&&item.dismissed?`<button class="mini-action" type="button" data-personalize-action="restore" data-service-id="${esc(id)}">다시 제안받기</button>`:'';
 return `<article class="platform-card${recommended?' recommended-card':''}" data-service-card="${esc(id)}"${recommended?' data-personalization-recommended="true"':''}><div class="platform-head"><h3>${esc(name)}</h3><span class="plan">${esc(badge)}</span></div><p>${esc(description)}</p><div class="meta"><span>${ready?'연결 가능':'미연결'}</span>${inCurrent?'<span>현재 공간</span>':''}${item.faded?'<span>오래 사용하지 않음</span>':''}</div><div class="platform-actions">${actions}${restore}<a class="card-link" data-service-link="${esc(id)}" href="${esc(route)}">${primary} →</a></div></article>`;
}
function bindPersonalizationActions(){
 document.querySelectorAll('[data-personalize-action][data-service-id]').forEach(button=>button.onclick=()=>personalize(button.dataset.serviceId||'',button.dataset.personalizeAction||''));
 document.querySelectorAll('[data-service-link]').forEach(link=>link.addEventListener('click',()=>{void personalize(link.dataset.serviceLink||'','engage')}));
}
function platformUi(){
 const host=$('#platformList'),discovery=$('#serviceDiscoveryList'),toggle=$('#discoverServicesButton');
 if(!host)return;
 if(!enabled){host.innerHTML='<div class="empty"><strong>격리 스테이징에서는 개인 접근권한을 읽지 않습니다.</strong><p>점진적 맞춤 UI와 인증 계약만 검증합니다.</p></div>';if(discovery)discovery.hidden=true;return}
 if(!session){host.innerHTML='<div class="empty"><strong>Google 인증 후 필요한 서비스만 나타납니다.</strong><p>처음부터 전체 기능을 펼쳐놓지 않습니다.</p></div>';if(discovery)discovery.hidden=true;if(toggle)toggle.hidden=true;progressiveSurfaceUi();return}
 const view=personalizationView(),primary=[...view.pinned,...view.active],sections=[];
 if(primary.length)sections.push(`<div class="personalization-group"><div class="personalization-label">지금 쓰는 서비스</div><div class="platform-grid">${primary.map(item=>serviceCard(item)).join('')}</div></div>`);
 if(view.recommended.length)sections.push(`<div class="personalization-group"><div class="personalization-label">관심이 보일 때만 제안</div><div class="platform-grid">${view.recommended.map(item=>serviceCard(item,{recommended:true})).join('')}</div></div>`);
 if(!sections.length)sections.push('<div class="empty"><strong>아직 홈에 꺼내둔 서비스가 없습니다.</strong><p>아래 관심 시작점을 누르거나, 필요한 기능이 생길 때 찾아보세요.</p></div>');
 host.innerHTML=sections.join('');
 if(toggle){toggle.hidden=false;toggle.textContent=discoveryOpen?'서비스 목록 닫기':'필요한 서비스 찾기';toggle.setAttribute('aria-expanded',String(discoveryOpen))}
 if(discovery){discovery.hidden=!discoveryOpen;discovery.innerHTML=discoveryOpen?`<div class="platform-grid discovery-grid">${view.available.map(item=>serviceCard(item,{discovery:true})).join('')||'<div class="empty"><strong>추가로 둘러볼 서비스가 없습니다.</strong></div>'}</div>`:''}
 bindPersonalizationActions();progressiveSurfaceUi();
 window.dispatchEvent(new CustomEvent('ekodi:personalization-rendered',{detail:{recommended:view.recommended.map(({id,name})=>({id,name})),active:primary.map(({id})=>id)}}));
}
function portfolioUi(){
 const host=$('#creatorList'),visible=filter==='all'?items:items.filter(i=>mode(i.creator_mode)===filter);
 if(!enabled){host.innerHTML='<div class="empty"><strong>격리 스테이징에서는 개인 데이터를 읽지 않습니다.</strong></div>';return}
 if(!session){host.innerHTML='<div class="empty"><strong>Google 인증 후 나의 창작물을 볼 수 있습니다.</strong></div>';return}
 if(!visible.length){host.innerHTML='<div class="empty"><strong>아직 My EKODI에 연결된 창작물이 없습니다.</strong><p>Creator AI에서 최종 승인 후 My EKODI에 등록하면 여기에 비공개로 연결됩니다.</p></div>';return}
 host.innerHTML=visible.map(i=>`<article class="portfolio-card"><small>${esc(MODES[mode(i.creator_mode)])}</small><h3>${esc(i.title||'제목 없는 창작물')}</h3><p>${esc(String(i.summary||'Creator AI에서 연결된 나의 창작물입니다.').slice(0,260))}</p><div class="meta"><span>${i.visibility==='public'?'공개':'비공개'}</span></div><div class="actions"><a class="secondary" href="${esc(serviceRoute('author','https://author.ekodi.kr/#projects'))}">Creator AI에서 열기</a></div></article>`).join('');
}
async function rpc(name,args){const {data,error}=await sb.rpc(name,args);if(error){console.warn(name,args,error);return null}return data}
async function callProfileApi(method='GET',body=null){
 if(!session?.access_token||!PROFILE_API)throw new Error('profile_session_required');
 const response=await fetch(PROFILE_API,{method,headers:{Authorization:`Bearer ${session.access_token}`,apikey:cfg.supabasePublishableKey,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data?.message||data?.error||'profile_api_failed');
 return data;
}
async function loadProfile(){
 profile=null;linkedIdentities=[];profileError='';
 if(!enabled||!session)return;
 try{
  const data=await callProfileApi();
  profile=data?.profile||null;linkedIdentities=Array.isArray(data?.identities)?data.identities:[];
 }catch(error){
  console.warn('profile-api',error);profileError='기본정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
 }
}
async function loadAccess(){
 access=new Map();workspaces=new Map();if(!sb||!session)return;
 await Promise.all(SERVICES.map(async([id])=>{
  const [a,w]=await Promise.all([rpc('current_site_access',{p_site_key:id}),rpc('current_site_workspaces',{p_site_key:id})]);
  access.set(id,a||{status:'unregistered',plan:'free'});workspaces.set(id,Array.isArray(w)?w:[]);
 }));
}
async function loadPortfolio(){
 items=[];if(!sb||!session)return;
 const {data,error}=await sb.from('creator_portfolio_items').select('id,project_id,workspace_key,title,summary,creator_mode,status,visibility,updated_at').order('updated_at',{ascending:false});
 if(error)throw error;items=data||[];
}
async function loadAll(){
 await Promise.all([loadAccess(),loadPortfolio(),loadProfile(),loadPersonalization()]);ensureActiveWorkspace();identityUi();profileUi();summaryUi();workspaceUi();platformUi();portfolioUi();progressiveSurfaceUi();
}
async function saveProfile(event){
 event.preventDefault();
 if(!session)return;
 const input=$('#displayName'),button=$('#saveProfile'),status=$('#profileStatus'),name=String(input?.value||'').trim().replace(/\s+/g,' ');
 if(!name||name.length>120){status.className='profile-status error';status.textContent='이름은 1자 이상 120자 이하로 입력해 주세요.';return}
 const old=button.textContent;button.disabled=true;input.disabled=true;button.textContent='저장 중…';status.className='profile-status';status.textContent='내 기본정보를 안전하게 저장하고 있습니다.';
 try{
  const data=await callProfileApi('PATCH',{display_name:name});
  profile=data?.profile||{display_name:name};linkedIdentities=Array.isArray(data?.identities)?data.identities:linkedIdentities;profileError='';
  identityUi();profileUi();status.className='profile-status success';status.textContent='저장되었습니다. EKODI 개인 이름에 바로 반영되었습니다.';
 }catch(error){
  console.error('profile save',error);status.className='profile-status error';status.textContent='저장하지 못했습니다. 기존 정보는 변경되지 않았습니다.';
 }finally{button.textContent=old;button.disabled=false;input.disabled=false}
}
function announceSession(){window.dispatchEvent(new CustomEvent('ekodi:my-session',{detail:{signedIn:Boolean(session?.access_token)}}))}
async function authAction(){if(!enabled)return;if(!session){const target=new URL(authUrl);target.searchParams.set('return_to',location.href.split('#')[0]);location.assign(target.href);return}await sb.auth.signOut();session=null;await loadAll();authUi();announceSession()}

$('#authButton').addEventListener('click',authAction);$('#accountAuthButton').addEventListener('click',authAction);$('#profileForm').addEventListener('submit',saveProfile);
$$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter||'all';$$('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));portfolioUi()}));

const discoveryButton=$('#discoverServicesButton');
if(discoveryButton)discoveryButton.addEventListener('click',()=>{discoveryOpen=!discoveryOpen;platformUi()});
$$('[data-intent-service]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.intentService||'';void personalize(id,'interest');setTimeout(()=>$('#platforms')?.scrollIntoView({behavior:'smooth',block:'start'}),0)}));
window.addEventListener('ekodi:personalization-signal',event=>{
 const raw=event?.detail||{},signal=normalizeSignal({...raw,created_at:raw.created_at||new Date().toISOString()});
 if(!session||!signal||!knownService(signal.service_id))return;
 ephemeralSignals=[signal,...ephemeralSignals.filter(item=>!(item.service_id===signal.service_id&&item.source===signal.source&&item.signal_type===signal.signal_type))].slice(0,30);
 platformUi();
});
window.addEventListener('hashchange',progressiveSurfaceUi);

if(!enabled){authUi();await loadAll()}else{
 try{await handoff()}catch(e){console.error('auth handoff',e)}
 const {data}=await sb.auth.getSession();session=data.session;authUi();announceSession();
 try{await loadAll()}catch(e){console.error('My EKODI load',e)}
 sb.auth.onAuthStateChange(async(_e,next)=>{session=next;authUi();announceSession();await loadAll()});
}
