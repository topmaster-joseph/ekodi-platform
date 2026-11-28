(()=>{
'use strict';
if(window.__EKODI_USER_UI_FOOTER_BOOTED)return;
window.__EKODI_USER_UI_FOOTER_BOOTED=true;

const VERSION=7;
const TRAFFIC_STATS_ATTR='data-ekodi-footer-traffic';
const TRAFFIC_STATS_URL='https://ekodi.kr/api/telemetry/public-summary';
const trafficStatsRequests=new Map();

const STYLE_ID='ekodi-user-ui-footer-style';
const CONFIG_URL='https://ekodi.kr/shell/user-footer.json';
const SITE_CHROME_URL='https://ekodi.kr/workspace-api/v1/site-chrome/public';
// Education and the independent BBQ storefront do not have customer-tenant chrome
// configuration. Preserve the site-owned native footer without a doomed 404 lookup.
const NON_TENANT_SITE_CHROME_SUBJECTS=new Set(['edu','education','bbqcg']);
const USER_SURFACES=new Set(['public','workspace']);
const SERVICE_OWNED_FOOTER_SERVICES=new Set();
const SITE_COPYRIGHT_ATTR='data-ekodi-copyright-credit';
const ekodiCopyright=()=>`© ${new Date().getFullYear()} EKODI (에코디). All rights reserved.`;
function nativeFooter(){
  // A native site footer wins. Never treat modal or article footers as site chrome.
  return [...document.querySelectorAll('footer:not([data-ekodi-user-footer])')].find(node=>
    !node.closest('dialog,[role="dialog"],article,[data-ekodi-shell-root]') &&
    (node.matches('body > footer,[data-ekodi-service-footer],.site-footer,.app-footer,.main-footer,[role="contentinfo"]') ||
      node.parentElement===document.body ||
      node.parentElement?.id==='app' ||
      node.parentElement?.tagName==='MAIN'&&node.classList.contains('site-footer'))
  )||null;
}
// A few store-owned footer layouts use a centered content grid. Keep platform
// attribution and public traffic evidence inside that grid, never at page edge.
// Scope the override to the BBQ customer route; other tenants remain unchanged.
function bbqCenteredFooterHost(footer){
  if(!/^\/bbqcg(?:\/|$)/.test(location.pathname)||!footer.matches('.foot,.promise-footer'))return null;
  return footer.querySelector('.foot-inner,.promise-footer-inner');
}
function creditNativeFooter(){
  const footer=nativeFooter();if(!footer)return false;
  footer.dataset.ekodiServiceFooter='true';
  footer.removeAttribute('data-ekodi-legacy-common-footer-hidden');
  footer.removeAttribute('aria-hidden');
  // Other operators may retain their own copy; EKODI attribution remains explicit.
  const text=String(footer.textContent||'');
  if(!/(?:©|ⓒ|copyright|저작권)[^\n]{0,100}(?:EKODI|에코디)/i.test(text)){
    let node=footer.querySelector(`[${SITE_COPYRIGHT_ATTR}]`);
    if(!node){node=document.createElement('small');node.setAttribute(SITE_COPYRIGHT_ATTR,'v1');const host=bbqCenteredFooterHost(footer);(host?.querySelector('.foot-copy,.footer-copy')||footer).append(node);}
    node.textContent=ekodiCopyright();
  }
  return true;
}
const FOOTER_ATTR='data-ekodi-user-footer';
const LEGACY_HIDDEN_ATTR='data-ekodi-legacy-common-footer-hidden';
let configPromise=null;
let siteConfigPromise=null;
let footerObserver=null;
let reconcileQueued=false;

function surface(){return String(document.documentElement.dataset.ekodiShellSurface||document.documentElement.dataset.ekodiUserSurface||'').toLowerCase();}
function serviceId(){return String(document.documentElement.dataset.ekodiService||'').trim().toLowerCase();}
function siteSubject(){const explicit=String(document.documentElement.dataset.ekodiSiteSubject||document.body?.dataset?.ekodiSiteSubject||'').trim().toLowerCase();if(explicit)return explicit;const service=serviceId();const owned={church:'ekodi-church',biz:'ekodi-biz',lab:'ekodi-lab',trade:'ekodi-trade',cafe:'ekodi-cafe'};if(owned[service])return owned[service];const first=location.pathname.split('/').filter(Boolean)[0]||'';const aliases={ekodibiz:'ekodi-biz',biz:'ekodi-biz',ekodichurch:'ekodi-church',church:'ekodi-church',ekodilab:'ekodi-lab',lab:'ekodi-lab',cheonggye:'cgma','cheonggye-merchants':'cgma','cheonggye-merchant-association':'cgma'};return aliases[first]||first}
function footerMode(){return String(document.body?.dataset.ekodiFooterMode||document.documentElement.dataset.ekodiFooterMode||'').trim().toLowerCase();}
function serviceOwnsFooter(){return SERVICE_OWNED_FOOTER_SERVICES.has(serviceId())||['service','custom','off'].includes(footerMode())||Boolean(nativeFooter());}
function enabled(){return USER_SURFACES.has(surface())&&!serviceOwnsFooter();}
function removeSharedFooter(){document.querySelectorAll(`[${FOOTER_ATTR}]`).forEach(node=>node.remove());}
function dedupeSharedFooters(){
  const nodes=[...document.querySelectorAll('['+FOOTER_ATTR+']')];
  const keep=nodes[0]||null;
  nodes.slice(1).forEach(node=>node.remove());
  return keep;
}

function scheduleReconcile(){
  if(reconcileQueued)return;
  reconcileQueued=true;
  queueMicrotask(()=>{reconcileQueued=false;void reconcile();});
}
function observeFooterChanges(){
  if(footerObserver||!document.body)return;
  footerObserver=new MutationObserver(mutations=>{
    for(const mutation of mutations)for(const node of mutation.addedNodes){
      if(node.nodeType!==1)continue;
      if(node.matches?.('footer,.powered,[data-ekodi-legal-footer],[data-ekodi-user-footer]')||node.querySelector?.('footer,.powered,[data-ekodi-legal-footer],[data-ekodi-user-footer]')){scheduleReconcile();return;}
    }
  });
  footerObserver.observe(document.body,{childList:true,subtree:true});
}
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
  // EKODI Shell's shared /shell/user-ui-shell.css already contains the
  // canonical user header/footer presentation. Avoid duplicating it via
  // runtime <style> tags: strict customer-site CSP blocks those injections.
  if(document.querySelector('link[data-ekodi-user-ui-style],link[href*="/shell/user-ui-shell.css"]'))return;
  if(document.getElementById(STYLE_ID))return;
  // Standalone adopters still get the exact same first-party stylesheet
  // without CSP nonces, 'unsafe-inline' or an external provider dependency.
  const link=document.createElement('link');
  link.id=STYLE_ID;
  link.rel='stylesheet';
  link.href='/shell/user-ui-shell.css';
  link.dataset.ekodiUserUiStyle='external-csp-v1';
  (document.head||document.documentElement).append(link);
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
async function loadSiteConfig(){
  const subject=siteSubject();
  if(!subject||NON_TENANT_SITE_CHROME_SUBJECTS.has(subject)||['admin','auth','privacy','terms','api'].includes(subject))return null;
  if(!siteConfigPromise)siteConfigPromise=fetch(`${SITE_CHROME_URL}?subject_key=${encodeURIComponent(subject)}`,{credentials:'omit',cache:'no-store'}).then(async response=>{if(!response.ok)return null;const data=await response.json();return data?.footer||null}).catch(()=>null);
  return siteConfigPromise;
}
async function loadBaseConfig(){const embedded=window.__EKODI_USER_FOOTER_CONFIG__;if(validConfig(embedded))return embedded;if(!configPromise)configPromise=fetch(CONFIG_URL,{credentials:'omit',cache:'force-cache'}).then(async response=>{if(!response.ok)throw new Error('footer-config-http-'+response.status);const config=await response.json();if(!validConfig(config))throw new Error('footer-config-invalid');window.__EKODI_USER_FOOTER_CONFIG__=config;return config}).catch(()=>null);return configPromise}
async function loadConfig(){const base=await loadBaseConfig();if(!base)return null;const site=await loadSiteConfig();if(!site){
    const id=serviceId();
    if(!id||['ekodi','biz','business'].includes(id))return base;
    const label=serviceLabel()||id.toUpperCase();
    return {...base,brand:label,operator:{...base.operator,name:label,representative:'',businessRegistrationNumber:'',commerceRegistrationNumber:''},contact:{address:'',email:'',emailHref:''},copyright:ekodiCopyright()};
  }
  return {...base,...site,operator:{...base.operator,...(site.operator||{})},contact:{...base.contact,...(site.contact||{})},legalLinks:Array.isArray(site.legalLinks)&&site.legalLinks.length?site.legalLinks:base.legalLinks}}
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
  // The operator line repeats nothing: when it equals the brand shown above it, skip it.
  const sameAsBrand=String(config.operator?.name||'').trim().toLowerCase()===String(config.brand||'').trim().toLowerCase();
  if(config.operator?.name&&!sameAsBrand)appendText(business,'span',config.operator.name);
  if(config.operator?.representative)appendText(business,'span',String(config.operator.representative));
  if(config.operator?.businessRegistrationNumber)appendText(business,'span',`${config.operator.registrationLabel} ${config.operator.businessRegistrationNumber}`);
  const address=appendText(copy,'div','','ekodi-user-ui-footer__address');
  if(config.contact?.address)appendText(address,'span',config.contact.address);
  if(config.contact?.address&&config.contact?.email)appendText(address,'span','·','ekodi-user-ui-footer__separator').setAttribute('aria-hidden','true');
  if(config.contact?.email){const email=appendText(address,'a',config.contact.email);email.href=String(config.contact.emailHref||`mailto:${config.contact.email}`);}
  if(config.contact?.phone){
    appendText(address,'span','·','ekodi-user-ui-footer__separator').setAttribute('aria-hidden','true');
    const phone=appendText(address,'a',config.contact.phone);
    phone.href=String(config.contact.phoneHref||`tel:${String(config.contact.phone).replace(/[^+\d]/g,'')}`);
  }
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
// One shared summary widget serves a native service footer or the shared footer.
// This is only a read-only public projection of the existing browser telemetry.
// Visit totals belong to every public page. The Shell may re-label a public
// tenant page with its own surface name (2026-11-29 audit: /cgma/), so only
// private surfaces opt out here; private paths are excluded just below.
function footerTrafficScope(){
  const declaredSurface=surface();
  if(!declaredSurface||['admin','data','document','form','control','auth','my'].includes(declaredSurface))return '';
  const segments=location.pathname.split('/').filter(Boolean).map(value=>value.toLowerCase());
  const root=segments[0]||'';
  if(['admin','auth','api','my'].includes(root)||['admin','auth','my'].includes(serviceId()))return '';
  // Shared legal pages are public too: they show the EKODI root site summary.
  // Root-level files (/hub.html) belong to the EKODI root site, like legal pages.
  const sharedLegal=['privacy','terms'].includes(root)||root.includes('.');
  const child=root==='ekodibiz'&&['trade','marketing-ai','mall'].includes(segments[1])?'/'+segments[1]:'';
  const url=new URL(TRAFFIC_STATS_URL);
  url.searchParams.set('site_path',sharedLegal?'':root+child);
  url.searchParams.set('site_id',serviceId()||'root');
  return url.toString();
}
function addTrafficMetric(parent,name,metric){
  const item=appendText(parent,'span','','ekodi-footer-traffic__metric');
  appendText(item,'span',name);
  appendText(item,'strong',String(metric?.label||'—'));
}
function attachFooterTraffic(footer){
  if(!(footer instanceof HTMLElement))return;
  const scope=footerTrafficScope();
  let node=footer.querySelector('['+TRAFFIC_STATS_ATTR+']');
  if(!scope){node?.remove();return;}
  installStyle();
  if(!node){
    node=appendText(bbqCenteredFooterHost(footer)||footer.querySelector('.ekodi-user-ui-footer__inner')||footer,'div','','ekodi-footer-traffic');
    node.setAttribute(TRAFFIC_STATS_ATTR,'v1');
    node.setAttribute('role','group');
  }
  if(node.dataset.ekodiTrafficScope===scope)return;
  node.dataset.ekodiTrafficScope=scope;
  const english=String(document.documentElement.lang||'').toLowerCase().startsWith('en');
  node.setAttribute('aria-label',english?'Site visit statistics':'사이트 방문 통계');
  node.textContent=english?'Visit statistics loading':'방문 통계 확인 중';
  let request=trafficStatsRequests.get(scope);
  if(!request){
    request=fetch(scope,{credentials:'omit',mode:'cors',cache:'default'})
      .then(async response=>response.ok?response.json():null).catch(()=>null);
    trafficStatsRequests.set(scope,request);
  }
  void request.then(data=>{
    if(!node.isConnected||node.dataset.ekodiTrafficScope!==scope)return;
    if(data?.status!=='ready'){
      node.textContent=english?'Statistics unavailable':'방문 통계 준비 중';
      return;
    }
    window.dispatchEvent(new CustomEvent('ekodi:footer-traffic-ready',{detail:{siteId:data.siteId,scope}}));
    node.textContent='';
    addTrafficMetric(node,english?'Today':'오늘 방문',data.today);
    addTrafficMetric(node,english?'7 days':'최근 7일',data.last7Days);
    addTrafficMetric(node,english?'30 days':'최근 30일',data.last30Days);
    const note=appendText(node,'small',english?'Anonymous sessions · UTC':'익명 세션 · UTC 기준','ekodi-footer-traffic__note');
    note.title=String(data.note||'');
    node.title=String(data.note||'');
  });
}

async function reconcile(){
  if(serviceOwnsFooter()){
    removeSharedFooter();
    creditNativeFooter();
    attachFooterTraffic(nativeFooter());
    return;
  }
  if(!enabled()||!document.body)return;
  installStyle();
  suppressLegacyCommonFooters();
  const existing=dedupeSharedFooters();
  if(existing){applyServiceContext(existing);applyReadableFooter(existing);attachFooterTraffic(existing);return;}
  const config=await loadConfig();
  if(serviceOwnsFooter()){
    removeSharedFooter();
    creditNativeFooter();
    attachFooterTraffic(nativeFooter());
    return;
  }
  if(!config||document.querySelector(`[${FOOTER_ATTR}]`)||!document.body)return;
  const footer=createFooter(config);
  document.body.append(footer);
  dedupeSharedFooters();
  applyReadableFooter(footer);
  attachFooterTraffic(footer);
  window.EKODIUserLanguage?.refresh?.();
  window.dispatchEvent(new CustomEvent('ekodi:user-footer-ready',{detail:{version:VERSION,surface:surface()}}));
}
window.EKODIUserUIFooter=Object.freeze({version:VERSION,refresh:reconcile});
window.addEventListener('ekodi:shell-theme',()=>{void reconcile();});
window.addEventListener('ekodi:surface-change',()=>{void reconcile();});
window.addEventListener('ekodi:design-profile-ready',()=>{void reconcile();});
window.addEventListener('resize',()=>{const footer=document.querySelector(`[${FOOTER_ATTR}]`);if(footer)applyReadableFooter(footer);},{passive:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{observeFooterChanges();void reconcile();},{once:true});else {observeFooterChanges();void reconcile();}
})();