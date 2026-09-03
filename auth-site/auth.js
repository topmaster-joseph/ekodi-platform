import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const ACCESS=`${SUPABASE_URL}/functions/v1/access-api`;
const PERSON_WORKSPACE=`${SUPABASE_URL}/functions/v1/workspace-api`;
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const services={
  cgma:{name:'청계상권 · 정회원',tenant:'cheonggye',role:'member',returnTo:'https://ekodi.kr/cgma/member',origins:['https://ekodi.kr','https://cgma.or.kr','https://cgma.ekodi.kr'],requestable:true},
  marketing:{name:'마케팅AI',tenant:null,role:'store_owner',returnTo:'https://marketing.ekodi.kr',origins:['https://marketing.ekodi.kr','https://jadam.ekodi.kr','https://pizzamaru.ekodi.kr','https://yogurt.ekodi.kr','https://yogurtpurple.ekodi.kr'],requestable:true},
  biz:{name:'에코디비즈',tenant:'ekodibiz',role:'member',returnTo:'https://biz.ekodi.kr',origins:['https://biz.ekodi.kr'],requestable:true},
  trade:{name:'EKODI Global Trading',tenant:'ekodi-biz',role:'member',returnTo:'https://ekodi.kr/ekodibiz/trade',origins:['https://ekodi.kr','https://trade.biz.ekodi.kr','https://trade.ekodi.kr'],requestable:false},
  mall:{name:'에코디몰',tenant:null,role:'member',returnTo:'https://ekodi.kr/ekodibiz/mall',origins:['https://ekodi.kr','https://mall.ekodi.kr'],requestable:true},
  pay:{name:'에코디결제',tenant:null,role:'member',returnTo:'https://pay.ekodi.kr',origins:['https://pay.ekodi.kr'],requestable:false},
  books:{name:'에코디북스',tenant:null,role:'member',returnTo:'https://books.ekodi.kr',origins:['https://books.ekodi.kr'],requestable:true},
  church:{name:'에코디교회',tenant:null,role:'member',returnTo:'https://church.ekodi.kr',origins:['https://church.ekodi.kr'],requestable:true},
  lab:{name:'에코디연구소',tenant:null,role:'member',returnTo:'https://lab.ekodi.kr',origins:['https://lab.ekodi.kr'],requestable:true},
  mission:{name:'커뮤니티',tenant:null,role:'member',returnTo:'https://mission.ekodi.kr',origins:['https://mission.ekodi.kr'],requestable:true},
  community:{name:'커뮤니티',tenant:null,role:'member',returnTo:'https://community.ekodi.kr',origins:['https://community.ekodi.kr'],requestable:true},
  edu:{name:'에코디교육',tenant:null,role:'member',returnTo:'https://edu.ekodi.kr',origins:['https://edu.ekodi.kr'],requestable:true},
  media:{name:'에코디미디어',tenant:null,role:'member',returnTo:'https://media.ekodi.kr',origins:['https://media.ekodi.kr'],requestable:true},
  social:{name:'EKODI Social',tenant:null,role:'member',returnTo:'https://social.ekodi.kr',origins:['https://social.ekodi.kr'],requestable:false},
  energy:{name:'Energy AI',tenant:null,role:'member',returnTo:'https://energy.ekodi.kr',origins:['https://energy.ekodi.kr'],requestable:false},
  admin:{name:'EKODI 관리자',tenant:null,role:'platform_admin',returnTo:'https://admin.ekodi.kr',origins:['https://admin.ekodi.kr'],requestable:false},
  portal:{name:'EKODI',tenant:null,role:'member',returnTo:'https://ekodi.kr',origins:['https://ekodi.kr'],requestable:false}
};
const PERSON_SCOPED_SITES=new Set(['social','energy']);
const params=new URLSearchParams(location.search);
const site=Object.hasOwn(services,params.get('site'))?params.get('site'):'portal';
const config=services[site];
const requestedWorkspace=String(params.get('workspace')||'').trim();
const SERVICE_API=PERSON_SCOPED_SITES.has(site)?PERSON_WORKSPACE:ACCESS;
const marketing=site==='marketing';
const reviewMode=marketing&&params.get('review')==='1';
const explicitPro=marketing&&(params.get('plan')==='pro'||params.get('intent')==='pro');
const manageMode=params.get('manage')==='1';
const interactiveMode=reviewMode||explicitPro||manageMode;
function isMarketingReturnOrigin(origin){
  if(config.origins.includes(origin))return true;
  try{const u=new URL(origin);return u.protocol==='https:'&&/^[a-z0-9-]+\.ai\.ekodi\.kr$/i.test(u.hostname)&&u.origin===origin}catch{return false}
}
const safeReturn=raw=>{try{const target=new URL(raw||config.returnTo);if(target.protocol!=='https:'||target.username||target.password)return config.returnTo;const cgmaPlatform=site==='cgma'&&target.origin==='https://ekodi.kr'&&(target.pathname==='/cgma'||target.pathname.startsWith('/cgma/'));return ((config.origins.includes(target.origin)&&target.origin!=='https://ekodi.kr')||cgmaPlatform||(marketing&&isMarketingReturnOrigin(target.origin)))?target.href:config.returnTo}catch{return config.returnTo}};
const returnTo=safeReturn(params.get('return_to'));
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
const $=id=>document.getElementById(id);
let routing=false;
let currentWorkspaces=[];
let fallbackWorkspaceKey=null;

