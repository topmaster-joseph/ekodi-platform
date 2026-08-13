const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const RETURN_TO='https://cgma.ekodi.kr/client/';
const $=id=>document.getElementById(id);

$('serviceName').textContent='청계상권 고객관리';
$('serviceBadge').textContent='고객 전용';
const introTitle=document.querySelector('.intro h1');
const introCopy=document.querySelector('.intro p');
if(introTitle)introTitle.innerHTML='한 계정으로,<br>고객공간까지 안전하게.';
if(introCopy)introCopy.textContent='Google 계정으로 본인만 확인합니다. 실제 고객권한과 데이터는 청계상권 고객 테넌트에서 별도로 검증합니다.';
$('signedOutCopy').textContent='초대로 등록된 고객 이메일과 Google 계정이 일치할 때만 고객 관리공간을 사용할 수 있습니다.';

function show(id,on=true){$(id)?.classList.toggle('hide',!on)}
function notice(text,type=''){const el=$('authStatus');el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}
async function identity(path,options={}){const headers={apikey:PUBLISHABLE_KEY,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${IDENTITY}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data}
function loadGoogleLibrary(){if(window.google?.accounts?.id)return Promise.resolve();return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.addEventListener('load',resolve,{once:true});s.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});document.head.append(s)})}

async function prepare(){
  const host=$('googleButtonHost');host.replaceChildren();show('googleRetry',false);notice('고객 전용 Google 인증을 준비하고 있습니다.');
  try{
    const [challenge]=await Promise.all([identity('/challenge',{method:'POST'}),loadGoogleLibrary()]);
    window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_prompt:true,callback:async response=>{
      notice('Google 계정을 확인하고 고객 관리공간으로 안전하게 연결하고 있습니다.');
      try{
        const proof=await identity('/google/exchange',{method:'POST',body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});
        if(!proof.tokenHash)throw new Error('identity_handoff_missing');
        const target=new URL(RETURN_TO);target.hash=new URLSearchParams({ekodi_token:proof.tokenHash,ekodi_type:'email'}).toString();location.assign(target.href);
      }catch(e){console.error('client central identity',e);notice('Google 본인확인을 완료하지 못했습니다. 다시 시도해 주세요.','error');show('googleRetry',true)}
    }});
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340))});
    notice('초대받은 고객 이메일과 같은 Google 계정으로 계속해 주세요.');
  }catch(e){console.error('prepare client identity',e);notice('고객 Google 인증 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.','error');show('googleRetry',true)}
}

$('googleRetry').addEventListener('click',prepare);
show('signedOut',true);show('signedIn',false);show('reviewConsole',false);await prepare();
