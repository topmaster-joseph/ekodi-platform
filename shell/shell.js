(()=>{
'use strict';
const script=document.currentScript;
if(window.__EKODI_SHELL_BOOTED)return;
window.__EKODI_SHELL_BOOTED=true;

const SHELL_ORIGIN='https://shell.ekodi.kr';
const MANIFEST_URL=`${SHELL_ORIGIN}/manifest.json`;
const THEME_URL=`${SHELL_ORIGIN}/theme.json`;
const AUTH='https://auth.ekodi.kr/';
const MY='https://my.ekodi.kr/';
const explicitService=String(script?.dataset?.ekodiService||'').trim().toLowerCase();
const hidden=script?.dataset?.ekodiShell==='off';
const requestedSurface=normalizeSurface(script?.dataset?.ekodiSurface||'workspace');
const fragment=new URLSearchParams(location.hash.startsWith('#')?location.hash.slice(1):'');
const handedWorkspace=fragment.get('ekodi_workspace')||'';
const handedTenant=fragment.get('ekodi_tenant')||'';
const handedStore=fragment.get('ekodi_store')||'';

const FALLBACK_THEME={
  version:2,
  workspace:{background:'#071522',surface:'#0B1D2E',surfaceRaised:'#10263A',border:'#24425E',text:'#F4F7FB',muted:'#9FB1C3',focus:'#8EC8FF',radius:'16px'},
  rules:{stableSurfaces:['workspace','admin','form','document','data'],dynamicSurfaces:['transition','bridge','loading','handoff']},
  services:{social:{accent:'#70B7FF'},church:{accent:'#D8B66A'},business:{accent:'#59C9B6'},biz:{accent:'#C8A96B'},books:{accent:'#C99084'},trade:{accent:'#58D7F2'},lab:{accent:'#E39463'},my:{accent:'#7CC7FF'}},
  transition:{variants:[{id:'deep-current',ambientBackground:'linear-gradient(145deg,#06111C,#0B2033)'}]}
};

let manifest=null;
let theme=FALLBACK_THEME;
let service=null;
let root=null;
let panel=null;
let surface=requestedSurface;
let state={workspaceKey:'',workspaceName:'',role:'',personName:'',tenantId:'',storeId:''};

function normalizeSurface(value){const v=String(value||'workspace').trim().toLowerCase();return /^[a-z-]{1,24}$/.test(v)?v:'workspace';}
function safeWorkspace(value){const v=String(value||'').trim();return /^[a-z]+:[a-zA-Z0-9:_-]{1,170}$/.test(v)?v:'';}
function storageKey(id){return `ekodi_shell_context:${id||'unknown'}`;}
function readStored(id){try{const raw=localStorage.getItem(storageKey(id));const parsed=raw?JSON.parse(raw):null;return parsed&&typeof parsed==='object'?parsed:{};}catch{return{};}}
function writeStored(){if(!service?.id)return;try{localStorage.setItem(storageKey(service.id),JSON.stringify({...state,updatedAt:new Date().toISOString()}));}catch{}}
function inferredWorkspaceName(key){if(!key)return'공간 선택';if(key.startsWith('person:'))return'개인 공간';if(key.startsWith('store:'))return'사업장 공간';if(key.startsWith('tenant:'))return'기관·단체 공간';if(key.startsWith('church:'))return'교회 공간';if(key.startsWith('community:'))return'커뮤니티 공간';if(key.startsWith('project:'))return'프로젝트 공간';return'현재 공간';}
function isDynamicSurface(value=surface){return (theme.rules?.dynamicSurfaces||[]).includes(value);}
function serviceTheme(){return theme.services?.[service?.id]||{};}
function transitionVariant(){
  const variants=theme.transition?.variants||[];
  if(!variants.length)return null;
  const day=Math.floor(Date.now()/86400000);
  const seed=[...(service?.id||explicitService||'ekodi')].reduce((sum,ch)=>sum+ch.charCodeAt(0),0);
  return variants[(day+seed)%variants.length];
}
function resolvedTheme(){
  const workspace={...FALLBACK_THEME.workspace,...theme.workspace};
  const identity=serviceTheme();
  const variant=isDynamicSurface()?transitionVariant():null;
  return {
    version:theme.version||2,
    surface,
    dynamic:Boolean(variant),
    serviceId:service?.id||explicitService||'',
    identity:identity.identity||'',
    accent:identity.accent||workspace.focus,
    ambientBackground:variant?.ambientBackground||workspace.background,
    variant:variant?.id||'stable-workspace',
    tokens:workspace,
  };
}
function applyHostTokens(){
  const value=resolvedTheme();
  const html=document.documentElement;
  html.dataset.ekodiShell='v2';
  html.dataset.ekodiShellSurface=value.surface;
  html.dataset.ekodiShellDynamic=value.dynamic?'true':'false';
  html.style.setProperty('--ekodi-shell-bg',value.tokens.background);
  html.style.setProperty('--ekodi-shell-surface',value.tokens.surface);
  html.style.setProperty('--ekodi-shell-surface-raised',value.tokens.surfaceRaised);
  html.style.setProperty('--ekodi-shell-border',value.tokens.border);
  html.style.setProperty('--ekodi-shell-text',value.tokens.text);
  html.style.setProperty('--ekodi-shell-muted',value.tokens.muted);
  html.style.setProperty('--ekodi-shell-focus',value.tokens.focus);
  html.style.setProperty('--ekodi-shell-accent',value.accent);
  html.style.setProperty('--ekodi-shell-radius',value.tokens.radius);
  html.style.setProperty('--ekodi-shell-ambient',value.ambientBackground);
  window.dispatchEvent(new CustomEvent('ekodi:shell-theme',{detail:value}));
  return value;
}
function mergeContext(next={}){
  const workspaceKey=safeWorkspace(next.workspaceKey??next.workspace_key??state.workspaceKey);
  state={...state,workspaceKey,workspaceName:String(next.workspaceName??next.workspace_name??state.workspaceName??'').trim().slice(0,120),role:String(next.role??state.role??'').trim().slice(0,80),personName:String(next.personName??next.person_name??state.personName??'').trim().slice(0,120),tenantId:String(next.tenantId??next.tenant_id??state.tenantId??'').trim().slice(0,120),storeId:String(next.storeId??next.store_id??state.storeId??'').trim().slice(0,120)};
  if(!state.workspaceName&&state.workspaceKey)state.workspaceName=inferredWorkspaceName(state.workspaceKey);
  writeStored();render();
  window.dispatchEvent(new CustomEvent('ekodi:shell-context',{detail:{...state,serviceId:service?.id||''}}));
  return {...state};
}
function setSurface(next){surface=normalizeSurface(next);render();applyHostTokens();return resolvedTheme();}
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
  const wrap=root.querySelector('.wrap');if(wrap)wrap.style.setProperty('--accent',resolvedTheme().accent);
}
function closePanel(){if(panel)panel.hidden=true;}
function buildUi(){
  if(hidden||!service||document.querySelector('[data-ekodi-shell-root]'))return;
  const host=document.createElement('div');host.dataset.ekodiShellRoot='2';host.style.cssText='position:fixed;z-index:2147483000;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));font-family:Inter,"Noto Sans KR",system-ui,sans-serif';
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=`:host{all:initial}.wrap{--accent:#8ec8ff;position:relative;font-family:Inter,"Noto Sans KR",system-ui,sans-serif;color:#f4f7fb}.pill{display:flex;align-items:center;gap:8px;border:1px solid #24425e;background:rgba(7,21,34,.94);backdrop-filter:blur(16px);box-shadow:0 10px 30px rgba(0,0,0,.28);border-radius:999px;padding:7px 9px 7px 11px;color:#f4f7fb;cursor:pointer;max-width:min(360px,calc(100vw - 24px));min-height:42px}.pill:focus-visible,.action:focus-visible,.service:focus-visible,.footer a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.dot{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent);flex:0 0 auto}.labels{min-width:0;text-align:left}.space{display:block;font-size:12px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px}.sub{display:flex;gap:6px;align-items:center;font-size:9px;color:#9fb1c3;margin-top:2px;white-space:nowrap}.chev{font-size:10px;color:#9fb1c3}.panel{position:absolute;right:0;top:calc(100% + 8px);width:min(326px,calc(100vw - 24px));max-height:min(72vh,560px);overflow:auto;background:#0b1d2e;border:1px solid #24425e;box-shadow:0 20px 56px rgba(0,0,0,.42);border-radius:16px;padding:10px;color:#f4f7fb}.panel[hidden]{display:none}.head{padding:6px 7px 10px;border-bottom:1px solid #18344d}.head strong{display:block;font-size:13px}.head small{display:block;color:#9fb1c3;font-size:9px;margin-top:3px}.action{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #23445f;background:#10263a;border-radius:11px;padding:10px;margin-top:9px;text-align:left;cursor:pointer;color:#f4f7fb;font-size:10px;font-weight:800}.services{display:grid;gap:3px;margin-top:8px}.service{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:0;background:transparent;border-radius:10px;padding:9px;cursor:pointer;text-align:left;color:#eaf0f6}.service:hover{background:#10263a}.service b{font-size:10px}.service small{font-size:8px;color:#91a6ba}.current{background:#10263a;box-shadow:inset 2px 0 0 var(--accent)}.footer{display:flex;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #18344d}.footer a{flex:1;text-decoration:none;color:#dce7f0;background:#10263a;border-radius:9px;padding:8px;text-align:center;font-size:9px;font-weight:800}@media(max-width:560px){.pill{max-width:230px}.panel{width:min(304px,calc(100vw - 20px))}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;
  const wrap=el('div',undefined,'wrap');wrap.style.setProperty('--accent',resolvedTheme().accent);
  const button=el('button',undefined,'pill');button.type='button';button.setAttribute('aria-label','EKODI 현재 공간과 서비스 열기');button.setAttribute('aria-expanded','false');
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
  button.addEventListener('click',()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',panel.hidden?'false':'true');});
  document.addEventListener('click',event=>{if(!event.composedPath().includes(host)){closePanel();button.setAttribute('aria-expanded','false');}},{capture:true});
  wrap.append(button,panel);shadow.append(style,wrap);document.documentElement.append(host);root=shadow;render();
}
async function fetchJson(url){const response=await fetch(url,{cache:'no-store',mode:'cors'});if(!response.ok)throw new Error(`${new URL(url).pathname}_${response.status}`);return response.json();}
async function boot(){
  try{manifest=await fetchJson(MANIFEST_URL);}catch(error){console.warn('EKODI Shell manifest unavailable',error);return;}
  try{const remoteTheme=await fetchJson(THEME_URL);if(remoteTheme&&typeof remoteTheme==='object')theme={...FALLBACK_THEME,...remoteTheme,workspace:{...FALLBACK_THEME.workspace,...remoteTheme.workspace},rules:{...FALLBACK_THEME.rules,...remoteTheme.rules},services:{...FALLBACK_THEME.services,...remoteTheme.services}};}catch(error){console.warn('EKODI Shell theme fallback active',error);}
  const host=location.hostname.toLowerCase();
  service=manifest.services.find(item=>item.id===explicitService)||manifest.services.find(item=>{try{return new URL(item.url).hostname===host;}catch{return false;}})||null;
  if(!service)return;
  const stored=readStored(service.id);state={...state,...stored};
  if(handedWorkspace)state.workspaceKey=safeWorkspace(handedWorkspace);
  if(handedTenant)state.tenantId=handedTenant.slice(0,120);
  if(handedStore)state.storeId=handedStore.slice(0,120);
  if(!state.workspaceName&&state.workspaceKey)state.workspaceName=inferredWorkspaceName(state.workspaceKey);
  writeStored();applyHostTokens();buildUi();
}
window.EKODIShell={
  setContext:mergeContext,
  getContext:()=>({...state,serviceId:service?.id||explicitService||''}),
  getTheme:resolvedTheme,
  setSurface,
  navigate,
  open:()=>{if(panel)panel.hidden=false;},
  close:closePanel,
  myUrl,
};
window.addEventListener('ekodi:context-change',event=>mergeContext(event.detail||{}));
window.addEventListener('ekodi:surface-change',event=>setSurface(event.detail?.surface||event.detail||'workspace'));
void boot();
})();
