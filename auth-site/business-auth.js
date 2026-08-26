const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const HANDOFF=`${SUPABASE_URL}/functions/v1/business-handoff-api`;
const BUSINESS_HOME='https://business.ekodi.kr/';
const params=new URLSearchParams(location.search);
const $=id=>document.getElementById(id);
const show=(id,on=true)=>$(id)?.classList.toggle('hide',!on);
const notice=(id,text,type='')=>{const el=$(id);if(!el)return;el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')};
const timeout=(promise,ms,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label||'timeout')),ms))]);
function fetchTimed(url,options={},ms=10000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);return fetch(url,{...options,signal:controller.signal}).finally(()=>clearTimeout(timer))}
function safeReturn(raw){
  if(!raw)return BUSINESS_HOME;
  try{
    const target=new URL(raw);
    if(target.protocol!=='https:'||target.username||target.password||target.origin!=='https://business.ekodi.kr')return BUSINESS_HOME;
    target.hash='';
    return target.href;
  }catch{return BUSINESS_HOME}
}
const RETURN_TO=safeReturn(params.get('return_to')||params.get('returnTo'));

$('serviceName').textContent='EKODI Business OS';
$('signedOutCopy').textContent='EKODI 통합 로그인은 무료회원 신원을 먼저 확인하고, 사업장 데이터 권한은 별도로 적용합니다.';
show('membershipPanel',false);show('identityPanel',false);show('requestActions',false);show('freeActions',false);show('approvedActions',false);show('workspacePanel',false);show('signedIn',false);show('signedOut',true);
notice('authStatus','로그인 상태를 확인하고 있습니다.');

