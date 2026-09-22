(()=>{
'use strict';
const RELEASE_CHECK_MS=60000;
const TOKEN_KEY='ekodi-auth-token';
const currentScript=document.currentScript;
const CURRENT_VERSION=(()=>{try{return new URL(currentScript?.src||location.href).searchParams.get('v')||''}catch{return''}})();
let checkedAt=0;
let pending=null;
function authenticated(){try{return Boolean(sessionStorage.getItem(TOKEN_KEY)&&!document.querySelector('#app')?.hidden)}catch{return false}}
function versionFrom(html){return String(html||'').match(/admin-authenticated-shell\.js\?v=([a-f0-9]{16})/)?.[1]||''}
async function convergeAdminRelease(force=false){
  if(!CURRENT_VERSION||!authenticated()||document.visibilityState==='hidden')return false;
  const now=Date.now();
  if(!force&&now-checkedAt<RELEASE_CHECK_MS)return false;
  if(pending)return pending;
  checkedAt=now;
  pending=fetch('/admin/',{cache:'no-store',credentials:'same-origin'})
    .then(response=>response.ok?response.text():'')
    .then(html=>{const live=versionFrom(html);if(live&&live!==CURRENT_VERSION){document.documentElement.dataset.ekodiAdminReleaseDrift='true';location.reload();return true}return false})
    .catch(()=>false)
    .finally(()=>{pending=null});
  return pending;
}
window.EKODIAdminReleaseConvergence=Object.freeze({check:convergeAdminRelease,currentVersion:CURRENT_VERSION});
window.addEventListener('focus',()=>{void convergeAdminRelease()});
window.addEventListener('pageshow',event=>{if(event.persisted)void convergeAdminRelease(true)});
window.addEventListener('ekodi-nav-changed',()=>{void convergeAdminRelease()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void convergeAdminRelease()});
void convergeAdminRelease(true);
})();