$('serviceName').textContent=config.name;
if(marketing){
  $('signedOutCopy').textContent='Google 계정으로 무료회원이 됩니다. 개인 공간은 바로 사용할 수 있고, 사업장·단체 공간은 별도 권한으로 연결됩니다.';
  $('requestAccess').textContent='Marketing AI Pro 사용신청';
  $('requestNote').placeholder='운영 중인 채널, 필요한 자동화 기능, 요청사항 등을 적어 주세요.';
  $('requestNoteLabel').firstChild.textContent='신청 메모 ';
  show('marketingApplication',true);
}

async function session(){const {data}=await sb.auth.getSession();return data.session}
async function api(path,options={}){const s=await session();if(!s)throw new Error('login_required');const headers={apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${s.access_token}`,...(options.headers||{})};if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${SERVICE_API}${path}`,{...options,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={}}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data;}
async function identity(path,options={}){const {authenticated=false,...fetchOptions}=options;const headers={apikey:PUBLISHABLE_KEY,...(fetchOptions.headers||{})};if(authenticated){const s=await session();if(!s)throw new Error('login_required');headers.Authorization=`Bearer ${s.access_token}`;}if(fetchOptions.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(`${IDENTITY}${path}`,{...fetchOptions,headers,cache:'no-store'});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={}}if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});return data;}
function show(id,on=true){$(id)?.classList.toggle('hide',!on)}
function notice(id,text,type=''){const el=$(id);if(!el)return;el.textContent=text;el.className=`notice${type?` ${type}`:''}`;el.classList.remove('hide')}
function cleanUrl(){const q=new URLSearchParams({site,return_to:returnTo});if(requestedWorkspace)q.set('workspace',requestedWorkspace);if(reviewMode)q.set('review','1');if(explicitPro)q.set('plan','pro');if(manageMode)q.set('manage','1');history.replaceState({},document.title,`/?${q.toString()}`)}
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
function showSignedIn(s){
  show('signedOut',false);show('signedIn',true);$('accountEmail').textContent=s?.user?.email||'인증 계정';
}
function resetSignedInPanels(){
  show('approvedActions',false);show('freeActions',false);show('requestActions',false);show('workspacePanel',false);
}
function showAccessFallback(s,text,type='warn'){
  routing=false;showSignedIn(s);resetSignedInPanels();$('serviceBadge').textContent=type==='error'?'연결 실패':'권한 확인 필요';notice('accessStatus',text,type);
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
  showProcessing('Google 계정을 확인하고 있습니다.');
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
    const message=e.message==='challenge_expired_or_used'?'Google 인증 시간이 만료되었습니다. 다시 시도해 주세요.':e.message==='identity_conflict'?'이 Google 계정은 다른 EKODI 사용자에 이미 연결되어 있습니다. 관리자 확인이 필요합니다.':'Google 본인 인증에 실패했습니다. 다시 시도하거나 취소해 주세요.';
    showIdentityFailure(message);
  }
}

