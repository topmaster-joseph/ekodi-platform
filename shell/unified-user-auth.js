(()=>{
'use strict';
// UI convenience only: permissions and canonical Person identity are always server verified.
if(window.__EKODI_UNIFIED_USER_AUTH_BOOTED)return;
window.__EKODI_UNIFIED_USER_AUTH_BOOTED=true;
const AUTH='https://ekodi.kr/auth/';
const PROJECT='renzehysxirjilvdxacv';
const PROFILE='https://'+PROJECT+'.supabase.co/functions/v1/profile-api/me';
const PUBLISHABLE='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const TOKEN_KEY=new RegExp('^sb-'+PROJECT+'-auth-token(?:\\.\\d+)?$');
const CACHE_TTL=5*60*1000;
let scheduled=false;
let requestInFlight='';
const displayCache=new Map();
function shortName(value){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  const chars=Array.from(text);
  return chars.length>12?chars.slice(0,12).join('')+'…':text;
}
function canonicalSession(){
  // Legacy independent hosts do not share apex browser storage; they use the central handoff.
  if(location.origin!=='https://ekodi.kr')return null;
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';
      if(!TOKEN_KEY.test(key))continue;
      const raw=JSON.parse(localStorage.getItem(key)||'null');
      const session=raw?.currentSession||raw?.session||raw;
      if(!session?.access_token||!session?.user?.id)continue;
      if(!Number.isFinite(Number(session.expires_at))||Number(session.expires_at)*1000<=Date.now()+15_000)continue;
      return session;
    }
  }catch{}
  return null;
}
function loginSite(){
  const service=String(document.documentElement.dataset.ekodiService||document.body?.dataset?.ekodiService||'').trim().toLowerCase();
  const first=location.pathname.split('/').filter(Boolean)[0]?.toLowerCase()||'';
  const aliases={ekodi:'portal',my:'my',ekodichurch:'church',ekodimission:'mission',ekodibiz:'biz',ekodimall:'mall',seonammedi:'seonammedi',cgma:'cgma'};
  const guess=(service==='ekodi'&&first?aliases[first]||'space':aliases[service]||aliases[first]||service||first||'portal');
  // An unregistered workspace must use the space realm; the server still checks the return URL.
  return /^[a-z0-9][a-z0-9-]{0,60}$/.test(guess)?guess:'space';
}
function originalPageLogin(){
  const auth=new URL(AUTH);
  auth.searchParams.set('site',loginSite());
  auth.searchParams.set('return_to',location.origin+location.pathname+location.search);
  return auth.href;
}
function activeUserHeader(){
  if(window.EKODIUserUIHeader?.getState?.().enabled!==true)return null;
  for(const header of document.querySelectorAll('header[data-ekodi-user-header-root],header[data-ekodi-user-header-fixed]')){
    if(header.closest('[data-ekodi-shell-root]'))continue;
    const style=getComputedStyle(header);
    if(style.display!=='none'&&style.visibility!=='hidden')return header;
  }
  return null;
}
function localName(session){
  const metadata=session?.user?.user_metadata||{};
  return String(metadata.display_name||metadata.full_name||metadata.name||'').trim()||'EKODI 회원';
}
function paint(){
  scheduled=false;
  const header=activeUserHeader();
  if(!header)return;
  const container=header.querySelector('[data-ekodi-header-actions],.header-actions,.nav-actions,.top-actions')||header.querySelector('nav')||header;
  let node=header.querySelector('[data-ekodi-unified-auth]');
  if(!node){
    node=document.createElement('span');
    node.className='ekodi-unified-auth';
    node.dataset.ekodiUnifiedAuth='v1';
    container.append(node);
  }
  const session=canonicalSession();
  const id=String(session?.user?.id||'');
  if(!session){
    if(node.dataset.ekodiIdentityKey==='guest')return;
    const link=document.createElement('a');
    link.textContent='로그인';link.className='ekodi-unified-auth__link';
    link.href=originalPageLogin();
    link.addEventListener('click',()=>{link.href=originalPageLogin();});
    node.replaceChildren(link);
    node.dataset.ekodiIdentityKey='guest';
    node.removeAttribute('title');
    return;
  }
  const cached=displayCache.get(id);
  if(cached&&cached.until<=Date.now())displayCache.delete(id);
  const display=displayCache.get(id)?.name||localName(session);
  const key='member:'+id+':'+display;
  if(node.dataset.ekodiIdentityKey!==key){
    const label=document.createElement('span');
    label.className='ekodi-unified-auth__name';
    label.textContent=shortName(display);
    label.title=display;
    label.setAttribute('aria-label','로그인 계정 '+display);
    node.replaceChildren(label);
    node.dataset.ekodiIdentityKey=key;
  }
  if(!displayCache.has(id)&&requestInFlight!==id){
    requestInFlight=id;
    fetch(PROFILE,{headers:{apikey:PUBLISHABLE,authorization:'Bearer '+session.access_token},cache:'no-store',credentials:'omit'})
      .then(async response=>response.ok?response.json():null)
      .then(data=>{
        const name=String(data?.profile?.display_name||'').replace(/\s+/g,' ').trim();
        displayCache.set(id,{name:name||localName(session),until:Date.now()+(name?CACHE_TTL:60_000)});
      })
      .catch(()=>{displayCache.set(id,{name:localName(session),until:Date.now()+60_000});})
      .finally(()=>{requestInFlight='';schedule();});
  }
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(paint);}
function installStyle(){
  if(document.getElementById('ekodi-unified-auth-style'))return;
  const style=document.createElement('style');
  style.id='ekodi-unified-auth-style';
  style.textContent='.ekodi-unified-auth{display:inline-flex;align-items:center;justify-content:center;min-width:0;max-width:min(21ch,34vw);margin-inline-start:8px;vertical-align:middle;font:inherit}.ekodi-unified-auth__link,.ekodi-unified-auth__name{display:inline-block;max-width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:inherit;font-weight:650;line-height:1.35}.ekodi-unified-auth__link{text-decoration:none;color:inherit}.ekodi-unified-auth__link:focus-visible{outline:2px solid currentColor;outline-offset:3px}@media(max-width:600px){.ekodi-unified-auth{max-width:12ch;margin-inline-start:4px}}';
  (document.head||document.documentElement).append(style);
}
window.EKODIUnifiedUserAuth=Object.freeze({version:1,refresh:schedule});
window.addEventListener('ekodi:user-header-ready',schedule);
window.addEventListener('ekodi:auth-state',schedule);
window.addEventListener('storage',schedule);
window.addEventListener('focus',schedule);
window.addEventListener('pageshow',schedule);
window.addEventListener('popstate',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{installStyle();schedule();},{once:true});
else {installStyle();schedule();}
})();
