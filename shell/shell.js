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
  rules:{
    stableSurfaces:['workspace','admin','form','document','data'],
    publicSurfaces:['public'],
    dynamicSurfaces:['transition','bridge','loading','handoff'],
    publicDynamicMustNotChange:['siteLayout','contentOrder','navigationPosition','buttonGeometry','fontScale','focusTreatment','contrastFloor','safeArea','authMeaning','serviceIdentity']
  },
  services:{
    social:{accent:'#70B7FF',public:{motif:'signal',companion:'#6CF0E1'}},
    church:{accent:'#D8B66A',public:{motif:'paper',companion:'#8FBFA7'}},
    business:{accent:'#59C9B6',public:{motif:'grid',companion:'#F0B45A'}},
    biz:{accent:'#C8A96B',public:{motif:'paper',companion:'#8F7A5B'}},
    books:{accent:'#C99084',public:{motif:'paper',companion:'#8B2742'}},
    trade:{accent:'#58D7F2',public:{motif:'grid',companion:'#80E3FF'}},
    lab:{accent:'#E39463',public:{motif:'paper',companion:'#5C92C8'}},
    my:{accent:'#7CC7FF',public:{motif:'orbit',companion:'#B5A2FF'}}
  },
  publicExperience:{
    enabled:true,
    timezone:'Asia/Seoul',
    rotation:'weekly-deterministic',
    cycleDays:7,
    refreshMinutes:60,
    variants:[
      {id:'quiet',selectorMix:10,railOpacity:.68},
      {id:'clear',selectorMix:14,railOpacity:.78},
      {id:'bright',selectorMix:18,railOpacity:.86}
    ],
    seasonOffsets:{winter:0,spring:1,summer:2,autumn:3},
    motifs:{
      orbit:['linear-gradient(90deg,var(--accent),var(--companion),var(--accent))'],
      flow:['linear-gradient(90deg,var(--accent),var(--companion))'],
      grid:['linear-gradient(90deg,var(--accent),var(--companion) 50%,var(--accent))'],
      paper:['linear-gradient(90deg,var(--accent),var(--companion) 62%,var(--accent))'],
      signal:['linear-gradient(90deg,var(--accent),var(--companion),var(--accent),var(--companion))'],
      stage:['linear-gradient(90deg,var(--accent),var(--companion) 50%,var(--accent))']
    }
  },
  transition:{variants:[{id:'deep-current',ambientBackground:'linear-gradient(145deg,#06111C,#0B2033)'}]}
};

let manifest=null;
let theme=FALLBACK_THEME;
let service=null;
let root=null;
let panel=null;
let surface=requestedSurface;
let cycleTimer=null;
let state={workspaceKey:'',workspaceName:'',role:'',personName:'',tenantId:'',storeId:''};

function normalizeSurface(value){const v=String(value||'workspace').trim().toLowerCase();return /^[a-z-]{1,24}$/.test(v)?v:'workspace';}
function safeWorkspace(value){const v=String(value||'').trim();return /^[a-z]+:[a-zA-Z0-9:_-]{1,170}$/.test(v)?v:'';}
function storageKey(id){return `ekodi_shell_context:${id||'unknown'}`;}
function readStored(id){try{const raw=localStorage.getItem(storageKey(id));const parsed=raw?JSON.parse(raw):null;return parsed&&typeof parsed==='object'?parsed:{};}catch{return{};}}
function writeStored(){if(!service?.id)return;try{localStorage.setItem(storageKey(service.id),JSON.stringify({...state,updatedAt:new Date().toISOString()}));}catch{}}
function inferredWorkspaceName(key){if(!key)return'공간 선택';if(key.startsWith('person:'))return'개인 공간';if(key.startsWith('store:'))return'사업장 공간';if(key.startsWith('tenant:'))return'기관·단체 공간';if(key.startsWith('church:'))return'교회 공간';if(key.startsWith('community:'))return'커뮤니티 공간';if(key.startsWith('project:'))return'프로젝트 공간';return'현재 공간';}
function isDynamicSurface(value=surface){return (theme.rules?.dynamicSurfaces||[]).includes(value);}
function isPublicSurface(value=surface){return (theme.rules?.publicSurfaces||['public']).includes(value);}
function serviceTheme(){return theme.services?.[service?.id]||{};}

