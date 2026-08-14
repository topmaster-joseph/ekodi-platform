const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const realms={
  'community':{name:'EKODI Community',returnTo:'https://community.ekodi.kr/',open:true},
  'cgma-client':{name:'청계상권 고객관리',returnTo:'https://cgma.ekodi.kr/client/'},
  'jadam-client':{name:'자담치킨 목포대점 고객관리',returnTo:'https://jadam.ekodi.kr/'},
  'pizzamaru-client':{name:'피자마루 목포대점 고객관리',returnTo:'https://pizzamaru.ekodi.kr/'},
  'yogurt-client':{name:'요거트퍼플 목포대점 고객관리',returnTo:'https://yogurt.ekodi.kr/'},
};
const site=new URLSearchParams(location.search).get('site');
const config=realms[site]||realms['cgma-client'];
const $=id=>document.getElementById(id);

$('serviceName').textContent=config.name;
$('serviceBadge').textContent=config.open?'커뮤니티':'고객 전용';
const introTitle=document.querySelector('.intro h1');
const introCopy=document.querySelector('.intro p');
if(config.open){
  if(introTitle)introTitle.innerHTML='관심으로 만나고,<br>함께 시작하는 커뮤니티.';
  if(introCopy)introCopy.textContent='Google 계정으로 본인만 확인합니다. 관심사와 참여 범위는 EKODI Community에서 직접 선택하고 언제든 변경할 수 있습니다.';
  $('signedOutCopy').textContent='Google 계정으로 계속하면 EKODI Community 프로필을 만들고 관심사 기반 Circle과 사람을 발견할 수 있습니다.';
}else{
  if(introTitle)introTitle.innerHTML='등록한 계정 그대로,<br>고객공간까지 안전하게.';
  if(introCopy)introCopy.textContent='Google 계정으로 본인만 확인합니다. 실제 고객권한과 데이터는 각 고객 테넌트에서 별도로 검증합니다.';
  $('signedOutCopy').textContent='EKODI Control Center에 사전등록된 이메일과 같은 Google 계정으로 로그인하면 별도 비밀번호 없이 활성화됩니다.';
}

function show(id,on=true){$(id)?.classList.toggle('hide',!on)}
function notice(text,type=''){const el=$('authStatus');el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}
async function identity(path,options={}){const headers={apikey:PUBLISHABLE_KEY,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${IDENTITY}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data}
function loadGoogleLibrary(){if(window.google?.accounts?.id)return Promise.resolve();return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.addEventListener('load',resolve,{once:true});s.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});document.head.append(s)})}

async function prepare(){
  const host=$('googleButtonHost');host.replaceChildren();show('googleRetry',false);notice(config.open?'EKODI Community Google 인증을 준비하고 있습니다.':'사전등록 고객용 Google 인증을 준비하고 있습니다.');
  try{
    const [challenge]=await Promise.all([identity('/challenge',{method:'POST'}),loadGoogleLibrary()]);
    window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_prompt:true,callback:async response=>{
      notice(config.open?'Google 계정을 확인하고 Community로 안전하게 연결하고 있습니다.':'Google 계정을 확인하고 고객 관리공간으로 안전하게 연결하고 있습니다.');
      try{
        const proof=await identity('/google/exchange',{method:'POST',body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});
        if(!proof.tokenHash)throw new Error('identity_handoff_missing');
        const target=new URL(config.returnTo);target.hash=new URLSearchParams({ekodi_token:proof.tokenHash,ekodi_type:'email'}).toString();location.assign(target.href);
      }catch(e){console.error('central identity',e);notice('Google 본인확인을 완료하지 못했습니다. 다시 시도해 주세요.','error');show('googleRetry',true)}
    }});
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340))});
    notice(config.open?'사용할 Google 계정으로 계속해 주세요.':'Control Center에 등록된 고객 이메일과 같은 Google 계정으로 계속해 주세요.');
  }catch(e){console.error('prepare central identity',e);notice('Google 인증 준비에 실패했습니다. 다시 시도해 주세요.','error');show('googleRetry',true)}
}

$('googleRetry').addEventListener('click',prepare);
show('signedOut',true);show('signedIn',false);show('reviewConsole',false);await prepare();
