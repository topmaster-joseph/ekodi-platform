const ADMIN_API='https://ekodi.kr';
const params=new URLSearchParams(location.search);
const directEntry=params.get('direct')==='1';
const directBridgeRoot=document.documentElement;
const CANONICAL_AUTH_ORIGIN='https://ekodi.kr';
const GOOGLE_BRIDGE_ORIGIN='https://auth.ekodi.kr';
let directFallbackTimer=0;
const rawReturn=params.get('return_to')||'https://ekodi.kr/admin/';
const safeReturn=(()=>{try{const u=new URL(rawReturn);if(u.protocol!=='https:')return'https://ekodi.kr/admin/';if(u.origin==='https://admin.ekodi.kr'||(u.origin==='https://ekodi.kr'&&u.pathname.startsWith('/admin')))return u.href;if(u.origin==='https://ai.ekodi.kr'&&u.pathname==='/')return u.href;if(u.origin==='https://tax.ekodi.kr'&&(u.pathname==='/'||u.pathname==='/index.html'))return u.href;if(u.origin==='https://ekodi.kr'&&(u.pathname==='/ekodibiz/mall/admin'||u.pathname==='/ekodibiz/mall/admin/'||u.pathname.startsWith('/ekodibiz/mall/admin/')))return u.href;return'https://ekodi.kr/admin/'}catch{return'https://ekodi.kr/admin/'}})();
const $=id=>document.getElementById(id);
$('serviceName').textContent='EKODI 관리자';
$('serviceBadge').textContent='관리자 전용';

