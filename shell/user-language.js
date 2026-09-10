(()=>{
'use strict';
if(window.__EKODI_USER_LANGUAGE_BOOTED)return;
window.__EKODI_USER_LANGUAGE_BOOTED=true;

const VERSION=7;
const STYLE_ID='ekodi-user-language-style';
const STORAGE_KEY='ekodi_user_locale';
const COOKIE_KEY='ekodi_locale';
const PARAM_KEY='lang';
const FALLBACK_LOCALE='ko-KR';
const I18N_API='https://api.ekodi.kr/api/i18n/v1';
const READINESS_REFRESH_MS=300000;
const REGISTRY=window.__EKODI_LANGUAGE_REGISTRY__||Object.freeze({
  version:0,sourceLocale:'ko-KR',languages:[{locale:'ko-KR',aliases:['ko','ko-kr'],short:'한국어',label:'한국어',direction:'ltr',chrome:{language:'언어',home:'EKODI 홈',account:'사용자 계정',privacy:'개인정보처리방침',terms:'이용약관',contact:'문의',legal:'법적 고지'}}]
});
const SUPPORTED=Object.freeze((REGISTRY.languages||[]).map(item=>Object.freeze({...item})));
const COPY=Object.freeze(Object.fromEntries(SUPPORTED.map(item=>[item.locale,Object.freeze(item.chrome||{})])));
const ALIASES=new Map();
for(const item of SUPPORTED){
  ALIASES.set(String(item.locale||'').toLowerCase(),item.locale);
  for(const alias of item.aliases||[])ALIASES.set(String(alias||'').toLowerCase(),item.locale);
}
let activeLocale='ko-KR';
let observer=null;
let scheduled=false;
let noticeTimer=null;
let readinessTimer=null;
let catalogRequest=0;
const translatedTextNodes=new Map();
const translatedAttributes=new Map();
let activeCatalog=null;
let catalogApplying=false;

function normalize(value){
  const raw=String(value||'').trim().toLowerCase();
  return ALIASES.get(raw)||'';
}
function parseLocales(value){
  const result=[];
  for(const token of String(value||'').split(/[\s,|]+/)){
    const locale=normalize(token);
    if(locale&&!result.includes(locale))result.push(locale);
  }
  if(!result.includes(FALLBACK_LOCALE))result.unshift(FALLBACK_LOCALE);
  return result;
}
function readyLocales(){return parseLocales(document.documentElement.dataset.ekodiReadyLocales||FALLBACK_LOCALE);}
function isLocaleReady(locale){return readyLocales().includes(normalize(locale)||FALLBACK_LOCALE);}
function visibleLanguages(){const ready=new Set(readyLocales());return SUPPORTED.filter(item=>ready.has(item.locale));}
function languageChoiceAvailable(){return visibleLanguages().length>1;}
function readCookie(){
  try{
    const prefix=`${COOKIE_KEY}=`;
    const item=String(document.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(prefix));
    return normalize(item?decodeURIComponent(item.slice(prefix.length)):'');
  }catch{return'';}
}
function readStorage(){try{return normalize(localStorage.getItem(STORAGE_KEY)||'');}catch{return'';}}
function initialPreference(){
  let query='';
  try{query=normalize(new URL(location.href).searchParams.get(PARAM_KEY));}catch{}
  if(query)return{locale:query,explicit:true};
  const cookie=readCookie();if(cookie)return{locale:cookie,explicit:true};
  const stored=readStorage();if(stored)return{locale:stored,explicit:true};
  return{locale:normalize(navigator.languages?.[0]||navigator.language)||FALLBACK_LOCALE,explicit:false};
}
function persist(locale){
  try{localStorage.setItem(STORAGE_KEY,locale);}catch{}
  try{document.cookie=`${COOKIE_KEY}=${encodeURIComponent(locale)}; Domain=.ekodi.kr; Path=/; Max-Age=31536000; SameSite=Lax; Secure`; }catch{}
}
function text(locale=activeLocale){return COPY[normalize(locale)||FALLBACK_LOCALE]||COPY[FALLBACK_LOCALE];}
function preparingText(locale){
  const code=normalize(locale)||FALLBACK_LOCALE;
  const messages={
    'ko-KR':'선택한 언어는 준비 중입니다. 한국어 페이지로 돌아갑니다.',
    en:'This language is being prepared. Returning to the Korean page.',
    'zh-CN':'该语言正在准备中。将返回韩语页面。',
    ja:'この言語は準備中です。韓国語ページに戻ります。',
    ne:'यो भाषा तयार हुँदैछ। कोरियाली पृष्ठमा फर्काइँदैछ।',
    vi:'Ngôn ngữ này đang được chuẩn bị. Sẽ quay lại trang tiếng Hàn.'
  };
  return messages[code]||messages['ko-KR'];
}
function setText(node,value){if(node&&node.textContent!==String(value))node.textContent=String(value);}
function setAttr(node,name,value){if(node&&node.getAttribute(name)!==String(value))node.setAttribute(name,String(value));}
function updateSharedCopy(){
  const copy=text();
  const brand=document.querySelector('.ekodi-user-ui-fallback-header__brand,.ekodi-user-ui-header-fallback__brand');
  setAttr(brand,'aria-label',copy.home);
  const accountNav=document.querySelector('.ekodi-user-ui-fallback-header__nav');
  setAttr(accountNav,'aria-label',copy.account);
  const legal=document.querySelector('.ekodi-user-ui-footer__links');
  setAttr(legal,'aria-label',copy.legal);
  const labels={privacy:copy.privacy,terms:copy.terms,contact:copy.contact};
  for(const [key,value] of Object.entries(labels)){
    for(const node of document.querySelectorAll(`[data-ekodi-i18n="${key}"]`))setText(node,value);
  }
}
function ensureBrowserTranslationBoundary(){
  let meta=document.head?.querySelector('meta[name=\"google\"][content=\"notranslate\"]');
  if(!meta&&document.head){meta=document.createElement('meta');meta.name='google';meta.content='notranslate';meta.dataset.ekodiBrowserTranslation='managed';document.head.append(meta);}
  document.documentElement.dataset.ekodiBrowserTranslation='native-i18n';
}
function clearUnsupportedQuery(requested){
  try{
    const url=new URL(location.href);
    if(normalize(url.searchParams.get(PARAM_KEY))!==requested)return;
    url.searchParams.set(PARAM_KEY,FALLBACK_LOCALE);
    history.replaceState(history.state,'',url);
  }catch{}
}
function notifyPreparing(requested){
  if(!document.body)return;
  let notice=document.querySelector('[data-ekodi-language-notice]');
  if(!notice){
    notice=document.createElement('div');
    notice.className='ekodi-language-notice';
    notice.setAttribute('data-ekodi-language-notice',`v${VERSION}`);
    notice.setAttribute('role','status');
    notice.setAttribute('aria-live','polite');
    document.body.append(notice);
  }
  notice.textContent=preparingText(requested);
  notice.hidden=false;
  clearTimeout(noticeTimer);
  noticeTimer=setTimeout(()=>{if(notice?.isConnected)notice.hidden=true;},3200);
}
function commit(locale,{save=true,emit=true,source='shared-user-shell',requestedLocale=''}={}){
  const next=normalize(locale)||FALLBACK_LOCALE;
  const changed=activeLocale!==next||document.documentElement.lang!==next;
  if(activeLocale!==next)restoreAutoTranslations();
  activeLocale=next;
  document.documentElement.lang=next;
  document.documentElement.dir='ltr';
  document.documentElement.dataset.ekodiLocale=next;
  if(save)persist(next);
  updateSharedCopy();
  syncControls();
  if(emit&&changed)window.dispatchEvent(new CustomEvent('ekodi:locale-change',{detail:{locale:next,version:VERSION,source,requestedLocale:requestedLocale||next}}));
  schedule();
  if(changed)setTimeout(()=>refreshActiveCatalog(next),0);
  return next;
}
function apply(locale,{save=true,emit=true,notify=true,source='shared-user-shell'}={}){
  const requested=normalize(locale)||FALLBACK_LOCALE;
  if(requested!==FALLBACK_LOCALE&&!isLocaleReady(requested)){
    clearUnsupportedQuery(requested);
    const next=commit(FALLBACK_LOCALE,{save,emit,source:'unsupported-locale-fallback',requestedLocale:requested});
    if(notify)notifyPreparing(requested);
    return next;
  }
  return commit(requested,{save,emit,source,requestedLocale:requested});
}
function setReadyLocales(locales){
  const ready=parseLocales(Array.isArray(locales)?locales.join(' '):locales);
  document.documentElement.dataset.ekodiReadyLocales=ready.join(' ');
  if(activeLocale!==FALLBACK_LOCALE&&!ready.includes(activeLocale))apply(activeLocale,{save:true,emit:true,notify:true,source:'readiness-change'});
  syncControls();
  schedule();
  return ready;
}
function currentServiceId(){
  const id=String(document.documentElement.dataset.ekodiService||'ekodi').trim().toLowerCase().replace(/[^a-z0-9-]/g,'');
  return id||'ekodi';
}
function normalizedCatalogText(value){return String(value||'').replace(/\s+/g,' ').trim();}
function excludedCatalogElement(element){return !element||Boolean(element.closest('script,style,noscript,template,svg,code,pre,[data-ekodi-language-control],[data-ekodi-user-footer],[data-ekodi-user-header-root],[data-ekodi-auto-i18n-ignore]'));}
function excludedCatalogNode(node){return excludedCatalogElement(node?.parentElement);}
function restoreAutoTranslations(){
  if(!translatedTextNodes.size&&!translatedAttributes.size){activeCatalog=null;return;}
  catalogApplying=true;
  for(const [node,original] of translatedTextNodes){if(node?.isConnected)node.nodeValue=original;}
  for(const [element,attributes] of translatedAttributes){if(!element?.isConnected)continue;for(const [name,original] of attributes)element.setAttribute(name,original);}
  translatedTextNodes.clear();translatedAttributes.clear();activeCatalog=null;catalogApplying=false;
}
function applyCatalogToDom(catalog){
  if(!catalog||activeLocale===FALLBACK_LOCALE||!document.body)return;
  const items=catalog.items||{};
  if(!items||typeof items!=='object')return;
  catalogApplying=true;
  try{
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      if(excludedCatalogNode(node)||translatedTextNodes.has(node))continue;
      const original=String(node.nodeValue||'');
      const key=normalizedCatalogText(original);
      const translated=typeof items[key]==='string'?items[key].trim():'';
      if(!translated||translated===key)continue;
      const leading=original.match(/^\s*/)?.[0]||'',trailing=original.match(/\s*$/)?.[0]||'';
      translatedTextNodes.set(node,original);
      node.nodeValue=`${leading}${translated}${trailing}`;
    }
    for(const element of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]')){
      if(excludedCatalogElement(element))continue;
      let stored=translatedAttributes.get(element);
      for(const name of ['placeholder','title','aria-label','alt']){
        if(!element.hasAttribute(name)||stored?.has(name))continue;
        const original=element.getAttribute(name)||'';
        const key=normalizedCatalogText(original);
        const translated=typeof items[key]==='string'?items[key].trim():'';
        if(!translated||translated===key)continue;
        if(!stored){stored=new Map();translatedAttributes.set(element,stored);}
        stored.set(name,original);element.setAttribute(name,translated);
      }
    }
  }finally{catalogApplying=false;}
}
async function refreshActiveCatalog(locale=activeLocale){
  const target=normalize(locale)||FALLBACK_LOCALE;
  const requestId=++catalogRequest;
  restoreAutoTranslations();
  if(target===FALLBACK_LOCALE||!isLocaleReady(target))return;
  try{
    const url=`${I18N_API}/catalog?service=${encodeURIComponent(currentServiceId())}&locale=${encodeURIComponent(target)}`;
    const response=await fetch(url,{headers:{accept:'application/json'},cache:'no-store',credentials:'omit'});
    if(requestId!==catalogRequest||target!==activeLocale||!response.ok)return;
    const catalog=await response.json();
    if(requestId!==catalogRequest||target!==activeLocale)return;
    activeCatalog=catalog;applyCatalogToDom(catalog);
  }catch{}
}
async function refreshRuntimeReadiness(){
  try{
    const url=`${I18N_API}/status?service=${encodeURIComponent(currentServiceId())}`;
    const response=await fetch(url,{headers:{accept:'application/json'},cache:'no-store',credentials:'omit'});
    if(!response.ok)return;
    const data=await response.json();
    if(Array.isArray(data?.publishedLocales)&&data.publishedLocales.length)setReadyLocales(data.publishedLocales);
    if(activeLocale!==FALLBACK_LOCALE)await refreshActiveCatalog(activeLocale);
  }catch{}
}
function header(){
  return document.querySelector('[data-ekodi-user-header-root]:not([data-ekodi-user-header-fallback]):not([data-ekodi-language-ignore])')||
    document.querySelector('[data-ekodi-user-header-root]:not([data-ekodi-language-ignore])')||
    document.querySelector('header[role="banner"],body > header,.site-header,.topbar,.app-header,.main-header');
}
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`.ekodi-user-language[data-ekodi-language-control]{position:relative!important;z-index:2147483400!important;overflow:visible!important;display:inline-flex!important;align-items:center!important;gap:6px!important;flex:0 0 auto!important;min-height:36px!important;margin-inline-start:6px!important;padding:0 22px 0 10px!important;border:1px solid rgba(37,82,61,.22)!important;border-radius:999px!important;background:#fbfcfa!important;color:#20362b!important;box-sizing:border-box!important;box-shadow:0 1px 2px rgba(20,45,34,.05)!important;text-shadow:none!important}.ekodi-user-language[data-ekodi-language-control]::after{content:'⌄';position:absolute;right:9px;top:50%;transform:translateY(-54%);font-size:11px;color:#52675d;opacity:.9;pointer-events:none}.ekodi-user-language__icon{font-size:13px;line-height:1;filter:none!important}.ekodi-user-language__label{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.ekodi-user-language__select{appearance:none!important;-webkit-appearance:none!important;min-width:58px!important;max-width:96px!important;min-height:34px!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#20362b!important;-webkit-text-fill-color:#20362b!important;box-shadow:none!important;text-shadow:none!important;font:750 12px/1.2 system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif!important;cursor:pointer!important;outline:none!important}.ekodi-user-language__select option{background:#fff!important;color:#20362b!important}.ekodi-user-language:hover{background:#f5f8f5!important;border-color:rgba(37,82,61,.32)!important}.ekodi-user-language:focus-within{outline:2px solid rgba(49,93,72,.34)!important;outline-offset:2px}.ekodi-user-language[data-ekodi-language-placement="footer"]{margin:2px 0 0!important}.ekodi-language-notice{position:fixed;left:50%;bottom:max(22px,env(safe-area-inset-bottom));z-index:2147483600;transform:translateX(-50%);max-width:min(520px,calc(100vw - 28px));padding:11px 15px;border-radius:999px;background:#17231d;color:#fff;-webkit-text-fill-color:#fff;box-shadow:0 12px 36px rgba(0,0,0,.2);font:700 12px/1.45 system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif;text-align:center}.ekodi-language-notice[hidden]{display:none!important}@media(max-width:480px){.ekodi-user-language[data-ekodi-language-control]{margin-inline-start:2px!important;padding-left:8px!important;padding-right:19px!important}.ekodi-user-language__select{max-width:70px!important;font-size:11px!important}}`;
  (document.head||document.documentElement).append(style);
}
function buildControl(placement){
  installStyle();
  const wrap=document.createElement('label');
  wrap.className='ekodi-user-language';
  wrap.setAttribute('data-ekodi-language-control',`v${VERSION}`);
  wrap.setAttribute('data-ekodi-language-placement',placement);
  if(placement==='header')wrap.setAttribute('data-ekodi-header-side','right');
  const icon=document.createElement('span');
  icon.className='ekodi-user-language__icon';
  icon.setAttribute('aria-hidden','true');
  icon.textContent='🌐';
  const textNode=document.createElement('span');
  textNode.className='ekodi-user-language__label';
  textNode.textContent=text().language;
  const select=document.createElement('select');
  select.className='ekodi-user-language__select';
  select.setAttribute('aria-label',text().language);
  for(const item of visibleLanguages()){
    const option=document.createElement('option');
    option.value=item.locale;
    option.textContent=item.short;
    option.title=item.label;
    select.append(option);
  }
  select.value=activeLocale;
  select.title=SUPPORTED.find(item=>item.locale===activeLocale)?.label||text().language;
  select.addEventListener('change',()=>apply(select.value));
  wrap.append(icon,textNode,select);
  syncControl(wrap);
  return wrap;
}
function isAccountLink(link){
  if(!(link instanceof HTMLAnchorElement))return false;
  const href=String(link.getAttribute('href')||'').toLowerCase();
  const label=String(link.textContent||'').trim().toLowerCase();
  const classes=String(link.className||'').toLowerCase();
  return classes.includes('shell-my')||classes.includes('login')||classes.includes('account')||
    href.includes('my.ekodi.kr')||href.includes('auth.ekodi.kr')||href.includes('/login')||href.includes('/signin')||href.includes('/signup')||
    /^(my ekodi|login|log in|sign in|로그인|회원가입|내 공간|마이)/i.test(label);
}
function actionContainer(target){
  return target.querySelector('.ekodi-user-ui-fallback-header__nav,[data-ekodi-header-actions],.header-actions,.nav-actions,.top-actions,.actions,#main-nav,nav')||target;
}
function syncControl(control){
  if(!control)return;
  setText(control.querySelector('.ekodi-user-language__label'),text().language);
  const select=control.querySelector('select');
  setAttr(select,'aria-label',text().language);
  if(!select)return;
  const visible=visibleLanguages();
  const signature=visible.map(item=>item.locale).join('|');
  if(select.dataset.ekodiVisibleLocales!==signature){
    select.replaceChildren(...visible.map(item=>{
      const option=document.createElement('option');
      option.value=item.locale;
      option.textContent=item.short;
      option.title=item.label;
      option.dataset.ekodiLocaleReady='true';
      return option;
    }));
    select.dataset.ekodiVisibleLocales=signature;
  }
  if(select.value!==activeLocale)select.value=activeLocale;
  select.title=SUPPORTED.find(item=>item.locale===activeLocale)?.label||text().language;
}
function placeHeaderControl(){
  if(!document.body)return;
  if(!languageChoiceAvailable()){document.querySelector('[data-ekodi-language-placement="header"]')?.remove();return;}
  const target=header();
  if(!target)return;
  let control=document.querySelector('[data-ekodi-language-placement="header"]');
  if(!control)control=buildControl('header');
  const parent=actionContainer(target);
  const accountLinks=[...parent.querySelectorAll('a')].filter(isAccountLink);
  const accountLink=accountLinks.at(-1)||null;
  if(accountLink){
    if(control.parentElement!==parent||control.previousElementSibling!==accountLink)accountLink.insertAdjacentElement('afterend',control);
  }else if(control.parentElement!==parent){
    parent.append(control);
  }
  syncControl(control);
}
function placeFooterControl(){
  if(!document.body)return;
  if(!languageChoiceAvailable()){document.querySelector('[data-ekodi-language-placement="footer"]')?.remove();return;}
  const footer=document.querySelector('[data-ekodi-user-footer],.ekodi-user-ui-footer,body > footer,footer');
  if(!footer)return;
  const parent=footer.querySelector('.ekodi-user-ui-footer__inner')||footer;
  let control=footer.querySelector('[data-ekodi-language-placement="footer"]');
  if(!control)control=buildControl('footer');
  if(control.parentElement!==parent)parent.append(control);
  syncControl(control);
}
function syncControls(){for(const control of document.querySelectorAll('[data-ekodi-language-control]'))syncControl(control);}
function reconcile(){scheduled=false;placeHeaderControl();placeFooterControl();updateSharedCopy();syncControls();if(activeCatalog&&!catalogApplying)applyCatalogToDom(activeCatalog);}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(reconcile);}
function boot(){
  ensureBrowserTranslationBoundary();
  const preferred=initialPreference();
  apply(preferred.locale,{save:true,emit:true,notify:preferred.explicit,source:'initial'});
  schedule();
  refreshRuntimeReadiness();
  if(!readinessTimer)readinessTimer=setInterval(refreshRuntimeReadiness,READINESS_REFRESH_MS);
}

window.EKODIUserLanguage=Object.freeze({
  version:VERSION,
  supported:SUPPORTED,
  getLocale:()=>activeLocale,
  getReadyLocales:()=>Object.freeze([...readyLocales()]),
  isLocaleReady,
  setReadyLocales,
  setLocale:locale=>apply(locale,{save:true,emit:true,notify:true}),
  refresh:schedule,
  refreshReadiness:refreshRuntimeReadiness
});
window.addEventListener('ekodi:user-header-ready',schedule);
window.addEventListener('ekodi:user-footer-ready',schedule);
window.addEventListener('ekodi:shell-theme',schedule);
window.addEventListener('popstate',()=>{const preferred=initialPreference();apply(preferred.locale,{save:true,emit:true,notify:preferred.explicit,source:'history'});});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
observer=new MutationObserver(schedule);
observer.observe(document.documentElement,{childList:true,subtree:true});
})();