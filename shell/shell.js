(()=>{
'use strict';
const script=document.currentScript;
if(window.__EKODI_SHELL_BOOTED)return;
window.__EKODI_SHELL_BOOTED=true;
const SHELL_ORIGIN='https://shell.ekodi.kr';
const MANIFEST_URL=`${SHELL_ORIGIN}/manifest.json`;
const AUTH='https://auth.ekodi.kr/';
const MY='https://my.ekodi.kr/';
const explicitService=String(script?.dataset?.ekodiService||'').trim().toLowerCase();
const hidden=script?.dataset?.ekodiShell==='off';
const fragment=new URLSearchParams(location.hash.startsWith('#')?location.hash.slice(1):'');
const handedWorkspace=fragment.get('ekodi_workspace')||'';
const handedTenant=fragment.get('ekodi_tenant')||'';
const handedStore=fragment.get('ekodi_store')||'';
let manifest=null;
let service=null;
let root=null;
let panel=null;
let state={workspaceKey:'',workspaceName:'',role:'',personName:'',tenantId:'',storeId:''};

function safeWorkspace(value){const v=String(value||'').trim();return /^[a-z]+:[a-zA-Z0-9:_-]{1,170}$/.test(v)?v:'';}
function serviceIdFromHost(host){const h=String(host||'').toLowerCase();const map={
  'my.ekodi.kr':'my','marketing.ekodi.kr':'marketing','community.ekodi.kr':'community','church.ekodi.kr':'church','business.ekodi.kr':'business','biz.ekodi.kr':'biz','work.ekodi.kr':'work','author.ekodi.kr':'author','books.ekodi.kr':'books','lab.ekodi.kr':'lab','social.ekodi.kr':'social','energy.ekodi.kr':'energy','mall.ekodi.kr':'mall','trade.ekodi.kr':'trade','pay.ekodi.kr':'pay','edu.ekodi.kr':'edu','media.ekodi.kr':'media'
};return map[h]||'';}
function storageKey(id){return `ekodi_shell_context:${id||'unknown'}`;}
function readStored(id){try{const raw=localStorage.getItem(storageKey(id));const parsed=raw?JSON.parse(raw):null;return parsed&&typeof parsed==='object'?parsed:{};}catch{return{};}}
function writeStored(){if(!service?.id)return;try{localStorage.setItem(storageKey(service.id),JSON.stringify({...state,updatedAt:new Date().toISOString()}));}catch{}}
function inferredWorkspaceName(key){if(!key)return'공간 선택';if(key.startsWith('person:'))return'개인 공간';if(key.startsWith('store:'))return'사업장 공간';if(key.startsWith('tenant:'))return'기관·단체 공간';if(key.startsWith('church:'))return'교회 공간';if(key.startsWith('community:'))return'커뮤니티 공간';if(key.startsWith('project:'))return'프로젝트 공간';return'현재 공간';}
function mergeContext(next={}){
  const workspaceKey=safeWorkspace(next.workspaceKey??next.workspace_key??state.workspaceKey);
  state={
    ...state,
    workspaceKey,
    workspaceName:String(next.workspaceName??next.workspace_name??state.workspaceName||'').trim().slice(0,120),
    role:String(next.role??state.role||'').trim().slice(0,80),
    personName:String(next.personName??next.person_name??state.personName||'').trim().slice(0,120),
    tenantId:String(next.tenantId??next.tenant_id??state.tenantId||'').trim().slice(0,120),
    storeId:String(next.storeId??next.store_id??state.storeId||'').trim().slice(0,120),
  };
  if(!state.workspaceName&&state.workspaceKey)state.workspaceName=inferredWorkspaceName(state.workspaceKey);
  writeStored();render();
  window.dispatchEvent(new CustomEvent('ekodi:shell-context',{detail:{...state,serviceId:service?.id||''}}));
  return {...state};
}
function currentReturn(){const u=new URL(location.href);u.hash='';return u.href;}
function myUrl(){const u=new URL(MY);u.searchParams.set('return_to',currentReturn());return u.href;}
function serviceUrl(target){
  if(!target?.url)return MY;
  if(target.id==='my')return myUrl();
  if(!target.sso)return target.url;
  const auth=new URL(AUTH);auth.searchParams.set('site',target.id);auth.searchParams.set('return_to',target.url);
  if(state.workspaceKey&&target.targetable)auth.searchParams.set('workspace',state.workspaceKey);
  return auth.href;
}
function navigate(target){const found=typeof target==='string'?manifest?.services?.find(s=>s.id===target):target;if(found)location.assign(serviceUrl(found));}
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function render(){
  if(!root||!service)return;
  const name=root.querySelector('[data-space]');if(name)name.textContent=state.workspaceName||inferredWorkspaceName(state.workspaceKey);
  const role=root.querySelector('[data-role]');if(role){role.textContent=state.role||service.shortName||service.name;role.hidden=!role.textContent;}
  const person=root.querySelector('[data-person]');if(person){person.textContent=state.personName||'';person.hidden=!state.personName;}
}
function closePanel(){if(panel)panel.hidden=true;}
function buildUi(){
  if(hidden||!service||document.querySelector('[data-ekodi-shell-root]'))return;
  const host=document.createElement('div');host.dataset.ekodiShellRoot='1';host.style.cssText='position:fixed;z-index:2147483000;top:12px;right:12px;font-family:Inter,"Noto Sans KR",system-ui,sans-serif;color:#17211b';
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=`:host{all:initial}.wrap{position:relative;font-family:Inter,"Noto Sans KR",system-ui,sans-serif}.pill{display:flex;align-items:center;gap:7px;border:1px solid rgba(23,33,27,.14);background:rgba(255,255,255,.94);backdrop-filter:blur(14px);box-shadow:0 8px 28px rgba(16,24,20,.12);border-radius:999px;padding:6px 8px 6px 10px;color:#17211b;cursor:pointer;max-width:min(360px,calc(100vw - 24px))}.dot{width:8px;height:8px;border-radius:50%;background:#2e7d4f;flex:0 0 auto}.labels{min-width:0;text-align:left}.space{display:block;font-size:11px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sub{display:flex;gap:5px;align-items:center;font-size:8px;color:#68756d;margin-top:1px;white-space:nowrap}.chev{font-size:10px;color:#67746c}.panel{position:absolute;right:0;top:calc(100% + 7px);width:min(320px,calc(100vw - 24px));max-height:min(72vh,560px);overflow:auto;background:#fff;border:1px solid rgba(23,33,27,.14);box-shadow:0 18px 52px rgba(16,24,20,.18);border-radius:16px;padding:10px}.panel[hidden]{display:none}.head{padding:5px 6px 9px;border-bottom:1px solid #eef1ef}.head strong{display:block;font-size:12px}.head small{display:block;color:#738078;font-size:9px;margin-top:3px}.action{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;border:0;background:#f3f7f4;border-radius:10px;padding:9px 10px;margin-top:8px;text-align:left;cursor:pointer;color:#203028;font-size:10px;font-weight:800}.services{display:grid;gap:3px;margin-top:8px}.service{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:0;background:transparent;border-radius:9px;padding:8px;cursor:pointer;text-align:left;color:#243128}.service:hover{background:#f5f7f5}.service b{font-size:10px}.service small{font-size:8px;color:#7a867f}.current{background:#eef6f0}.footer{display:flex;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #eef1ef}.footer a{flex:1;text-decoration:none;color:#33433a;background:#f7f8f7;border-radius:9px;padding:8px;text-align:center;font-size:9px;font-weight:800}@media(max-width:560px){.pill{max-width:220px}.panel{width:min(300px,calc(100vw - 20px))}}`;
  const wrap=el('div',undefined,'wrap');
  const button=el('button',undefined,'pill');button.type='button';button.setAttribute('aria-label','EKODI 현재 공간과 서비스 열기');
  button.append(el('span','', 'dot'));
  const labels=el('span',undefined,'labels');const space=el('span','공간 선택','space');space.dataset.space='1';const sub=el('span',undefined,'sub');const person=el('span','',undefined);person.dataset.person='1';const role=el('span',service.shortName||service.name);role.dataset.role='1';sub.append(person,role);labels.append(space,sub);button.append(labels,el('span','▾','chev'));
  panel=el('div',undefined,'panel');panel.hidden=true;
  const head=el('div',undefined,'head');head.append(el('strong',service.name),el('small','EKODI · 사람 → 공간 → 기능'));panel.append(head);
  const switcher=el('button',undefined,'action');switcher.type='button';switcher.append(el('span','공간 전환 · My EKODI'),el('span','→'));switcher.addEventListener('click',()=>location.assign(myUrl()));panel.append(switcher);
  const services=el('div',undefined,'services');
  for(const item of (manifest.services||[]).filter(s=>s.state!=='planned'&&s.id!=='my').sort((a,b)=>(a.order||999)-(b.order||999))){
    const row=el('button',undefined,`service${item.id===service.id?' current':''}`);row.type='button';const left=el('span');left.append(el('b',item.shortName||item.name));const hint=el('small',item.id===service.id?'현재 서비스':(item.capabilities||[]).slice(0,2).join(' · '));row.append(left,hint);row.addEventListener('click',()=>navigate(item));services.append(row);
  }
  panel.append(services);
  const footer=el('div',undefined,'footer');const my=el('a','My EKODI');my.href=myUrl();const rootLink=el('a','EKODI');rootLink.href='https://ekodi.kr/';footer.append(my,rootLink);panel.append(footer);
  button.addEventListener('click',()=>{panel.hidden=!panel.hidden;});
  document.addEventListener('click',event=>{if(!host.contains(event.target))closePanel();},{capture:true});
  wrap.append(button,panel);shadow.append(style,wrap);document.documentElement.append(host);root=shadow;render();
}
async function loadManifest(){
  const response=await fetch(MANIFEST_URL,{cache:'no-store',mode:'cors'});if(!response.ok)throw new Error(`manifest_${response.status}`);const data=await response.json();if(!Array.isArray(data?.services))throw new Error('manifest_invalid');return data;
}
async function boot(){
  try{manifest=await loadManifest();}catch(error){console.warn('EKODI Shell manifest unavailable',error);return;}
  const id=explicitService||serviceIdFromHost(location.hostname);service=manifest.services.find(item=>item.id===id)||manifest.services.find(item=>new URL(item.url).hostname===location.hostname)||null;if(!service)return;
  const stored=readStored(service.id);state={...state,...stored};
  if(handedWorkspace)state.workspaceKey=safeWorkspace(handedWorkspace);
  if(handedTenant)state.tenantId=handedTenant.slice(0,120);
  if(handedStore)state.storeId=handedStore.slice(0,120);
  if(!state.workspaceName&&state.workspaceKey)state.workspaceName=inferredWorkspaceName(state.workspaceKey);
  writeStored();buildUi();
}
window.EKODIShell={
  setContext:mergeContext,
  getContext:()=>({...state,serviceId:service?.id||explicitService||serviceIdFromHost(location.hostname)}),
  navigate,
  open:()=>{if(panel)panel.hidden=false;},
  close:closePanel,
  myUrl,
};
window.addEventListener('ekodi:context-change',event=>mergeContext(event.detail||{}));
void boot();
})();
