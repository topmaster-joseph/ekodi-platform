(()=>{
'use strict';
if(window.__EKODI_USER_UI_FOOTER_BOOTED)return;
window.__EKODI_USER_UI_FOOTER_BOOTED=true;

const VERSION=2;
const STYLE_ID='ekodi-user-ui-footer-style';
const CONFIG_URL='https://shell.ekodi.kr/user-footer.json';
const USER_SURFACES=new Set(['public','workspace']);
const FOOTER_ATTR='data-ekodi-user-footer';
let configPromise=null;

function surface(){return String(document.documentElement.dataset.ekodiShellSurface||document.documentElement.dataset.ekodiUserSurface||'').toLowerCase();}
function enabled(){return USER_SURFACES.has(surface());}
function installStyle(){
  if(document.getElementById(STYLE_ID)||document.querySelector('[data-ekodi-user-ui-style]'))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .ekodi-user-ui-footer{position:relative;z-index:2;width:100%;box-sizing:border-box;margin-top:28px;border-top:1px solid var(--ekodi-user-footer-border,color-mix(in srgb,currentColor 14%,transparent));background:var(--ekodi-user-footer-background,transparent);color:var(--ekodi-user-footer-text,inherit);font-family:inherit;font-size:13px;line-height:1.7;text-align:left}
    .ekodi-user-ui-footer__inner{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:24px 0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:20px 28px}
    .ekodi-user-ui-footer__copy{min-width:0;display:grid;gap:6px}.ekodi-user-ui-footer__brand{font-weight:800;letter-spacing:.12em;color:inherit}
    .ekodi-user-ui-footer__business,.ekodi-user-ui-footer__address{display:flex;align-items:baseline;gap:4px 14px;flex-wrap:wrap}.ekodi-user-ui-footer__address{word-break:keep-all}.ekodi-user-ui-footer__separator{opacity:.5}
    .ekodi-user-ui-footer__links{display:flex;justify-content:flex-end;align-items:flex-start;gap:6px 16px;flex-wrap:wrap;white-space:nowrap}.ekodi-user-ui-footer a{color:var(--ekodi-user-footer-link,currentColor);text-decoration:none;text-underline-offset:3px}.ekodi-user-ui-footer a:hover,.ekodi-user-ui-footer a:focus-visible{text-decoration:underline}.ekodi-user-ui-footer a:focus-visible{outline:2px solid currentColor;outline-offset:3px}
    .ekodi-user-ui-footer__copyright,.ekodi-user-ui-footer__scope{opacity:.72}.ekodi-user-ui-footer__scope{font-size:.92em}
    [data-ekodi-legal-footer]:not(.ekodi-user-ui-footer){display:none!important}
    @media(max-width:720px){.ekodi-user-ui-footer__inner{width:min(100% - 24px,1180px);padding:20px 0;grid-template-columns:1fr;gap:10px}.ekodi-user-ui-footer__links{justify-content:flex-start;white-space:normal}.ekodi-user-ui-footer__business,.ekodi-user-ui-footer__address{gap:3px 10px}}
  `;
  (document.head||document.documentElement).append(style);
}
function validConfig(value){return Boolean(value&&typeof value==='object'&&Number(value.version)>=VERSION&&value.operator&&value.contact&&Array.isArray(value.legalLinks));}
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
  }
  return footer;
}
async function reconcile(){
  if(!enabled()||document.querySelector(`[${FOOTER_ATTR}]`)||!document.body)return;
  installStyle();
  const config=await loadConfig();
  if(!config||document.querySelector(`[${FOOTER_ATTR}]`)||!document.body)return;
  document.body.append(createFooter(config));
  window.dispatchEvent(new CustomEvent('ekodi:user-footer-ready',{detail:{version:VERSION,surface:surface()}}));
}
window.EKODIUserUIFooter=Object.freeze({version:VERSION,refresh:reconcile});
window.addEventListener('ekodi:shell-theme',()=>{void reconcile();});
window.addEventListener('ekodi:surface-change',()=>{void reconcile();});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void reconcile();},{once:true});else void reconcile();
})();
