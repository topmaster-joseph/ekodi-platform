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
let memberGateTimer=null;
let memberGateRoot=null;
let memberGateOwnedInert=false;
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
function setSurface(next){surface=normalizeSurface(next);applyHostTokens();render();reconcileMemberGate();return resolvedTheme();}
function currentReturn(){const u=new URL(location.href);u.hash='';return u.href;}
function myUrl(){const u=new URL(MY);u.searchParams.set('return_to',currentReturn());return u.href;}

function memberPolicy(){return service?.userAccessPolicy||null;}
function memberGateApplies(){const p=memberPolicy();return Boolean(p&&p.guestMode==='guide-only'&&p.minimumTier==='free'&&(surface==='public'||surface==='workspace'));}
function handoffPending(){try{return new URLSearchParams(location.hash.startsWith('#')?location.hash.slice(1):'').has('ekodi_token');}catch{return false;}}
function localMemberSession(){
  try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)||'';if(!/^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(key))continue;let parsed;try{parsed=JSON.parse(localStorage.getItem(key)||'null');}catch{continue;}const s=parsed?.currentSession||parsed?.session||parsed;const token=String(s?.access_token||'');const user=s?.user;const exp=Number(s?.expires_at||0);if(token&&user?.id&&(!exp||exp*1000>Date.now()-60000))return true;}}catch{}return false;
}
function memberLoginUrl(){const u=new URL(AUTH);u.searchParams.set('site',service?.id||explicitService||'portal');u.searchParams.set('return_to',currentReturn());return u.href;}
function clearMemberGate(){if(memberGateRoot){memberGateRoot.remove();memberGateRoot=null;}if(memberGateOwnedInert&&document.body){document.body.inert=false;memberGateOwnedInert=false;}}
function renderMemberGate(mode='guest'){
  if(memberGateRoot?.dataset?.mode===mode)return;clearMemberGate();if(document.body&&!document.body.inert){document.body.inert=true;memberGateOwnedInert=true;}
  const host=document.createElement('div');host.dataset.ekodiMemberGate='v1';host.dataset.mode=mode;host.style.cssText='position:fixed;inset:0;z-index:2147482850;display:grid;place-items:center;padding:24px;background:#071522;font-family:Inter,"Noto Sans KR",system-ui,sans-serif;color:#f4f7fb';
  const shadow=host.attachShadow({mode:'open'});const wrap=document.createElement('section');wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-label',String(service?.name||'EKODI')+' 회원 안내');
  wrap.innerHTML='<style>*{box-sizing:border-box}.card{width:min(620px,100%);border:1px solid #24425e;border-radius:24px;padding:30px;background:#0b1d2e;box-shadow:0 28px 80px rgba(0,0,0,.42)}.eyebrow{font-size:12px;font-weight:850;letter-spacing:.14em;color:#8ec8ff}.card h1{margin:10px 0 12px;font-size:clamp(30px,7vw,48px);line-height:1.05}.card p{margin:0;color:#b6c5d3;line-height:1.75}.note{margin-top:18px;padding:14px 16px;border-radius:14px;background:#10263a;color:#dce8f2;font-size:14px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}a{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:12px;text-decoration:none;font-weight:850}.primary{background:#f4f7fb;color:#071522}.secondary{border:1px solid #31506e;color:#dce8f2}.small{margin-top:18px;color:#8296aa;font-size:12px}@media(max-width:560px){.card{padding:24px 20px}.actions{display:grid}.actions a{width:100%}}</style><div class="card"><div class="eyebrow">EKODI COMMON SERVICE</div><h1></h1><p></p><div class="note"></div><div class="actions"></div><div class="small">공개는 안내까지, 이용은 무료회원부터.</div></div>';

  wrap.querySelector('h1').textContent=service?.name||'EKODI';wrap.querySelector('p').textContent='이 공통서비스의 실제 기능과 콘텐츠는 Google 로그인한 EKODI 무료회원 이상에게 제공합니다.';
  wrap.querySelector('.note').textContent=mode==='handoff'?'Google 인증을 서비스에 연결하고 있습니다.':'로그인 전에는 서비스 소개와 이용 안내만 제공됩니다.';
  const actions=wrap.querySelector('.actions');if(mode==='handoff'){const span=document.createElement('span');span.textContent='인증 연결 중…';span.className='primary';span.style.cssText='display:inline-flex;align-items:center;min-height:46px;padding:0 18px;border-radius:12px;font-weight:850';actions.append(span);}else{const login=document.createElement('a');login.href=memberLoginUrl();login.className='primary';login.textContent='Google로 무료 시작';const info=document.createElement('a');info.href='https://ekodi.kr/#services';info.className='secondary';info.textContent='서비스 안내';actions.append(login,info);}
  shadow.append(wrap);document.documentElement.append(host);memberGateRoot=host;
}
function reconcileMemberGate(){if(!memberGateApplies()){clearMemberGate();document.documentElement.dataset.ekodiMemberAccess='not-applicable';return;}if(localMemberSession()){clearMemberGate();document.documentElement.dataset.ekodiMemberAccess='member';return;}const mode=handoffPending()?'handoff':'guest';document.documentElement.dataset.ekodiMemberAccess=mode;renderMemberGate(mode);}
function startMemberGate(){reconcileMemberGate();if(memberGateTimer)clearInterval(memberGateTimer);memberGateTimer=setInterval(reconcileMemberGate,2000);window.addEventListener('storage',reconcileMemberGate);window.addEventListener('focus',reconcileMemberGate);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reconcileMemberGate();});window.addEventListener('ekodi:auth-state',reconcileMemberGate);}

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
  const host=document.createElement('div');host.dataset.ekodiShellRoot='2';host.style.cssText='position:fixed;z-index:2147483000;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));font-family:Inter,"Noto Sans KR",system-ui,sans-serif';
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=`:host{all:initial}.wrap{--accent:#8ec8ff;--companion:#b5a2ff;--selector-bg:rgba(7,21,34,.94);--selector-border:#24425e;--selector-shadow:0 10px 30px rgba(0,0,0,.28);--public-rail:none;--rail-opacity:0;position:relative;font-family:Inter,"Noto Sans KR",system-ui,sans-serif;color:#f4f7fb}.public-rail{position:fixed;z-index:2147482999;left:0;right:0;top:0;height:max(3px,env(safe-area-inset-top));min-height:3px;background:var(--public-rail);opacity:var(--rail-opacity);pointer-events:none}.public-rail[hidden]{display:none}.pill{display:flex;align-items:center;gap:8px;border:1px solid var(--selector-border);background:var(--selector-bg);backdrop-filter:blur(16px);box-shadow:var(--selector-shadow);border-radius:999px;padding:7px 9px 7px 11px;color:#f4f7fb;cursor:pointer;max-width:min(360px,calc(100vw - 24px));min-height:42px}.pill:focus-visible,.action:focus-visible,.service:focus-visible,.footer a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.dot{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent);flex:0 0 auto}.labels{min-width:0;text-align:left}.space{display:block;font-size:12px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px}.sub{display:flex;gap:6px;align-items:center;font-size:9px;color:#9fb1c3;margin-top:2px;white-space:nowrap}.chev{font-size:10px;color:#9fb1c3}.panel{position:absolute;right:0;top:calc(100% + 8px);width:min(326px,calc(100vw - 24px));max-height:min(72vh,560px);overflow:auto;background:#0b1d2e;border:1px solid color-mix(in srgb,var(--accent) 22%,#24425e);box-shadow:0 20px 56px rgba(0,0,0,.42);border-radius:16px;padding:10px;color:#f4f7fb}.panel[hidden]{display:none}.head{padding:6px 7px 10px;border-bottom:1px solid #18344d}.head strong{display:block;font-size:13px}.head small{display:block;color:#9fb1c3;font-size:9px;margin-top:3px}.action{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #23445f;background:#10263a;border-radius:11px;padding:10px;margin-top:9px;text-align:left;cursor:pointer;color:#f4f7fb;font-size:10px;font-weight:800}.services{display:grid;gap:3px;margin-top:8px}.service{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:0;background:transparent;border-radius:10px;padding:9px;cursor:pointer;text-align:left;color:#eaf0f6}.service:hover{background:#10263a}.service b{font-size:10px}.service small{font-size:8px;color:#91a6ba}.current{background:#10263a;box-shadow:inset 2px 0 0 var(--accent)}.footer{display:flex;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #18344d}.footer a{flex:1;text-decoration:none;color:#dce7f0;background:#10263a;border-radius:9px;padding:8px;text-align:center;font-size:9px;font-weight:800}@media(max-width:560px){.pill{max-width:230px}.panel{width:min(304px,calc(100vw - 20px))}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;
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
  wrap.append(button,panel);shadow.append(style,wrap);document.documentElement.append(host);root=shadow;render();
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
  startMemberGate();
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
