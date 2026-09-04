(()=>{
'use strict';
if(window.__EKODI_USER_UI_FOOTER_BOOTED)return;
window.__EKODI_USER_UI_FOOTER_BOOTED=true;

const VERSION=4;
const STYLE_ID='ekodi-user-ui-footer-style';
const CONFIG_URL='https://shell.ekodi.kr/user-footer.json';
const USER_SURFACES=new Set(['public','workspace']);
const SERVICE_OWNED_FOOTER_SERVICES=new Set();
const FOOTER_ATTR='data-ekodi-user-footer';
const LEGACY_HIDDEN_ATTR='data-ekodi-legacy-common-footer-hidden';
let configPromise=null;

function surface(){return String(document.documentElement.dataset.ekodiShellSurface||document.documentElement.dataset.ekodiUserSurface||'').toLowerCase();}
function serviceId(){return String(document.documentElement.dataset.ekodiService||'').trim().toLowerCase();}
function footerMode(){return String(document.body?.dataset.ekodiFooterMode||document.documentElement.dataset.ekodiFooterMode||'').trim().toLowerCase();}
function serviceOwnsFooter(){return SERVICE_OWNED_FOOTER_SERVICES.has(serviceId())||['service','custom','off'].includes(footerMode())||Boolean(document.querySelector('[data-ekodi-service-footer]'));}
function enabled(){return USER_SURFACES.has(surface())&&!serviceOwnsFooter();}
function removeSharedFooter(){document.querySelectorAll(`[${FOOTER_ATTR}]`).forEach(node=>node.remove());}
function suppressLegacyCommonFooters(){
  if(serviceOwnsFooter())return;
  for(const node of document.querySelectorAll(`footer,.powered,[data-ekodi-legal-footer]`)){
    if(node.hasAttribute(FOOTER_ATTR)||node.hasAttribute(LEGACY_HIDDEN_ATTR))continue;
    const text=String(node.textContent||'').replace(/\s+/g,' ').trim();
    const powered=/^Powered by\s+(?:EKODI|EKODIBIZ)$/i.test(text);
    const commonLegal=/(?:사업자등록번호|Business Registration)/i.test(text)&&/(?:개인정보처리방침|Privacy Policy)/i.test(text)&&/(?:이용약관|Terms)/i.test(text);
    if(!powered&&!commonLegal)continue;
    node.setAttribute(LEGACY_HIDDEN_ATTR,'v1');
    node.setAttribute('aria-hidden','true');
  }
}
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .ekodi-user-ui-footer{position:relative!important;z-index:2!important;width:100%!important;box-sizing:border-box!important;margin-top:32px!important;border-top:1px solid var(--ekodi-user-footer-border,color-mix(in srgb,var(--ekodi-service-accent,currentColor) 18%,transparent))!important;background:var(--ekodi-user-footer-background,color-mix(in srgb,var(--ekodi-service-paper,transparent) 92%,var(--ekodi-service-accent,transparent) 8%))!important;color:var(--ekodi-user-footer-safe-text,#f4f7f5)!important;-webkit-text-fill-color:var(--ekodi-user-footer-safe-text,#f4f7f5)!important;font-family:system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif!important;font-size:14px!important;line-height:1.75!important;text-align:center!important;text-shadow:none!important}
    .ekodi-user-ui-footer__inner{width:min(1040px,calc(100% - 40px))!important;margin:0 auto!important;padding:28px 0 30px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:14px!important}
    .ekodi-user-ui-footer__copy{min-width:0!important;width:100%!important;display:grid!important;justify-items:center!important;gap:7px!important}.ekodi-user-ui-footer__service{font-size:12px!important;font-weight:750!important;letter-spacing:.04em!important;color:var(--ekodi-user-footer-safe-muted,#dbe5df)!important;-webkit-text-fill-color:var(--ekodi-user-footer-safe-muted,#dbe5df)!important}.ekodi-user-ui-footer__brand{font-size:14px!important;font-weight:850!important;letter-spacing:.13em!important;color:var(--ekodi-user-footer-safe-text,#f4f7f5)!important;-webkit-text-fill-color:var(--ekodi-user-footer-safe-text,#f4f7f5)!important}
    .ekodi-user-ui-footer__business,.ekodi-user-ui-footer__address{width:100%!important;display:flex!important;align-items:baseline!important;justify-content:center!important;gap:5px 16px!important;flex-wrap:wrap!important;color:var(--ekodi-user-footer-safe-text,#f4f7f5)!important;-webkit-text-fill-color:var(--ekodi-user-footer-safe-text,#f4f7f5)!important}.ekodi-user-ui-footer__address{word-break:keep-all!important}.ekodi-user-ui-footer__separator{color:var(--ekodi-user-footer-safe-muted,#dbe5df)!important;opacity:.9!important}
    .ekodi-user-ui-footer__links{display:flex!important;justify-content:center!important;align-items:center!important;gap:7px 18px!important;flex-wrap:wrap!important;white-space:normal!important}.ekodi-user-ui-footer a{color:var(--ekodi-user-footer-safe-link,#fff)!important;-webkit-text-fill-color:var(--ekodi-user-footer-safe-link,#fff)!important;font-weight:700!important;text-decoration:none!important;text-underline-offset:3px!important}.ekodi-user-ui-footer a:hover,.ekodi-user-ui-footer a:focus-visible{text-decoration:underline!important}.ekodi-user-ui-footer a:focus-visible{outline:2px solid currentColor!important;outline-offset:3px!important}
    .ekodi-user-ui-footer__copyright,.ekodi-user-ui-footer__scope{color:var(--ekodi-user-footer-safe-muted,#dbe5df)!important;-webkit-text-fill-color:var(--ekodi-user-footer-safe-muted,#dbe5df)!important;opacity:1!important}.ekodi-user-ui-footer__scope{max-width:800px!important;font-size:13px!important;line-height:1.7!important}
    [data-ekodi-legal-footer]:not(.ekodi-user-ui-footer),[data-ekodi-legacy-common-footer-hidden]{display:none!important}
    @media(max-width:720px){.ekodi-user-ui-footer{font-size:13px!important}.ekodi-user-ui-footer__inner{width:min(100% - 28px,1040px)!important;padding:24px 0 26px!important;gap:12px!important}.ekodi-user-ui-footer__business,.ekodi-user-ui-footer__address{gap:4px 11px!important}.ekodi-user-ui-footer__scope{font-size:12.5px!important}}
  `;
  (document.head||document.documentElement).append(style);
}
function parseRgb(value){
  const raw=String(value||'');
  const rgb=raw.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if(rgb)return [Number(rgb[1]),Number(rgb[2]),Number(rgb[3])].map(value=>Math.max(0,Math.min(255,value)));
  const srgb=raw.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if(srgb)return [Number(srgb[1]),Number(srgb[2]),Number(srgb[3])].map(value=>Math.max(0,Math.min(255,value*255)));
  return null;
}
function luminance(rgb){
  const channels=rgb.map(value=>{const v=value/255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});
  return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
}
function contrast(a,b){const l1=luminance(a),l2=luminance(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);}
function applyReadableFooter(footer){
  if(!(footer instanceof HTMLElement))return;
  const bg=parseRgb(getComputedStyle(footer).backgroundColor);
  const light=[247,250,248];
  const dark=[28,43,34];
  const useLight=!bg||contrast(bg,light)>=contrast(bg,dark);
  footer.style.setProperty('--ekodi-user-footer-safe-text',useLight?'#f7faf8':'#1c2b22');
  footer.style.setProperty('--ekodi-user-footer-safe-link',useLight?'#ffffff':'#163d2b');
  footer.style.setProperty('--ekodi-user-footer-safe-muted',useLight?'#dbe5df':'#4c6155');
  footer.dataset.ekodiFooterContrast=useLight?'light-on-dark':'dark-on-light';
}
function serviceLabel(){
  const service=serviceId();
  const explicit=String(document.documentElement.dataset.ekodiServiceLabel||document.body?.dataset?.ekodiServiceLabel||'').trim();
  if(explicit)return explicit;
  const title=String(document.title||'').split('|')[0].trim();
  if(title&&!/^my ekodi$/i.test(title))return title;
  const labels={church:'EKODI Church',community:'Community',cafe:'EKODI Cafe',mall:'EKODI Mall',business:'EKODI Biz',biz:'EKODI Biz',marketing:'Marketing AI',trade:'EKODI Trade',invest:'EKODI Invest',books:'EKODI Books',publishing:'Publishing',author:'EKODI Author',lab:'EKODI Lab',edu:'EKODI Education',my:'My EKODI'};
  return labels[service]||'';
}
function applyServiceContext(footer){
  if(!(footer instanceof HTMLElement))return;
  const service=serviceId()||'ekodi';
  footer.dataset.ekodiFooterService=service;
  const label=document.documentElement.dataset.ekodiFooterProfile==='inherit'?'':serviceLabel();
  let context=footer.querySelector('.ekodi-user-ui-footer__service');
  if(!label||/^ekodi$/i.test(label)){if(context)context.remove();return;}
  if(!context){
    context=document.createElement('div');
    context.className='ekodi-user-ui-footer__service';
    const brand=footer.querySelector('.ekodi-user-ui-footer__brand');
    if(brand)brand.insertAdjacentElement('afterend',context);else footer.querySelector('.ekodi-user-ui-footer__copy')?.prepend(context);
  }
  context.textContent=label;
}
function validConfig(value){return Boolean(value&&typeof value==='object'&&Number(value.version)>=3&&value.operator&&value.contact&&Array.isArray(value.legalLinks));}
async function loadConfig(){
  const embedded=window.__EKODI_USER_FOOTER_CONFIG__;
  if(validConfig(embedded))return embedded;
  if(!configPromise)configPromise=fetch(CONFIG_URL,{credentials:'omit',cache:'force-cache'}).then(async response=>{
    if(!response.ok)throw new Error(`footer-config-http-${response.status}`);
    const config=await response.json();
    if(!validConfig(config))throw new Error('footer-config-invalid');
    window.__EKODI_USER_FOOTER_CONFIG__=config;
    return config;
  }).catch(()=>null);
  return configPromise;
}
function appendText(parent,tag,text,className=''){
  const node=document.createElement(tag);
  if(className)node.className=className;
  node.textContent=String(text||'');
  parent.append(node);
  return node;
}
function createFooter(config){
  const footer=document.createElement('footer');
  footer.className='ekodi-user-ui-footer';
  footer.setAttribute(FOOTER_ATTR,`v${VERSION}`);
  footer.setAttribute('data-ekodi-legal-footer','user-shell-v2');
  footer.setAttribute('aria-label',String(config.ariaLabel||'EKODI 운영 및 법적 고지'));
  const inner=appendText(footer,'div','','ekodi-user-ui-footer__inner');
  const copy=appendText(inner,'div','','ekodi-user-ui-footer__copy');
  appendText(copy,'strong',config.brand,'ekodi-user-ui-footer__brand');
  const business=appendText(copy,'div','','ekodi-user-ui-footer__business');
  appendText(business,'span',`${config.operator.label} ${config.operator.name}`);
  appendText(business,'span',`${config.operator.representativeLabel} ${config.operator.representative}`);
  appendText(business,'span',`${config.operator.registrationLabel} ${config.operator.businessRegistrationNumber}`);
  const address=appendText(copy,'div','','ekodi-user-ui-footer__address');
  appendText(address,'span',`${config.contact.addressLabel} ${config.contact.address}`);
  appendText(address,'span','·','ekodi-user-ui-footer__separator').setAttribute('aria-hidden','true');
  const email=appendText(address,'a',config.contact.email);
  email.href=String(config.contact.emailHref||`mailto:${config.contact.email}`);
  appendText(copy,'div',config.copyright,'ekodi-user-ui-footer__copyright');
  appendText(copy,'div',config.precedenceNotice,'ekodi-user-ui-footer__scope');
  const nav=appendText(inner,'nav','','ekodi-user-ui-footer__links');
  nav.setAttribute('aria-label','법적 고지');
  for(const item of config.legalLinks){
    if(!item?.href||!item?.label)continue;
    const link=appendText(nav,'a',item.label);
    link.href=String(item.href);
    if(item.i18n)link.setAttribute('data-ekodi-i18n',String(item.i18n));
  }
  return footer;
}
async function reconcile(){
  if(serviceOwnsFooter()){
    removeSharedFooter();
    return;
  }
  if(!enabled()||!document.body)return;
  installStyle();
  suppressLegacyCommonFooters();
  const existing=document.querySelector(`[${FOOTER_ATTR}]`);
  if(existing){applyServiceContext(existing);applyReadableFooter(existing);return;}
  const config=await loadConfig();
  if(serviceOwnsFooter()){
    removeSharedFooter();
    return;
  }
  if(!config||document.querySelector(`[${FOOTER_ATTR}]`)||!document.body)return;
  const footer=createFooter(config);
  document.body.append(footer);
  applyReadableFooter(footer);
  window.EKODIUserLanguage?.refresh?.();
  window.dispatchEvent(new CustomEvent('ekodi:user-footer-ready',{detail:{version:VERSION,surface:surface()}}));
}
window.EKODIUserUIFooter=Object.freeze({version:VERSION,refresh:reconcile});
window.addEventListener('ekodi:shell-theme',()=>{void reconcile();});
window.addEventListener('ekodi:surface-change',()=>{void reconcile();});
window.addEventListener('ekodi:design-profile-ready',()=>{void reconcile();});
window.addEventListener('resize',()=>{const footer=document.querySelector(`[${FOOTER_ATTR}]`);if(footer)applyReadableFooter(footer);},{passive:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void reconcile();},{once:true});else void reconcile();
})();