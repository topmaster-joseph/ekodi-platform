const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const ACCESS=`${SUPABASE_URL}/functions/v1/access-api`;
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const params=new URLSearchParams(location.search);
const site='marketing';
const returnOrigins=new Set(['https://marketing.ekodi.kr','https://jadam.ekodi.kr','https://pizzamaru.ekodi.kr','https://yogurt.ekodi.kr']);
const safeReturn=raw=>{try{const u=new URL(raw||'https://marketing.ekodi.kr');return u.protocol==='https:'&&returnOrigins.has(u.origin)?u.href:'https://marketing.ekodi.kr/'}catch{return'https://marketing.ekodi.kr/'}};
const returnTo=safeReturn(params.get('return_to'));
const explicitPro=params.get('plan')==='pro'||params.get('intent')==='pro';
const manageMode=params.get('manage')==='1';
const $=id=>document.getElementById(id);
const show=(id,on=true)=>$(id)?.classList.toggle('hide',!on);
const notice=(id,text,type='')=>{const el=$(id);if(!el)return;el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timeout=(promise,ms,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label||'timeout')),ms))]);

$('serviceName').textContent='마케팅AI';
$('signedOutCopy').textContent='Google 계정으로 무료회원이 됩니다. 개인 공간은 바로 사용할 수 있고, 사업장·단체 공간은 별도 권한으로 연결됩니다.';
$('requestAccess').textContent=explicitPro?'Marketing AI Pro 사용신청':'사업장 Pro 사용신청';
$('requestNote').placeholder='운영 중인 채널, 필요한 자동화 기능, 요청사항 등을 적어 주세요.';
$('requestNoteLabel').firstChild.textContent='신청 메모 ';
show('marketingApplication',true);

