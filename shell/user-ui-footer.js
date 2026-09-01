(()=>{
'use strict';
if(window.__EKODI_USER_UI_FOOTER_BOOTED)return;
window.__EKODI_USER_UI_FOOTER_BOOTED=true;

const VERSION=3;
const STYLE_ID='ekodi-user-ui-footer-style';
const CONFIG_URL='https://shell.ekodi.kr/user-footer.json';
const USER_SURFACES=new Set(['public','workspace']);
const SERVICE_OWNED_FOOTER_SERVICES=new Set(['church']);
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
  if(document.getElementById(STYLE_ID)||document.querySelector('[data-ekodi-user-ui-style]'))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .ekodi-user-ui-footer{position:relative;z-index:2;width:100%;box-sizing:border-box;margin-top:28px;border-top:1px solid var(--ekodi-user-footer-border,color-mix(in srgb,var(--ekodi-service-accent,currentColor) 18%,transparent));background:var(--ekodi-user-footer-background,color-mix(in srgb,var(--ekodi-service-paper,transparent) 92%,var(--ekodi-service-accent,transparent) 8%));color:var(--ekodi-user-footer-text,inherit);font-family:inherit;font-size:13px;line-height:1.7;text-align:center}
    .ekodi-user-ui-footer__inner{width:min(980px,calc(100% - 32px));margin:0 auto;padding:24px 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
    .ekodi-user-ui-footer__copy{min-width:0;width:100%;display:grid;justify-items:center;gap:6px}.ekodi-user-ui-footer__brand{font-weight:800;letter-spacing:.12em;color:inherit}
    .ekodi-user-ui-footer__business,.ekodi-user-ui-footer__address{width:100%;display:flex;align-items:baseline;justify-content:center;gap:4px 14px;flex-wrap:wrap}.ekodi-user-ui-footer__address{word-break:keep-all}.ekodi-user-ui-footer__separator{opacity:.5}
    .ekodi-user-ui-footer__links{display:flex;justify-content:center;align-items:center;gap:6px 16px;flex-wrap:wrap;white-space:normal}.ekodi-user-ui-footer a{color:var(--ekodi-user-footer-link,currentColor);text-decoration:none;text-underline-offset:3px}.ekodi-user-ui-footer a:hover,.ekodi-user-ui-footer a:focus-visible{text-decoration:underline}.ekodi-user-ui-footer a:focus-visible{outline:2px solid currentColor;outline-offset:3px}
    .ekodi-user-ui-footer__copyright,.ekodi-user-ui-footer__scope{opacity:.72}.ekodi-user-ui-footer__scope{max-width:760px;font-size:.92em}
    [data-ekodi-legal-footer]:not(.ekodi-user-ui-footer),[data-ekodi-legacy-common-footer-hidden]{display:none!important}
    @media(max-width:720px){.ekodi-user-ui-footer__inner{width:min(100% - 24px,980px);padding:20px 0;gap:10px}.ekodi-user-ui-footer__business,.ekodi-user-ui-footer__address{gap:3px 10px}}
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
  if(document.querySelector(`[${FOOTER_ATTR}]`))return;
  const config=await loadConfig();
  if(serviceOwnsFooter()){
    removeSharedFooter();
    return;
  }
  if(!config||document.querySelector(`[${FOOTER_ATTR}]`)||!document.body)return;
  document.body.append(createFooter(config));
  window.EKODIUserLanguage?.refresh?.();
  window.dispatchEvent(new CustomEvent('ekodi:user-footer-ready',{detail:{version:VERSION,surface:surface()}}));
}
window.EKODIUserUIFooter=Object.freeze({version:VERSION,refresh:reconcile});
window.addEventListener('ekodi:shell-theme',()=>{void reconcile();});
window.addEventListener('ekodi:surface-change',()=>{void reconcile();});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void reconcile();},{once:true});else void reconcile();
})();
