(()=>{
'use strict';
if(window.__EKODI_USER_UI_HEADER_BOOTED)return;
window.__EKODI_USER_UI_HEADER_BOOTED=true;

const VERSION=2;
const STYLE_ID='ekodi-user-ui-header-style';
const USER_SURFACES=new Set(['public','workspace']);
const DISABLED_MODES=new Set(['off','hidden','immersive']);
const ROOT_CLASS='ekodi-user-ui-header';
const CENTER_CLASS='ekodi-user-ui-header-center';
const FALLBACK_CLASS='ekodi-user-ui-header-fallback';
const SPACER_ATTR='data-ekodi-user-header-spacer';
const FALLBACK_ATTR='data-ekodi-user-header-fallback';
const HOME_ATTR='data-ekodi-header-home';
const HEADER_SELECTORS=[
  'header[data-ekodi-user-header-root]',
  'header[data-ekodi-fixed-header]',
  '.site-header',
  '.topbar',
  '.app-header',
  '.main-header',
  '.mobile-header',
  '.global-header',
  '.nav-header',
  '.header-wrap',
  'header[role="banner"]',
  'body > header',
  'body header:first-of-type'
];
const CENTER_SELECTORS=[
  '[data-ekodi-header-center]',
  '[data-ekodi-header-title]',
  '.header-title',
  '.site-title',
  '.page-title',
  '.brand-title',
  'h1'
];

let activeHeader=null;
let activeCenter=null;
let spacer=null;
let fallbackHeader=null;
let resizeObserver=null;
let mutationObserver=null;
let scheduled=false;

function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .${ROOT_CLASS}{
      position:fixed!important;
      top:0!important;
      left:0!important;
      right:0!important;
      width:100%!important;
      max-width:none!important;
      z-index:2147482000!important;
      box-sizing:border-box!important;
      min-height:var(--ekodi-user-header-min-height,48px)!important;
      padding-top:calc(var(--ekodi-user-header-base-padding-top,0px) + env(safe-area-inset-top,0px))!important;
      transform:none!important;
      isolation:isolate;
    }
    .${ROOT_CLASS} .${CENTER_CLASS}{
      position:absolute!important;
      left:50%!important;
      top:50%!important;
      transform:translate(-50%,-50%)!important;
      width:max-content!important;
      max-width:min(66vw,760px)!important;
      margin-left:0!important;
      margin-right:0!important;
      text-align:center!important;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      z-index:1;
    }
    .${FALLBACK_CLASS}{
      min-height:64px!important;
      border-bottom:1px solid color-mix(in srgb,var(--ekodi-shell-border,#dfe4df) 72%,transparent)!important;
      background:color-mix(in srgb,var(--ekodi-shell-surface,#fafaf7) 94%,transparent)!important;
      backdrop-filter:blur(14px);
      color:var(--ekodi-shell-text,#18251d)!important;
      font:14px/1.4 system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif!important;
    }
    .${FALLBACK_CLASS} .ekodi-user-ui-header-fallback__inner{width:min(1180px,calc(100% - 32px));min-height:64px;margin:0 auto;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:16px}
    .${FALLBACK_CLASS} a{color:inherit;text-decoration:none}.${FALLBACK_CLASS} a:focus-visible{outline:2px solid currentColor;outline-offset:4px;border-radius:4px}
    .${FALLBACK_CLASS} .ekodi-user-ui-header-fallback__brand{font-weight:850;letter-spacing:.12em}.ekodi-user-ui-header-fallback__context{text-align:center;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ekodi-user-ui-header-fallback__my{color:var(--ekodi-shell-focus,#315d48)!important;font-weight:650}
    [${SPACER_ATTR}]{
      display:block!important;
      width:100%!important;
      min-width:0!important;
      pointer-events:none!important;
      visibility:hidden!important;
      grid-column:1/-1!important;
      flex:0 0 auto!important;
    }
    html{scroll-padding-top:calc(var(--ekodi-user-header-height,0px) + 12px)}
    @media(max-width:768px){
      .${ROOT_CLASS} .${CENTER_CLASS}{max-width:54vw!important}
    }
    @media(max-width:480px){
      .${ROOT_CLASS} .${CENTER_CLASS}{max-width:48vw!important}
      .${FALLBACK_CLASS} .ekodi-user-ui-header-fallback__inner{width:min(100% - 24px,1180px);gap:10px;font-size:12px}
    }
  `;
  (document.head||document.documentElement).append(style);
}

function surface(){return String(document.documentElement.dataset.ekodiShellSurface||'').toLowerCase();}
function mode(){
  const htmlMode=String(document.documentElement.dataset.ekodiUserHeader||'').toLowerCase();
  const bodyMode=String(document.body?.dataset?.ekodiUserHeader||'').toLowerCase();
  return bodyMode||htmlMode||'default';
}
function shouldEnable(){
  if(!USER_SURFACES.has(surface()))return false;
  if(DISABLED_MODES.has(mode()))return false;
  return true;
}
function visible(element){
  if(!element||!element.isConnected)return false;
  if(element.closest('[data-ekodi-shell-root],[data-ekodi-header-ignore]'))return false;
  const css=getComputedStyle(element);
  if(css.display==='none'||css.visibility==='hidden')return false;
  const rect=element.getBoundingClientRect();
  return rect.width>0&&rect.height>0;
}
function findHeader(){
  for(const selector of HEADER_SELECTORS){
    for(const node of document.querySelectorAll(selector)){
      if(node.hasAttribute(FALLBACK_ATTR))continue;
      if(node.dataset.ekodiUserHeader==='off'||node.dataset.ekodiHeaderFixed==='off')continue;
      if(visible(node))return node;
    }
  }
  return null;
}
function serviceLabel(){
  const id=String(document.currentScript?.dataset?.ekodiService||document.documentElement.dataset.ekodiService||'').trim();
  const fromTitle=String(document.title||'').split('|')[0].trim();
  return fromTitle||id.toUpperCase()||'EKODI';
}
function ensureFallback(){
  if(!document.body)return null;
  const existing=document.querySelector(`[${FALLBACK_ATTR}]`);
  if(existing){fallbackHeader=existing;fallbackHeader.classList.add(FALLBACK_CLASS);return fallbackHeader;}
  const header=document.createElement('header');
  header.className=FALLBACK_CLASS;
  header.setAttribute(FALLBACK_ATTR,`v${VERSION}`);
  header.setAttribute('data-ekodi-user-header-root',`v${VERSION}`);
  header.setAttribute('role','banner');
  header.innerHTML=`<div class="ekodi-user-ui-header-fallback__inner"><a class="ekodi-user-ui-header-fallback__brand" data-ekodi-header-home href="https://ekodi.kr/" aria-label="EKODI 홈">EKODI</a><span class="ekodi-user-ui-header-fallback__context" data-ekodi-header-center>${serviceLabel()}</span><a class="ekodi-user-ui-header-fallback__my" href="https://my.ekodi.kr/">My EKODI</a></div>`;
  document.body.prepend(header);
  fallbackHeader=header;
  return header;
}
function removeFallback(){
  if(fallbackHeader?.isConnected)fallbackHeader.remove();
  fallbackHeader=null;
}
function serviceHomeUrl(){
  const explicit=String(document.documentElement.dataset.ekodiHome||document.body?.dataset?.ekodiHome||'').trim();
  if(explicit){try{return new URL(explicit,location.href)}catch{}}
  const url=new URL(location.href);
  url.search='';url.hash='';
  if(url.hostname==='ekodi.kr'||url.hostname==='www.ekodi.kr'){
    const segment=url.pathname.split('/').filter(Boolean)[0]||'';
    const globalRoots=new Set(['privacy','terms','admin']);
    url.pathname=segment&&!globalRoots.has(segment)?`/${segment}/`:'/';
  }else url.pathname='/';
  return url;
}
function serviceHomeAnchor(){
  const value=String(document.documentElement.dataset.ekodiHomeAnchor||document.body?.dataset?.ekodiHomeAnchor||'').trim();
  return /^#[A-Za-z][\w:.-]*$/.test(value)?value:'';
}
function findHomeAnchor(header){
  const selectors=[`[${HOME_ATTR}]`,'.brand[href]','a.brand[href]','.site-brand a[href]','.logo a[href]','a.logo[href]','.site-logo a[href]'];
  for(const selector of selectors){const node=header?.querySelector(selector);if(node instanceof HTMLAnchorElement)return node;}
  return null;
}
function bindHomeAnchor(header){
  const anchor=findHomeAnchor(header);if(!anchor)return;
  const localAnchor=serviceHomeAnchor();
  anchor.setAttribute(HOME_ATTR,`v${VERSION}`);
  if(localAnchor)anchor.setAttribute('href',localAnchor);else anchor.href=serviceHomeUrl().toString();
  if(anchor.dataset.ekodiHeaderHomeBound==='true')return;
  anchor.dataset.ekodiHeaderHomeBound='true';
  anchor.addEventListener('click',event=>{
    if(serviceHomeAnchor())return;
    const target=serviceHomeUrl();
    const here=new URL(location.href);here.search='';here.hash='';
    if(here.origin===target.origin&&here.pathname.replace(/\/+$/,'/')===target.pathname.replace(/\/+$/,'/')){
      event.preventDefault();
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({top:0,left:0,behavior:reduced?'auto':'smooth'});
      try{history.replaceState(history.state,'',target.pathname+location.search);}catch{}
    }
  });
}
function safeCenterCandidate(node){
  if(!node||!visible(node))return false;
  if(node.closest('[data-ekodi-header-side]'))return false;
  return node.querySelectorAll('button,input,select,textarea').length===0;
}
function findCenter(header){
  for(const selector of CENTER_SELECTORS){
    for(const node of header.querySelectorAll(selector))if(safeCenterCandidate(node))return node;
  }
  return null;
}
function updateSpacer(){
  if(!activeHeader||!spacer)return;
  const height=Math.max(0,Math.ceil(activeHeader.getBoundingClientRect().height));
  spacer.style.height=`${height}px`;
  spacer.style.flexBasis=`${height}px`;
  document.documentElement.style.setProperty('--ekodi-user-header-height',`${height}px`);
}
function detach(){
  if(resizeObserver){resizeObserver.disconnect();resizeObserver=null;}
  if(activeCenter){activeCenter.classList.remove(CENTER_CLASS);activeCenter.removeAttribute('data-ekodi-user-header-centered');}
  if(activeHeader){
    activeHeader.classList.remove(ROOT_CLASS);
    activeHeader.removeAttribute('data-ekodi-user-header-fixed');
    activeHeader.style.removeProperty('--ekodi-user-header-base-padding-top');
    activeHeader.style.removeProperty('--ekodi-user-header-min-height');
  }
  if(spacer){spacer.remove();spacer=null;}
  activeHeader=null;
  activeCenter=null;
  document.documentElement.style.removeProperty('--ekodi-user-header-height');
}
function attach(header){
  if(!header||!shouldEnable())return;
  bindHomeAnchor(header);
  if(activeHeader===header&&spacer?.isConnected){
    const nextCenter=findCenter(header);
    if(nextCenter!==activeCenter){
      if(activeCenter)activeCenter.classList.remove(CENTER_CLASS);
      activeCenter=nextCenter;
      if(activeCenter){activeCenter.classList.add(CENTER_CLASS);activeCenter.setAttribute('data-ekodi-user-header-centered','true');}
    }
    updateSpacer();
    return;
  }
  detach();
  activeHeader=header;
  const computed=getComputedStyle(header);
  const beforeHeight=Math.max(48,Math.ceil(header.getBoundingClientRect().height));
  header.style.setProperty('--ekodi-user-header-base-padding-top',computed.paddingTop||'0px');
  header.style.setProperty('--ekodi-user-header-min-height',`${beforeHeight}px`);
  header.classList.add(ROOT_CLASS);
  header.setAttribute('data-ekodi-user-header-root',`v${VERSION}`);
  header.setAttribute('data-ekodi-user-header-fixed',`v${VERSION}`);
  if(!header.getAttribute('role'))header.setAttribute('role','banner');
  activeCenter=findCenter(header);
  if(activeCenter){activeCenter.classList.add(CENTER_CLASS);activeCenter.setAttribute('data-ekodi-user-header-centered','true');}
  spacer=document.createElement('div');
  spacer.setAttribute(SPACER_ATTR,`v${VERSION}`);
  spacer.setAttribute('aria-hidden','true');
  header.insertAdjacentElement('afterend',spacer);
  resizeObserver=new ResizeObserver(updateSpacer);
  resizeObserver.observe(header);
  requestAnimationFrame(updateSpacer);
  window.dispatchEvent(new CustomEvent('ekodi:user-header-ready',{detail:{version:VERSION,surface:surface(),centered:Boolean(activeCenter),fallback:header.hasAttribute(FALLBACK_ATTR)}}));
}
function reconcile(){
  scheduled=false;
  installStyle();
  if(!shouldEnable()){detach();removeFallback();return;}
  const header=findHeader();
  if(header){if(activeHeader===fallbackHeader)detach();removeFallback();attach(header);return;}
  attach(ensureFallback());
}
function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(reconcile);
}

window.EKODIUserUIHeader=Object.freeze({
  version:VERSION,
  refresh:schedule,
  getState:()=>({enabled:shouldEnable(),surface:surface(),mode:mode(),attached:Boolean(activeHeader),centered:Boolean(activeCenter),fallback:Boolean(activeHeader?.hasAttribute(FALLBACK_ATTR))})
});
window.addEventListener('ekodi:shell-theme',schedule);
window.addEventListener('ekodi:surface-change',schedule);
window.addEventListener('resize',schedule,{passive:true});
window.addEventListener('orientationchange',schedule,{passive:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
mutationObserver=new MutationObserver(schedule);
mutationObserver.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ekodi-shell-surface','data-ekodi-user-header','data-ekodi-home-anchor']});
})();
