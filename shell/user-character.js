(()=>{
'use strict';
if(window.__EKODI_USER_CHARACTER_BOOTED)return;
window.__EKODI_USER_CHARACTER_BOOTED=true;

const VERSION=2;
const STYLE_ID='ekodi-user-character-style';
const USER_SURFACES=new Set(['public','workspace']);
const DISABLED_MODES=new Set(['off','hidden','none']);
const CHARACTER_ATTR='data-ekodi-user-character';
const PROFILES=Object.freeze({
  church:{pose:'welcome',prop:'book',label:'함께 말씀을 나누는 에코디언'},
  community:{pose:'welcome',prop:'heart',label:'이웃을 잇는 에코디언'},
  cafe:{pose:'welcome',prop:'cup',label:'반갑게 맞이하는 에코디언'},
  mall:{pose:'guide',prop:'bag',label:'필요를 함께 찾는 에코디언'},
  business:{pose:'guide',prop:'chart',label:'일을 돕는 에코디언'},
  biz:{pose:'guide',prop:'chart',label:'일을 돕는 에코디언'},
  marketing:{pose:'idea',prop:'spark',label:'아이디어를 건네는 에코디언'},
  trade:{pose:'guide',prop:'route',label:'길을 잇는 에코디언'},
  invest:{pose:'guide',prop:'chart',label:'기회를 살피는 에코디언'},
  books:{pose:'read',prop:'book',label:'책을 권하는 에코디언'},
  publishing:{pose:'read',prop:'book',label:'이야기를 만드는 에코디언'},
  author:{pose:'idea',prop:'spark',label:'창작을 돕는 에코디언'},
  lab:{pose:'idea',prop:'spark',label:'질문을 품은 에코디언'},
  edu:{pose:'read',prop:'book',label:'배움을 돕는 에코디언'},
  my:{pose:'welcome',prop:'heart',label:'나의 여정을 함께하는 에코디언'},
  support:{pose:'welcome',prop:'heart',label:'기회를 연결하는 에코디언'},
  pay:{pose:'guide',prop:'shield',label:'안전한 결제를 돕는 에코디언'},
  insurance:{pose:'guide',prop:'shield',label:'안심을 돕는 에코디언'},
  live:{pose:'welcome',prop:'spark',label:'오늘의 이야기를 여는 에코디언'}
});

function serviceId(){return String(document.documentElement.dataset.ekodiService||document.body?.dataset?.ekodiService||location.hostname.split('.')[0]||'my').trim().toLowerCase();}
function surface(){return String(document.documentElement.dataset.ekodiShellSurface||document.documentElement.dataset.ekodiUserSurface||'').trim().toLowerCase();}
function mode(){return String(document.documentElement.dataset.ekodiCharacter||document.body?.dataset?.ekodiCharacter||'auto').trim().toLowerCase();}
function isLanding(){
  const parts=location.pathname.split('/').filter(Boolean);
  if(location.hostname==='ekodi.kr'||location.hostname==='www.ekodi.kr')return parts.length<=1;
  return parts.length===0;
}
function profile(){return PROFILES[serviceId()]||{pose:'welcome',prop:'heart',label:'함께하는 에코디언'};}
function eligible(){return USER_SURFACES.has(surface())&&!DISABLED_MODES.has(mode())&&isLanding();}
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
  const selected=profile();const node=document.createElement('aside');node.className='ekodi-main-ekodian';node.setAttribute(CHARACTER_ATTR,`v${VERSION}`);node.dataset.ekodiCharacterVariant=String(document.documentElement.dataset.ekodiCharacterProfile||'auto');node.setAttribute('aria-label',selected.label);node.innerHTML=svg(selected);host.append(node);
  document.documentElement.dataset.ekodiUserCharacter=`v${VERSION}`;
  window.dispatchEvent(new CustomEvent('ekodi:user-character-ready',{detail:{version:VERSION,service:serviceId(),profile:profile().prop}}));
  return node;
}
function refresh(){const existing=document.querySelector(`.ekodi-main-ekodian[${CHARACTER_ATTR}]`);if(!eligible()){existing?.remove();return null;}const variant=String(document.documentElement.dataset.ekodiCharacterProfile||'auto');if(existing&&existing.dataset.ekodiCharacterVariant!==variant){existing.remove();return mount();}return existing||mount();}
window.EKODIUserCharacter=Object.freeze({version:VERSION,refresh,profile:()=>({...profile()})});
const boot=()=>{setTimeout(refresh,0);setTimeout(refresh,600)};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener('ekodi:surface-change',refresh);
window.addEventListener('ekodi:design-profile-ready',refresh);
})();
