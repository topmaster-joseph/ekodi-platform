import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const ACCESS=`${SUPABASE_URL}/functions/v1/access-api`;
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const services={
  cgma:{name:'청계상권 · 정회원',tenant:'cheonggye',role:'member',returnTo:'https://cgma.ekodi.kr/member',origins:['https://cgma.ekodi.kr'],requestable:true},
  marketing:{name:'마케팅AI',tenant:'ekodibiz',role:'store_owner',returnTo:'https://marketing.ekodi.kr',origins:['https://marketing.ekodi.kr','https://jadam.ekodi.kr','https://pizzamaru.ekodi.kr','https://yogurtpurple.ekodi.kr'],requestable:true},
  biz:{name:'에코디비즈',tenant:'ekodibiz',role:'member',returnTo:'https://biz.ekodi.kr',origins:['https://biz.ekodi.kr'],requestable:true},
  trade:{name:'EKODI Global Trading',tenant:'ekodibiz',role:'member',returnTo:'https://trade.ekodi.kr',origins:['https://trade.ekodi.kr'],requestable:true},
  mall:{name:'에코디몰',tenant:null,role:'member',returnTo:'https://mall.ekodi.kr',origins:['https://mall.ekodi.kr'],requestable:true},
  pay:{name:'에코디결제',tenant:null,role:'member',returnTo:'https://pay.ekodi.kr',origins:['https://pay.ekodi.kr'],requestable:false},
  books:{name:'에코디북스',tenant:null,role:'member',returnTo:'https://books.ekodi.kr',origins:['https://books.ekodi.kr'],requestable:true},
  church:{name:'에코디교회',tenant:null,role:'member',returnTo:'https://church.ekodi.kr',origins:['https://church.ekodi.kr'],requestable:true},
  lab:{name:'에코디연구소',tenant:null,role:'member',returnTo:'https://lab.ekodi.kr',origins:['https://lab.ekodi.kr'],requestable:true},
  mission:{name:'에코디선교회',tenant:null,role:'member',returnTo:'https://mission.ekodi.kr',origins:['https://mission.ekodi.kr'],requestable:true},
  community:{name:'에코디커뮤니티',tenant:null,role:'member',returnTo:'https://community.ekodi.kr',origins:['https://community.ekodi.kr'],requestable:true},
  edu:{name:'에코디교육',tenant:null,role:'member',returnTo:'https://edu.ekodi.kr',origins:['https://edu.ekodi.kr'],requestable:true},
  media:{name:'에코디미디어',tenant:null,role:'member',returnTo:'https://media.ekodi.kr',origins:['https://media.ekodi.kr'],requestable:true},
  admin:{name:'EKODI 관리자',tenant:null,role:'platform_admin',returnTo:'https://admin.ekodi.kr',origins:['https://admin.ekodi.kr'],requestable:false},
  portal:{name:'EKODI',tenant:null,role:'member',returnTo:'https://ekodi.kr',origins:['https://ekodi.kr'],requestable:false}
};
const params=new URLSearchParams(location.search);
const site=Object.hasOwn(services,params.get('site'))?params.get('site'):'portal';
const config=services[site];
const safeReturn=raw=>{try{const target=new URL(raw||config.returnTo);return target.protocol==='https:'&&config.origins.includes(target.origin)?target.href:config.returnTo}catch{return config.returnTo}};
const returnTo=safeReturn(params.get('return_to'));
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
const $=id=>document.getElementById(id);

$('serviceName').textContent=config.name;

