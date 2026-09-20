(()=>{
'use strict';
const root=document.documentElement;
if(root.dataset.siteMemberHome!=='v1')return;
const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const WORKSPACE_API=`${SUPABASE_URL}/functions/v1/workspace-api`;
const siteKey=String(root.dataset.siteKey||'').trim();
const workspaceSlug=String(root.dataset.workspaceSlug||'').trim();
const audienceHint=String(root.dataset.audienceHint||'person').trim();
const $=id=>document.getElementById(id);
let audience=audienceHint||'person';
let preferences={pinnedServices:[],hiddenServices:[],serviceOrder:[],density:'comfortable'};
let token='';
let foundation=null;

function sessionFromStorage(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';
      if(!/^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(key))continue;
      let parsed=null;try{parsed=JSON.parse(localStorage.getItem(key)||'null')}catch{}
      const session=parsed?.currentSession||parsed?.session||parsed;
      const access=String(session?.access_token||'');
      const exp=Number(session?.expires_at||0);
      if(access&&session?.user?.id&&(!exp||exp*1000>Date.now()-60000))return session;
    }
  }catch{}
  return null;
}
function authHeaders(){return {apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${token}`,'content-type':'application/json'}}
function audienceFromSpace(space){
  const raw=String(space?.kind||space?.workspace_kind||'').toLowerCase();
  if(raw==='store'||raw==='business')return'business';
  if(['church','community','organization','team','project'].includes(raw))return raw;
  return'organization';
}
async function workspaceContext(){
  if(!workspaceSlug||!token)return null;
  const response=await fetch(`${WORKSPACE_API}/spaces/resolve?slug=${encodeURIComponent(workspaceSlug)}`,{headers:authHeaders(),cache:'no-store'});
  if(!response.ok)return null;
  const data=await response.json().catch(()=>null);
  return data?.space||null;
}
async function loadProfile(){
  if(!token)return;
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/current_site_member_home_profile`,{method:'POST',headers:authHeaders(),body:JSON.stringify({p_site_key:siteKey}),cache:'no-store'}).catch(()=>null);
  if(!response?.ok)return;
  const profile=await response.json().catch(()=>null);
  if(profile?.audience_kind)audience=String(profile.audience_kind);
  const p=profile?.preferences;
  if(p&&typeof p==='object')preferences={...preferences,...p};
}
async function saveProfile(){
  if(!token){$('saveState').textContent='로그인 후 저장할 수 있습니다.';return}
  $('saveState').textContent='저장 중…';
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_site_member_home_preferences`,{method:'POST',headers:authHeaders(),body:JSON.stringify({p_site_key:siteKey,p_preferences:preferences}),cache:'no-store'}).catch(()=>null);
  $('saveState').textContent=response?.ok?'저장됨':'저장 확인필요';
}
async function loadFoundation(){
  const response=await fetch(`/_ekodi/member-home/foundation.json?audience=${encodeURIComponent(audience)}`,{cache:'no-store'});
  if(!response.ok)throw new Error('foundation_unavailable');
  foundation=await response.json();
}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderCards(id,items=[],kind='CAPABILITY'){
  $(id).innerHTML=items.map(item=>`<article class="smh-card"><small>${kind}</small><strong>${esc(item.name||item.id)}</strong><p>${esc(item.description||((item.capabilities||[]).slice(0,4).join(' · ')))}</p></article>`).join('');
}
function preferenceSet(name){return new Set(Array.isArray(preferences[name])?preferences[name].map(String):[])}
function serviceRank(service,pinned,order){
  const pin=pinned.has(service.id)?0:1;
  const explicit=order.indexOf(service.id);
  return [pin,explicit<0?9999:explicit,service.name||service.id];
}
function compareRank(a,b,pinned,order){const x=serviceRank(a,pinned,order),y=serviceRank(b,pinned,order);return x[0]-y[0]||x[1]-y[1]||String(x[2]).localeCompare(String(y[2]),'ko')}
function renderServices(){
  const pinned=preferenceSet('pinnedServices'),hidden=preferenceSet('hiddenServices'),order=Array.isArray(preferences.serviceOrder)?preferences.serviceOrder.map(String):[];
  const services=(foundation?.services||[]).filter(s=>s.available||s.productionVerified).sort((a,b)=>compareRank(a,b,pinned,order));
  $('serviceGrid').innerHTML=services.map(service=>{
    const isPinned=pinned.has(service.id),isHidden=hidden.has(service.id);
    return `<article class="smh-service" data-service="${esc(service.id)}" data-hidden="${isHidden}"><div><strong>${esc(service.name||service.id)}</strong><small>${esc(service.group||'service')} · ${service.available?'사용 가능':'준비 중'}</small></div><div class="smh-service-actions"><button type="button" data-action="pin" data-id="${esc(service.id)}" aria-pressed="${isPinned}">${isPinned?'고정됨':'고정'}</button><button type="button" data-action="hide" data-id="${esc(service.id)}">${isHidden?'다시 표시':'숨김'}</button></div></article>`
  }).join('');
  $('serviceGrid').querySelectorAll('button[data-action]').forEach(button=>button.addEventListener('click',async()=>{
    const id=button.dataset.id,action=button.dataset.action;
    const pins=preferenceSet('pinnedServices'),hides=preferenceSet('hiddenServices');
    if(action==='pin'){if(pins.has(id))pins.delete(id);else pins.add(id)}
    if(action==='hide'){if(hides.has(id))hides.delete(id);else{hides.add(id);pins.delete(id)}}
    preferences.pinnedServices=[...pins];preferences.hiddenServices=[...hides];
    renderServices();await saveProfile();
  }));
}
function renderAll(){
  renderCards('coreGrid',foundation?.core||[],'CORE');
  renderCards('commonGrid',foundation?.common||[],'COMMON');
  renderCards('specialistGrid',foundation?.specialist||[],'WORKSPACE PACK');
  renderServices();
}
async function boot(){
  const session=sessionFromStorage();
  token=String(session?.access_token||'');
  if(!token){
    $('memberState').textContent='로그인하면 이 사이트 전용 마이페이지가 열립니다.';
    $('loginAction').hidden=false;
    await loadFoundation();renderAll();return;
  }
  $('memberState').textContent=`${session.user?.email||'EKODI 사용자'} · 이 사이트에 로그인됨`;
  $('loginAction').hidden=true;
  const space=await workspaceContext();
  if(workspaceSlug){
    if(space){
      audience=audienceFromSpace(space);
      $('workspaceContext').hidden=false;
      $('workspaceName').textContent=space.name||workspaceSlug;
      $('workspaceRole').textContent=space.role||'member';
    }else{
      $('memberState').textContent='로그인은 확인되었지만 이 사이트의 구성원 권한은 확인되지 않았습니다.';
    }
  }
  await loadProfile();
  await loadFoundation();
  renderAll();
  window.dispatchEvent(new CustomEvent('ekodi:site-member-home-ready',{detail:{siteKey,audience,foundationVersion:foundation.version}}));
}
$('restoreServices')?.addEventListener('click',async()=>{preferences={...preferences,pinnedServices:[],hiddenServices:[],serviceOrder:[]};renderServices();await saveProfile()});
boot().catch(error=>{console.error('site member home',error);$('memberState').textContent='마이페이지 구성을 불러오지 못했습니다. 다시 시도해 주세요.'});
})();