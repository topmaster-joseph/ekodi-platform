(()=>{
'use strict';
if(window.__EKODI_ECOSYSTEM_LINK_COMPAT)return;
window.__EKODI_ECOSYSTEM_LINK_COMPAT=true;

const LEGACY_HOST_TO_SERVICE=Object.freeze({
  'ekodibiz.kr':'biz',
  'www.ekodibiz.kr':'biz',
  'ekodi-church.pages.dev':'church',
  'ekodicommunity.pages.dev':'community',
  'ekodilab.pages.dev':'lab',
});

function serviceMap(manifest){
  return new Map((manifest?.services||[]).map(service=>[service.id,service]));
}
function canonicalize(root,services){
  const anchors=root?.querySelectorAll?.('a[href]')||[];
  for(const anchor of anchors){
    let url;
    try{url=new URL(anchor.getAttribute('href'),location.href);}catch{continue;}
    const serviceId=LEGACY_HOST_TO_SERVICE[url.hostname.toLowerCase()];
    const target=serviceId?services.get(serviceId):null;
    if(!target?.url)continue;
    const canonical=new URL(target.url);
    canonical.pathname=url.pathname==='/'?canonical.pathname:url.pathname;
    canonical.search=url.search;
    canonical.hash=url.hash;
    anchor.href=canonical.href;
    anchor.dataset.ekodiCanonicalService=serviceId;
  }
}

async function boot(){
  let manifest;
  try{
    const response=await fetch('https://shell.ekodi.kr/manifest.json',{cache:'no-store',mode:'cors'});
    if(!response.ok)return;
    manifest=await response.json();
  }catch{return;}
  const services=serviceMap(manifest);
  canonicalize(document,services);
  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){if(node.nodeType===1)canonicalize(node.matches?.('a[href]')?node.parentNode:node,services);}
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
