(()=>{
'use strict';
if(window.__EKODI_USER_LANGUAGE_BOOTED)return;
window.__EKODI_USER_LANGUAGE_BOOTED=true;

const VERSION=6;
const STYLE_ID='ekodi-user-language-style';
const STORAGE_KEY='ekodi_user_locale';
const COOKIE_KEY='ekodi_locale';
const PARAM_KEY='lang';
const FALLBACK_LOCALE='ko-KR';
const SUPPORTED=Object.freeze([
  {locale:'ko-KR',short:'\uD55C\uAD6D\uC5B4',label:'\uD55C\uAD6D\uC5B4'},
  {locale:'en',short:'English',label:'English'},
  {locale:'zh-CN',short:'\u4E2D\u6587',label:'\u4E2D\u6587'},
  {locale:'ja',short:'\u65E5\u672C\u8A9E',label:'\u65E5\u672C\u8A9E'},
  {locale:'ne',short:'\u0928\u0947\u092A\u093E\u0932\u0940',label:'\u0928\u0947\u092A\u093E\u0932\u0940'},
  {locale:'vi',short:'Ti\u1EBFng Vi\u1EC7t',label:'Ti\u1EBFng Vi\u1EC7t'}
]);

const LOCALES=new Set(SUPPORTED.map(item=>item.locale));
const COPY=Object.freeze({
  'ko-KR':{language:'언어',home:'EKODI 홈',account:'사용자 계정',privacy:'개인정보처리방침',terms:'이용약관',contact:'문의',legal:'법적 고지'},
  en:{language:'Language',home:'EKODI Home',account:'User account',privacy:'Privacy Policy',terms:'Terms of Use',contact:'Contact',legal:'Legal information'},
  'zh-CN':{language:'语言',home:'EKODI 首页',account:'用户账户',privacy:'隐私政策',terms:'使用条款',contact:'联系',legal:'法律信息'},
  ja:{language:'言語',home:'EKODI ホーム',account:'ユーザーアカウント',privacy:'プライバシーポリシー',terms:'利用規約',contact:'お問い合わせ',legal:'法的情報'},
  ne:{language:'\u092D\u093E\u0937\u093E',home:'EKODI \u0917\u0943\u0939',account:'\u092A\u094D\u0930\u092F\u094B\u0917\u0915\u0930\u094D\u0924\u093E \u0916\u093E\u0924\u093E',privacy:'\u0917\u094B\u092A\u0928\u0940\u092F\u0924\u093E \u0928\u0940\u0924\u093F',terms:'\u092A\u094D\u0930\u092F\u094B\u0917\u0915\u093E \u0938\u0930\u094D\u0924\u0939\u0930\u0942',contact:'\u0938\u092E\u094D\u092A\u0930\u094D\u0915',legal:'\u0915\u093E\u0928\u0941\u0928\u0940 \u091C\u093E\u0928\u0915\u093E\u0930\u0940'},
  my:{language:'ဘာသာစကား',home:'EKODI ပင်မ',account:'အသုံးပြုသူ အကောင့်',privacy:'ကိုယ်ရေးအချက်အလက် မူဝါဒ',terms:'အသုံးပြုမှု စည်းကမ်းများ',contact:'ဆက်သွယ်ရန်',legal:'ဥပဒေဆိုင်ရာ အချက်အလက်'},
  kac:{language:'Ga',home:'EKODI Home',account:'User account',privacy:'Privacy Policy',terms:'Terms of Use',contact:'Contact',legal:'Legal information'},
  vi:{language:'Ngôn ngữ',home:'Trang chủ EKODI',account:'Tài khoản người dùng',privacy:'Chính sách quyền riêng tư',terms:'Điều khoản sử dụng',contact:'Liên hệ',legal:'Thông tin pháp lý'},
  mn:{language:'Хэл',home:'EKODI нүүр',account:'Хэрэглэгчийн бүртгэл',privacy:'Нууцлалын бодлого',terms:'Үйлчилгээний нөхцөл',contact:'Холбоо барих',legal:'Хууль зүйн мэдээлэл'},
  id:{language:'Bahasa',home:'Beranda EKODI',account:'Akun pengguna',privacy:'Kebijakan Privasi',terms:'Ketentuan Penggunaan',contact:'Kontak',legal:'Informasi hukum'}
});
let activeLocale='ko-KR';
let observer=null;
let scheduled=false;
let noticeTimer=null;

function normalize(value){
  const raw=String(value||'').trim();
  if(LOCALES.has(raw))return raw;
  const lower=raw.toLowerCase();
  if(lower==='ko'||lower.startsWith('ko-'))return'ko-KR';
  if(lower==='en'||lower.startsWith('en-'))return'en';
  if(lower==='zh'||lower.startsWith('zh-'))return'zh-CN';
  if(lower==='ja'||lower.startsWith('ja-'))return'ja';
  if(lower==='ne'||lower.startsWith('ne-')||lower==='nep')return'ne';
  if(lower==='my'||lower.startsWith('my-')||lower==='bur'||lower==='mya')return'my';
  if(lower==='kac'||lower.startsWith('kac-')||lower==='jinghpaw'||lower==='kachin')return'kac';
  if(lower==='vi'||lower.startsWith('vi-'))return'vi';
  if(lower==='mn'||lower.startsWith('mn-'))return'mn';
  if(lower==='id'||lower.startsWith('id-')||lower==='in')return'id';
  return'';
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
  activeLocale=next;
  document.documentElement.lang=next;
  document.documentElement.dir='ltr';
  document.documentElement.dataset.ekodiLocale=next;
  if(save)persist(next);
  updateSharedCopy();
  syncControls();
  if(emit&&changed)window.dispatchEvent(new CustomEvent('ekodi:locale-change',{detail:{locale:next,version:VERSION,source,requestedLocale:requestedLocale||next}}));
  schedule();
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
  if(select.value!==activeLocale)select.value=activeLocale;
  select.title=SUPPORTED.find(item=>item.locale===activeLocale)?.label||text().language;
  for(const option of select.options){
    const ready=isLocaleReady(option.value);
    option.dataset.ekodiLocaleReady=ready?'true':'false';
    const item=SUPPORTED.find(candidate=>candidate.locale===option.value);
    option.title=ready?(item?.label||option.textContent):preparingText(option.value);
  }
}
function placeHeaderControl(){
  if(!document.body)return;
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
  const footer=document.querySelector('[data-ekodi-user-footer],.ekodi-user-ui-footer,body > footer,footer');
  if(!footer)return;
  const parent=footer.querySelector('.ekodi-user-ui-footer__inner')||footer;
  let control=footer.querySelector('[data-ekodi-language-placement="footer"]');
  if(!control)control=buildControl('footer');
  if(control.parentElement!==parent)parent.append(control);
  syncControl(control);
}
function syncControls(){for(const control of document.querySelectorAll('[data-ekodi-language-control]'))syncControl(control);}
function reconcile(){scheduled=false;placeHeaderControl();placeFooterControl();updateSharedCopy();syncControls();}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(reconcile);}
function boot(){
  ensureBrowserTranslationBoundary();
  const preferred=initialPreference();
  apply(preferred.locale,{save:true,emit:true,notify:preferred.explicit,source:'initial'});
  schedule();
}

window.EKODIUserLanguage=Object.freeze({
  version:VERSION,
  supported:SUPPORTED,
  getLocale:()=>activeLocale,
  getReadyLocales:()=>Object.freeze([...readyLocales()]),
  isLocaleReady,
  setReadyLocales,
  setLocale:locale=>apply(locale,{save:true,emit:true,notify:true}),
  refresh:schedule
});
window.addEventListener('ekodi:user-header-ready',schedule);
window.addEventListener('ekodi:user-footer-ready',schedule);
window.addEventListener('ekodi:shell-theme',schedule);
window.addEventListener('popstate',()=>{const preferred=initialPreference();apply(preferred.locale,{save:true,emit:true,notify:preferred.explicit,source:'history'});});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
observer=new MutationObserver(schedule);
observer.observe(document.documentElement,{childList:true,subtree:true});
})();