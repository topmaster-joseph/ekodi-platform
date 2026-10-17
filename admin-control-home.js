/* EKODI Control stays native; its admin host only owns layout and navigation. */
(()=>{
'use strict';
const app=document.getElementById('app');
const isAuthenticated=()=>{try{return Boolean(sessionStorage.getItem('ekodi-auth-token')&&app&&!app.hidden)}catch{return false}};
function sync(){
  const atHome=isAuthenticated()&&window.EKODIAdminPanels?.current?.()==='command-home';
  let region=document.getElementById('ekodiControlHome');
  if(atHome&&!region){
    const main=app?.querySelector('main');
    if(!main)return;
    region=document.createElement('section');
    region.id='ekodiControlHome';
    region.setAttribute('aria-label','EKODI Control 통합 작업영역');
    region.hidden=true;
    const frame=document.createElement('iframe');
    frame.id='ekodiControlHomeFrame';
    frame.title='EKODI Control 명령·작업·Agents·Workers·결과';
    frame.src='/control?embedded=admin';
    frame.referrerPolicy='no-referrer';
    frame.loading='eager';
    region.appendChild(frame);
    main.appendChild(region);
  }
  document.body.classList.toggle('admin-control-home',Boolean(atHome));
  if(region)region.hidden=!atHome;
}
window.addEventListener('ekodi-admin-ready',sync);
window.addEventListener('ekodi-admin-section-changed',sync);
window.addEventListener('popstate',()=>queueMicrotask(sync));
window.addEventListener('hashchange',()=>queueMicrotask(sync));
window.addEventListener('ekodi-authenticated',()=>queueMicrotask(sync));
document.getElementById('logoutButton')?.addEventListener('click',()=>{document.body.classList.remove('admin-control-home');const region=document.getElementById('ekodiControlHome');if(region)region.hidden=true});
sync();
})();
