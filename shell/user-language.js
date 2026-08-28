(()=>{
'use strict';
if(window.__EKODI_USER_LANGUAGE_BOOTED)return;
window.__EKODI_USER_LANGUAGE_BOOTED=true;

const VERSION=1;
const STORAGE_KEY='ekodi_user_locale';
const COOKIE_KEY='ekodi_locale';
const PARAM_KEY='lang';
const SUPPORTED=Object.freeze([
  {locale:'ko-KR',short:'KO',label:'한국어'},
  {locale:'en',short:'EN',label:'English'},
  {locale:'zh-CN',short:'中文',label:'中文'},
  {locale:'ja',short:'日本語',label:'日本語'}
]);
const LOCALES=new Set(SUPPORTED.map(item=>item.locale));
const COPY=Object.freeze({
  'ko-KR':{language:'언어',home:'EKODI 홈',account:'사용자 계정',privacy:'개인정보처리방침',terms:'이용약관',contact:'문의',legal:'법적 고지'},
  en:{language:'Language',home:'EKODI Home',account:'User account',privacy:'Privacy Policy',terms:'Terms of Use',contact:'Contact',legal:'Legal information'},
  'zh-CN':{language:'语言',home:'EKODI 首页',account:'用户账户',privacy:'隐私政策',terms:'使用条款',contact:'联系',legal:'法律信息'},
  ja:{language:'言語',home:'EKODI ホーム',account:'ユーザーアカウント',privacy:'プライバシーポリシー',terms:'利用規約',contact:'お問い合わせ',legal:'法的情報'}
});
let activeLocale='ko-KR';
let observer=null;
let scheduled=false;

function normalize(value){
  const raw=String(value||'').trim();
  if(LOCALES.has(raw))return raw;
  const lower=raw.toLowerCase();
  if(lower==='ko'||lower.startsWith('ko-'))return'ko-KR';
  if(lower==='en'||lower.startsWith('en-'))return'en';
  if(lower==='zh'||lower.startsWith('zh-'))return'zh-CN';
  if(lower==='ja'||lower.startsWith('ja-'))return'ja';
  return'';
}
function readCookie(){
  try{
    const prefix=`${COOKIE_KEY}=`;
    const item=String(document.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(prefix));
    return normalize(item?decodeURIComponent(item.slice(prefix.length)):'');
  }catch{return'';}
}
function readStorage(){try{return normalize(localStorage.getItem(STORAGE_KEY)||'');}catch{return'';}}
function initialLocale(){
  let query='';
  try{query=normalize(new URL(location.href).searchParams.get(PARAM_KEY));}catch{}
  return query||readCookie()||readStorage()||normalize(navigator.languages?.[0]||navigator.language)||'ko-KR';
}
function persist(locale){
  try{localStorage.setItem(STORAGE_KEY,locale);}catch{}
  try{document.cookie=`${COOKIE_KEY}=${encodeURIComponent(locale)}; Domain=.ekodi.kr; Path=/; Max-Age=31536000; SameSite=Lax; Secure`; }catch{}
}
function text(){return COPY[activeLocale]||COPY['ko-KR'];}
function updateSharedCopy(){
  const copy=text();
  const brand=document.querySelector('.ekodi-user-ui-fallback-header__brand,.ekodi-user-ui-header-fallback__brand');
  if(brand)brand.setAttribute('aria-label',copy.home);
  const accountNav=document.querySelector('.ekodi-user-ui-fallback-header__nav');
  if(accountNav)accountNav.setAttribute('aria-label',copy.account);
  const legal=document.querySelector('.ekodi-user-ui-footer__links');
  if(legal)legal.setAttribute('aria-label',copy.legal);
  const labels={privacy:copy.privacy,terms:copy.terms,contact:copy.contact};
  for(const [key,value] of Object.entries(labels)){
    for(const node of document.querySelectorAll(`[data-ekodi-i18n="${key}"]`))node.textContent=value;
  }
}
function apply(locale,{save=true,emit=true}={}){
  const next=normalize(locale)||'ko-KR';
  activeLocale=next;
  document.documentElement.lang=next;
  document.documentElement.dir='ltr';
  document.documentElement.dataset.ekodiLocale=next;
  if(save)persist(next);
  updateSharedCopy();
  syncControls();
  if(emit)window.dispatchEvent(new CustomEvent('ekodi:locale-change',{detail:{locale:next,version:VERSION,source:'shared-user-shell'}}));
  return next;
}
function header(){
  return document.querySelector('[data-ekodi-user-header-root]:not([data-ekodi-language-ignore])')||
    document.querySelector('header[role="banner"],body > header,.site-header,.topbar,.app-header,.main-header');
}
function buildControl(){
  const wrap=document.createElement('label');
  wrap.className='ekodi-user-language';
  wrap.setAttribute('data-ekodi-language-control',`v${VERSION}`);
  wrap.setAttribute('data-ekodi-header-side','right');
  const textNode=document.createElement('span');
  textNode.className='ekodi-user-language__label';
  textNode.textContent=text().language;
  const select=document.createElement('select');
  select.className='ekodi-user-language__select';
  select.setAttribute('aria-label',text().language);
  for(const item of SUPPORTED){
    const option=document.createElement('option');
    option.value=item.locale;
    option.textContent=item.label;
    select.append(option);
  }
  select.value=activeLocale;
  select.addEventListener('change',()=>apply(select.value));
  wrap.append(textNode,select);
  return wrap;
}
function placeControl(){
  if(!document.body)return;
  let control=document.querySelector('[data-ekodi-language-control]');
  const target=header();
  if(!target)return;
  if(!control)control=buildControl();
  const fallbackNav=target.querySelector('.ekodi-user-ui-fallback-header__nav');
  const preferred=target.querySelector('[data-ekodi-header-actions],.header-actions,.nav-actions,.top-actions,.actions');
  const parent=fallbackNav||preferred||target;
  if(control.parentElement!==parent){
    if(fallbackNav)fallbackNav.prepend(control);else parent.append(control);
  }
  control.querySelector('.ekodi-user-language__label').textContent=text().language;
  const select=control.querySelector('select');
  select.setAttribute('aria-label',text().language);
  select.value=activeLocale;
}
function syncControls(){
  for(const control of document.querySelectorAll('[data-ekodi-language-control]')){
    const label=control.querySelector('.ekodi-user-language__label');
    const select=control.querySelector('select');
    if(label)label.textContent=text().language;
    if(select){select.setAttribute('aria-label',text().language);select.value=activeLocale;}
  }
}
function reconcile(){scheduled=false;placeControl();updateSharedCopy();}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(reconcile);}
function boot(){apply(initialLocale(),{save:true,emit:false});schedule();}

window.EKODIUserLanguage=Object.freeze({
  version:VERSION,
  supported:SUPPORTED,
  getLocale:()=>activeLocale,
  setLocale:locale=>apply(locale),
  refresh:schedule
});
window.addEventListener('ekodi:user-header-ready',schedule);
window.addEventListener('ekodi:shell-theme',schedule);
window.addEventListener('popstate',()=>apply(initialLocale(),{save:true,emit:true}));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
observer=new MutationObserver(schedule);
observer.observe(document.documentElement,{childList:true,subtree:true});
})();
