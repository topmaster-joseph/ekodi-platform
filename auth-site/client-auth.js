const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const timeout=(promise,ms,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label||'timeout')),ms))]);
function fetchTimed(url,options={},ms=10000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);return fetch(url,{...options,signal:controller.signal}).finally(()=>clearTimeout(timer))}

const realms={
  portal:{name:'EKODI',returnTo:'https://ekodi.kr/',open:true,kind:'portal'},
  'my':{name:'My EKODI',returnTo:'https://my.ekodi.kr/',open:true,kind:'my'},
  community:{name:'Community',returnTo:'https://community.ekodi.kr/',open:true,kind:'community'},
  church:{name:'EKODI Church',returnTo:'https://church.ekodi.kr/',open:true,kind:'church'},
  biz:{name:'EKODI Biz',returnTo:'https://biz.ekodi.kr/',open:true,kind:'biz'},
  trade:{name:'EKODI Trading',returnTo:'https://trade.ekodi.kr/',open:true,kind:'trade'},
  mall:{name:'EKODI Mall',returnTo:'https://mall.ekodi.kr/',open:true,kind:'mall'},
  pay:{name:'EKODI Pay',returnTo:'https://pay.ekodi.kr/',open:true,kind:'pay'},
  books:{name:'EKODI Books',returnTo:'https://books.ekodi.kr/',open:true,kind:'books'},
  lab:{name:'EKODI Lab',returnTo:'https://lab.ekodi.kr/',open:true,kind:'lab'},
  mission:{name:'EKODI Mission',returnTo:'https://mission.ekodi.kr/',open:true,kind:'mission'},
  edu:{name:'EKODI Education',returnTo:'https://edu.ekodi.kr/',open:true,kind:'edu'},
  media:{name:'EKODI Media',returnTo:'https://media.ekodi.kr/',open:true,kind:'media'},
  social:{name:'EKODI Social',returnTo:'https://social.ekodi.kr/',open:true,kind:'social'},
  energy:{name:'Energy AI',returnTo:'https://energy.ekodi.kr/',open:true,kind:'energy'},
  work:{name:'EKODI Work',returnTo:'https://work.ekodi.kr/',open:true,kind:'work'},
  messenger:{name:'EKODI Messenger',returnTo:'https://messenger.ekodi.kr/',open:true,kind:'messenger'},
  invest:{name:'EKODI Investment',returnTo:'https://invest.ekodi.kr/',open:true,kind:'invest'},
  support:{name:'EKODI Support AI',returnTo:'https://support.ekodi.kr/',open:true,kind:'support'},
  publishing:{name:'Publishing',returnTo:'https://publishing.ekodi.kr/',open:true,kind:'publishing'},
  money:{name:'EKODI Money',returnTo:'https://money.ekodi.kr/',open:true,kind:'money'},
  mail:{name:'EKODI Mail',returnTo:'https://mail.ekodi.kr/',open:true,kind:'mail'},
  live:{name:'EKODI Live',returnTo:'https://live.ekodi.kr/',open:true,kind:'live'},
  cloud:{name:'EKODI Cloud',returnTo:'https://cloud.ekodi.kr/',open:true,kind:'cloud'},
  cafe:{name:'EKODI Cafe',returnTo:'https://cafe.ekodi.kr/',open:true,kind:'cafe'},
  'cgma-client':{name:'청계상권 고객관리',returnTo:'https://cgma.ekodi.kr/client/',origins:['https://cgma.ekodi.kr'],open:false,kind:'cgma-client'},
  'jadam-client':{name:'자담치킨 목포대점 고객관리',returnTo:'https://jadam.ai.ekodi.kr/',origins:['https://jadam.ai.ekodi.kr','https://jadam.ekodi.kr'],open:false,kind:'jadam-client'},
  'pizzamaru-client':{name:'피자마루 목포대점 고객관리',returnTo:'https://pizzamaru.ai.ekodi.kr/',origins:['https://pizzamaru.ai.ekodi.kr','https://pizzamaru.ekodi.kr'],open:false,kind:'pizzamaru-client'},
  'yogurt-client':{name:'요거트퍼플 목포대점 고객관리',returnTo:'https://yogurt.ai.ekodi.kr/',origins:['https://yogurt.ai.ekodi.kr','https://yogurt.ekodi.kr'],open:false,kind:'yogurt-client'}
};
const params=new URLSearchParams(location.search);
const site=params.get('site')||'portal';
async function manifestRealm(id){
  if(!id)return null;
  try{
    const response=await fetchTimed('https://shell.ekodi.kr/manifest.json',{cache:'no-store'},5000);
    if(!response.ok)return null;
    const manifest=await response.json();
    const service=manifest?.services?.find(item=>item.id===id);
    if(!service?.url)return null;
    const serviceUrl=new URL(service.url);
    if(serviceUrl.protocol!=='https:')return null;
    return {name:service.name||service.shortName||id,returnTo:serviceUrl.href,origins:[serviceUrl.origin],open:true,kind:id,operatingModel:service.operatingModel||'',userAccessPolicy:service.userAccessPolicy||null};
  }catch{return null}
}
function implicitEkodiRealm(id){
  const value=String(id||'').trim().toLowerCase();
  if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)||value==='portal')return null;
  const origin=`https://${value}.ekodi.kr`;
  return {name:value.replace(/-/g,' ').toUpperCase(),returnTo:`${origin}/`,origins:[origin],open:true,kind:value};
}
const manifestConfig=await manifestRealm(site);
const baseConfig=realms[site]||manifestConfig||implicitEkodiRealm(site)||realms.portal;
const config={...baseConfig,operatingModel:manifestConfig?.operatingModel||baseConfig.operatingModel||'',userAccessPolicy:manifestConfig?.userAccessPolicy||baseConfig.userAccessPolicy||null};
const commonServiceEntry=config.operatingModel==='shared-service';
function safeReturn(raw){
  const fallback=new URL(config.returnTo);
  if(!raw)return fallback.href;
  try{
    const target=new URL(raw);
    const allowedOrigins=new Set(config.origins||[fallback.origin]);
    const hostname=target.hostname.toLowerCase();
    const internalEkodi=hostname==='ekodi.kr'||hostname.endsWith('.ekodi.kr');
    if(target.protocol!=='https:'||target.username||target.password||(!allowedOrigins.has(target.origin)&&!internalEkodi))return fallback.href;
    target.hash='';
    return target.href;
  }catch{return fallback.href}
}
const RETURN_TO=safeReturn(params.get('return_to')||params.get('returnTo'));
const $=id=>document.getElementById(id);
const show=(id,on=true)=>$(id)?.classList.toggle('hide',!on);
function notice(text,type=''){const el=$('authStatus');if(!el)return;el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}