async function prepareGoogle(){
  routing=false;const host=$('googleButtonHost');host.replaceChildren();show('signedIn',false);show('signedOut',true);show('googleButtonHost',true);show('googleRetry',false);show('cancelSignedOut',false);$('serviceBadge').textContent='인증 필요';notice('authStatus',marketing?'Google 계정으로 무료회원 인증을 준비하고 있습니다.':'Google 인증을 준비하고 있습니다.');
  try{
    const [challenge]=await Promise.all([identity('/challenge',{method:'POST'}),loadGoogleLibrary()]);
    window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_prompt:true,callback:r=>handleGoogleCredential(r,challenge)});
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(390,Math.max(260,host.clientWidth||340))});
    notice('authStatus',marketing?'Google 계정으로 본인을 확인하면 개인 Marketing AI 공간을 바로 이용할 수 있습니다.':'Google 계정으로 본인을 확인해 주세요.');
  }catch(e){
    console.error('prepare google identity',e);
    showIdentityFailure('Google 인증을 준비하지 못했습니다. 다시 시도하거나 취소해 주세요.');
  }
}

function workspaceKindLabel(kind){return kind==='personal'?'개인':kind==='business'?'사업장':'단체'}
function workspacePlanLabel(plan){return String(plan||'standard').toUpperCase()}
function authorizedWorkspaces(items){return items.filter(item=>item?.requires_handoff===true&&['active','pre_registered'].includes(String(item?.status||'')))}

async function handoffToService(workspaceKey=null){
  const d=await api('/handoff',{method:'POST',body:JSON.stringify({site,return_to:returnTo,workspace_key:workspaceKey||undefined})});
  if(!d.tokenHash||!d.returnTo)throw new Error('handoff_unavailable');
  const target=new URL(d.returnTo);
  const fragment={ekodi_token:d.tokenHash,ekodi_type:d.type||'email'};
  if(d.workspace?.workspace_key)fragment.ekodi_workspace=d.workspace.workspace_key;
  if(d.workspace?.tenant_id)fragment.ekodi_tenant=d.workspace.tenant_id;
  if(d.workspace?.store_id)fragment.ekodi_store=d.workspace.store_id;
  window.__EKODI_WORKSPACE_ROUTING=true;
  target.hash=new URLSearchParams(fragment).toString();
  location.assign(target.href);
}

async function openWorkspace(item,button){
  if(button){button.disabled=true;button.classList.add('loading')}
  try{
    if(item.requires_handoff===false&&marketing){location.assign(marketingFreeTarget());return;}
    await handoffToService(item.workspace_key);
  }catch(e){
    console.error('workspace handoff',e);
    notice('accessStatus','선택한 공간으로 연결하지 못했습니다. 다른 공간을 선택하거나 다시 인증해 주세요.','error');
    if(button){button.disabled=false;button.classList.remove('loading')}
  }
}

