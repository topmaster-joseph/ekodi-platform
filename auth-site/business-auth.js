import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const HANDOFF=`${SUPABASE_URL}/functions/v1/business-handoff-api`;
const BUSINESS_HOME='https://business.ekodi.kr/';
const params=new URLSearchParams(location.search);
function safeReturn(raw){
  if(!raw)return BUSINESS_HOME;
  try{
    const target=new URL(raw);
    if(target.protocol!=='https:'||target.origin!=='https://business.ekodi.kr')return BUSINESS_HOME;
    target.hash='';
    return target.href;
  }catch{return BUSINESS_HOME}
}
const RETURN_TO=safeReturn(params.get('return_to')||params.get('returnTo'));
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
const $=id=>document.getElementById(id);
const show=(id,on=true)=>$(id)?.classList.toggle('hide',!on);
const notice=(id,text,type='')=>{const el=$(id);if(!el)return;el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')};

$('serviceName').textContent='EKODI Business OS';
$('signedOutCopy').textContent='Google 계정으로 본인을 확인한 뒤 EKODIBIZ 또는 연결된 점포의 Business OS 권한만 확인합니다.';
show('membershipPanel',false);show('identityPanel',false);show('requestActions',false);show('freeActions',false);show('approvedActions',false);show('workspacePanel',false);

async function session(){return (await sb.auth.getSession()).data.session}
async function identity(path,options={}){
  const headers={apikey:PUBLISHABLE_KEY,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';
  const response=await fetch(`${IDENTITY}${path}`,{...options,headers,cache:'no-store'});const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{}
  if(!response.ok)throw Object.assign(new Error(data.error||`http_${response.status}`),{status:response.status,data});return data;
}
function loadGoogleLibrary(){
  if(window.google?.accounts?.id)return Promise.resolve();
  return new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-ekodi-google-identity]');if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return}const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.dataset.ekodiGoogleIdentity='true';script.addEventListener('load',resolve,{once:true});script.addEventListener('error',()=>reject(new Error('google_library_failed')),{once:true});document.head.append(script)});
}
function showSignedIn(s){show('signedOut',false);show('signedIn',true);$('accountEmail').textContent=s?.user?.email||'인증 계정';$('serviceBadge').textContent='권한 확인'}
function showSignedOut(text='Google 계정으로 본인을 확인해 주세요.'){
  show('signedIn',false);show('signedOut',true);show('googleButtonHost',true);show('googleRetry',false);show('cancelSignedOut',false);$('serviceBadge').textContent='인증 필요';notice('authStatus',text);
}
async function issueHandoff(s){
  showSignedIn(s);notice('accessStatus','EKODIBIZ와 연결 점포의 Business OS 권한을 확인하고 있습니다.');
  const response=await fetch(HANDOFF,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,authorization:`Bearer ${s.access_token}`,'content-type':'application/json'},body:'{}',cache:'no-store'});
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{}
  if(response.status===403){notice('accessStatus','이 계정에는 아직 EKODIBIZ 또는 연결 점포의 Business OS 권한이 없습니다. 조직 관리자에게 권한을 요청해 주세요.','warn');return}
  if(!response.ok||!data.tokenHash)throw new Error(data.error||`handoff_${response.status}`);
  const target=new URL(RETURN_TO);target.hash=new URLSearchParams({ekodi_token:data.tokenHash,ekodi_type:data.type||'email',ekodi_workspace:data.workspace||'ekodibiz'}).toString();location.assign(target.href);
}
async function handleGoogleCredential(response,challenge){
  if(!response?.credential){notice('authStatus','Google 인증이 완료되지 않았습니다. 다시 시도해 주세요.','error');return}
  notice('authStatus','Google 계정을 확인하고 있습니다.');
  try{
    const proof=await identity('/google/exchange',{method:'POST',body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});
    const {error}=await sb.auth.verifyOtp({token_hash:proof.tokenHash,type:'email'});if(error)throw error;
    const s=await session();if(!s)throw new Error('session_not_created');await issueHandoff(s);
  }catch(error){console.error('business auth',error);showSignedOut('Business OS 인증을 완료하지 못했습니다. 다시 시도해 주세요.');show('googleRetry',true)}
}
async function prepareGoogle(){
  const host=$('googleButtonHost');host.replaceChildren();showSignedOut('Google 인증을 준비하고 있습니다.');
  try{
    const [challenge]=await Promise.all([identity('/challenge',{method:'POST'}),loadGoogleLibrary()]);
    window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_prompt:true,callback:r=>handleGoogleCredential(r,challenge)});
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340))});
    notice('authStatus','Google 계정으로 EKODI Business OS 권한을 확인합니다.');
  }catch(error){console.error(error);notice('authStatus','Google 인증을 준비하지 못했습니다. 다시 시도해 주세요.','error');show('googleRetry',true)}
}
async function logout(){await sb.auth.signOut();prepareGoogle()}

$('googleRetry')?.addEventListener('click',prepareGoogle);
$('cancelSignedOut')?.addEventListener('click',()=>location.assign(RETURN_TO));
$('cancelSignedIn')?.addEventListener('click',()=>location.assign(RETURN_TO));
$('logout')?.addEventListener('click',logout);

const existing=await session();if(existing){try{await issueHandoff(existing)}catch(error){console.error(error);showSignedIn(existing);notice('accessStatus','Business OS 연결을 완료하지 못했습니다. 다시 인증하거나 잠시 후 다시 시도해 주세요.','error')}}else await prepareGoogle();