let createClient;
try{
  ({createClient}=await timeout(import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'),6000,'supabase_cdn_timeout'));
}catch(firstError){
  console.warn('Supabase primary CDN failed, using fallback',firstError);
  try{({createClient}=await timeout(import('https://esm.sh/@supabase/supabase-js@2?bundle'),6000,'supabase_fallback_timeout'));}
  catch(error){
    console.error('Supabase client unavailable',error);
    $('serviceBadge').textContent='연결 실패';
    notice('authStatus','인증 모듈을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.','error');
    show('googleRetry',true);show('cancelSignedOut',true);
    throw error;
  }
}

const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
let currentSession=null;
let routing=false;
let currentWorkspaces=[];
let fallbackWorkspaceKey=null;

function cleanUrl(){const q=new URLSearchParams({site,return_to:returnTo});if(explicitPro)q.set('plan','pro');if(manageMode)q.set('manage','1');history.replaceState({},document.title,`/?${q.toString()}`)}
function marketingFreeTarget(){try{const u=new URL(returnTo);if(u.origin==='https://marketing.ekodi.kr'){u.searchParams.set('welcome','free');u.hash='memberTrial'}return u.href}catch{return'https://marketing.ekodi.kr/?welcome=free#memberTrial'}}
function showSignedIn(s){show('signedOut',false);show('signedIn',true);$('accountEmail').textContent=s?.user?.email||'인증 계정'}
function resetPanels(){show('approvedActions',false);show('freeActions',false);show('requestActions',false);show('workspacePanel',false)}
function showFailure(text){routing=false;$('serviceBadge').textContent='인증 실패';show('signedIn',false);show('signedOut',true);show('googleButtonHost',false);show('googleRetry',true);show('cancelSignedOut',true);notice('authStatus',text,'error')}
function showAccessFailure(text){routing=false;showSignedIn(currentSession);resetPanels();$('serviceBadge').textContent='연결 실패';notice('accessStatus',text,'error');show('freeActions',true);if(explicitPro)show('requestActions',true)}
function fetchTimed(url,options={},ms=12000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);return fetch(url,{...options,signal:controller.signal}).finally(()=>clearTimeout(timer))}
async function api(path,options={}){if(!currentSession)throw new Error('login_required');const headers={apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${currentSession.access_token}`,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetchTimed(`${ACCESS}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data}
async function identity(path,options={}){const {authenticated=false,...rest}=options;const headers={apikey:PUBLISHABLE_KEY,...(rest.headers||{})};if(authenticated){if(!currentSession)throw new Error('login_required');headers.Authorization=`Bearer ${currentSession.access_token}`;}if(rest.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetchTimed(`${IDENTITY}${path}`,{...rest,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data}

function loadGoogleLibrary(){if(window.google?.accounts?.id)return Promise.resolve();return timeout(new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-ekodi-google-identity]');if(existing){if(window.google?.accounts?.id){resolve();return}existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});return}const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.dataset.ekodiGoogleIdentity='true';script.addEventListener('load',resolve,{once:true});script.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});document.head.append(script)}),8000,'google_library_timeout')}

function workspaceKindLabel(kind){return kind==='personal'?'개인':kind==='business'?'사업장':'단체'}
function workspacePlanLabel(plan){return String(plan||'free').toUpperCase()}
function authorized(items){return(items||[]).filter(item=>item?.requires_handoff===true&&['active','pre_registered'].includes(String(item?.status||'')))}
function renderWorkspacePanel(items){currentWorkspaces=Array.isArray(items)?items:[];const list=$('workspaceList');list.replaceChildren();if(!currentWorkspaces.length){show('workspacePanel',false);return}show('workspacePanel',true);$('workspaceCount').textContent=`${currentWorkspaces.length}개`;for(const item of currentWorkspaces){const button=document.createElement('button');button.type='button';button.className='workspace-card';const copy=document.createElement('span');copy.className='workspace-copy';const name=document.createElement('strong');name.textContent=item.workspace_name||item.store_name||'내 공간';const meta=document.createElement('span');meta.className='workspace-meta';meta.textContent=[workspaceKindLabel(item.workspace_kind),workspacePlanLabel(item.plan),item.store_name&&item.store_name!==item.workspace_name?item.store_name:''].filter(Boolean).join(' · ');copy.append(name,meta);const arrow=document.createElement('span');arrow.className='workspace-arrow';arrow.textContent='→';button.append(copy,arrow);button.addEventListener('click',()=>openWorkspace(item,button));list.append(button)}}
function renderIdentityList(items){const host=$('linkedAccounts');host.replaceChildren();for(const item of items||[]){const row=document.createElement('div');row.className='linked-account';const left=document.createElement('div');const email=document.createElement('strong');email.textContent=item.email||'Google 계정';const meta=document.createElement('span');meta.textContent=item.is_primary?'기본 로그인':'연결된 로그인';left.append(email,meta);const badge=document.createElement('span');badge.className='provider-badge';badge.textContent='Google';row.append(left,badge);host.append(row)}}
async function loadLinkedIdentities(){show('identityPanel',true);try{const data=await identity('/identities',{method:'GET',authenticated:true});renderIdentityList(data.identities||[]);$('addGoogleAccount').disabled=Boolean(data.reloginRequired);if(data.reloginRequired)notice('identityLinkStatus','새 통합 프로필 연결을 위해 한 번 다시 로그인해 주세요.','warn');else show('identityLinkStatus',false)}catch(error){console.error('linked identities',error);$('addGoogleAccount').disabled=false;notice('identityLinkStatus','로그인 계정 목록은 나중에 다시 확인할 수 있습니다.','warn')}}
async function loadWorkspaces(){const data=await api('/workspaces?site=marketing');currentWorkspaces=Array.isArray(data.workspaces)?data.workspaces:[];return currentWorkspaces}

async function handoffToService(workspaceKey){const d=await api('/handoff',{method:'POST',body:JSON.stringify({site:'marketing',return_to:returnTo,workspace_key:workspaceKey||undefined})});if(!d.tokenHash||!d.returnTo)throw new Error('handoff_unavailable');const target=new URL(d.returnTo);const fragment={ekodi_token:d.tokenHash,ekodi_type:d.type||'email'};if(d.workspace?.workspace_key)fragment.ekodi_workspace=d.workspace.workspace_key;if(d.workspace?.tenant_id)fragment.ekodi_tenant=d.workspace.tenant_id;if(d.workspace?.store_id)fragment.ekodi_store=d.workspace.store_id;target.hash=new URLSearchParams(fragment).toString();location.assign(target.href)}
async function openWorkspace(item,button){if(button){button.disabled=true;button.classList.add('loading')}try{if(item.requires_handoff===false){location.assign(marketingFreeTarget());return}await handoffToService(item.workspace_key)}catch(error){console.error('workspace handoff',error);notice('accessStatus','선택한 공간 연결이 지연되고 있습니다. 무료 기능으로 이동하거나 다시 시도해 주세요.','error');show('freeActions',true);if(button){button.disabled=false;button.classList.remove('loading')}}}

async function renderAccess(s){currentSession=s;routing=false;showSignedIn(s);resetPanels();notice('accessStatus','내 Marketing AI 공간을 확인하고 있습니다.');let workspaces;try{workspaces=await loadWorkspaces()}catch(error){console.error('workspace list',error);showAccessFailure('공간 정보를 불러오지 못했습니다. 화면을 잠그지 않고 무료 기능을 사용할 수 있게 열어 두었습니다.');return}renderWorkspacePanel(workspaces);const active=authorized(workspaces);fallbackWorkspaceKey=active[0]?.workspace_key||null;if(active.length===1&&workspaces.length===1&&!explicitPro&&!manageMode){routing=true;$('serviceBadge').textContent=`${workspacePlanLabel(active[0].plan)} 이용중`;notice('accessStatus','인증되었습니다. Marketing AI로 이동합니다.');try{await handoffToService(active[0].workspace_key);return}catch(error){console.error('automatic handoff',error);routing=false;show('approvedActions',true);show('freeActions',true);notice('accessStatus','자동 연결이 지연되어 직접 이동 버튼을 열었습니다.','warn')}}else if(active.length){$('serviceBadge').textContent=workspaces.length>1?`${workspaces.length}개 공간`:`${workspacePlanLabel(active[0].plan)} 이용중`;notice('accessStatus',workspaces.length>1?'사용할 개인·사업장·단체 공간을 선택해 주세요.':'Marketing AI 이용 권한이 확인되었습니다.');if(workspaces.length===1)show('approvedActions',true)}else{$('serviceBadge').textContent='무료회원';notice('accessStatus','무료 기능을 바로 이용할 수 있습니다.');show('freeActions',true)}if(explicitPro)show('requestActions',true);await loadLinkedIdentities()}

async function handleGoogleCredential(response,challenge){if(!response?.credential){showFailure('Google 계정을 선택하지 못했습니다. 다시 시도해 주세요.');return}$('serviceBadge').textContent='확인 중';notice('authStatus','Google 계정을 확인하고 있습니다.');show('googleButtonHost',false);show('cancelSignedOut',true);try{const proof=await identity('/google/exchange',{method:'POST',body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});const result=await timeout(sb.auth.verifyOtp({token_hash:proof.tokenHash,type:'email'}),10000,'verify_otp_timeout');if(result.error)throw result.error;currentSession=result.data?.session||null;if(!currentSession){const sessionResult=await timeout(sb.auth.getSession(),5000,'session_timeout');currentSession=sessionResult.data.session}if(!currentSession)throw new Error('session_not_created');cleanUrl();await renderAccess(currentSession)}catch(error){console.error('google exchange',error);showFailure(error.message==='identity_conflict'?'이 Google 계정은 다른 EKODI 사용자에 연결되어 있습니다. 관리자 확인이 필요합니다.':'로그인이 지연되거나 실패했습니다. 다시 시도해 주세요.')}}
async function prepareGoogle(){routing=false;const host=$('googleButtonHost');host.replaceChildren();show('signedIn',false);show('signedOut',true);show('googleButtonHost',true);show('googleRetry',false);show('cancelSignedOut',true);$('serviceBadge').textContent='인증 필요';notice('authStatus','Google 인증을 준비하고 있습니다.');try{const [challenge]=await Promise.all([identity('/challenge',{method:'POST'}),loadGoogleLibrary()]);window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_button:true,button_auto_select:false,callback:r=>void handleGoogleCredential(r,challenge)});window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340))});notice('authStatus','Google 계정으로 본인을 확인해 주세요.')}catch(error){console.error('prepare google',error);showFailure('Google 인증 준비가 지연되고 있습니다. 다시 시도하거나 Marketing AI로 돌아가 주세요.')}}