function hashText(value){
  let hash=2166136261;
  for(const ch of String(value||'')){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}
function seoulDate(now=new Date()){
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
  const values=Object.fromEntries(formatter.formatToParts(now).map(part=>[part.type,part.value]));
  return {key:`${values.year}-${values.month}-${values.day}`,year:Number(values.year),month:Number(values.month),day:Number(values.day)};
}
function seasonForMonth(month){if([3,4,5].includes(month))return'spring';if([6,7,8].includes(month))return'summer';if([9,10,11].includes(month))return'autumn';return'winter';}
function transitionVariant(){
  const variants=theme.transition?.variants||[];
  if(!variants.length)return null;
  const date=seoulDate();
  const ordinal=Math.floor(Date.UTC(date.year,date.month-1,date.day)/86400000);
  const seed=hashText(service?.id||explicitService||'ekodi');
  return variants[(ordinal+seed)%variants.length];
}
function publicVariant(){
  const config=theme.publicExperience||FALLBACK_THEME.publicExperience;
  if(!config?.enabled||!isPublicSurface())return null;
  const date=seoulDate();
  const ordinal=Math.floor(Date.UTC(date.year,date.month-1,date.day)/86400000);
  const cycleDays=Math.max(1,Number(config.cycleDays)||7);
  const cycleIndex=Math.floor(ordinal/cycleDays);
  const season=seasonForMonth(date.month);
  const identity=serviceTheme();
  const publicIdentity=identity.public||{};
  const motif=publicIdentity.motif||'orbit';
  const companion=publicIdentity.companion||identity.accent||FALLBACK_THEME.workspace.focus;
  const seed=hashText(`${service?.id||explicitService||'ekodi'}:${motif}`);
  const seasonOffset=Number(config.seasonOffsets?.[season]||0);
  const variants=config.variants||[];
  const variant=variants.length?variants[(cycleIndex+seed+seasonOffset)%variants.length]:{id:'quiet',selectorMix:10,railOpacity:.72};
  const motifVariants=config.motifs?.[motif]||config.motifs?.orbit||[];
  const rail=motifVariants.length?motifVariants[(cycleIndex+(seed>>>5)+seasonOffset)%motifVariants.length]:'linear-gradient(90deg,var(--accent),var(--companion))';
  const mix=Math.min(24,Math.max(6,Number(variant.selectorMix)||10));
  return {
    enabled:true,
    mode:config.rotation||'weekly-deterministic',
    timezone:config.timezone||'Asia/Seoul',
    dateKey:date.key,
    cycleKey:`${date.year}-w${cycleIndex}`,
    season,
    motif,
    companion,
    variant:variant.id||'quiet',
    rail,
    railOpacity:Math.min(1,Math.max(.45,Number(variant.railOpacity)||.72)),
    selectorBackground:`linear-gradient(145deg,color-mix(in srgb,var(--accent) ${mix}%,#071522),rgba(7,21,34,.96))`,
    selectorBorder:`color-mix(in srgb,var(--accent) ${Math.min(42,mix+18)}%,#24425e)`,
    selectorShadow:`0 10px 30px rgba(0,0,0,.28),0 0 24px color-mix(in srgb,var(--accent) ${Math.min(28,mix+6)}%,transparent)`
  };
}
function resolvedTheme(){
  const workspace={...FALLBACK_THEME.workspace,...theme.workspace};
  const identity=serviceTheme();
  const transition=isDynamicSurface()?transitionVariant():null;
  const publicExperience=publicVariant();
  return {
    version:theme.version||2,
    surface,
    dynamic:Boolean(transition||publicExperience),
    serviceId:service?.id||explicitService||'',
    identity:identity.identity||'',
    accent:identity.accent||workspace.focus,
    companion:publicExperience?.companion||identity.accent||workspace.focus,
    ambientBackground:transition?.ambientBackground||workspace.background,
    variant:publicExperience?`public-${publicExperience.variant}`:(transition?.id||'stable-workspace'),
    publicExperience,
    tokens:workspace
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
  html.style.setProperty('--ekodi-public-accent',value.accent);
  html.style.setProperty('--ekodi-public-companion',value.companion);
  if(value.publicExperience){
    html.dataset.ekodiShellSeason=value.publicExperience.season;
    html.dataset.ekodiShellPublicCycle=value.publicExperience.cycleKey;
    html.dataset.ekodiShellPublicMotif=value.publicExperience.motif;
    html.style.setProperty('--ekodi-public-rail',value.publicExperience.rail);
    window.dispatchEvent(new CustomEvent('ekodi:public-experience',{detail:{...value.publicExperience,serviceId:value.serviceId,accent:value.accent}}));
  }else{
    delete html.dataset.ekodiShellSeason;
    delete html.dataset.ekodiShellPublicCycle;
    delete html.dataset.ekodiShellPublicMotif;
    html.style.removeProperty('--ekodi-public-rail');
  }
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
function setSurface(next){surface=normalizeSurface(next);applyHostTokens();render();return resolvedTheme();}
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
  const themeValue=resolvedTheme();
  const publicMode=isPublicSurface();
  const name=root.querySelector('[data-space]');
  if(name)name.textContent=publicMode?service.name:(state.workspaceName||inferredWorkspaceName(state.workspaceKey));
  const role=root.querySelector('[data-role]');
  if(role){
    role.textContent=publicMode?'EKODI 서비스 전환':(state.role||service.shortName||service.name);
    role.hidden=!role.textContent;
  }
  const person=root.querySelector('[data-person]');
  if(person){
    person.textContent=publicMode?'':(state.personName||'');
    person.hidden=!person.textContent;
  }
  const contextHint=root.querySelector('[data-context-hint]');
  if(contextHint)contextHint.textContent=publicMode?'EKODI · 서비스 선택 · My EKODI에서 공간 관리':'EKODI · 사람 → 공간 → 기능';
  const wrap=root.querySelector('.wrap');
  if(wrap){
    wrap.style.setProperty('--accent',themeValue.accent);
    wrap.style.setProperty('--companion',themeValue.companion);
    wrap.style.setProperty('--selector-bg',themeValue.publicExperience?.selectorBackground||'rgba(7,21,34,.94)');
    wrap.style.setProperty('--selector-border',themeValue.publicExperience?.selectorBorder||'#24425e');
    wrap.style.setProperty('--selector-shadow',themeValue.publicExperience?.selectorShadow||'0 10px 30px rgba(0,0,0,.28)');
    wrap.style.setProperty('--public-rail',themeValue.publicExperience?.rail||'none');
    wrap.style.setProperty('--rail-opacity',String(themeValue.publicExperience?.railOpacity||0));
  }
  const rail=root.querySelector('.public-rail');
  if(rail)rail.hidden=!publicMode;
}
function closePanel(){if(panel)panel.hidden=true;}
function buildUi(){
  if(hidden||!service||document.querySelector('[data-ekodi-shell-root]'))return;
  const host=document.createElement('div');host.dataset.ekodiShellRoot='2';host.dataset.ekodiService=service.id;
  const shadow=host.attachShadow({mode:'open'});
  const shellStyle=document.createElement('link');shellStyle.rel='stylesheet';shellStyle.href=`${SHELL_ORIGIN}/shell-ui.css?v=20260824-workspace-1`;
  const wrap=el('div',undefined,'wrap');
  const rail=el('div',undefined,'public-rail');rail.hidden=true;rail.setAttribute('aria-hidden','true');wrap.append(rail);
  const button=el('button',undefined,'pill');button.type='button';button.setAttribute('aria-label','EKODI 현재 공간과 서비스 열기');button.setAttribute('aria-expanded','false');
  button.append(el('span','', 'dot'));
  const labels=el('span',undefined,'labels');const space=el('span','공간 선택','space');space.dataset.space='1';const sub=el('span',undefined,'sub');const person=el('span','',undefined);person.dataset.person='1';const role=el('span',service.shortName||service.name);role.dataset.role='1';sub.append(person,role);labels.append(space,sub);button.append(labels,el('span','▾','chev'));
  panel=el('div',undefined,'panel');panel.hidden=true;
  const head=el('div',undefined,'head');const contextHint=el('small','EKODI · 사람 → 공간 → 기능');contextHint.dataset.contextHint='1';head.append(el('strong',service.name),contextHint);panel.append(head);
  const switcher=el('button',undefined,'action');switcher.type='button';switcher.append(el('span','공간 전환 · My EKODI'),el('span','→'));switcher.addEventListener('click',()=>location.assign(myUrl()));panel.append(switcher);
  const services=el('div',undefined,'services');
  for(const item of (manifest.services||[]).filter(s=>s.state!=='planned'&&s.id!=='my').sort((a,b)=>(a.order||999)-(b.order||999))){
    const row=el('button',undefined,`service${item.id===service.id?' current':''}`);row.type='button';const left=el('span');left.append(el('b',item.shortName||item.name));const hint=el('small',item.id===service.id?'현재 서비스':(item.capabilities||[]).slice(0,2).join(' · '));row.append(left,hint);row.addEventListener('click',()=>navigate(item));services.append(row);
  }
  panel.append(services);
  const footer=el('div',undefined,'footer');const my=el('a','My EKODI');my.href=myUrl();const rootLink=el('a','EKODI');rootLink.href='https://ekodi.kr/';footer.append(my,rootLink);panel.append(footer);
  button.addEventListener('click',()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',panel.hidden?'false':'true');});
  document.addEventListener('click',event=>{if(!event.composedPath().includes(host)){closePanel();button.setAttribute('aria-expanded','false');}},{capture:true});
  wrap.append(button,panel);shadow.append(shellStyle,wrap);const myAuth=service.id==='my'?document.querySelector('#authButton'):null;if(myAuth?.parentElement)myAuth.before(host);else document.documentElement.append(host);root=shadow;render();
}
function refreshThemeCycle(){if(!service)return;applyHostTokens();render();}
function startCycleRefresh(){
  if(cycleTimer)clearInterval(cycleTimer);
  const minutes=Math.max(15,Number(theme.publicExperience?.refreshMinutes)||60);
  cycleTimer=setInterval(refreshThemeCycle,minutes*60000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshThemeCycle();});
}
async function fetchJson(url){const response=await fetch(url,{cache:'no-store',mode:'cors'});if(!response.ok)throw new Error(`${new URL(url).pathname}_${response.status}`);return response.json();}
async function boot(){
  try{manifest=await fetchJson(MANIFEST_URL);}catch(error){console.warn('EKODI Shell manifest unavailable',error);return;}
  try{
    const remoteTheme=await fetchJson(THEME_URL);
    if(remoteTheme&&typeof remoteTheme==='object')theme={...FALLBACK_THEME,...remoteTheme,workspace:{...FALLBACK_THEME.workspace,...remoteTheme.workspace},rules:{...FALLBACK_THEME.rules,...remoteTheme.rules},publicExperience:{...FALLBACK_THEME.publicExperience,...remoteTheme.publicExperience,motifs:{...FALLBACK_THEME.publicExperience.motifs,...remoteTheme.publicExperience?.motifs}},services:{...FALLBACK_THEME.services,...remoteTheme.services}};
  }catch(error){console.warn('EKODI Shell theme fallback active',error);}
  const host=location.hostname.toLowerCase();
  service=manifest.services.find(item=>item.id===explicitService)||manifest.services.find(item=>{try{return new URL(item.url).hostname===host;}catch{return false;}})||null;
  if(!service)return;
  const stored=readStored(service.id);state={...state,...stored};
  if(handedWorkspace)state.workspaceKey=safeWorkspace(handedWorkspace);
  if(handedTenant)state.tenantId=handedTenant.slice(0,120);
  if(handedStore)state.storeId=handedStore.slice(0,120);
  if(!state.workspaceName&&state.workspaceKey)state.workspaceName=inferredWorkspaceName(state.workspaceKey);
  writeStored();applyHostTokens();buildUi();startCycleRefresh();
}
window.EKODIShell={
  setContext:mergeContext,
  getContext:()=>({...state,serviceId:service?.id||explicitService||''}),
  getTheme:resolvedTheme,
  setSurface,
  navigate,
  open:()=>{if(panel)panel.hidden=false;},
  close:closePanel,
  myUrl
};
window.addEventListener('ekodi:context-change',event=>mergeContext(event.detail||{}));
window.addEventListener('ekodi:surface-change',event=>setSurface(event.detail?.surface||event.detail||'workspace'));
void boot();
})();