let createClient;
try{
  ({createClient}=await timeout(import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'),6000,'supabase_cdn_timeout'));
}catch(firstError){
  console.warn('Supabase primary CDN failed, using fallback',firstError);
  try{({createClient}=await timeout(import('https://esm.sh/@supabase/supabase-js@2?bundle'),6000,'supabase_fallback_timeout'));}
  catch(error){
    console.error('Supabase client unavailable',error);
    $('serviceName').textContent=config.name;
    $('serviceBadge').textContent='연결 실패';
    notice('로그인 모듈을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.','error');
    show('googleRetry',true);show('cancelSignedOut',true);
    $('googleRetry').onclick=()=>location.reload();
    throw error;
  }
}

const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
let routing=false;
let handlingCredential=false;

$('serviceName').textContent=config.name;
$('serviceBadge').textContent='EKODI';
$('signedOutCopy').textContent=commonServiceEntry?`${config.name}의 실제 기능은 Google 로그인한 무료회원 이상에게 제공됩니다. 로그인 후 일반회원은 My EKODI에서 내 공간과 서비스를 이어서 이용합니다.`:'EKODI에서 Google 본인확인을 한 번 마치면 다른 EKODI 서비스에서도 같은 로그인 상태를 사용합니다.';
show('signedOut',true);show('signedIn',false);show('reviewConsole',false);show('membershipPanel',false);show('identityPanel',false);show('workspacePanel',false);show('requestActions',false);show('freeActions',false);show('approvedActions',false);

async function session(){
  const result=await timeout(sb.auth.getSession(),3500,'session_timeout');
  if(result.error)throw result.error;
  return result.data.session;
}
async function identity(path,options={}){
  const {authenticated=false,session:knownSession=null,...fetchOptions}=options;
  const headers={apikey:PUBLISHABLE_KEY,...(fetchOptions.headers||{})};
  if(authenticated){
    const s=knownSession||await session();
    if(!s)throw new Error('login_required');
    headers.Authorization=`Bearer ${s.access_token}`;
  }
  if(fetchOptions.body&&!headers['content-type'])headers['content-type']='application/json';
  const response=await fetchTimed(`${IDENTITY}${path}`,{...fetchOptions,headers,cache:'no-store'},10000);
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{}
  if(!response.ok)throw Object.assign(new Error(data.error||`identity_${response.status}`),{status:response.status,data});
  return data;
}
function loadGoogleLibrary(){
  if(window.google?.accounts?.id)return Promise.resolve();
  return timeout(new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-ekodi-google-identity]');
    if(existing){
      if(window.google?.accounts?.id){resolve();return}
      existing.addEventListener('load',resolve,{once:true});
      existing.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.dataset.ekodiGoogleIdentity='true';
    script.addEventListener('load',resolve,{once:true});script.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});document.head.append(script);
  }),7000,'google_library_timeout');
}
function myEntryTarget(){
  const target=new URL('https://my.ekodi.kr/');
  if(site&&site!=='portal'&&site!=='my')target.searchParams.set('from',site);
  return target;
}
function routeTarget(proof){
  if(!proof?.tokenHash)throw new Error('identity_handoff_missing');
  const target=commonServiceEntry&&proof.platformAdmin!==true?myEntryTarget():new URL(RETURN_TO);
  target.hash=new URLSearchParams({ekodi_token:proof.tokenHash,ekodi_type:proof.type||'email'}).toString();
  location.assign(target.href);
}
async function handoffExistingSession(s){
  if(routing)return true;
  routing=true;
  $('serviceBadge').textContent='인증 완료';
  show('googleButtonHost',false);show('googleRetry',false);show('cancelSignedOut',false);
  notice('로그인이 확인되었습니다. 서비스로 이동합니다.');
  try{
    const proof=await identity('/session/handoff',{method:'POST',authenticated:true,session:s});
    routeTarget(proof);
    return true;
  }catch(error){
    routing=false;
    console.error('central session handoff',error);
    return false;
  }
}
function showRetry(message){
  routing=false;
  $('serviceBadge').textContent='다시 시도';
  show('googleButtonHost',false);show('googleRetry',true);show('cancelSignedOut',true);
  notice(message,'error');
}
async function handleCredential(response,challenge){
  if(handlingCredential)return;
  if(!response?.credential){showRetry('Google 로그인이 완료되지 않았습니다. 다시 시도해 주세요.');return;}
  handlingCredential=true;
  $('serviceBadge').textContent='확인 중';
  show('googleButtonHost',false);show('googleRetry',false);show('cancelSignedOut',false);
  notice('Google 계정을 확인하고 있습니다.');
  try{
    const proof=await identity('/google/exchange',{method:'POST',body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});
    const {error}=await timeout(sb.auth.verifyOtp({token_hash:proof.tokenHash,type:proof.type||'email'}),10000,'verify_timeout');
    if(error)throw error;
    const s=await session();
    if(!s)throw new Error('session_not_created');
    handlingCredential=false;
    if(!(await handoffExistingSession(s)))throw new Error('session_handoff_failed');
  }catch(error){
    handlingCredential=false;
    console.error('central identity',error);
    const message=error.message==='challenge_expired_or_used'?'Google 로그인 시간이 만료되었습니다. 다시 시도해 주세요.':error.message==='identity_conflict'?'이 Google 계정은 다른 EKODI 사용자에 연결되어 있습니다. 관리자 확인이 필요합니다.':'Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.';
    showRetry(message);
  }
}
async function renderGoogle(){
  const host=$('googleButtonHost');host.replaceChildren();show('googleButtonHost',true);show('googleRetry',false);show('cancelSignedOut',false);
  $('serviceBadge').textContent='로그인';notice('Google 계정으로 계속해 주세요.');
  try{
    const [challenge]=await Promise.all([identity('/challenge',{method:'POST'}),loadGoogleLibrary()]);
    window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_button:true,button_auto_select:false,callback:r=>void handleCredential(r,challenge)});
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340)),use_fedcm_for_button:true});
    notice('처음 한 번만 Google 계정으로 본인을 확인합니다.');
  }catch(error){
    console.error('prepare central identity',error);
    showRetry('Google 로그인을 준비하지 못했습니다. 다시 시도해 주세요.');
  }
}
async function prepare(){
  routing=false;
  show('signedOut',true);show('signedIn',false);show('googleButtonHost',false);show('googleRetry',false);show('cancelSignedOut',false);
  $('serviceBadge').textContent='확인 중';notice('로그인 상태를 확인하고 있습니다.');
  let existing=null;
  try{existing=await session()}catch(error){console.warn('central session bootstrap',error)}
  if(existing){
    if(await handoffExistingSession(existing))return;
    showRetry('기존 로그인 연결을 완료하지 못했습니다. 다시 시도해 주세요.');
    return;
  }
  await renderGoogle();
}

$('googleRetry')?.addEventListener('click',prepare);
$('cancelSignedOut')?.addEventListener('click',()=>location.assign(RETURN_TO));
$('cancelSignedIn')?.addEventListener('click',()=>location.assign(RETURN_TO));
$('logout')?.addEventListener('click',async()=>{try{await timeout(sb.auth.signOut(),8000,'logout_timeout')}catch(error){console.warn(error)}await prepare()});

await prepare();
sb.auth.onAuthStateChange((event,s)=>{
  if((event==='SIGNED_IN'||event==='TOKEN_REFRESHED')&&s&&!routing&&!handlingCredential)queueMicrotask(()=>void handoffExistingSession(s));
  if(event==='SIGNED_OUT'){routing=false;}
});