async function prepareLinkGoogle(){const button=$('addGoogleAccount');button.disabled=true;notice('identityLinkStatus','추가할 Google 계정을 선택해 주세요.');try{const [challenge]=await Promise.all([identity('/google/link/challenge',{method:'POST',authenticated:true}),loadGoogleLibrary()]);const host=$('linkGoogleButtonHost');host.replaceChildren();show('linkGoogleButtonHost',true);window.google.accounts.id.disableAutoSelect?.();window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_button:true,button_auto_select:false,callback:r=>void handleLinkCredential(r,challenge)});window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'medium',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(360,Math.max(250,host.clientWidth||320))})}catch(error){console.error('prepare linked account',error);button.disabled=false;show('linkGoogleButtonHost',false);notice('identityLinkStatus','Google 계정 추가 인증을 준비하지 못했습니다.','error')}}
async function handleLinkCredential(response,challenge){const button=$('addGoogleAccount');if(!response?.credential){button.disabled=false;return}try{const data=await identity('/google/link/exchange',{method:'POST',authenticated:true,body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});renderIdentityList(data.identities||[]);show('linkGoogleButtonHost',false);button.disabled=false;notice('identityLinkStatus',`${data.linked?.email||'Google 계정'}이 연결되었습니다.`);renderWorkspacePanel(await loadWorkspaces())}catch(error){console.error('link google',error);button.disabled=false;show('linkGoogleButtonHost',false);notice('identityLinkStatus','Google 계정 연결에 실패했습니다.','error')}}

