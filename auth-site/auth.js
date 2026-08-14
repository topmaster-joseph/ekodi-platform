import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const ACCESS=`${SUPABASE_URL}/functions/v1/access-api`;
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const services={
  cgma:{name:'청계상권 · 정회원',tenant:'cheonggye',role:'member',returnTo:'https://cgma.ekodi.kr/member',origins:['https://cgma.ekodi.kr'],requestable:true},
  marketing:{name:'마케팅AI',tenant:null,role:'store_owner',returnTo:'https://marketing.ekodi.kr',origins:['https://marketing.ekodi.kr','https://jadam.ekodi.kr','https://pizzamaru.ekodi.kr','https://yogurt.ekodi.kr'],requestable:true},
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
const marketing=site==='marketing';
const reviewMode=marketing&&params.get('review')==='1';
const explicitPro=marketing&&(params.get('plan')==='pro'||params.get('intent')==='pro');
const interactiveMode=reviewMode||explicitPro;
const safeReturn=raw=>{try{const target=new URL(raw||config.returnTo);return target.protocol==='https:'&&config.origins.includes(target.origin)?target.href:config.returnTo}catch{return config.returnTo}};
const returnTo=safeReturn(params.get('return_to'));
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
const $=id=>document.getElementById(id);
let routing=false;

$('serviceName').textContent=config.name;
if(marketing){
  $('signedOutCopy').textContent='Google 계정으로 무료회원이 됩니다. 인증 후 마케팅AI로 바로 돌아가 무료 기능을 이용할 수 있습니다.';
  $('requestAccess').textContent='Marketing AI Pro 사용신청';
  $('requestNote').placeholder='운영 중인 채널, 필요한 자동화 기능, 요청사항 등을 적어 주세요.';
  $('requestNoteLabel').firstChild.textContent='신청 메모 ';
  show('marketingApplication',true);
}

async function session(){const {data}=await sb.auth.getSession();return data.session}
async function api(path,options={}){const s=await session();if(!s)throw new Error('login_required');const headers={apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${s.access_token}`,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${ACCESS}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={}}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data;}
async function identity(path,options={}){const headers={apikey:PUBLISHABLE_KEY,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${IDENTITY}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={}}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data;}
function show(id,on=true){$(id)?.classList.toggle('hide',!on)}
function notice(id,text,type=''){const el=$(id);if(!el)return;el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}
function cleanUrl(){const q=new URLSearchParams({site,return_to:returnTo});if(reviewMode)q.set('review','1');if(explicitPro)q.set('plan','pro');history.replaceState({},document.title,`/?${q.toString()}`)}
function fmtDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?'확인 필요':d.toLocaleString('ko-KR')}
function escText(value){return String(value??'')}
function cancelToService(){location.assign(returnTo)}
function marketingFreeTarget(){
  try{
    const target=new URL(returnTo);
    if(target.origin==='https://marketing.ekodi.kr'){
      target.searchParams.set('welcome','free');
      target.hash='memberTrial';
    }
    return target.href;
  }catch{return 'https://marketing.ekodi.kr/?welcome=free#memberTrial'}
}
function showProcessing(text='Google 인증이 완료되었습니다. 요청한 서비스로 돌아가는 중입니다.'){
  $('serviceBadge').textContent='인증 완료';
  show('signedIn',false);show('signedOut',true);show('googleButtonHost',false);show('googleRetry',false);show('cancelSignedOut',false);
  notice('authStatus',text);
}
function showIdentityFailure(text){
  routing=false;$('serviceBadge').textContent='인증 실패';show('signedIn',false);show('signedOut',true);show('googleButtonHost',false);show('googleRetry',true);show('cancelSignedOut',true);notice('authStatus',text,'error');
}
function showAccessFallback(s,text,type='warn'){
  routing=false;show('signedOut',false);show('signedIn',true);$('accountEmail').textContent=s?.user?.email||'인증 계정';show('approvedActions',false);show('freeActions',false);show('requestActions',false);$('serviceBadge').textContent=type==='error'?'연결 실패':'권한 확인 필요';notice('accessStatus',text,type);
}

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
  if(!response?.credential){showIdentityFailure('Google 인증이 완료되지 않았습니다. 다시 시도하거나 취소해 주세요.');return;}
  showProcessing('Google 계정을 확인하고 있습니다. 잠시만 기다려 주세요.');
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
    showIdentityFailure(e.message==='challenge_expired_or_used'?'Google 인증 시간이 만료되었습니다. 다시 시도하거나 취소해 주세요.':'Google 본인 인증에 실패했습니다. 다시 시도하거나 취소해 주세요.');
  }
}

async function prepareGoogle(){
  routing=false;const host=$('googleButtonHost');host.replaceChildren();show('signedIn',false);show('signedOut',true);show('googleButtonHost',true);show('googleRetry',false);show('cancelSignedOut',false);$('serviceBadge').textContent='인증 필요';notice('authStatus',marketing?'Google 계정으로 무료회원 인증을 준비하고 있습니다.':'Google 인증을 준비하고 있습니다.');
  try{
    const [challenge]=await Promise.all([identity('/challenge',{method:'POST'}),loadGoogleLibrary()]);
    window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_prompt:true,callback:r=>handleGoogleCredential(r,challenge)});
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340))});
    notice('authStatus',marketing?'Google 계정으로 본인을 확인하면 마케팅AI 무료회원으로 바로 돌아갑니다.':'Google 계정으로 본인을 확인해 주세요. 인증이 끝나면 요청한 서비스로 바로 돌아갑니다.');
  }catch(e){
    console.error('prepare google identity',e);
    showIdentityFailure('Google 인증을 준비하지 못했습니다. 잠시 후 다시 시도하거나 취소해 주세요.');
  }
}

async function loadReviewConsole(){
  if(!reviewMode)return;
  show('reviewConsole',true);
  notice('reviewStatus','Marketing AI Pro 사용신청을 불러오는 중입니다.');
  const list=$('reviewList');list.replaceChildren();
  try{
    const data=await api('/pending?site=marketing');
    const requests=data.requests||[];
    if(!requests.length){notice('reviewStatus','현재 승인 대기 중인 Marketing AI Pro 신청이 없습니다.');return;}
    notice('reviewStatus',`승인 대기 ${requests.length}건입니다. 승인하면 독립 고객 테넌트와 기본 작업공간이 자동 생성됩니다.`);
    for(const item of requests){
      const card=document.createElement('article');card.className='review-item';
      const info=document.createElement('div');
      const title=document.createElement('h3');title.textContent=item.business_name||item.email||'신규 신청';
      const meta=document.createElement('div');meta.className='review-meta';
      for(const value of [item.email,`요금제 ${(item.requested_plan||'pro').toUpperCase()}`,item.contact_phone||'',item.business_number?`사업자 ${item.business_number}`:'',fmtDate(item.requested_at)]){
        if(!value)continue;const span=document.createElement('span');span.textContent=value;meta.append(span);
      }
      info.append(title,meta);
      if(item.applicant_note){const note=document.createElement('p');note.className='review-note';note.textContent=item.applicant_note;info.append(note);}
      const actions=document.createElement('div');actions.className='review-actions';
      const approve=document.createElement('button');approve.type='button';approve.textContent='승인';
      const reject=document.createElement('button');reject.type='button';reject.textContent='거절';reject.className='reject';
      const decide=async decision=>{
        approve.disabled=true;reject.disabled=true;
        try{
          const result=await api('/review',{method:'POST',body:JSON.stringify({request_id:item.id,decision})});
          if(decision==='approve'&&result.tenant){notice('reviewStatus',`${escText(result.tenant.name)} 승인 완료. 고객 테넌트 ${escText(result.tenant.slug)}가 연결되었습니다.`);}
          else notice('reviewStatus',decision==='approve'?'승인이 완료되었습니다.':'신청을 거절 처리했습니다.');
          await loadReviewConsole();
        }catch(e){notice('reviewStatus',e.message==='reviewer_required'?'플랫폼 관리자 권한이 필요합니다.':`검수 처리 실패: ${e.message}`,'error');approve.disabled=false;reject.disabled=false;}
      };
      approve.addEventListener('click',()=>decide('approve'));reject.addEventListener('click',()=>decide('reject'));
      actions.append(approve,reject);card.append(info,actions);list.append(card);
    }
  }catch(e){
    notice('reviewStatus',e.message==='reviewer_required'?'이 화면은 EKODI 플랫폼 관리자만 사용할 수 있습니다.':'사용신청 목록을 불러오지 못했습니다.','error');
  }
}

async function handoffToService(){
  const d=await api('/handoff',{method:'POST',body:JSON.stringify({site,return_to:returnTo})});
  if(!d.tokenHash||!d.returnTo)throw new Error('handoff_unavailable');
  const target=new URL(d.returnTo);target.hash=new URLSearchParams({ekodi_token:d.tokenHash,ekodi_type:d.type||'email'}).toString();
  location.assign(target.href);
}

async function renderInteractiveAccess(s){
  show('signedOut',false);show('signedIn',true);$('accountEmail').textContent=s.user.email||'인증 계정';show('approvedActions',false);show('freeActions',false);show('requestActions',false);
  try{
    const access=await api(`/me?site=${encodeURIComponent(site)}`);
    if(access.status==='active'||access.status==='pre_registered'){
      $('serviceBadge').textContent=marketing?`${String(access.plan||'pro').toUpperCase()} 이용중`:'접근 승인';
      notice('accessStatus',marketing?`Marketing AI ${String(access.plan||'pro').toUpperCase()} 권한이 확인되었습니다.`:`${config.name} 접근권한이 확인되었습니다.`);
      show('approvedActions',true);
    }else if(marketing){
      $('serviceBadge').textContent='무료회원';notice('accessStatus','Google 본인 인증은 완료되었습니다. Pro 기능을 신청하거나 취소해 원래 서비스로 돌아갈 수 있습니다.');show('freeActions',true);show('requestActions',true);show('marketingApplication',true);
    }else{
      $('serviceBadge').textContent='권한 확인 필요';
      if(config.requestable){notice('accessStatus','Google 본인 인증은 완료되었지만 이 서비스의 이용 권한이 없습니다. 권한을 신청하거나 다른 계정으로 다시 시도할 수 있습니다.','warn');show('requestActions',true);}
      else notice('accessStatus','Google 본인 인증은 완료되었지만 이 서비스의 이용 권한이 없습니다. 다른 계정으로 다시 시도하거나 취소해 주세요.','warn');
    }
    await loadReviewConsole();
  }catch{notice('accessStatus','본인 인증은 완료되었지만 서비스 권한을 확인하지 못했습니다. 다시 시도하거나 취소해 주세요.','error')}
}

async function renderAccess(s){
  if(interactiveMode){await renderInteractiveAccess(s);return;}
  if(routing)return;
  routing=true;$('accountEmail').textContent=s.user.email||'인증 계정';show('approvedActions',false);show('freeActions',false);show('requestActions',false);showProcessing();
  try{
    const access=await api(`/me?site=${encodeURIComponent(site)}`);
    if(access.status==='active'||access.status==='pre_registered'){
      try{await handoffToService();return;}
      catch(e){console.error('central handoff',e);showAccessFallback(s,'본인 인증은 완료되었지만 서비스 연결에 실패했습니다. 다시 이동을 시도하거나 취소해 주세요.','error');show('approvedActions',true);return;}
    }
    if(marketing){location.assign(marketingFreeTarget());return;}
    if(site==='portal'){location.assign(returnTo);return;}
    showAccessFallback(s,config.requestable?'본인 인증은 완료되었지만 이 서비스의 이용 권한이 없습니다. 권한을 신청하거나 다른 계정으로 다시 시도할 수 있습니다.':'본인 인증은 완료되었지만 이 서비스의 이용 권한이 없습니다. 다른 계정으로 다시 시도하거나 취소해 주세요.','warn');
    if(config.requestable)show('requestActions',true);
  }catch(e){console.error('central access check',e);showAccessFallback(s,'본인 인증은 완료되었지만 서비스 권한 확인에 실패했습니다. 다른 계정으로 다시 시도하거나 취소해 주세요.','error');}
}

$('googleRetry').addEventListener('click',prepareGoogle);
$('cancelSignedOut').addEventListener('click',cancelToService);
$('cancelSignedIn').addEventListener('click',cancelToService);
$('logout').addEventListener('click',async()=>{await sb.auth.signOut();cleanUrl();show('signedIn',false);show('signedOut',true);show('reviewConsole',false);$('serviceBadge').textContent='인증 필요';await prepareGoogle()});
$('continueFree').addEventListener('click',()=>location.assign(marketing?marketingFreeTarget():returnTo));
$('refreshReviews').addEventListener('click',loadReviewConsole);

$('requestAccess').addEventListener('click',async()=>{
  const btn=$('requestAccess');btn.disabled=true;
  try{
    const payload={site,tenant:config.tenant,role:config.role,note:$('requestNote').value.trim()};
    if(marketing){
      payload.plan='pro';
      payload.business_name=$('businessName').value.trim();
      payload.contact_phone=$('contactPhone').value.trim();
      payload.business_number=$('businessNumber').value.trim();
    }
    const d=await api('/request',{method:'POST',body:JSON.stringify(payload)});
    if(d.already_authorized){notice('requestStatus','이미 접근권한이 확인되었습니다. 서비스로 다시 이동합니다.');setTimeout(()=>location.reload(),500);return;}
    notice('requestStatus',d.already_pending?'이미 검수 중인 신청입니다. 승인되면 같은 Google 계정에 권한이 연결됩니다.':marketing?'Marketing AI Pro 사용신청이 접수되었습니다. 승인 후 같은 Google 계정으로 고급 기능을 이용할 수 있습니다.':'접근권한 신청이 접수되었습니다. 승인 후 같은 Google 계정으로 바로 이용할 수 있습니다.');
  }catch(e){notice('requestStatus',e.message==='tenant_not_found'?'신청 대상 조직을 확인하지 못했습니다.':marketing?'Pro 사용신청을 처리하지 못했습니다.':'접근권한 신청을 처리하지 못했습니다.','error')}
  finally{btn.disabled=false}
});

$('continueService').addEventListener('click',async()=>{
  const btn=$('continueService');btn.disabled=true;btn.textContent='서비스 연결 준비 중…';
  try{await handoffToService();}
  catch(e){notice('accessStatus','서비스 연결에 다시 실패했습니다. 다른 계정으로 재인증하거나 취소해 주세요.','error');btn.disabled=false;btn.textContent='서비스로 다시 이동';}
});

const {data:{session:initial}}=await sb.auth.getSession();
if(initial){cleanUrl();await renderAccess(initial)}else await prepareGoogle();
sb.auth.onAuthStateChange(async(event,s)=>{if(event==='SIGNED_IN'&&s){cleanUrl();await renderAccess(s)}if(event==='SIGNED_OUT'){routing=false;show('signedIn',false);show('signedOut',true);show('reviewConsole',false)}});
