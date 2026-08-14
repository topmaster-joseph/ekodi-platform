const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const realms={
  'community':{name:'EKODI Community',returnTo:'https://community.ekodi.kr/',open:true,kind:'community'},
  'mall-seller':{name:'EKODI Mall Seller',returnTo:'https://mall.ekodi.kr/seller/',open:true,kind:'seller'},
  'cgma-client':{name:'청계상권 고객관리',returnTo:'https://cgma.ekodi.kr/client/'},
  'jadam-client':{name:'자담치킨 목포대점 고객관리',returnTo:'https://jadam.ekodi.kr/'},
  'pizzamaru-client':{name:'피자마루 목포대점 고객관리',returnTo:'https://pizzamaru.ekodi.kr/'},
  'yogurt-client':{name:'요거트퍼플 목포대점 고객관리',returnTo:'https://yogurt.ekodi.kr/'},
};
const site=new URLSearchParams(location.search).get('site');
const config=realms[site]||realms['cgma-client'];
const $=id=>document.getElementById(id);

$('serviceName').textContent=config.name;
$('serviceBadge').textContent=config.open?(config.kind==='seller'?'무료 판매자 가입':'커뮤니티'):'Google 로그인';
const introTitle=document.querySelector('.intro h1');
const introCopy=document.querySelector('.intro p');
if(config.kind==='seller'){
  if(introTitle)introTitle.innerHTML='Google로 가입하고,<br>내 스토어를 시작하세요.';
  if(introCopy)introCopy.textContent='Google 계정으로 본인을 확인합니다. 로그인 후 판매자 상태와 이용 가능한 기능을 자동으로 확인합니다.';
  $('signedOutCopy').textContent='Google 계정으로 계속하면 무료 Seller 계정으로 연결됩니다. 실제 직접판매와 정산 권한은 확인된 상태에 따라 자동 적용됩니다.';
}else if(config.open){
  if(introTitle)introTitle.innerHTML='Google로 로그인하고,<br>내 활동을 이어가세요.';
  if(introCopy)introCopy.textContent='Google 계정으로 본인을 확인합니다. 로그인 후 프로필과 참여 범위를 불러와 필요한 공간으로 연결합니다.';
  $('signedOutCopy').textContent='Google 계정 하나로 로그인하고, 서비스별 참여 상태와 권한은 로그인 후 자동으로 적용합니다.';
}else{
  if(introTitle)introTitle.innerHTML='Google로 로그인하면,<br>등록된 역할이 자동 적용됩니다.';
  if(introCopy)introCopy.textContent='Google 계정으로 본인을 확인합니다. 점주·마케팅담당자·본사담당자·회계담당자 등 실제 역할은 사전등록된 이메일 권한을 서버가 자동으로 확인합니다.';
  $('signedOutCopy').textContent='사전등록된 Google 이메일과 일치하면 별도 점주 로그인이나 역할 선택 없이 등록된 권한이 자동 적용됩니다.';
}

function show(id,on=true){$(id)?.classList.toggle('hide',!on)}
function notice(text,type=''){const el=$('authStatus');el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}
async function identity(path,options={}){const headers={apikey:PUBLISHABLE_KEY,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${IDENTITY}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data}
function loadGoogleLibrary(){if(window.google?.accounts?.id)return Promise.resolve();return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.addEventListener('load',resolve,{once:true});s.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});document.head.append(s)})}

async function prepare(){
  const host=$('googleButtonHost');host.replaceChildren();show('googleRetry',false);
  const preparing=config.kind==='seller'?'EKODI Mall Google 로그인을 준비하고 있습니다.':config.open?'EKODI Community Google 로그인을 준비하고 있습니다.':'Google 로그인을 준비하고 있습니다.';
  notice(preparing);
  try{
    const [challenge]=await Promise.all([identity('/challenge',{method:'POST'}),loadGoogleLibrary()]);
    window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_prompt:true,callback:async response=>{
      const working=config.kind==='seller'?'Google 계정을 확인하고 Seller Studio로 연결하고 있습니다.':config.open?'Google 계정을 확인하고 Community로 연결하고 있습니다.':'Google 계정과 등록된 역할을 확인하고 있습니다.';
      notice(working);
      try{
        const proof=await identity('/google/exchange',{method:'POST',body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});
        if(!proof.tokenHash)throw new Error('identity_handoff_missing');
        const target=new URL(config.returnTo);target.hash=new URLSearchParams({ekodi_token:proof.tokenHash,ekodi_type:'email'}).toString();location.assign(target.href);
      }catch(e){console.error('central identity',e);notice('Google 본인확인을 완료하지 못했습니다. 다시 시도해 주세요.','error');show('googleRetry',true)}
    }});
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340))});
    const ready=config.kind==='seller'?'사용할 Google 계정으로 계속해 주세요.':config.open?'사용할 Google 계정으로 계속해 주세요.':'등록된 Google 계정으로 계속해 주세요. 역할과 권한은 로그인 후 자동으로 적용됩니다.';
    notice(ready);
  }catch(e){console.error('prepare central identity',e);notice('Google 인증 준비에 실패했습니다. 다시 시도해 주세요.','error');show('googleRetry',true)}
}

$('googleRetry').addEventListener('click',prepare);
show('signedOut',true);show('signedIn',false);show('reviewConsole',false);await prepare();
