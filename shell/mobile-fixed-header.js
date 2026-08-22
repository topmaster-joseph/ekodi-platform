(()=>{
'use strict';
if(window.__EKODI_MOBILE_FIXED_HEADER_BOOTED)return;
window.__EKODI_MOBILE_FIXED_HEADER_BOOTED=true;

const MOBILE_MAX=768;
const STYLE_ID='ekodi-mobile-fixed-header-style';
const SPACER_ATTR='data-ekodi-mobile-header-spacer';
const HEADER_SELECTORS=[
  '[data-ekodi-fixed-header]',
  '.site-header',
  '.topbar',
  '.app-header',
  '.main-header',
  '.mobile-header',
  '.page-header',
  'header[role="banner"]',
  'body > header'
];
let activeHeader=null;
let spacer=null;
let resizeObserver=null;
let mutationObserver=null;

function isMobile(){return window.matchMedia(`(max-width:${MOBILE_MAX}px)`).matches;}
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`@media(max-width:${MOBILE_MAX}px){
    .ekodi-mobile-fixed-header{
      position:fixed!important;
      top:0!important;
      left:0!important;
      right:0!important;
      width:100%!important;
      max-width:none!important;
      z-index:2147482000!important;
      box-sizing:border-box!important;
      padding-top:calc(var(--ekodi-mobile-header-base-padding-top,0px) + env(safe-area-inset-top,0px))!important;
      transform:none!important;
    }
    [${SPACER_ATTR}]{display:block!important;width:100%!important;min-width:0!important;pointer-events:none!important;visibility:hidden!important;grid-column:1/-1!important;flex:0 0 auto!important}
    html{scroll-padding-top:calc(var(--ekodi-mobile-fixed-header-height,0px) + 12px)}
  }`;
  (document.head||document.documentElement).append(style);
}
function visible(element){
  if(!element||!element.isConnected)return false;
  const css=getComputedStyle(element);
  if(css.display==='none'||css.visibility==='hidden')return false;
  const rect=element.getBoundingClientRect();
  return rect.width>0&&rect.height>0;
}
function findHeader(){
  for(const selector of HEADER_SELECTORS){
    const nodes=document.querySelectorAll(selector);
    for(const node of nodes){if(visible(node))return node;}
  }
  return null;
}
function updateSpacer(){
  if(!activeHeader||!spacer||!isMobile())return;
  const height=Math.max(0,Math.ceil(activeHeader.getBoundingClientRect().height));
  spacer.style.height=`${height}px`;
  spacer.style.flexBasis=`${height}px`;
  document.documentElement.style.setProperty('--ekodi-mobile-fixed-header-height',`${height}px`);
}
function detach(){
  if(resizeObserver){resizeObserver.disconnect();resizeObserver=null;}
  if(activeHeader){
    activeHeader.classList.remove('ekodi-mobile-fixed-header');
    activeHeader.style.removeProperty('--ekodi-mobile-header-base-padding-top');
    activeHeader.removeAttribute('data-ekodi-mobile-fixed');
  }
  if(spacer){spacer.remove();spacer=null;}
  activeHeader=null;
  document.documentElement.style.removeProperty('--ekodi-mobile-fixed-header-height');
}
function attach(header){
  if(!header||!isMobile())return;
  if(activeHeader===header&&spacer?.isConnected){updateSpacer();return;}
  detach();
  activeHeader=header;
  const computed=getComputedStyle(header);
  header.style.setProperty('--ekodi-mobile-header-base-padding-top',computed.paddingTop||'0px');
  header.classList.add('ekodi-mobile-fixed-header');
  header.setAttribute('data-ekodi-mobile-fixed','true');
  spacer=document.createElement('div');
  spacer.setAttribute(SPACER_ATTR,'true');
  spacer.setAttribute('aria-hidden','true');
  header.insertAdjacentElement('afterend',spacer);
  resizeObserver=new ResizeObserver(updateSpacer);
  resizeObserver.observe(header);
  requestAnimationFrame(updateSpacer);
}
function enforce(){
  installStyle();
  if(!isMobile()){detach();return;}
  const header=findHeader();
  if(header)attach(header);
}
function schedule(){requestAnimationFrame(enforce);}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enforce,{once:true});
else enforce();
window.addEventListener('resize',schedule,{passive:true});
window.addEventListener('orientationchange',schedule,{passive:true});
mutationObserver=new MutationObserver(schedule);
mutationObserver.observe(document.documentElement,{childList:true,subtree:true});
})();