async function session(){const {data}=await sb.auth.getSession();return data.session}
async function api(path,options={}){const s=await session();if(!s)throw new Error('login_required');const headers={apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${s.access_token}`,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${ACCESS}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={}}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data;}
async function identity(path,options={}){const headers={apikey:PUBLISHABLE_KEY,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${IDENTITY}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={}}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data;}
function show(id,on=true){$(id)?.classList.toggle('hide',!on)}
function notice(id,text,type=''){const el=$(id);if(!el)return;el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}
function cleanUrl(){history.replaceState({},document.title,`/?site=${encodeURIComponent(site)}&return_to=${encodeURIComponent(returnTo)}`)}

function loadGoogleLibrary(){
  if(window.google?.accounts?.id)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-ekodi-google-identity]');
    if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
    const script=document.createElement('script');
    script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.dataset.ekodiGoogleIdentity='true';
    script.addEventListener('load',resolve,{once:true});script.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});document.head.append(script);
  });
}

async function handleGoogleCredential(response,challenge){
  notice('authStatus','Google 계정을 확인하고 EKODI 세션을 만드는 중입니다.');
  try{
    const proof=await identity('/google/exchange',{method:'POST',body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});
    const {error}=await sb.auth.verifyOtp({token_hash:proof.tokenHash,type:'email'});
    if(error)throw error;
    const s=await session();
    if(!s)throw new Error('session_not_created');
    cleanUrl();
    await renderAccess(s);
  }catch(e){
    console.error('central google identity',e);
    notice('authStatus',e.message==='challenge_expired_or_used'?'Google 인증 시간이 만료되었습니다. 다시 준비해 주세요.':'Google 본인확인을 완료하지 못했습니다. 다시 시도해 주세요.','error');
    show('googleRetry',true);
  }
}

async function prepareGoogle(){
  const host=$('googleButtonHost');host.replaceChildren();show('googleRetry',false);notice('authStatus','Google 인증을 준비하고 있습니다.');
  try{
    const [challenge]=await Promise.all([identity('/challenge',{method:'POST'}),loadGoogleLibrary()]);
    window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_prompt:true,callback:r=>handleGoogleCredential(r,challenge)});
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340))});
    notice('authStatus','Google 계정으로 본인을 확인해 주세요. 서비스별 권한은 인증 후 별도로 확인합니다.');
  }catch(e){
    console.error('prepare google identity',e);
    notice('authStatus','Google 인증 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.','error');show('googleRetry',true);
  }
}

async function renderAccess(s){
  show('signedOut',false);show('signedIn',true);$('accountEmail').textContent=s.user.email||'인증 계정';
  show('approvedActions',false);show('requestActions',false);
  try{
    const access=await api(`/me?site=${encodeURIComponent(site)}`);
    if(access.status==='active'||access.status==='pre_registered'){
      $('serviceBadge').textContent='접근 승인';
      notice('accessStatus',`${config.name} 접근권한이 확인되었습니다. 일회용 연결 토큰으로 안전하게 이동할 수 있습니다.`);
      show('approvedActions',true);
      return;
    }
    $('serviceBadge').textContent='미등록 계정';
    if(config.requestable){
      notice('accessStatus','Google 계정은 확인됐지만 이 서비스의 사전등록 권한이 없습니다. 인증 신청 후 관리자가 승인하면 같은 계정에 권한이 자동 연결됩니다.','warn');
      show('requestActions',true);
    }else{
      notice('accessStatus','이 서비스는 사전등록된 계정만 접근할 수 있습니다. 관리자에게 계정 등록을 요청해 주세요.','warn');
    }
  }catch{notice('accessStatus','중앙 접근권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.','error')}
}

$('googleRetry').addEventListener('click',prepareGoogle);
$('logout').addEventListener('click',async()=>{await sb.auth.signOut();cleanUrl();show('signedIn',false);show('signedOut',true);$('serviceBadge').textContent='권한 확인';await prepareGoogle()});

$('requestAccess').addEventListener('click',async()=>{
  const btn=$('requestAccess');btn.disabled=true;
  try{
    const payload={site,tenant:config.tenant,role:config.role,note:$('requestNote').value.trim()};
    const d=await api('/request',{method:'POST',body:JSON.stringify(payload)});
    if(d.already_authorized){notice('requestStatus','이미 접근권한이 확인되었습니다. 새로고침합니다.');setTimeout(()=>location.reload(),500);return;}
    notice('requestStatus',d.already_pending?'이미 검수 중인 신청입니다.':'접근권한 신청이 접수되었습니다. 승인 후 같은 Google 계정으로 바로 이용할 수 있습니다.');
  }catch{notice('requestStatus','접근권한 신청을 처리하지 못했습니다.','error')}
  finally{btn.disabled=false}
});

$('continueService').addEventListener('click',async()=>{
  const btn=$('continueService');btn.disabled=true;btn.textContent='안전한 연결 준비 중…';
  try{
    const d=await api('/handoff',{method:'POST',body:JSON.stringify({site,return_to:returnTo})});
    if(!d.tokenHash||!d.returnTo)throw new Error('handoff_unavailable');
    const target=new URL(d.returnTo);target.hash=new URLSearchParams({ekodi_token:d.tokenHash,ekodi_type:d.type||'email'}).toString();
    location.assign(target.href);
  }catch(e){
    notice('accessStatus','서비스용 일회용 연결을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.','error');
    btn.disabled=false;btn.textContent='서비스로 안전하게 이동';
  }
});

const {data:{session:initial}}=await sb.auth.getSession();
if(initial){cleanUrl();await renderAccess(initial)}else await prepareGoogle();
sb.auth.onAuthStateChange(async(event,s)=>{if(event==='SIGNED_IN'&&s){cleanUrl();await renderAccess(s)}if(event==='SIGNED_OUT'){show('signedIn',false);show('signedOut',true)}});
