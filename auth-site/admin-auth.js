const ADMIN_API='https://api.ekodi.kr';
const params=new URLSearchParams(location.search);
const rawReturn=params.get('return_to')||'https://admin.ekodi.kr/';
const safeReturn=(()=>{try{const u=new URL(rawReturn);return u.protocol==='https:'&&u.origin==='https://admin.ekodi.kr'?u.href:'https://admin.ekodi.kr/'}catch{return'https://admin.ekodi.kr/'}})();
const $=id=>document.getElementById(id);
$('serviceName').textContent='EKODI 관리자';
$('serviceBadge').textContent='관리자 전용';

function show(id,on=true){$(id)?.classList.toggle('hide',!on)}
function notice(text,type=''){const el=$('authStatus');el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}
async function request(path,options={}){const headers={...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${ADMIN_API}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data}
function loadGoogleLibrary(){if(window.google?.accounts?.id)return Promise.resolve();return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.addEventListener('load',resolve,{once:true});s.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});document.head.append(s)})}
async function prepare(){
  const host=$('googleButtonHost');host.replaceChildren();show('googleRetry',false);notice('관리자 전용 Google 인증을 준비하고 있습니다.');
  try{
    const [config,challenge]=await Promise.all([request('/api/google/config'),request('/api/google/challenge',{method:'POST'}),loadGoogleLibrary()]).then(([config,challenge])=>[config,challenge]);
    if(!config.clientId||!challenge.nonce)throw new Error('admin_google_not_ready');
    window.google.accounts.id.initialize({client_id:config.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_prompt:true,callback:async response=>{
      notice('관리자 Google 계정과 허용목록을 확인하고 있습니다.');
      try{
        const result=await request('/api/google/login',{method:'POST',body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});
        if(!result.token)throw new Error('admin_session_missing');
        const target=new URL(safeReturn);target.hash=new URLSearchParams({ekodi_admin_token:result.token}).toString();location.assign(target.href);
      }catch(e){notice(e.status===403?'이 Google 계정은 EKODI 관리자 허용목록에 없습니다.':'관리자 인증을 완료하지 못했습니다. 다시 시도해 주세요.','error');show('googleRetry',true)}
    }});
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340))});
    notice('사전등록된 관리자 Google 계정으로 본인을 확인해 주세요. 일반 회원 권한과 관리자 권한은 분리되어 있습니다.');
  }catch(e){console.error('admin central auth',e);notice('관리자 Google 인증 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.','error');show('googleRetry',true)}
}
$('googleRetry').addEventListener('click',prepare);
show('signedOut',true);show('signedIn',false);await prepare();
