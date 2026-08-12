import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const ACCESS=`${SUPABASE_URL}/functions/v1/access-api`;
const services={
  cgma:{name:'청계상권 · 정회원',tenant:'cheonggye',role:'member',returnTo:'https://cgma.ekodi.kr/member',requestable:true},
  marketing:{name:'마케팅AI',tenant:'ekodibiz',role:'store_owner',returnTo:'https://marketing.ekodi.kr',requestable:true},
  admin:{name:'EKODI 관리자',tenant:null,role:'platform_admin',returnTo:'https://admin.ekodi.kr',requestable:false},
  portal:{name:'EKODI',tenant:null,role:'member',returnTo:'https://ekodi.kr',requestable:false}
};
const params=new URLSearchParams(location.search);
const site=Object.hasOwn(services,params.get('site'))?params.get('site'):'portal';
const config=services[site];
const safeReturn=raw=>{try{const target=new URL(raw||config.returnTo);const allowed=new URL(config.returnTo);return target.protocol==='https:'&&target.origin===allowed.origin?target.href:config.returnTo}catch{return config.returnTo}};
const returnTo=safeReturn(params.get('return_to'));
const callbackUrl=`${location.origin}/?site=${encodeURIComponent(site)}&return_to=${encodeURIComponent(returnTo)}`;
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{flowType:'implicit',detectSessionInUrl:true,persistSession:true}});
const $=id=>document.getElementById(id);

$('serviceName').textContent=config.name;

async function session(){const {data}=await sb.auth.getSession();return data.session}
async function api(path,options={}){const s=await session();if(!s)throw new Error('login_required');const headers={apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${s.access_token}`,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${ACCESS}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={}}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data;}
function show(id,on=true){$(id)?.classList.toggle('hide',!on)}
function notice(id,text,type=''){const el=$(id);if(!el)return;el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}

async function probeGoogle(){
  let enabled=false;
  try{const r=await fetch(`${SUPABASE_URL}/auth/v1/settings`,{headers:{apikey:PUBLISHABLE_KEY},cache:'no-store'});const d=await r.json();enabled=d?.external?.google===true}catch{}
  $('googleLogin').disabled=!enabled;
  $('googleText').textContent=enabled?'Google 계정으로 계속':'Google 로그인 연결 준비 중';
  if(!enabled)notice('authStatus','중앙 권한 시스템은 준비되었습니다. Google OAuth 자격정보가 연결되면 이 버튼이 자동 활성화됩니다.','warn');
  return enabled;
}

async function renderAccess(s){
  show('signedOut',false);show('signedIn',true);$('accountEmail').textContent=s.user.email||'인증 계정';
  show('approvedActions',false);show('requestActions',false);
  try{
    const access=await api(`/me?site=${encodeURIComponent(site)}`);
    if(access.status==='active'||access.status==='pre_registered'){
      $('serviceBadge').textContent='접근 승인';
      notice('accessStatus',`${config.name} 접근권한이 확인되었습니다. 안전한 일회용 연결을 통해 서비스로 이동할 수 있습니다.`);
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

$('googleLogin').addEventListener('click',async()=>{
  if($('googleLogin').disabled)return;
  notice('authStatus','Google 인증 화면으로 이동합니다.');
  const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:callbackUrl}});
  if(error)notice('authStatus','Google 로그인 연결을 확인해 주세요.','error');
});

$('logout').addEventListener('click',async()=>{await sb.auth.signOut();history.replaceState({},document.title,`/?site=${encodeURIComponent(site)}&return_to=${encodeURIComponent(returnTo)}`);show('signedIn',false);show('signedOut',true);$('serviceBadge').textContent='권한 확인';await probeGoogle()});

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
    if(!d.action_link)throw new Error('handoff_unavailable');
    location.assign(d.action_link);
  }catch(e){
    notice('accessStatus',e.message==='auth_redirect_not_ready'?'서비스 이동용 인증 Redirect 설정이 아직 준비되지 않았습니다. Google 인증 설정과 함께 자동 활성화됩니다.':'안전한 서비스 연결을 만들지 못했습니다.','error');
    btn.disabled=false;btn.textContent='서비스로 안전하게 이동';
  }
});

await probeGoogle();
const {data:{session:initial}}=await sb.auth.getSession();
if(initial){history.replaceState({},document.title,`/?site=${encodeURIComponent(site)}&return_to=${encodeURIComponent(returnTo)}`);await renderAccess(initial)}
sb.auth.onAuthStateChange(async(event,s)=>{if(event==='SIGNED_IN'&&s){history.replaceState({},document.title,`/?site=${encodeURIComponent(site)}&return_to=${encodeURIComponent(returnTo)}`);await renderAccess(s)}if(event==='SIGNED_OUT'){show('signedIn',false);show('signedOut',true)}});
