(()=>{
'use strict';
if(window.__EKODI_USER_LANGUAGE_BOOTED)return;
window.__EKODI_USER_LANGUAGE_BOOTED=true;

const VERSION=3;
const STYLE_ID='ekodi-user-language-style';
const STORAGE_KEY='ekodi_user_locale';
const COOKIE_KEY='ekodi_locale';
const PARAM_KEY='lang';
const SUPPORTED=Object.freeze([
  {locale:'ko-KR',short:'한국어',label:'한국어'},
  {locale:'en',short:'English',label:'English'},
  {locale:'zh-CN',short:'中文',label:'中文'},
  {locale:'ja',short:'日本語',label:'日本語'},
  {locale:'my',short:'မြန်မာ',label:'မြန်မာဘာသာ'},
  {locale:'kac',short:'Jinghpaw',label:'Jinghpaw (Kachin)'},
  {locale:'vi',short:'Tiếng Việt',label:'Tiếng Việt'},
  {locale:'mn',short:'Монгол',label:'Монгол хэл'},
  {locale:'id',short:'Bahasa',label:'Bahasa Indonesia'}
]);
const LOCALES=new Set(SUPPORTED.map(item=>item.locale));
const COPY=Object.freeze({
  'ko-KR':{language:'언어',home:'EKODI 홈',account:'사용자 계정',privacy:'개인정보처리방침',terms:'이용약관',contact:'문의',legal:'법적 고지'},
  en:{language:'Language',home:'EKODI Home',account:'User account',privacy:'Privacy Policy',terms:'Terms of Use',contact:'Contact',legal:'Legal information'},
  'zh-CN':{language:'语言',home:'EKODI 首页',account:'用户账户',privacy:'隐私政策',terms:'使用条款',contact:'联系',legal:'法律信息'},
  ja:{language:'言語',home:'EKODI ホーム',account:'ユーザーアカウント',privacy:'プライバシーポリシー',terms:'利用規約',contact:'お問い合わせ',legal:'法的情報'},
  my:{language:'ဘာသာစကား',home:'EKODI ပင်မ',account:'အသုံးပြုသူ အကောင့်',privacy:'ကိုယ်ရေးအချက်အလက် မူဝါဒ',terms:'အသုံးပြုမှု စည်းကမ်းများ',contact:'ဆက်သွယ်ရန်',legal:'ဥပဒေဆိုင်ရာ အချက်အလက်'},
  kac:{language:'Ga',home:'EKODI Home',account:'User account',privacy:'Privacy Policy',terms:'Terms of Use',contact:'Contact',legal:'Legal information'},
  vi:{language:'Ngôn ngữ',home:'Trang chủ EKODI',account:'Tài khoản người dùng',privacy:'Chính sách quyền riêng tư',terms:'Điều khoản sử dụng',contact:'Liên hệ',legal:'Thông tin pháp lý'},
  mn:{language:'Хэл',home:'EKODI нүүр',account:'Хэрэглэгчийн бүртгэл',privacy:'Нууцлалын бодлого',terms:'Үйлчилгээний нөхцөл',contact:'Холбоо барих',legal:'Хууль зүйн мэдээлэл'},
  id:{language:'Bahasa',home:'Beranda EKODI',account:'Akun pengguna',privacy:'Kebijakan Privasi',terms:'Ketentuan Penggunaan',contact:'Kontak',legal:'Informasi hukum'}
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
  if(lower==='my'||lower.startsWith('my-')||lower==='bur'||lower==='mya')return'my';
  if(lower==='kac'||lower.startsWith('kac-')||lower==='jinghpaw'||lower==='kachin')return'kac';
  if(lower==='vi'||lower.startsWith('vi-'))return'vi';
  if(lower==='mn'||lower.startsWith('mn-'))return'mn';
  if(lower==='id'||lower.startsWith('id-')||lower==='in')return'id';
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
function apply(locale,{save=true,emit=true}={}){
  const next=normalize(locale)||'ko-KR';
  const changed=activeLocale!==next||document.documentElement.lang!==next;
  activeLocale=next;
  document.documentElement.lang=next;
  document.documentElement.dir='ltr';
  document.documentElement.dataset.ekodiLocale=next;
  if(save)persist(next);
  updateSharedCopy();
  syncControls();
  if(emit&&changed)window.dispatchEvent(new CustomEvent('ekodi:locale-change',{detail:{locale:next,version:VERSION,source:'shared-user-shell'}}));
  schedule();
  return next;
}
function header(){
  return document.querySelector('[data-ekodi-user-header-root]:not([data-ekodi-language-ignore])')||
    document.querySelector('header[role="banner"],body > header,.site-header,.topbar,.app-header,.main-header');
}
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`.ekodi-user-language[data-ekodi-language-control]{position:relative!important;display:inline-flex!important;align-items:center!important;gap:5px!important;flex:0 0 auto!important;min-height:34px!important;margin-inline-start:6px!important;padding:0 21px 0 9px!important;border:1px solid color-mix(in srgb,currentColor 18%,transparent)!important;border-radius:999px!important;background:color-mix(in srgb,var(--ekodi-user-chrome-bg,#fff) 92%,transparent)!important;color:inherit!important;box-sizing:border-box!important;box-shadow:none!important}.ekodi-user-language[data-ekodi-language-control]::after{content:'⌄';position:absolute;right:8px;top:50%;transform:translateY(-54%);font-size:11px;opacity:.62;pointer-events:none}.ekodi-user-language__icon{font-size:13px;line-height:1}.ekodi-user-language__label{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.ekodi-user-language__select{appearance:none!important;-webkit-appearance:none!important;min-width:58px!important;max-width:96px!important;min-height:32px!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:inherit!important;box-shadow:none!important;font:700 12px/1.2 system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif!important;cursor:pointer!important;outline:none!important}.ekodi-user-language:focus-within{outline:2px solid color-mix(in srgb,var(--ekodi-user-chrome-link,#2563eb) 32%,transparent)!important;outline-offset:2px}@media(max-width:480px){.ekodi-user-language[data-ekodi-language-control]{margin-inline-start:2px!important;padding-left:7px!important;padding-right:18px!important}.ekodi-user-language__select{max-width:70px!important;font-size:11px!important}}`;
  (document.head||document.documentElement).append(style);
}
function buildControl(){
  installStyle();
  const wrap=document.createElement('label');
  wrap.className='ekodi-user-language';
  wrap.setAttribute('data-ekodi-language-control',`v${VERSION}`);
  wrap.setAttribute('data-ekodi-header-side','right');
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
  for(const item of SUPPORTED){
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
function placeControl(){
  if(!document.body)return;
  let control=document.querySelector('[data-ekodi-language-control]');
  const target=header();
  if(!target)return;
  if(!control)control=buildControl();
  const parent=actionContainer(target);
  const accountLinks=[...parent.querySelectorAll('a')].filter(isAccountLink);
  const accountLink=accountLinks.at(-1)||null;
  if(accountLink){
    if(control.parentElement!==parent||control.previousElementSibling!==accountLink)accountLink.insertAdjacentElement('afterend',control);
  }else if(control.parentElement!==parent){
    parent.append(control);
  }
  setText(control.querySelector('.ekodi-user-language__label'),text().language);
  const select=control.querySelector('select');
  setAttr(select,'aria-label',text().language);
  if(select){
    if(select.value!==activeLocale)select.value=activeLocale;
    select.title=SUPPORTED.find(item=>item.locale===activeLocale)?.label||text().language;
  }
}
function syncControls(){
  for(const control of document.querySelectorAll('[data-ekodi-language-control]')){
    setText(control.querySelector('.ekodi-user-language__label'),text().language);
    const select=control.querySelector('select');
    setAttr(select,'aria-label',text().language);
    if(select){
      if(select.value!==activeLocale)select.value=activeLocale;
      select.title=SUPPORTED.find(item=>item.locale===activeLocale)?.label||text().language;
    }
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