$('googleRetry').addEventListener('click',()=>void prepareGoogle());
$('cancelSignedOut').addEventListener('click',()=>location.assign(returnTo));
$('cancelSignedIn').addEventListener('click',()=>location.assign(returnTo));
$('continueFree').addEventListener('click',()=>location.assign(marketingFreeTarget()));
$('addGoogleAccount').addEventListener('click',()=>void prepareLinkGoogle());
$('continueService').addEventListener('click',async()=>{const btn=$('continueService');btn.disabled=true;try{await handoffToService(fallbackWorkspaceKey)}catch(error){console.error('continue service',error);btn.disabled=false;show('freeActions',true);notice('accessStatus','서비스 연결이 지연되고 있습니다. 무료 기능으로 이동할 수 있습니다.','warn')}});
$('logout').addEventListener('click',async()=>{try{await timeout(sb.auth.signOut(),6000,'signout_timeout')}catch{}currentSession=null;cleanUrl();show('signedIn',false);show('signedOut',true);show('identityPanel',false);await prepareGoogle()});
$('requestAccess').addEventListener('click',async()=>{const btn=$('requestAccess');btn.disabled=true;try{const payload={site:'marketing',role:'store_owner',plan:'pro',note:$('requestNote').value.trim(),business_name:$('businessName').value.trim(),contact_phone:$('contactPhone').value.trim(),business_number:$('businessNumber').value.trim()};const d=await api('/request',{method:'POST',body:JSON.stringify(payload)});notice('requestStatus',d.already_pending?'이미 검수 중인 신청입니다.':'Marketing AI Pro 사용신청이 접수되었습니다.')}catch(error){console.error('pro request',error);notice('requestStatus','Pro 사용신청을 처리하지 못했습니다.','error')}finally{btn.disabled=false}});

const initialResult=await timeout(sb.auth.getSession(),6000,'initial_session_timeout').catch(error=>({data:{session:null},error}));currentSession=initialResult.data?.session||null;if(currentSession){cleanUrl();await renderAccess(currentSession)}else await prepareGoogle();

// Supabase documents a deadlock risk when async Supabase calls are awaited inside onAuthStateChange.
// Keep the callback synchronous and defer all work to a later task.
sb.auth.onAuthStateChange((event,s)=>{
  currentSession=s||null;
  setTimeout(()=>{
    if(event==='SIGNED_IN'&&s&&!routing)void renderAccess(s);
    if(event==='SIGNED_OUT'){routing=false;show('signedIn',false);show('signedOut',true);show('identityPanel',false)}
  },0);
});