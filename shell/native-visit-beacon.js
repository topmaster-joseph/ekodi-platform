(()=>{
'use strict';
if(window.__EKODI_NATIVE_VISIT_BEACON_BOOTED)return;
window.__EKODI_NATIVE_VISIT_BEACON_BOOTED=true;

// Native footer-only sites already have a shared read-only stats projection.
// Their view telemetry uses the existing site-scoped endpoint, never raw paths,
// IP addresses, account identities or user-agent values.
const sent=new Set();
function send(detail){
  if(window.__EKODI_SHELL_BOOTED)return; // Full Shell already records this visit.
  if(navigator.globalPrivacyControl===true||navigator.doNotTrack==='1')return;
  const surface=String(document.documentElement.dataset.ekodiShellSurface||document.body?.dataset?.ekodiShellSurface||'').toLowerCase();
  if(surface!=='public'&&surface!=='workspace')return;
  const siteId=String(detail?.siteId||'').trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(siteId))return;
  let url;
  try{url=new URL(String(detail?.scope||''));}catch{return;}
  if(url.origin!=='https://ekodi.kr'||url.pathname!=='/api/telemetry/public-summary')return;
  const sitePath=url.searchParams.get('site_path')||'';
  if(sitePath&&!/^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(sitePath))return;
  const key=siteId+'|'+sitePath;
  if(sent.has(key))return;
  sent.add(key);
  const day=new Date().toISOString().slice(0,10);
  const storageKey='ekodi_traffic_daily:'+siteId+':'+day;
  let sid='';
  try{sid=localStorage.getItem(storageKey)||'';}catch{}
  if(!sid)try{sid=sessionStorage.getItem(storageKey)||'';}catch{}
  if(!/^[A-Za-z0-9_-]{16,96}$/.test(sid)){
    try{sid=crypto.randomUUID().replace(/-/g,'_');}
    catch{
      const bytes=new Uint8Array(18);crypto.getRandomValues(bytes);
      sid=[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    }
    for(const storage of [localStorage,sessionStorage]){
      try{storage.setItem(storageKey,sid);break;}catch{}
    }
  }
  const payload=JSON.stringify({sid,site_id:siteId,site_path:sitePath,surface});
  const endpoint='https://ekodi.kr/api/telemetry/visit';
  try{if(navigator.sendBeacon?.(endpoint,payload))return;}catch{}
  try{fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',keepalive:true,headers:{'content-type':'text/plain;charset=UTF-8'},body:payload}).catch(()=>{});}catch{}
}
window.addEventListener('ekodi:footer-traffic-ready',event=>send(event.detail));
})();