const ua=String(navigator.userAgent||'');
const isAndroid=/Android/i.test(ua);
const isEmbeddedWebView=/\bwv\b|;\s*wv\)|ChatGPT|FBAN|FBAV|Instagram|KAKAOTALK|NAVER\(inapp|Line\//i.test(ua);

function show(id,on=true){$(id)?.classList.toggle('hide',!on)}
function clearDirectFallback(message='등록된 관리자 Google 계정을 선택해 주세요.'){if(directFallbackTimer){window.clearTimeout(directFallbackTimer);directFallbackTimer=0}if(directEntry)directBridgeRoot.dataset.adminDirectBridge='prompt';notice(message)}
function revealDirectFallback(message='Google 계정 선택창이 자동으로 열리지 않았습니다. 아래 Google 로그인 버튼을 눌러 주세요.'){if(directFallbackTimer){window.clearTimeout(directFallbackTimer);directFallbackTimer=0}if(directEntry)directBridgeRoot.dataset.adminDirectBridge='fallback';notice(message,'error')}
function notice(text,type=''){const el=$('authStatus');el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}
async function request(path,options={}){const headers={...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${ADMIN_API}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data}
function requestGoogleCredential(config,challenge){
  return new Promise((resolve,reject)=>{
    const state=(crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')).replace(/[^a-zA-Z0-9._-]/g,'');
    const target=new URL('/google-origin-bridge',GOOGLE_BRIDGE_ORIGIN);
    target.searchParams.set('client_id',config.clientId);target.searchParams.set('nonce',challenge.nonce);target.searchParams.set('state',state);
    const popup=window.open(target.href,'ekodi_google_origin_bridge','popup,width=520,height=680,resizable=yes,scrollbars=yes');
    if(!popup){reject(Object.assign(new Error('google_popup_blocked'),{code:'GOOGLE_POPUP_BLOCKED'}));return}
    let settled=false;const finish=(error,data)=>{if(settled)return;settled=true;window.removeEventListener('message',onMessage);clearTimeout(timer);clearInterval(watch);try{if(!popup.closed)popup.close()}catch{};error?reject(error):resolve(data)};
    const onMessage=event=>{if(event.origin!==GOOGLE_BRIDGE_ORIGIN||event.source!==popup)return;const data=event.data||{};if(data.type!=='ekodi-google-origin-bridge'||data.state!==state||data.nonce!==challenge.nonce||!data.credential)return;finish(null,data)};
    window.addEventListener('message',onMessage);
    const timer=setTimeout(()=>finish(Object.assign(new Error('google_bridge_timeout'),{code:'GOOGLE_BRIDGE_TIMEOUT'})),120000);
    const watch=setInterval(()=>{try{if(popup.closed)finish(Object.assign(new Error('google_bridge_closed'),{code:'GOOGLE_BRIDGE_CLOSED'}))}catch{}},500);
    try{popup.focus()}catch{}
  })
}
async function completeGoogleLogin(credential,challenge){
  notice('관리자 Google 계정과 허용목록을 확인하고 있습니다.');
  const result=await request('/api/google/login',{method:'POST',body:JSON.stringify({credential,nonce:challenge.nonce})});
  if(!result.token)throw new Error('admin_session_missing');
  navigateToAdmin(result);
}
function renderOriginBridgeButton(host,config,challenge){
  const button=document.createElement('button');button.type='button';button.className='google-btn';button.textContent='Google 계정으로 계속하기';
  button.addEventListener('click',async()=>{button.disabled=true;show('googleRetry',false);try{const proof=await requestGoogleCredential(config,challenge);await completeGoogleLogin(proof.credential,challenge)}catch(e){
    const expired=e?.status===400&&/만료|이미 사용/.test(String(e?.data?.error||''));if(expired){notice('Google 로그인 확인 시간이 지나 새 인증 요청을 준비합니다. 잠시만 기다려 주세요.','error');setTimeout(prepare,350);return}
    const bridgeProblem=['GOOGLE_POPUP_BLOCKED','GOOGLE_BRIDGE_TIMEOUT','GOOGLE_BRIDGE_CLOSED'].includes(e?.code);notice(bridgeProblem?'Google 인증 창을 열지 못했거나 닫혔습니다. 다시 시도해 주세요.':loginFailureMessage(e),'error');button.disabled=false;show('googleRetry',true)
  }});host.append(button);
}
function loginFailureMessage(error){
  if(error?.status===403&&error?.data?.code==='GOOGLE_ACCOUNT_NOT_ALLOWED')return'이 Google 계정은 EKODI 관리자 허용목록에 없습니다. 등록된 관리자 계정을 선택해 주세요.';
  if(error?.status===403)return error?.data?.error||'이 Google 계정은 EKODI 관리자 권한이 없습니다.';
  if(error?.status===503)return'Google 관리자 인증 서버가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.';
  return error?.data?.error||'관리자 인증을 완료하지 못했습니다. 다시 시도해 주세요.';
}
function currentAuthUrl(){
  const u=new URL(location.href);
  u.hash='';
  return u.href;
}
function androidChromeIntent(url){
  const plain=String(url).replace(/^https:\/\//i,'');
  return `intent://${plain}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
function renderExternalBrowserGate(message='이 앱 안의 브라우저에서는 Google 로그인이 안정적으로 지원되지 않습니다.'){
  const host=$('googleButtonHost');
  host.replaceChildren();
  const link=document.createElement('a');
  link.className='google-btn';
  link.textContent=isAndroid?'Chrome에서 관리자 로그인 열기':'기본 브라우저에서 관리자 로그인 열기';
  const authUrl=currentAuthUrl();
  link.href=isAndroid?androidChromeIntent(authUrl):authUrl;
  if(!isAndroid){link.target='_blank';link.rel='noopener noreferrer external';}
  host.append(link);
  notice(`${message} 외부 브라우저에서 다시 열면 인증 후 관리자 화면으로 자동 이동합니다.`,'error');
  show('googleRetry',false);
}
function preparationFailureMessage(error){
  if(error?.data?.code==='AUTH_STORE_DAILY_LIMIT'){
    let reset='';
    try{
      if(error.data.retryAt)reset=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(error.data.retryAt));
    }catch{}
    return reset?'관리자 인증 저장소의 일일 사용량 한도에 도달했습니다. '+reset+' 이후 다시 시도해 주세요.':'관리자 인증 저장소의 일일 사용량 한도에 도달했습니다. 저장소 한도가 초기화된 뒤 다시 시도해 주세요.';
  }
  if(error?.status===503)return error?.data?.error||'관리자 Google 인증 서버가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.';
  return '관리자 Google 인증 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}
function showNavigationFallback(targetHref){
  const host=$('googleButtonHost');
  host.replaceChildren();
  const link=document.createElement('a');
  link.className='google-btn';
  link.href=targetHref;
  link.textContent='인증 완료 · 관리자 화면 열기';
  link.rel='noreferrer';
  host.append(link);
  notice('Google 인증은 완료됐지만 자동 화면 이동이 지연되고 있습니다. 아래 버튼을 한 번 누르면 관리자 화면으로 이어집니다.','error');
}
function navigateToAdmin(result){
  const target=new URL(safeReturn);
  target.hash=new URLSearchParams({ekodi_admin_token:result.token}).toString();
  const targetHref=target.href;
  notice('관리자 인증이 완료되었습니다. 관리자 화면으로 이동합니다.');
  window.setTimeout(()=>{
    if(location.hostname==='auth.ekodi.kr')showNavigationFallback(targetHref);
  },1200);
  try{location.replace(targetHref)}catch{
    try{location.assign(targetHref)}catch{showNavigationFallback(targetHref)}
  }
}
async function prepare(){
  if(directFallbackTimer){window.clearTimeout(directFallbackTimer);directFallbackTimer=0}
  const host=$('googleButtonHost');host.replaceChildren();show('googleRetry',false);notice('관리자 전용 Google 인증을 준비하고 있습니다.');
  if(isEmbeddedWebView){if(directEntry)directBridgeRoot.dataset.adminDirectBridge='fallback';renderExternalBrowserGate();return;}
  try{
    const [config,challenge]=await Promise.all([request('/api/google/config'),request('/api/google/challenge',{method:'POST'})]);
    if(!config.clientId||!challenge.nonce)throw new Error('admin_google_not_ready');
    if(location.origin===CANONICAL_AUTH_ORIGIN){
      renderOriginBridgeButton(host,config,challenge);
      if(directEntry)directBridgeRoot.dataset.adminDirectBridge='prompt';
      notice('등록된 관리자 Google 계정을 선택해 주세요. 인증 창은 기존 승인된 Google 인증 원점을 사용하고 완료 후 이 화면으로 돌아옵니다.');
      return;
    }
    throw Object.assign(new Error('unexpected_admin_auth_origin'),{code:'UNEXPECTED_ADMIN_AUTH_ORIGIN'});
  }catch(e){console.error('admin central auth',e);if(directEntry)directBridgeRoot.dataset.adminDirectBridge='fallback';notice(preparationFailureMessage(e),'error');show('googleRetry',true)}
}
$('googleRetry').addEventListener('click',prepare);
show('signedOut',true);show('signedIn',false);await prepare();