let createClient;
try{
  ({createClient}=await timeout(import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'),6000,'supabase_cdn_timeout'));
}catch(firstError){
  console.warn('Supabase primary CDN failed, using fallback',firstError);
  try{({createClient}=await timeout(import('https://esm.sh/@supabase/supabase-js@2?bundle'),6000,'supabase_fallback_timeout'));}
  catch(error){
    console.error('Supabase client unavailable',error);
    $('serviceBadge').textContent='연결 실패';
    notice('authStatus','로그인 모듈을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.','error');
    show('googleRetry',true);show('cancelSignedOut',true);$('googleRetry').onclick=()=>location.reload();
    throw error;
  }
}

const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
let routing=false;
let handlingCredential=false;

async function session(){const result=await timeout(sb.auth.getSession(),3500,'session_timeout');if(result.error)throw result.error;return result.data.session}
async function identity(path,options={}){
  const {authenticated=false,session:knownSession=null,...fetchOptions}=options;
  const headers={apikey:PUBLISHABLE_KEY,...(fetchOptions.headers||{})};
  if(authenticated){const s=knownSession||await session();if(!s)throw new Error('login_required');headers.authorization=`Bearer ${s.access_token}`;}
  if(fetchOptions.body&&!headers['content-type'])headers['content-type']='application/json';
  const response=await fetchTimed(`${IDENTITY}${path}`,{...fetchOptions,headers,cache:'no-store'},10000);
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{}
  if(!response.ok)throw Object.assign(new Error(data.error||`identity_${response.status}`),{status:response.status,data});return data;
}
function loadGoogleLibrary(){
  if(window.google?.accounts?.id)return Promise.resolve();
  return timeout(new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-ekodi-google-identity]');
    if(existing){if(window.google?.accounts?.id){resolve();return}existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});return}
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.dataset.ekodiGoogleIdentity='true';script.addEventListener('load',resolve,{once:true});script.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});document.head.append(script);
  }),7000,'google_library_timeout');
}
function showRetry(message){
  routing=false;
  $('serviceBadge').textContent='다시 시도';
  show('signedIn',false);show('signedOut',true);show('googleButtonHost',false);show('googleRetry',true);show('cancelSignedOut',true);
  notice('authStatus',message,'error');
}
function redirectWithToken(tokenHash,type='email',workspace=null){
  if(!tokenHash)throw new Error('handoff_token_missing');
  const target=new URL(RETURN_TO);
  const fragment={ekodi_token:tokenHash,ekodi_type:type};
  if(workspace)fragment.ekodi_workspace=workspace;
  target.hash=new URLSearchParams(fragment).toString();
  location.assign(target.href);
}
async function tryBusinessHandoff(s){
  const response=await fetchTimed(HANDOFF,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,authorization:`Bearer ${s.access_token}`,'content-type':'application/json'},body:'{}',cache:'no-store'},10000);
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{}
  if(response.status===403)return false;
  if(!response.ok||!data.tokenHash)throw new Error(data.error||`business_handoff_${response.status}`);
  redirectWithToken(data.tokenHash,data.type||'email',data.workspace||'ekodibiz');
  return true;
}
async function freeIdentityHandoff(s){
  const proof=await identity('/session/handoff',{method:'POST',authenticated:true,session:s});
  redirectWithToken(proof.tokenHash,proof.type||'email');
}
async function routeSession(s){
  if(routing)return;
  routing=true;
  $('serviceBadge').textContent='인증 완료';
  show('signedIn',false);show('signedOut',true);show('googleButtonHost',false);show('googleRetry',false);show('cancelSignedOut',false);
  notice('authStatus','로그인이 확인되었습니다. Business OS로 이동합니다.');
  try{
    if(await tryBusinessHandoff(s))return;
    notice('authStatus','EKODI 무료회원으로 Business OS에 연결합니다.');
    await freeIdentityHandoff(s);
  }catch(error){
    console.error('business session route',error);
    showRetry('Business OS 연결을 완료하지 못했습니다. 다시 시도해 주세요.');
  }
}
async function handleGoogleCredential(response,challenge){
  if(handlingCredential)return;
  if(!response?.credential){showRetry('Google 로그인이 완료되지 않았습니다. 다시 시도해 주세요.');return;}
  handlingCredential=true;
  $('serviceBadge').textContent='확인 중';show('googleButtonHost',false);show('googleRetry',false);show('cancelSignedOut',false);notice('authStatus','Google 계정을 확인하고 있습니다.');
  try{
    const proof=await identity('/google/exchange',{method:'POST',body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});
    const {error}=await timeout(sb.auth.verifyOtp({token_hash:proof.tokenHash,type:proof.type||'email'}),10000,'verify_timeout');if(error)throw error;
    const s=await session();if(!s)throw new Error('session_not_created');
    handlingCredential=false;await routeSession(s);
  }catch(error){
    handlingCredential=false;console.error('business google auth',error);
    const message=error.message==='challenge_expired_or_used'?'Google 로그인 시간이 만료되었습니다. 다시 시도해 주세요.':error.message==='identity_conflict'?'이 Google 계정은 다른 EKODI 사용자에 연결되어 있습니다. 관리자 확인이 필요합니다.':'Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.';
    showRetry(message);
  }
}
async function renderGoogle(){
  const host=$('googleButtonHost');host.replaceChildren();show('signedIn',false);show('signedOut',true);show('googleButtonHost',true);show('googleRetry',false);show('cancelSignedOut',false);$('serviceBadge').textContent='로그인';notice('authStatus','Google 계정으로 계속해 주세요.');
  try{
    const [challenge]=await Promise.all([identity('/challenge',{method:'POST'}),loadGoogleLibrary()]);
    window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_button:true,button_auto_select:false,callback:r=>void handleGoogleCredential(r,challenge)});
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340)),use_fedcm_for_button:true});
    notice('authStatus','처음 한 번만 Google 계정으로 본인을 확인합니다.');
  }catch(error){console.error(error);showRetry('Google 로그인을 준비하지 못했습니다. 다시 시도해 주세요.')}
}
async function prepare(){
  routing=false;show('signedIn',false);show('signedOut',true);show('googleButtonHost',false);show('googleRetry',false);show('cancelSignedOut',false);$('serviceBadge').textContent='확인 중';notice('authStatus','로그인 상태를 확인하고 있습니다.');
  let existing=null;
  try{existing=await session()}catch(error){console.warn('business session bootstrap',error)}
  if(existing){await routeSession(existing);return}
  await renderGoogle();
}
async function logout(){try{await timeout(sb.auth.signOut(),8000,'logout_timeout')}catch(error){console.warn('business logout',error)}await prepare()}

$('googleRetry')?.addEventListener('click',prepare);
$('cancelSignedOut')?.addEventListener('click',()=>location.assign(RETURN_TO));
$('cancelSignedIn')?.addEventListener('click',()=>location.assign(RETURN_TO));
$('logout')?.addEventListener('click',logout);

await prepare();
sb.auth.onAuthStateChange((event,s)=>{
  if((event==='SIGNED_IN'||event==='TOKEN_REFRESHED')&&s&&!routing&&!handlingCredential)queueMicrotask(()=>void routeSession(s));
  if(event==='SIGNED_OUT'){routing=false;}
});
