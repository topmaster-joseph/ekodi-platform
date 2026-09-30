import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const AUTHOR_ACCESS=`${SUPABASE_URL}/functions/v1/author-access-api`;
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const AUTHOR_HOME='https://author.ekodi.kr/';
const params=new URLSearchParams(location.search);
function safeReturn(raw){
  if(!raw)return AUTHOR_HOME;
  try{
    const target=new URL(raw);
    if(target.protocol!=='https:'||target.origin!=='https://author.ekodi.kr')return AUTHOR_HOME;
    target.hash='';
    return target.href;
  }catch{return AUTHOR_HOME}
}
const RETURN_TO=safeReturn(params.get('return_to')||params.get('returnTo'));
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
const $=id=>document.getElementById(id);
const show=(id,on=true)=>$(id)?.classList.toggle('hide',!on);
function notice(id,text,type=''){const el=$(id);if(!el)return;el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}

$('serviceName').textContent='Creator AI';
$('signedOutCopy').textContent='Google 계정으로 본인을 확인하면 개인 크리에이터 스튜디오를 무료로 시작하고 My EKODI와 연결할 수 있습니다.';
show('requestActions',false);show('membershipPanel',false);show('identityPanel',false);

async function session(){const {data}=await sb.auth.getSession();return data.session}
async function identity(path,options={}){const headers={apikey:PUBLISHABLE_KEY,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const s=await session();if(options.authenticated&&s)headers.Authorization=`Bearer ${s.access_token}`;const r=await fetch(`${IDENTITY}${path}`,{...options,headers,cache:'no-store'});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`identity_${r.status}`);return data}
async function authorAccess(path,options={}){const s=await session();if(!s)throw new Error('login_required');const headers={apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${s.access_token}`,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${AUTHOR_ACCESS}${path}`,{...options,headers,cache:'no-store'});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`author_access_${r.status}`);return data}
function loadGoogle(){if(window.google?.accounts?.id)return Promise.resolve();return new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-ekodi-author-google]');if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return}const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.dataset.ekodiAuthorGoogle='true';script.onload=resolve;script.onerror=()=>reject(new Error('google_library_failed'));document.head.append(script)})}
function showSignedIn(s){show('signedOut',false);show('signedIn',true);$('accountEmail').textContent=s?.user?.email||'Google 계정';$('serviceBadge').textContent='인증 완료'}
function showSignedOut(){show('signedIn',false);show('signedOut',true);$('serviceBadge').textContent='인증 필요'}
async function handoff(){const space=await authorAccess('/workspace');const workspace=space.workspace;if(!workspace?.workspace_key||workspace?.status!=='active')throw new Error('creator_workspace_unavailable');notice('accessStatus','개인 크리에이터 스튜디오와 My EKODI 정체성을 연결하고 있습니다.');const data=await authorAccess('/handoff',{method:'POST',body:JSON.stringify({return_to:RETURN_TO,workspace_key:workspace.workspace_key})});if(!data.tokenHash||!data.returnTo)throw new Error('handoff_unavailable');const target=new URL(RETURN_TO);target.hash=new URLSearchParams({ekodi_token:data.tokenHash,ekodi_type:data.type||'email',ekodi_workspace:workspace.workspace_key}).toString();location.assign(target.href)}
async function routeSignedIn(s){showSignedIn(s);show('approvedActions',false);show('freeActions',false);show('workspacePanel',false);try{await handoff()}catch(error){console.error('creator handoff',error);notice('accessStatus','크리에이터 스튜디오 연결을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.','error');show('approvedActions',true);$('continueService').textContent='Creator AI 다시 연결';$('continueService').onclick=()=>handoff().catch(()=>notice('accessStatus','연결을 다시 시도하지 못했습니다.','error'))}}
async function handleCredential(response,challenge){if(!response?.credential)return;notice('authStatus','Google 계정을 확인하고 있습니다.');try{const proof=await identity('/google/exchange',{method:'POST',body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});const {error}=await sb.auth.verifyOtp({token_hash:proof.tokenHash,type:'email'});if(error)throw error;const s=await session();if(!s)throw new Error('session_not_created');await routeSignedIn(s)}catch(error){console.error('creator google auth',error);notice('authStatus','Google 본인 인증에 실패했습니다. 다시 시도해 주세요.','error');show('googleRetry',true)}}
async function prepareGoogle(){showSignedOut();show('googleButtonHost',true);show('googleRetry',false);show('cancelSignedOut',false);const host=$('googleButtonHost');host.replaceChildren();notice('authStatus','Google 인증을 준비하고 있습니다.');try{const [challenge]=await Promise.all([identity('/challenge',{method:'POST'}),loadGoogle()]);window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_prompt:true,callback:r=>handleCredential(r,challenge)});window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340))});notice('authStatus','Google 계정으로 본인을 확인하면 내 Creator AI 스튜디오로 이동합니다.')}catch(error){console.error(error);notice('authStatus','Google 인증을 준비하지 못했습니다. 다시 시도해 주세요.','error');show('googleRetry',true)}}

$('googleRetry').addEventListener('click',prepareGoogle);
$('cancelSignedOut').addEventListener('click',()=>location.assign(RETURN_TO));
$('cancelSignedIn').addEventListener('click',()=>location.assign(RETURN_TO));
$('logout').addEventListener('click',async()=>{await sb.auth.signOut();await prepareGoogle()});

const existing=await session();
if(existing) await routeSignedIn(existing); else await prepareGoogle();
