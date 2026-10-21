(()=>{
'use strict';
// EKODI shared User AI entry (bottom AI command box) — RETIRED 2026-10-21.
// Owner decision: remove the bottom AI command box from every EKODI user surface.
// This module intentionally never mounts. It only removes any instance left behind by a
// stale cached shell bundle so pages converge to the retired state without a hard refresh.
if(window.__EKODI_USER_AI_ENTRY_RETIRED__)return;
window.__EKODI_USER_AI_ENTRY_RETIRED__=true;
window.__EKODI_USER_AI_ENTRY__=true;
function purge(){
  document.querySelectorAll('[data-ekodi-user-ai-entry],[data-ekodi-user-ai-entry-style]').forEach(node=>{
    if(node!==document.documentElement)node.remove();
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',purge,{once:true});else purge();
})();
