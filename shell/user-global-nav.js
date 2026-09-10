(()=>{
'use strict';
if(typeof window==='undefined'||typeof document==='undefined')return;
if(window.__EKODI_USER_GLOBAL_NAV_BOOTED)return;
window.__EKODI_USER_GLOBAL_NAV_BOOTED=true;

// EKODI common user chrome contract: persistent chrome is the shared header
// and shared footer only. Workspace/service discovery belongs inside My EKODI
// content, never in a floating global or space-selector menu on service pages.
const LEGACY_SELECTOR='[data-ekodi-shell-root],[data-ekodi-user-global-nav]';
let observer=null;

function removeLegacyFloatingChrome(){
  document.documentElement.dataset.ekodiGlobalNav='off';
  document.documentElement.dataset.ekodiWorkspaceSelector='hidden';
  for(const node of document.querySelectorAll(LEGACY_SELECTOR))node.remove();
}

function startGuard(){
  removeLegacyFloatingChrome();
  if(observer||typeof MutationObserver!=='function')return;
  observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(!(node instanceof Element))continue;
        if(node.matches?.(LEGACY_SELECTOR)||node.querySelector?.(LEGACY_SELECTOR)){
          queueMicrotask(removeLegacyFloatingChrome);
          return;
        }
      }
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
}

startGuard();
window.addEventListener('ekodi:shell-theme',removeLegacyFloatingChrome);
window.addEventListener('ekodi:shell-context',removeLegacyFloatingChrome);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',removeLegacyFloatingChrome,{once:true});
})();