function renderWorkspacePanel(items){
  currentWorkspaces=Array.isArray(items)?items:[];
  const list=$('workspaceList');list.replaceChildren();
  if(!currentWorkspaces.length){show('workspacePanel',false);return;}
  show('workspacePanel',true);$('workspaceCount').textContent=`${currentWorkspaces.length}개`;
  for(const item of currentWorkspaces){
    const button=document.createElement('button');button.type='button';button.className='workspace-card';
    const text=document.createElement('span');text.className='workspace-copy';
    const name=document.createElement('strong');name.textContent=item.workspace_name||item.store_name||'내 공간';
    const meta=document.createElement('span');meta.className='workspace-meta';
    const parts=[workspaceKindLabel(item.workspace_kind),workspacePlanLabel(item.plan)];
    if(item.store_name&&item.store_name!==item.workspace_name)parts.push(item.store_name);
    meta.textContent=parts.join(' · ');
    text.append(name,meta);
    const arrow=document.createElement('span');arrow.className='workspace-arrow';arrow.textContent='→';
    button.append(text,arrow);button.addEventListener('click',()=>openWorkspace(item,button));list.append(button);
  }
}

async function loadWorkspaces(){
  const data=await api(`/workspaces?site=${encodeURIComponent(site)}`);
  currentWorkspaces=Array.isArray(data.workspaces)?data.workspaces:[];
  return currentWorkspaces;
}

function renderIdentityList(items){
  const host=$('linkedAccounts');host.replaceChildren();
  for(const item of items||[]){
    const row=document.createElement('div');row.className='linked-account';
    const left=document.createElement('div');
    const email=document.createElement('strong');email.textContent=item.email||'Google 계정';
    const meta=document.createElement('span');meta.textContent=item.is_primary?'기본 로그인':'연결된 로그인';
    left.append(email,meta);
    const badge=document.createElement('span');badge.className='provider-badge';badge.textContent='Google';
    row.append(left,badge);host.append(row);
  }
}

async function loadLinkedIdentities(){
  show('identityPanel',true);
  try{
    const data=await identity('/identities',{method:'GET',authenticated:true});
    renderIdentityList(data.identities||[]);
    $('addGoogleAccount').disabled=Boolean(data.reloginRequired);
    if(data.reloginRequired)notice('identityLinkStatus','현재 세션은 새 통합 프로필에 아직 연결되지 않았습니다. 다른 계정으로 다시 로그인하면 자동으로 전환됩니다.','warn');
    else show('identityLinkStatus',false);
  }catch(e){
    console.error('linked identities',e);
    $('addGoogleAccount').disabled=true;
    notice('identityLinkStatus','연결된 로그인 계정을 확인하지 못했습니다.','error');
  }
}

async function handleLinkCredential(response,challenge){
  const button=$('addGoogleAccount');
  if(!response?.credential){button.disabled=false;notice('identityLinkStatus','추가할 Google 계정을 선택하지 못했습니다. 다시 시도해 주세요.','error');return;}
  notice('identityLinkStatus','새 Google 계정의 소유권을 확인하고 연결하고 있습니다.');
  try{
    const data=await identity('/google/link/exchange',{method:'POST',authenticated:true,body:JSON.stringify({credential:response.credential,nonce:challenge.nonce})});
    renderIdentityList(data.identities||[]);show('linkGoogleButtonHost',false);button.disabled=false;
    notice('identityLinkStatus',`${data.linked?.email||'Google 계정'}이 같은 EKODI 사용자에게 연결되었습니다.`);
    const workspaces=await loadWorkspaces();renderWorkspacePanel(workspaces);
  }catch(e){
    console.error('link google identity',e);button.disabled=false;show('linkGoogleButtonHost',false);
    const message=e.message==='identity_already_linked'?'이 Google 계정은 다른 EKODI 사용자에 이미 연결되어 있어 자동으로 합칠 수 없습니다. 관리자 확인이 필요합니다.':e.message==='challenge_expired_or_used'?'계정 추가 인증 시간이 만료되었습니다. 다시 시도해 주세요.':'Google 계정 연결에 실패했습니다.';
    notice('identityLinkStatus',message,'error');
  }
}

