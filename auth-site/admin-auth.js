const ADMIN_API='https://api.ekodi.kr';
const params=new URLSearchParams(location.search);
const directEntry=params.get('direct')==='1';
const rawReturn=params.get('return_to')||'https://admin.ekodi.kr/';
const safeReturn=(()=>{try{const u=new URL(rawReturn);if(u.protocol!=='https:')return'https://admin.ekodi.kr/';if(u.origin==='https://admin.ekodi.kr')return u.href;if(u.origin==='https://ai.ekodi.kr'&&u.pathname==='/')return u.href;if(u.origin==='https://tax.ekodi.kr'&&(u.pathname==='/'||u.pathname==='/index.html'))return u.href;if(u.origin==='https://ekodi.kr'&&(u.pathname==='/admin'||u.pathname==='/admin/'||u.pathname==='/ekodibiz/mall/admin'||u.pathname==='/ekodibiz/mall/admin/'))return u.href;return'https://admin.ekodi.kr/'}catch{return'https://admin.ekodi.kr/'}})();
const $=id=>document.getElementById(id);
$('serviceName').textContent='EKODI 관리자';
$('serviceBadge').textContent='관리자 전용';

const ua=String(navigator.userAgent||'');
const isAndroid=/Android/i.test(ua);
const isIos=/iPhone|iPad|iPod/i.test(ua);
const isEmbeddedWebView=/\bwv\b|;\s*wv\)|ChatGPT|FBAN|FBAV|Instagram|KAKAOTALK|NAVER\(inapp|Line\//i.test(ua);

function show(id,on=true){$(id)?.classList.toggle('hide',!on)}
function notice(text,type=''){const el=$('authStatus');el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}
async function request(path,options={}){const headers={...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${ADMIN_API}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data}
function loadGoogleLibrary(){if(window.google?.accounts?.id)return Promise.resolve();return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.addEventListener('load',resolve,{once:true});s.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});document.head.append(s)})}
function loginFailureMessage(error){
  if(error?.status===403&&error?.data?.code==='GOOGLE_ACCOUNT_NOT_ALLOWED')return'이 Google 계정은 EKODI 관리자 허용목록에 없습니다. 등록된 관리자 계정을 선택해 주세요.';
  if(error?.status===403)return error?.data?.error||'이 Google 계정은 EKODI 관리자 권한이 없습니다.';
  if(error?.status===503)return'Google 관리자 인증 서버가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.';
  return error?.data?.error||'관리자 인증을 완료하지 못했습니다. 다시 시도해 주세요.';
}
function supportsFedCmButton(){
  if(isEmbeddedWebView||isIos)return false;
  const match=ua.match(/Chrome\/(\d+)/i);
  if(!match||/EdgA?|OPR|SamsungBrowser/i.test(ua))return false;
  const major=Number(match[1]||0);
  return isAndroid?major>=128:major>=125;
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
  const host=$('googleButtonHost');host.replaceChildren();show('googleRetry',false);notice(directEntry?'Google 관리자 계정 선택창을 준비하고 있습니다.':'관리자 전용 Google 인증을 준비하고 있습니다.');
  if(isEmbeddedWebView){renderExternalBrowserGate();return;}
  try{
    const [config,challenge]=await Promise.all([request('/api/google/config'),request('/api/google/challenge',{method:'POST'}),loadGoogleLibrary()]).then(([config,challenge])=>[config,challenge]);
    if(!config.clientId||!challenge.nonce)throw new Error('admin_google_not_ready');
    window.google.accounts.id.disableAutoSelect?.();
    window.google.accounts.id.initialize({
      client_id:config.clientId,
      nonce:challenge.nonce,
      auto_select:false,
      use_fedcm_for_button:supportsFedCmButton(),
      button_auto_select:false,
      ux_mode:'popup',
      context:'signin',
      callback:async response=>{
        notice('관리자 Google 계정과 허용목록을 확인하고 있습니다.');
        try{
          if(!response?.credential)throw new Error('google_credential_missing');
          const result=await request('/api/google/login',{method:'POST',body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});
          if(!result.token)throw new Error('admin_session_missing');
          navigateToAdmin(result);
        }catch(e){
          const expired=e?.status===400&&/만료|이미 사용/.test(String(e?.data?.error||''));
          if(expired){
            console.warn('expired_challenge');
            notice('Google 로그인 확인 시간이 지나 새 인증 요청을 준비합니다. 잠시만 기다려 주세요.','error');
            setTimeout(prepare,350);
            return;
          }
          notice(loginFailureMessage(e),'error');show('googleRetry',true);
        }
      }
    });
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340))});
    if(directEntry){
      notice('등록된 관리자 Google 계정을 선택해 주세요. 계정 선택창을 자동으로 엽니다.');
      try{window.google.accounts.id.prompt()}catch(error){console.warn('admin direct Google prompt',error)}
    }else notice('등록된 관리자 Google 계정을 선택해 주세요. 계정 선택 후 EKODI 관리자 허용목록을 다시 확인합니다.');
  }catch(e){console.error('admin central auth',e);notice('관리자 Google 인증 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.','error');show('googleRetry',true)}
}
$('googleRetry').addEventListener('click',prepare);
show('signedOut',true);show('signedIn',false);await prepare();
