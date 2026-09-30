(()=>{
'use strict';
const BRIDGE_PATH='/auth/google-origin-bridge?wait=1';
function adminSurface(){
  const root=document.documentElement;
  const surface=String(root.dataset.ekodiSurface||root.dataset.ekodiUserSurface||'').toLowerCase();
  const ui=String(root.dataset.ekodiUiSurface||'').toLowerCase();
  return surface==='admin'||ui.includes('admin')||/(^|\/)admin(?:\/|$)/i.test(location.pathname);
}
function canonicalAuthUrl(anchor){
  const clicked=new URL(anchor.href,location.href);
  if(!/^https?:$/.test(clicked.protocol)||clicked.pathname!=='/auth/'&&clicked.pathname!=='/auth')return null;
  if(clicked.origin!==location.origin)return null;
  const url=new URL('/auth/',location.origin);
  for(const [key,value] of clicked.searchParams)url.searchParams.append(key,value);
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
  let adminReturn=false;try{adminReturn=/(^|\/)admin(?:\/|$)/i.test(new URL(returnTo,location.href).pathname)}catch{}
  if(!adminReturn)return;
  let popup=null;try{popup=openBridge(auth)}catch{}
  if(!popup)return;
  event.preventDefault();
  auth.searchParams.set('direct','1');
  auth.searchParams.set('bridge','preopened');
  try{popup.focus()}catch{}
  location.assign(auth.href);
},{capture:true});
})();