async function prepareLinkGoogle(){
  const button=$('addGoogleAccount');button.disabled=true;notice('identityLinkStatus','추가로 사용할 Google 계정을 선택해 주세요.');
  try{
    const [challenge]=await Promise.all([identity('/google/link/challenge',{method:'POST',authenticated:true}),loadGoogleLibrary()]);
    const host=$('linkGoogleButtonHost');host.replaceChildren();show('linkGoogleButtonHost',true);
    window.google.accounts.id.disableAutoSelect?.();
    window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,use_fedcm_for_prompt:true,callback:r=>handleLinkCredential(r,challenge)});
    window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'medium',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(360,Math.max(250,host.clientWidth||320))});
  }catch(e){
    console.error('prepare link google',e);button.disabled=false;show('linkGoogleButtonHost',false);
    notice('identityLinkStatus',e.message==='relogin_required'?'새 통합 프로필을 만들기 위해 먼저 다시 로그인해 주세요.':'Google 계정 추가 인증을 준비하지 못했습니다.','error');
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

async function renderInteractiveAccess(s,workspaces){
  routing=false;showSignedIn(s);resetSignedInPanels();renderWorkspacePanel(workspaces);await loadLinkedIdentities();
  const authorized=authorizedWorkspaces(workspaces);fallbackWorkspaceKey=authorized[0]?.workspace_key||null;
  if(manageMode&&site==='portal'){
    $('serviceBadge').textContent='계정 관리';notice('accessStatus','한 사람에게 연결된 로그인 계정을 관리합니다. 서비스 권한과 데이터는 각 공간에 그대로 분리되어 있습니다.');
  }else if(authorized.length){
    $('serviceBadge').textContent=workspaces.length>1?`${workspaces.length}개 공간`:`${workspacePlanLabel(authorized[0].plan)} 이용중`;
    notice('accessStatus',workspaces.length>1?'사용할 개인·사업장·단체 공간을 선택해 주세요.':`${config.name} 이용 권한이 확인되었습니다.`);
    if(workspaces.length===1)show('approvedActions',true);
  }else if(marketing){
    $('serviceBadge').textContent='무료회원';notice('accessStatus','개인 Marketing AI 공간은 바로 사용할 수 있습니다. 사업장이나 단체용 Pro 공간은 별도로 신청할 수 있습니다.');show('freeActions',true);
  }else{
    $('serviceBadge').textContent='권한 확인 필요';notice('accessStatus',config.requestable?'Google 본인 인증은 완료되었지만 이 서비스의 이용 권한이 없습니다.':'이 서비스의 이용 권한이 없습니다.','warn');
  }
  if(marketing&&explicitPro){show('requestActions',true);show('marketingApplication',true);$('requestAccess').textContent=authorized.length?'새 사업장 Pro 추가 신청':'Marketing AI Pro 사용신청';}
  else if(!authorized.length&&config.requestable&&!manageMode)show('requestActions',true);
  await loadReviewConsole();
}

async function renderAccess(s){
  if(routing&&!interactiveMode)return;
  try{
    const workspaces=await loadWorkspaces();
    if(interactiveMode){await renderInteractiveAccess(s,workspaces);return;}
    const authorized=authorizedWorkspaces(workspaces);fallbackWorkspaceKey=authorized[0]?.workspace_key||null;
    const requested=authorized.find(item=>item.workspace_key===requestedWorkspace);

    if(site==='portal'){location.assign(returnTo);return;}
    if(requested){
      routing=true;showProcessing(`${requested.workspace_name||'선택한 Workspace'}로 연결하고 있습니다.`);
      try{await handoffToService(requested.workspace_key);return;}
      catch(e){console.error('requested workspace handoff',e);showAccessFallback(s,'선택한 Workspace를 다시 확인하지 못했습니다. 다른 공간을 선택하거나 다시 인증해 주세요.','error');await loadLinkedIdentities();return;}
    }
    if(authorized.length>0){
      routing=true;showProcessing('Google 인증이 완료되었습니다. 원래 이용하던 서비스로 돌아가는 중입니다.');
      try{await handoffToService();return;}
      catch(e){
        console.error('seamless central handoff',e);
        routing=false;showSignedIn(s);resetSignedInPanels();renderWorkspacePanel(workspaces);await loadLinkedIdentities();
        $('serviceBadge').textContent=workspaces.length>1?`${workspaces.length}개 공간`:'연결 재시도';
        notice('accessStatus','자동 복귀가 지연되어 사용할 공간을 선택할 수 있게 열었습니다.','warn');
        if(workspaces.length===1)show('approvedActions',true);
        return;
      }
    }
    if(marketing){location.assign(marketingFreeTarget());return;}
    showAccessFallback(s,config.requestable?'본인 인증은 완료되었지만 이 서비스의 이용 권한이 없습니다. 권한을 신청하거나 다른 계정으로 다시 시도할 수 있습니다.':'본인 인증은 완료되었지만 이 서비스의 이용 권한이 없습니다. 다른 계정으로 다시 시도하거나 취소해 주세요.','warn');
    await loadLinkedIdentities();if(config.requestable)show('requestActions',true);await loadReviewConsole();
  }catch(e){
    console.error('central access check',e);showAccessFallback(s,'본인 인증은 완료되었지만 서비스 권한 확인에 실패했습니다. 다른 계정으로 다시 시도하거나 취소해 주세요.','error');
  }
}

$('googleRetry').addEventListener('click',prepareGoogle);
$('cancelSignedOut').addEventListener('click',cancelToService);
$('cancelSignedIn').addEventListener('click',cancelToService);
$('logout').addEventListener('click',async()=>{await sb.auth.signOut();cleanUrl();show('signedIn',false);show('signedOut',true);show('reviewConsole',false);show('identityPanel',false);$('serviceBadge').textContent='인증 필요';await prepareGoogle()});
$('continueFree').addEventListener('click',()=>location.assign(marketing?marketingFreeTarget():returnTo));
$('refreshReviews').addEventListener('click',loadReviewConsole);
$('addGoogleAccount').addEventListener('click',prepareLinkGoogle);

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
    if(d.already_authorized){notice('requestStatus','이미 이 공간의 접근권한이 확인되어 있습니다.');return;}
    notice('requestStatus',d.already_pending?'이미 검수 중인 신청입니다. 승인되면 현재 EKODI 사용자에게 새 공간이 연결됩니다.':marketing?'Marketing AI Pro 사용신청이 접수되었습니다. 승인 후 새 사업장·단체 공간으로 추가됩니다.':'접근권한 신청이 접수되었습니다. 승인 후 현재 EKODI 사용자에게 권한이 연결됩니다.');
  }catch(e){notice('requestStatus',e.message==='tenant_not_found'?'신청 대상 조직을 확인하지 못했습니다.':marketing?'Pro 사용신청을 처리하지 못했습니다.':'접근권한 신청을 처리하지 못했습니다.','error')}
  finally{btn.disabled=false}
});

$('continueService').addEventListener('click',async()=>{
  const btn=$('continueService');btn.disabled=true;btn.textContent='서비스 연결 준비 중…';
  try{await handoffToService(fallbackWorkspaceKey);}
  catch(e){notice('accessStatus','서비스 연결에 다시 실패했습니다. 다른 계정으로 재인증하거나 취소해 주세요.','error');btn.disabled=false;btn.textContent='서비스로 다시 이동';}
});

const {data:{session:initial}}=await sb.auth.getSession();
if(initial){cleanUrl();await renderAccess(initial)}else await prepareGoogle();
sb.auth.onAuthStateChange(async(event,s)=>{if(event==='SIGNED_IN'&&s){cleanUrl();await renderAccess(s)}if(event==='SIGNED_OUT'){routing=false;show('signedIn',false);show('signedOut',true);show('reviewConsole',false);show('identityPanel',false)}});