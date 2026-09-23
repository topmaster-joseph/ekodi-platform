(()=>{
'use strict';
const PROD_AUTH_ORIGIN='https://ekodi.kr';
const BRIDGE_PATH='/auth/google-origin-bridge?wait=1';
function adminSurface(){
  const root=document.documentElement;
  const surface=String(root.dataset.ekodiSurface||root.dataset.ekodiUserSurface||'').toLowerCase();
  const ui=String(root.dataset.ekodiUiSurface||'').toLowerCase();
  const host=location.hostname.toLowerCase();
  return surface==='admin'||ui.includes('admin')||host==='admin.ekodi.kr'||/(^|\/)admin(?:\/|$)/i.test(location.pathname);
}
function canonicalAuthUrl(anchor){
  const url=new URL(anchor.href,location.href);
  if(!/^https?:$/.test(url.protocol)||url.pathname!=='/auth/'&&url.pathname!=='/auth')return null;
  if((location.hostname==='ekodi.kr'||location.hostname.endsWith('.ekodi.kr'))&&(url.hostname==='auth.ekodi.kr'||url.hostname==='www.ekodi.kr')){
    const canonical=new URL(url.href);canonical.protocol='https:';canonical.host='ekodi.kr';canonical.pathname='/auth/';return canonical;
  }
  if(url.pathname==='/auth')url.pathname='/auth/';
  return url;
}
function openBridge(auth){
  const bridge=new URL(BRIDGE_PATH,auth.origin);
  return window.open(bridge.href,'ekodi_google_origin_bridge','popup,width=520,height=680,resizable=yes,scrollbars=yes');
}
document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!adminSurface())return;
  const anchor=event.target?.closest?.('a[href]');
  if(!anchor||anchor.target&&anchor.target!=='_self')return;
  let auth;try{auth=canonicalAuthUrl(anchor)}catch{return}
  if(!auth)return;
  const returnTo=auth.searchParams.get('return_to')||auth.searchParams.get('returnTo')||'';
  let adminReturn=false;try{const target=new URL(returnTo,location.href);adminReturn=target.hostname==='admin.ekodi.kr'||/(^|\/)admin(?:\/|$)/i.test(target.pathname)}catch{}
  if(!adminReturn&&!adminSurface())return;
  let popup=null;try{popup=openBridge(auth)}catch{}
  if(!popup)return;
  event.preventDefault();
  auth.searchParams.set('direct','1');
  auth.searchParams.set('bridge','preopened');
  try{popup.focus()}catch{}
  location.assign(auth.href);
},{capture:true});
})();