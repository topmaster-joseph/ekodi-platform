import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const IDENTITY=`${SUPABASE_URL}/functions/v1/identity-api`;
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
const fixedRealms=Object.freeze({
  my:{name:'My EKODI',returnTo:'https://my.ekodi.kr/'},
  community:{name:'EKODI Community',returnTo:'https://community.ekodi.kr/'},
  work:{name:'EKODI Work',returnTo:'https://work.ekodi.kr/'},
  messenger:{name:'EKODI Messenger',returnTo:'https://messenger.ekodi.kr/'},
  invest:{name:'EKODI Investment',returnTo:'https://invest.ekodi.kr/'},
  'cgma-client':{name:'청계상권 고객관리',returnTo:'https://cgma.ekodi.kr/client/'},
  'jadam-client':{name:'자담치킨 목포대점 고객관리',returnTo:'https://jadam.ai.ekodi.kr/'},
  'pizzamaru-client':{name:'피자마루 목포대점 고객관리',returnTo:'https://pizzamaru.ai.ekodi.kr/'},
  'yogurt-client':{name:'요거트퍼플 목포대점 고객관리',returnTo:'https://yogurt.ai.ekodi.kr/'},
});
const params=new URLSearchParams(location.search);
const site=params.get('site')||'';

function show(id,on=true){document.getElementById(id)?.classList.toggle('hide',!on)}
function confirmedKey(id){return `ekodi:client-confirmed:${id}:v1`}
function isConfirmed(id){try{return localStorage.getItem(confirmedKey(id))==='1'}catch{return false}}
function markConfirmed(id){try{localStorage.setItem(confirmedKey(id),'1')}catch{}}

async function manifestRealm(id){
  if(!id)return null;
  try{
    const response=await fetch('https://shell.ekodi.kr/manifest.json',{cache:'no-store'});
    if(!response.ok)return null;
    const manifest=await response.json();
    const service=manifest?.services?.find(item=>item.id===id);
    if(!service||service.sso!==true||service.authMode!=='client')return null;
    return {name:service.name||service.shortName||id,returnTo:service.url};
  }catch{return null}
}

async function realmFor(id){return fixedRealms[id]||await manifestRealm(id)}

function safeReturn(realm,raw){
  const fallback=new URL(realm.returnTo);
  if(!raw)return fallback.href;
  try{
    const target=new URL(raw);
    if(target.protocol!=='https:'||target.username||target.password||target.origin!==fallback.origin)return fallback.href;
    target.hash='';
    return target.href;
  }catch{return fallback.href}
}

function probeReturn(realm){
  const target=new URL(safeReturn(realm,params.get('return_to')||params.get('returnTo')));
  target.searchParams.set('sso_checked','1');
  target.searchParams.set('auth','required');
  target.hash='';
  return target.href;
}

async function centralSession(){
  try{const {data}=await sb.auth.getSession();return data.session||null}catch{return null}
}

async function handoff(session,realm){
  const target=new URL(safeReturn(realm,params.get('return_to')||params.get('returnTo')));
  const response=await fetch(`${IDENTITY}/session/handoff`,{
    method:'POST',
    headers:{apikey:PUBLISHABLE_KEY,authorization:`Bearer ${session.access_token}`},
    cache:'no-store',
  });
  const text=await response.text();
  let data={};
  try{data=text?JSON.parse(text):{}}catch{}
  if(!response.ok||!data.tokenHash)throw new Error(data.error||'session_handoff_failed');
  target.hash=new URLSearchParams({ekodi_token:data.tokenHash,ekodi_type:data.type||'email'}).toString();
  markConfirmed(site);
  location.assign(target.href);
}

function renderConfirmation(session,realm){
  const introTitle=document.querySelector('.intro h1');
  const introCopy=document.querySelector('.intro p');
  if(introTitle)introTitle.innerHTML='다시 인증하지 않고,<br>확인 한 번으로 시작합니다.';
  if(introCopy)introCopy.textContent='이미 EKODI 통합 로그인이 확인되었습니다. 처음 방문한 서비스만 한 번 연결을 확인하고, 다음부터는 바로 이어집니다.';
  const serviceName=document.getElementById('serviceName');
  const serviceBadge=document.getElementById('serviceBadge');
  const email=document.getElementById('accountEmail');
  const status=document.getElementById('accessStatus');
  const continueButton=document.getElementById('continueService');
  if(serviceName)serviceName.textContent=realm.name;
  if(serviceBadge)serviceBadge.textContent='처음 연결';
  if(email)email.textContent=session.user?.email||'EKODI 계정';
  if(status){status.textContent='Google 인증은 이미 완료되어 있습니다. 이 서비스와 EKODI 계정을 연결할지만 확인해 주세요.';status.className='notice success'}
  show('signedOut',false);show('signedIn',true);show('approvedActions',true);
  for(const id of ['workspacePanel','identityPanel','membershipPanel','freeActions','requestActions'])show(id,false);
  if(continueButton){
    continueButton.textContent='확인하고 시작';
    continueButton.onclick=async()=>{
      continueButton.disabled=true;
      if(status){status.textContent='연결을 확인했습니다. 서비스로 이동합니다.';status.className='notice success'}
      try{await handoff(session,realm)}catch(error){
        console.error('first visit handoff',error);
        continueButton.disabled=false;
        if(status){status.textContent='연결을 마치지 못했습니다. 다시 한 번 확인해 주세요.';status.className='notice error'}
      }
    };
  }
  const cancel=document.getElementById('cancelSignedIn');
  if(cancel){cancel.textContent='나중에';cancel.onclick=()=>location.assign('https://my.ekodi.kr/')}
  const logout=document.getElementById('logout');
  if(logout){logout.textContent='다른 계정';logout.onclick=async()=>{await sb.auth.signOut();location.reload()}}
  document.documentElement.dataset.ekodiFirstVisitConfirm='1';
}

export async function runPreAuth(){
  const realm=await realmFor(site);
  if(!realm)return false;
  const session=await centralSession();

  if(params.get('probe')==='1'&&site==='my'){
    if(session)return false;
    location.replace(probeReturn(realm));
    return true;
  }

  if(!session){
    if(site&&site!=='my'){
      const subscription=sb.auth.onAuthStateChange((event,next)=>{
        if(event==='SIGNED_IN'&&next){markConfirmed(site);subscription.data.subscription.unsubscribe()}
      });
    }
    return false;
  }

  if(site==='my'||params.get('manage')==='1'||params.get('review')==='1'||isConfirmed(site))return false;
  renderConfirmation(session,realm);
  return true;
}
