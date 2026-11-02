(()=>{
'use strict';
if(window.__EKODI_CHURCH_SHELL_I18N_BOOTED)return;
window.__EKODI_CHURCH_SHELL_I18N_BOOTED=true;

const MAP=Object.freeze({
  '♫ MR 재생':{en:'♫ Play MR','zh-CN':'♫ 播放 MR',ja:'♫ MR 再生'},
  'MR 재생':{en:'Play MR','zh-CN':'播放 MR',ja:'MR 再生'},
  '♫ MR 일시정지':{en:'♫ Pause MR','zh-CN':'♫ 暂停 MR',ja:'♫ MR 一時停止'},
  'MR 일시정지':{en:'Pause MR','zh-CN':'暂停 MR',ja:'MR 一時停止'},
  '♫ MR 정지':{en:'♫ Stop MR','zh-CN':'♫ 停止 MR',ja:'♫ MR 停止'},
  'MR 정지':{en:'Stop MR','zh-CN':'停止 MR',ja:'MR 停止'},
  'MR 끄기':{en:'Turn off MR','zh-CN':'关闭 MR',ja:'MR をオフ'},
  'MR 켜기':{en:'Turn on MR','zh-CN':'开启 MR',ja:'MR をオン'}
});
const LANGUAGES=Object.freeze([
  ['ko-KR','한국어'],['en','English'],['zh-CN','中文'],['ja','日本語'],
  ['my','မြန်မာ'],['kac','Jinghpaw'],['vi','Tiếng Việt'],['mn','Монгол'],['id','Bahasa']
]);
const LANGUAGE_VALUES=new Set(LANGUAGES.map(([value])=>value));
const states=new WeakMap();
let scheduled=false;

function normalizeLocale(value){
  const raw=String(value||'').trim();
  if(raw==='ko'||raw.startsWith('ko-'))return'ko-KR';
  if(raw==='en'||raw.startsWith('en-'))return'en';
  if(raw==='zh'||raw.startsWith('zh-'))return'zh-CN';
  if(raw==='ja'||raw.startsWith('ja-'))return'ja';
  if(raw==='my'||raw.startsWith('my-'))return'my';
  if(raw==='kac'||raw.startsWith('kac-'))return'kac';
  if(raw==='vi'||raw.startsWith('vi-'))return'vi';
  if(raw==='mn'||raw.startsWith('mn-'))return'mn';
  if(raw==='id'||raw.startsWith('id-'))return'id';
  return'ko-KR';
}
function locale(){
  const query=new URLSearchParams(location.search).get('lang');
  return normalizeLocale(query||window.EKODIUserLanguage?.getLocale?.()||window.EKODIChurchI18n?.getLocale?.()||document.documentElement.dataset.ekodiLocale||document.documentElement.lang||'ko-KR');
}
function translated(source){
  const lang=locale();
  if(lang==='ko-KR')return source;
  return MAP[source]?.[lang]||source;
}
function ensureLanguageControl(){
  const nav=document.querySelector('#main-nav');
  if(!nav)return;
  let control=document.querySelector('[data-ekodi-language-control]');
  if(!control){
    control=document.createElement('label');
    control.className='ekodi-user-language';
    control.dataset.ekodiLanguageControl='v1';
    control.setAttribute('aria-label','Language');
    control.style.cssText='display:flex;align-items:center;gap:3px;';
    const icon=document.createElement('span');
    icon.className='ekodi-user-language__icon';
    icon.textContent='🌐';
    icon.setAttribute('aria-hidden','true');
    const label=document.createElement('span');
    label.className='ekodi-user-language__label';
    label.textContent='Language';
    const select=document.createElement('select');
    select.className='ekodi-user-language__select';
    select.setAttribute('aria-label','Language');
    control.append(icon,label,select);
    const my=nav.querySelector('.shell-my');
    nav.insertBefore(control,my||null);
  }
  const select=control.querySelector('select');
  if(!select)return;
  const expected=LANGUAGES.map(([value,label])=>`${value}\u0000${label}`).join('\u0001');
  const actual=[...select.options].map(option=>`${option.value}\u0000${option.textContent.trim()}`).join('\u0001');
  if(actual!==expected){
    const fragment=document.createDocumentFragment();
    for(const [value,label] of LANGUAGES){
      const option=document.createElement('option');
      option.value=value;option.textContent=label;option.title=label;fragment.append(option);
    }
    select.replaceChildren(fragment);
  }
  const current=locale();
  if(LANGUAGE_VALUES.has(current)&&select.value!==current)select.value=current;
  if(!select.dataset.ekodiLanguageBound){
    select.dataset.ekodiLanguageBound='true';
    select.addEventListener('change',()=>{
      const next=normalizeLocale(select.value);
      if(!LANGUAGE_VALUES.has(next))return;
      const url=new URL(location.href);
      url.searchParams.set('lang',next);
      location.assign(url.toString());
    });
  }
}
function stateFor(node,value){
  let state=states.get(node);
  if(!state){state={source:value,last:value};states.set(node,state);}
  else if(value!==state.last){state.source=value;state.last=value;}
  return state;
}
function translateText(node){
  if(!node?.parentElement)return;
  const current=String(node.nodeValue||'');
  const state=stateFor(node,current);
  const trimmed=state.source.trim();
  if(!MAP[trimmed])return;
  const lead=state.source.match(/^\s*/)?.[0]||'';
  const tail=state.source.match(/\s*$/)?.[0]||'';
  const next=`${lead}${translated(trimmed)}${tail}`;
  if(node.nodeValue!==next)node.nodeValue=next;
  state.last=next;
}
function run(){
  scheduled=false;
  ensureLanguageControl();
  const root=document.body||document.documentElement;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode()))translateText(node);
  root.querySelectorAll?.('[aria-label],[title]').forEach(node=>{
    const aria=node.getAttribute('aria-label');
    const title=node.getAttribute('title');
    if(aria&&MAP[aria.trim()])node.setAttribute('aria-label',translated(aria.trim()));
    if(title&&MAP[title.trim()])node.setAttribute('title',translated(title.trim()));
  });
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(run);}
function loadExtensions(){
  // Public Church is mounted at /ekodichurch on the EKODI canonical domain.
  // Root-relative /church-*.js requests leaked to the platform root and returned 404.
  const scoped=location.pathname==='/ekodichurch'||location.pathname.startsWith('/ekodichurch/');
  const assetRoot=scoped?'/ekodichurch/':'/';
  if(!document.querySelector('link[data-ekodi-church-header-tune]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=assetRoot+'church-header-tune.css';
    link.dataset.ekodiChurchHeaderTune='v1';
    document.head.append(link);
  }
  for(const name of ['church-i18n-extended.js','church-i18n-payment-patch.js','church-header-controls.js','church-footer-number-i18n.js']){
    const src=assetRoot+name;
    // Relative entries in the Church HTML must not be loaded a second time.
    if([...document.scripts].some(node=>node.src&&new URL(node.src,location.href).pathname===src))continue;
    const script=document.createElement('script');
    script.src=src;
    script.defer=true;
    script.dataset.ekodiChurchExtension='v1';
    document.head.append(script);
  }
}

ensureLanguageControl();
window.addEventListener('ekodi:locale-change',schedule);
window.addEventListener('ekodi:church-i18n-applied',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
loadExtensions();
})();