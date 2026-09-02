(()=>{
'use strict';
if(window.__EKODI_USER_PAGE_TRANSLATION__)return;
window.__EKODI_USER_PAGE_TRANSLATION__=true;
const VERSION=1;
const SOURCE='ko-KR';
const API='https://shell.ekodi.kr/translate';
const EXCLUDE='script,style,noscript,code,pre,textarea,select,option,svg,canvas,template,iframe,video,audio,[contenteditable],[translate="no"],[data-ekodi-no-translate],[data-sensitive],[data-private],[data-user-content],[data-ekodi-secret],[data-ekodi-language-control],.ekodi-user-ui-footer';
const WORKSPACE_UI='button,label,legend,summary,nav,a,h1,h2,h3,h4,h5,h6,th,caption,[role="button"],[role="tab"],[role="menuitem"],[aria-label],.title,.heading,.label,.eyebrow,.kicker,[data-ui-copy]';
const ATTRS=['placeholder','title','aria-label'];
const textOriginal=new WeakMap();
const attrOriginal=new WeakMap();
const touchedText=new Set();
const touchedAttr=new Set();
const cache=new Map();
let locale=SOURCE;
let observer=null;
let timer=0;
let runId=0;
function surface(){return String(document.documentElement.dataset.ekodiUserSurface||'public').toLowerCase();}
function clean(value){return String(value||'').replace(/\s+/g,' ').trim();}
function translatable(value){const text=clean(value);return text.length>0&&text.length<=600&&/[가-힣]/.test(text);}
function blocked(el){return !el||!!el.closest(EXCLUDE);}
function allowedText(node){
  const el=node?.parentElement;
  if(blocked(el)||!translatable(node.nodeValue))return false;
  if(surface()!=='workspace')return true;
  return !!el.closest(WORKSPACE_UI);
}
function textItems(root=document.body){
  if(!root)return[];
  const out=[];
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:node=>allowedText(node)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    if(!textOriginal.has(node))textOriginal.set(node,node.nodeValue);
    touchedText.add(node);
    out.push({kind:'text',node,original:textOriginal.get(node),value:clean(textOriginal.get(node))});
  }
  return out;
}
function attrItems(root=document.body){
  if(!root)return[];
  const nodes=root.matches?.('*')?[root,...root.querySelectorAll('*')]:[...root.querySelectorAll('*')];
  const out=[];
  for(const el of nodes){
    if(blocked(el))continue;
    if(surface()==='workspace'&&!el.matches(WORKSPACE_UI)&&!el.closest(WORKSPACE_UI))continue;
    for(const attr of ATTRS){
      const value=el.getAttribute?.(attr);
      if(!translatable(value))continue;
      let originals=attrOriginal.get(el);if(!originals){originals={};attrOriginal.set(el,originals);}
      if(!(attr in originals))originals[attr]=value;
      touchedAttr.add(el);
      out.push({kind:'attr',node:el,attr,original:originals[attr],value:clean(originals[attr])});
    }
  }
  return out;
}
function restore(){
  for(const node of touchedText){if(node?.isConnected&&textOriginal.has(node))node.nodeValue=textOriginal.get(node);}
  for(const el of touchedAttr){
    if(!el?.isConnected)continue;
    const originals=attrOriginal.get(el)||{};
    for(const [name,value] of Object.entries(originals))el.setAttribute(name,value);
  }
}
async function translate(values,target,currentRun){
  const result=new Map();
  const missing=[];
  for(const value of new Set(values)){
    const key=`${target}\u0000${value}`;
    if(cache.has(key))result.set(value,cache.get(key));else missing.push(value);
  }
  for(let index=0;index<missing.length;index+=24){
    if(currentRun!==runId)return result;
    const texts=missing.slice(index,index+24);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:SOURCE,target,texts,surface:surface()}),signal:controller.signal,credentials:'omit',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!Array.isArray(data.translations))throw new Error(data.error||`translate_${response.status}`);
      texts.forEach((text,i)=>{
        const translated=clean(data.translations[i]||'')||text;
        cache.set(`${target}\u0000${text}`,translated);
        result.set(text,translated);
      });
    }catch(error){console.warn('EKODI page translation fallback',error?.message||error);}
    finally{clearTimeout(timeout);}
  }
  return result;
}
function applyItem(item,value){
  if(item.kind==='text'){
    const raw=String(item.original||'');
    const lead=raw.match(/^\s*/)?.[0]||'';const tail=raw.match(/\s*$/)?.[0]||'';
    item.node.nodeValue=`${lead}${value}${tail}`;
  }else item.node.setAttribute(item.attr,value);
}
async function render(root=document.body){
  const current=++runId;
  if(locale===SOURCE){restore();return;}
  const items=[...textItems(root),...attrItems(root)];
  if(!items.length)return;
  const translated=await translate(items.map(item=>item.value),locale,current);
  if(current!==runId)return;
  for(const item of items)applyItem(item,translated.get(item.value)||item.value);
}
function schedule(root=document.body){
  clearTimeout(timer);
  timer=setTimeout(()=>render(root),80);
}
function setLocale(next){
  locale=String(next||SOURCE);
  schedule(document.body);
}
function boot(){
  locale=window.EKODIUserLanguage?.getLocale?.()||document.documentElement.dataset.ekodiLocale||document.documentElement.lang||SOURCE;
  schedule(document.body);
  observer=new MutationObserver(records=>{
    if(locale===SOURCE)return;
    const roots=[];
    for(const record of records)for(const node of record.addedNodes||[])if(node.nodeType===1)roots.push(node);
    if(roots.length)schedule(document.body);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
}
window.addEventListener('ekodi:locale-change',event=>setLocale(event.detail?.locale||SOURCE));
window.EKODIUserPageTranslation=Object.freeze({version:VERSION,getLocale:()=>locale,refresh:()=>schedule(document.body),restore});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
