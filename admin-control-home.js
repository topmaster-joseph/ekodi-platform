/* Native EKODI Control: mounted only after a verified super-admin session. */
(()=>{
'use strict';
const app=document.getElementById('app');
const readToken=()=>{try{return sessionStorage.getItem('ekodi-auth-token')||''}catch{return''}};
let authorizedToken='';
let verificationId=0;
let verifying=false;
function isSuperAdmin(){
  const token=readToken();
  return Boolean(token&&token===authorizedToken&&app&&!app.hidden);
}
function sync(){
  const atHome=isSuperAdmin()&&window.EKODIAdminPanels?.current?.()==='command-home';
  let region=document.getElementById('ekodiControlHome');
  if(atHome&&!region){
    const main=app?.querySelector('main');
    if(!main)return;
    if(!document.querySelector('link[data-ekodi-control-home-style],link[data-ekodi-postauth-style="admin-control-home.css"]')){
      const style=document.createElement('link');
      const currentScript=document.querySelector('script[src*="admin-authenticated-shell.js"]');
      const assetVersion=new URL(currentScript?.src||location.href).searchParams.get('v')||'1';
      style.rel='stylesheet';
      style.href='/admin/admin-control-home.css?v='+encodeURIComponent(assetVersion);
      style.dataset.ekodiControlHomeStyle='true';
      document.head.appendChild(style);
    }
    region=document.createElement('section');
    region.id='ekodiControlHome';
    region.setAttribute('aria-label','EKODI Control 통합 작업영역');
    region.hidden=true;
    // Critical geometry must exist before the asynchronously fetched Admin CSS arrives.
    // Without this, the embedded browser defaults to roughly 300x150 and a
    // live E2E may observe a collapsed work area while the stylesheet loads.
    region.style.width='100%';
    region.style.height='100dvh';
    region.style.minHeight='0';
    region.style.overflow='hidden';
    const frame=document.createElement('iframe');
    frame.id='ekodiControlHomeFrame';
    frame.title='EKODI Control 명령·작업·Agents·Workers·결과';
    frame.src='/control?embedded=admin';
    frame.referrerPolicy='no-referrer';
    frame.loading='eager';
    frame.style.display='block';
    frame.style.width='100%';
    frame.style.height='100%';
    frame.style.border='0';
    region.appendChild(frame);
    main.appendChild(region);
  }
  document.body.classList.toggle('admin-control-home',Boolean(atHome));
  if(region)region.hidden=!atHome;
  // ADMIN-HOME-NO-FLASH-001: the assist command view stays held (CSS) until Control owns
  // the home, and is released only once the session is known not to be a super admin.
  // A super admin whose panel router has not reported command-home yet stays held, so
  // the assist welcome never paints before Control (observed 2026-10-28).
  document.body.classList.toggle('admin-control-home-released',!isSuperAdmin()&&!pendingVerification());
}
function pendingVerification(){return verifying&&Boolean(readToken())}
async function verify(){
  const token=readToken();
  const requestId=++verificationId;
  authorizedToken='';
  verifying=Boolean(token&&app&&!app.hidden);
  sync();
  if(!verifying)return;
  try{
    const response=await fetch('/api/session',{
      headers:{authorization:'Bearer '+token},
      cache:'no-store',
      credentials:'same-origin'
    });
    const session=response.ok?await response.json():null;
    if(requestId!==verificationId||readToken()!==token)return;
    if(session?.authenticated===true&&session.role==='super_admin'){
      authorizedToken=token;
    }
  }catch{
    // Fail closed when authority cannot be verified.
  }
  if(requestId===verificationId)verifying=false;
  sync();
}
window.addEventListener('ekodi-admin-ready',()=>void verify());
window.addEventListener('ekodi-session-validated',event=>{
  const token=readToken();
  const session=event.detail;
  verificationId++;
  authorizedToken=token&&session?.authenticated===true&&session.role==='super_admin'?token:'';
  verifying=false;
  sync();
});
window.addEventListener('ekodi-admin-section-changed',sync);
window.addEventListener('popstate',()=>queueMicrotask(sync));
window.addEventListener('hashchange',()=>queueMicrotask(sync));
window.addEventListener('ekodi-authenticated',()=>void verify());
document.getElementById('logoutButton')?.addEventListener('click',()=>{
  verificationId++;
  authorizedToken='';
  sync();
});
void verify();
})();
