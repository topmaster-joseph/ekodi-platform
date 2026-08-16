import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const realms={
  'my':{name:'My EKODI',returnTo:'https://my.ekodi.kr/',open:true,kind:'my'},
  community:{name:'EKODI Community',returnTo:'https://community.ekodi.kr/',open:true,kind:'community'},
  work:{name:'EKODI Work',returnTo:'https://work.ekodi.kr/',open:true,kind:'work'},
  'cgma-client':{name:'청계상권 고객관리',returnTo:'https://cgma.ekodi.kr/client/'},
  'jadam-client':{name:'자담치킨 목포대점 고객관리',returnTo:'https://jadam.ekodi.kr/'},
  'pizzamaru-client':{name:'피자마루 목포대점 고객관리',returnTo:'https://pizzamaru.ekodi.kr/'},
  'yogurt-client':{name:'요거트퍼플 목포대점 고객관리',returnTo:'https://yogurt.ekodi.kr/'},
};
const site=new URLSearchParams(location.search).get('site');
const config=realms[site]||realms['cgma-client'];
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
const $=id=>document.getElementById(id);
let routing=false;

$('serviceName').textContent=config.name;
$('serviceBadge').textContent=config.kind==='my'?'나의 에코디':config.kind==='work'?'일·인재':config.open?'커뮤니티':'Google 로그인';
const introTitle=document.querySelector('.intro h1');
const introCopy=document.querySelector('.intro p');
if(config.kind==='my'){
  if(introTitle)introTitle.innerHTML='한 번 로그인하고,<br>나의 EKODI를 이어가세요.';
  if(introCopy)introCopy.textContent='이미 EKODI에 로그인했다면 다시 Google 계정을 고르지 않고 My EKODI로 바로 연결합니다. 처음 방문할 때만 Google로 본인을 확인합니다.';
  $('signedOutCopy').textContent='My EKODI는 로그인 후 모든 일반사용자를 위한 개인 홈입니다. 공간 전환과 서비스 이동은 여기에서 이어집니다.';
}else if(config.kind==='work'){
  if(introTitle)introTitle.innerHTML='한 번 로그인하고,<br>내 일과 채용을 이어가세요.';
  if(introCopy)introCopy.textContent='EKODI 통합 로그인 상태를 재사용합니다. 로그인 후 Work Profile, 지원 현황, 사업장과 채용 기능을 안전하게 연결합니다.';
  $('signedOutCopy').textContent='EKODI 통합 로그인으로 Work에 연결합니다. 구직자와 사업주 역할과 권한은 로그인 후 자동으로 적용됩니다.';
}else if(config.open){
  if(introTitle)introTitle.innerHTML='한 번 로그인하고,<br>내 활동을 이어가세요.';
  if(introCopy)introCopy.textContent='EKODI 통합 로그인 상태를 재사용하고, 서비스별 역할과 권한은 로그인 후 자동으로 적용합니다.';
  $('signedOutCopy').textContent='EKODI에서 이미 본인확인을 했다면 Google 로그인을 반복하지 않습니다.';
}else{
  if(introTitle)introTitle.innerHTML='한 번 로그인하면,<br>등록된 역할이 이어집니다.';
  if(introCopy)introCopy.textContent='EKODI 통합 로그인으로 본인을 확인합니다. 역할과 권한은 로그인 후 자동으로 적용하고 서버가 다시 확인합니다.';
  $('signedOutCopy').textContent='등록된 Google 계정과 EKODI 사용자 연결을 기준으로 서비스 권한을 적용합니다.';
}

function show(id,on=true){$(id)?.classList.toggle('hide',!on)}
function notice(text,type=''){const el=$('authStatus');el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}
async function session(){const {data}=await sb.auth.getSession();return data.session}
async function identity(path,options={}){
  const {authenticated=false,...fetchOptions}=options;
  const headers={apikey:PUBLISHABLE_KEY,...(fetchOptions.headers||{})};
  if(authenticated){const s=await session();if(!s)throw new Error('login_required');headers.Authorization=`Bearer ${s.access_token}`;}
  if(fetchOptions.body&&!headers['content-type'])headers['content-type']='application/json';
  const r=await fetch(`${IDENTITY}${path}`,{...fetchOptions,headers,cache:'no-store'});
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}
  if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});
  return data;
}
function loadGoogleLibrary(){if(window.google?.accounts?.id)return Promise.resolve();return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.addEventListener('load',resolve,{once:true});s.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});document.head.append(s)})}

async function handoffExistingSession(){
  if(routing)return;
  const s=await session();
  if(!s)return false;
  routing=true;
  notice('기존 EKODI 로그인을 확인했습니다. 요청한 공간으로 바로 연결합니다.');
  try{
    const proof=await identity('/session/handoff',{method:'POST',authenticated:true});
    if(!proof.tokenHash)throw new Error('identity_handoff_missing');
    const target=new URL(config.returnTo);
    target.hash=new URLSearchParams({ekodi_token:proof.tokenHash,ekodi_type:proof.type||'email'}).toString();
    location.assign(target.href);
    return true;
  }catch(error){
    routing=false;
    console.error('central session handoff',error);
    return false;
  }
}

async function handleCredential(response,challenge){
  if(!response?.credential){notice('Google 계정을 선택하지 못했습니다. 다시 시도해 주세요.','error');show('googleRetry',true);return;}
  notice('Google 계정을 확인하고 EKODI 통합 로그인을 만들고 있습니다.');
  try{
    const proof=await identity('/google/exchange',{method:'POST',body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});
    if(!proof.tokenHash)throw new Error('identity_handoff_missing');
    const {error}=await sb.auth.verifyOtp({token_hash:proof.tokenHash,type:proof.type||'email'});
    if(error)throw error;
    if(!(await handoffExistingSession()))throw new Error('session_handoff_failed');
  }catch(error){
    console.error('central identity',error);
    routing=false;
    notice(error.message==='identity_conflict'?'이 Google 계정은 다른 EKODI 사용자에 연결되어 있습니다. 관리자 확인이 필요합니다.':'Google 본인확인을 완료하지 못했습니다. 다시 시도해 주세요.','error');
    show('googleRetry',true);
  }
}

async function prepare(){
  routing=false;
  const host=$('googleButtonHost');host.replaceChildren();show('googleRetry',false);show('cancelSignedOut',false);
  notice('EKODI 통합 로그인 상태를 확인하고 있습니다.');
  if(await handoffExistingSession())return;
  try{
    const [challenge]=await Promise.all([identity('/challenge',{method:'POST'}),loadGoogleLibrary()]);
    window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_prompt:true,callback:r=>void handleCredential(r,challenge)});
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340))});
    notice('처음 이용하거나 전체 로그아웃한 경우에만 Google 계정으로 본인을 확인해 주세요.');
  }catch(error){
    console.error('prepare central identity',error);
    notice('Google 인증 준비에 실패했습니다. 다시 시도해 주세요.','error');
    show('googleRetry',true);
  }
}

$('googleRetry').addEventListener('click',prepare);
show('signedOut',true);show('signedIn',false);show('reviewConsole',false);
await prepare();
sb.auth.onAuthStateChange((event)=>{if((event==='SIGNED_IN'||event==='TOKEN_REFRESHED')&&!routing)queueMicrotask(()=>handoffExistingSession())});