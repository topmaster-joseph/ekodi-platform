(()=>{
'use strict';
if(window.__EKODI_USER_CHARACTER_BOOTED)return;
window.__EKODI_USER_CHARACTER_BOOTED=true;

const VERSION=4;
const STYLE_ID='ekodi-user-character-style';
const REGISTRY_ATTR='data-ekodi-character-registry';
const REGISTRY_ASSET='character-registry.js';
const USER_SURFACES=new Set(['public','workspace']);
const DISABLED_MODES=new Set(['off','hidden','none']);
const CHARACTER_ATTR='data-ekodi-user-character';
const FALLBACK_RESTRAINT=new Set(['payment','personal_data','security','complex_admin','focus_heavy']);
let operationSnapshot=null;
const FALLBACK_PROFILES=Object.freeze({
  church:{pose:'welcome',prop:'book',label:'함께 말씀을 나누는 에코디언'},
  community:{pose:'welcome',prop:'heart',label:'이웃을 잇는 에코디언'},
  cgma:{pose:'welcome',prop:'heart',label:'상인과 이웃을 잇는 에코디언'},
  cafe:{pose:'welcome',prop:'cup',label:'반갑게 맞이하는 에코디언'},
  mall:{pose:'guide',prop:'bag',label:'필요를 함께 찾는 에코디언'},
  shop:{pose:'guide',prop:'bag',label:'좋은 선택을 돕는 에코디언'},
  jadam:{pose:'guide',prop:'bag',label:'메뉴 선택을 돕는 에코디언'},
  pizzamaru:{pose:'guide',prop:'bag',label:'메뉴 선택을 돕는 에코디언'},
  delivery:{pose:'guide',prop:'route',label:'주문과 배달의 길을 잇는 에코디언'},
  business:{pose:'guide',prop:'chart',label:'일을 돕는 에코디언'},
  biz:{pose:'guide',prop:'chart',label:'사업의 다음 선택을 돕는 에코디언'},
  marketing:{pose:'idea',prop:'spark',label:'아이디어를 건네는 에코디언'},
  trade:{pose:'guide',prop:'route',label:'길을 잇는 에코디언'},
  invest:{pose:'guide',prop:'chart',label:'기회를 살피는 에코디언'},
  money:{pose:'guide',prop:'chart',label:'재정 흐름을 살피는 에코디언'},
  books:{pose:'read',prop:'book',label:'책을 권하는 에코디언'},
  publishing:{pose:'read',prop:'book',label:'이야기를 만드는 에코디언'},
  author:{pose:'idea',prop:'spark',label:'창작을 돕는 에코디언'},
  lab:{pose:'idea',prop:'spark',label:'질문을 품은 에코디언'},
  edu:{pose:'read',prop:'book',label:'배움을 돕는 에코디언'},
  my:{pose:'welcome',prop:'heart',label:'나의 여정을 함께하는 에코디언'},
  support:{pose:'welcome',prop:'heart',label:'기회를 연결하는 에코디언'},
  pay:{pose:'guide',prop:'shield',label:'안전한 결제를 돕는 에코디언'},
  insurance:{pose:'guide',prop:'shield',label:'안심을 돕는 에코디언'},
  live:{pose:'welcome',prop:'spark',label:'오늘의 이야기를 여는 에코디언'},
  media:{pose:'welcome',prop:'spark',label:'이야기의 장면을 여는 에코디언'},
  social:{pose:'welcome',prop:'heart',label:'사람과 소식을 잇는 에코디언'},
  messenger:{pose:'welcome',prop:'heart',label:'대화를 이어 주는 에코디언'},
  developer:{pose:'guide',prop:'route',label:'연결 규격을 안내하는 에코디언'},
  experience:{pose:'welcome',prop:'spark',label:'체험의 길을 여는 에코디언'},
  work:{pose:'guide',prop:'route',label:'집중할 일을 안내하는 에코디언'},
  energy:{pose:'guide',prop:'chart',label:'에너지 흐름을 살피는 에코디언'},
  mail:{pose:'guide',prop:'route',label:'소식을 정확히 이어 주는 에코디언'},
  cloud:{pose:'guide',prop:'route',label:'자료와 작업을 이어 주는 에코디언'},
  life:{pose:'welcome',prop:'heart',label:'삶의 질문 곁에 있는 에코디언'},
  journal:{pose:'read',prop:'book',label:'기록과 성찰을 돕는 에코디언'},
  space:{pose:'guide',prop:'route',label:'운영공간을 안내하는 에코디언'},
  management:{pose:'guide',prop:'chart',label:'운영을 정리하는 에코디언'}
});

function serviceId(){return String(document.documentElement.dataset.ekodiService||document.body?.dataset?.ekodiService||location.hostname.split('.')[0]||'my').trim().toLowerCase();}
function surface(){return String(document.documentElement.dataset.ekodiShellSurface||document.documentElement.dataset.ekodiUserSurface||'').trim().toLowerCase();}
function mode(){return String(document.documentElement.dataset.ekodiCharacter||document.body?.dataset?.ekodiCharacter||'auto').trim().toLowerCase();}
function context(){return String(document.documentElement.dataset.ekodiCharacterContext||document.body?.dataset?.ekodiCharacterContext||'').trim().toLowerCase();}
function registry(){return window.EKODICharacterRegistry||null;}
function profiles(){return registry()?.services||FALLBACK_PROFILES;}
function isLanding(){
  const parts=location.pathname.split('/').filter(Boolean);
  if(location.hostname==='ekodi.kr'||location.hostname==='www.ekodi.kr')return parts.length<=1;
  return parts.length===0;
}
function profile(){return profiles()[serviceId()]||FALLBACK_PROFILES[serviceId()]||{pose:'welcome',prop:'heart',label:'함께하는 에코디언'};}
function operationCharacter(){return operationSnapshot?.character&&typeof operationSnapshot.character==='object'?operationSnapshot.character:null;}
function experienceState(){
  const operationState=String(operationCharacter()?.state||'').trim().toLowerCase();
  if(operationState&&registry()?.experienceStates?.[operationState])return operationState;
  const requested=String(document.documentElement.dataset.ekodiCharacterState||document.body?.dataset?.ekodiCharacterState||'welcome').trim().toLowerCase();
  const active=registry();
  if(active?.experienceStates?.[requested])return requested;
  if(active?.placements?.[requested])return active.placements[requested];
  return 'calm';
}
function isRestrainedContext(){
  const value=context();if(!value)return false;
  const configured=registry()?.restraint?.minimize;
  return Array.isArray(configured)?configured.includes(value):FALLBACK_RESTRAINT.has(value);
}
function operationHidden(){return Number(operationCharacter()?.presence?.level)===0;}
function eligible(){return USER_SURFACES.has(surface())&&!DISABLED_MODES.has(mode())&&isLanding()&&!isRestrainedContext()&&!operationHidden();}
function propSvg(prop){
  if(prop==='book')return '<g transform="translate(103 92)"><path d="M-24 0c12-5 20-3 24 2v26c-7-5-15-6-24-3Z"/><path d="M24 0C12-5 3-3 0 2v26c7-5 15-6 24-3Z"/></g>';
  if(prop==='cup')return '<g transform="translate(109 96)"><path d="M-18-7h28v25h-28Z"/><path d="M10-2h7c10 0 10 15 0 15h-7" fill="none"/></g>';
  if(prop==='bag')return '<g transform="translate(108 97)"><rect x="-20" y="-4" width="35" height="29" rx="5"/><path d="M-10-4c0-12 16-12 16 0" fill="none"/></g>';
  if(prop==='chart')return '<g transform="translate(109 94)"><rect x="-22" y="-12" width="40" height="34" rx="4"/><path d="m-14 13 9-10 8 5 9-14" fill="none"/></g>';
  if(prop==='shield')return '<g transform="translate(108 94)"><path d="M0-18 19-10v17c0 14-8 23-19 29-11-6-19-15-19-29v-17Z"/><path d="m-9 5 7 7 12-15" fill="none"/></g>';
  if(prop==='route')return '<g transform="translate(110 95)"><path d="M-21 18C-9-15 6-15 21 4" fill="none"/><circle cx="-21" cy="18" r="4"/><circle cx="21" cy="4" r="4"/></g>';
  if(prop==='spark')return '<g transform="translate(111 91)"><path d="M0-20 6-6 20 0 6 6 0 20-6 6-20 0-6-6Z"/></g>';
  return '<g transform="translate(110 94)"><path d="M0 22C-28 3-19-18-5-18 4-18 8-12 10-7c3-5 7-11 16-11 14 0 23 21-6 40L10 29Z"/></g>';
}
function svg(p){
  const wave=p.pose==='welcome'?'<path class="ekodian-line" d="M70 84C52 72 43 59 47 47"/>':'';
  return `<svg viewBox="0 0 180 180" role="img" aria-label="${p.label}"><ellipse cx="89" cy="153" rx="55" ry="9" class="ekodian-shadow"/><g class="ekodian-body"><circle cx="82" cy="64" r="25" class="ekodian-skin"/><path d="M58 61c3-24 38-32 50-5-8-4-14-10-18-18-8 10-18 18-32 23Z" class="ekodian-hair"/><path d="M58 91c16-15 41-15 56 0l10 53H48Z" class="ekodian-shirt"/><path class="ekodian-line" d="M70 62h3M91 62h3M76 73c5 4 10 4 15 0"/>${wave}<path class="ekodian-line" d="M58 102c-12 9-17 19-18 32M112 102c11 8 17 19 18 32"/>${propSvg(p.prop)}</g></svg>`;
}
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
  .ekodi-main-ekodian-host{position:relative!important;isolation:isolate}.ekodi-main-ekodian{position:absolute;z-index:3;right:clamp(10px,3vw,42px);bottom:clamp(6px,1.6vw,24px);width:clamp(108px,13vw,176px);pointer-events:none;opacity:.96;filter:drop-shadow(0 10px 18px rgba(22,43,31,.10));color:var(--ekodi-service-accent,var(--accent,#78b89b))}.ekodi-main-ekodian svg{display:block;width:100%;height:auto;overflow:visible}.ekodi-main-ekodian .ekodian-shadow{fill:color-mix(in srgb,currentColor 10%,transparent)}.ekodi-main-ekodian .ekodian-skin{fill:#f1c3a0;stroke:#26372e;stroke-width:3}.ekodi-main-ekodian .ekodian-hair{fill:#26372e}.ekodi-main-ekodian .ekodian-shirt{fill:color-mix(in srgb,currentColor 64%,#fff 36%);stroke:#26372e;stroke-width:3}.ekodi-main-ekodian .ekodian-line{fill:none;stroke:#26372e;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.ekodi-main-ekodian g g{fill:color-mix(in srgb,currentColor 28%,#fff 72%);stroke:#26372e;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.ekodi-main-ekodian .ekodian-body{transform-origin:88px 142px;animation:ekodi-ekodian-breathe 5.8s ease-in-out infinite}@keyframes ekodi-ekodian-breathe{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-3px) rotate(.4deg)}}
  @media(max-width:760px){.ekodi-main-ekodian{right:8px;bottom:5px;width:clamp(92px,28vw,126px);opacity:.91}.ekodi-main-ekodian-host{padding-right:min(22vw,88px)!important}}
  @media(max-width:420px){.ekodi-main-ekodian{width:88px;opacity:.88}.ekodi-main-ekodian-host{padding-right:68px!important}}
  @media(prefers-reduced-motion:reduce){.ekodi-main-ekodian .ekodian-body{animation:none!important}}
  `;(document.head||document.documentElement).append(style);
}
function heroTarget(){
  const explicit=document.querySelector('[data-ekodi-character-host]');if(explicit)return explicit;
  const selectors=['main .hero','main [class*="hero"]','main [data-hero]','main > section:first-of-type','main','[role="main"]'];
  for(const selector of selectors){const node=document.querySelector(selector);if(node&&node.getBoundingClientRect().height>120)return node;}
  return null;
}
function mount(){
  if(!eligible()||!document.body)return null;
  const host=heroTarget();if(!host)return null;
  installStyle();host.classList.add('ekodi-main-ekodian-host');
  const selected=profile();const operation=operationCharacter();const node=document.createElement('aside');node.className='ekodi-main-ekodian';node.setAttribute(CHARACTER_ATTR,`v${VERSION}`);node.dataset.ekodiCharacterVariant=String(document.documentElement.dataset.ekodiCharacterProfile||'auto');node.dataset.ekodiCharacterState=experienceState();node.dataset.ekodiCharacterRole=String(operation?.role||'guide');node.dataset.ekodiCharacterGeneration=String(operationSnapshot?.generation||registry()?.system?.generation||8);node.dataset.ekodiCharacterPresence=String(operation?.presence?.token||'supporting');node.setAttribute('aria-label',selected.label);node.innerHTML=svg(selected);host.append(node);
  document.documentElement.dataset.ekodiUserCharacter=`v${VERSION}`;
  document.documentElement.dataset.ekodiCharacterGeneration=String(operationSnapshot?.generation||registry()?.system?.generation||8);
  window.dispatchEvent(new CustomEvent('ekodi:user-character-ready',{detail:{version:VERSION,registryVersion:registry()?.schemaVersion||0,generation:Number(document.documentElement.dataset.ekodiCharacterGeneration||8),service:serviceId(),profile:selected.prop,state:experienceState(),role:node.dataset.ekodiCharacterRole}}));
  return node;
}
function refresh(force=false){
  const existing=document.querySelector(`.ekodi-main-ekodian[${CHARACTER_ATTR}]`);
  if(force)existing?.remove();
  const current=force?null:existing;
  if(!eligible()){current?.remove();return null;}
  const variant=String(document.documentElement.dataset.ekodiCharacterProfile||'auto');
  const state=experienceState();
  const role=String(operationCharacter()?.role||'guide');
  if(current&&(current.dataset.ekodiCharacterVariant!==variant||current.dataset.ekodiCharacterState!==state||current.dataset.ekodiCharacterRole!==role)){current.remove();return mount();}
  return current||mount();
}
function applyOperation(snapshot){
  const value=snapshot?.ekodian&&typeof snapshot.ekodian==='object'?snapshot.ekodian:snapshot;
  if(!value||typeof value!=='object')return false;
  if(value.contract&&value.contract!=='ekodi.ekodian-operation.v1')return false;
  if(value.generation&&Number(value.generation)!==8)return false;
  operationSnapshot=value;
  const character=operationCharacter();
  document.documentElement.dataset.ekodiCharacterState=String(character?.state||'calm');
  document.documentElement.dataset.ekodiCharacterRole=String(character?.role||'guide');
  document.documentElement.dataset.ekodiCharacterGeneration='8';
  refresh(true);
  window.dispatchEvent(new CustomEvent('ekodi:user-character-operation-applied',{detail:{generation:8,state:character?.state||'calm',role:character?.role||'guide',presence:character?.presence||null}}));
  return true;
}
function clearOperation(){
  operationSnapshot=null;
  delete document.documentElement.dataset.ekodiCharacterRole;
  refresh(true);
}
function registryUrl(){
  try{const src=document.currentScript?.src;if(src)return new URL(REGISTRY_ASSET,src).href;}catch{}
  return `https://shell.ekodi.kr/${REGISTRY_ASSET}`;
}
function ensureRegistry(){
  if(registry()||document.querySelector(`script[${REGISTRY_ATTR}]`))return;
  const script=document.createElement('script');script.src=registryUrl();script.async=true;script.setAttribute(REGISTRY_ATTR,'');script.addEventListener('error',()=>{document.documentElement.dataset.ekodiCharacterRegistry='fallback';},{once:true});(document.head||document.documentElement).append(script);
}

window.EKODIUserCharacter=Object.freeze({
  version:VERSION,
  generation:8,
  refresh,
  applyOperation,
  clearOperation,
  operation:()=>operationSnapshot,
  profile:()=>({...profile()}),
  state:()=>experienceState(),
  registry:()=>registry()
});
const boot=()=>{ensureRegistry();setTimeout(refresh,0);setTimeout(refresh,600)};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener('ekodi:surface-change',refresh);
window.addEventListener('ekodi:design-profile-ready',refresh);
window.addEventListener('ekodi:agent-state',event=>applyOperation(event?.detail||null));
window.addEventListener('ekodi:character-registry-ready',()=>{document.documentElement.dataset.ekodiCharacterRegistry=`v${registry()?.schemaVersion||1}`;document.documentElement.dataset.ekodiCharacterGeneration=String(registry()?.system?.generation||8);refresh(true);});
})();
