(() => {
  'use strict';
  const TOKEN_KEY='ekodi-auth-token';
  let loading=null;
  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}}
  function ready(){return Boolean(token()&&!document.querySelector('#app')?.hidden)}
  function installButton(){
    if(!ready())return;
    loadControlPlane();
    if(document.querySelector('#ekodiAssistDock')||document.querySelector('#ekodiAssistBootstrap'))return;
    const button=document.createElement('button');
    button.id='ekodiAssistBootstrap';
    button.className='ekodi-assist-bootstrap';
    button.type='button';
    button.setAttribute('aria-label','EKODI Assist 열기');
    button.textContent='✦';
    button.addEventListener('click',async()=>{button.disabled=true;try{await loadAssist(true)}finally{button.disabled=false}});
    document.body.appendChild(button);
    if('requestIdleCallback'in window)window.requestIdleCallback(()=>loadAssist(false));
  }
  async function loadControlPlane(){
    if(window.EKODIAdminAIControlPlane)return;
    const demand=window.EKODIAdminDemand;
    if(!demand?.loadScript)return;
    try{await demand.loadScript('admin-ai-control-plane.js')}catch(error){console.warn('[EKODI Control Plane] lazy load failed',error)}
  }
  async function loadAssist(open){
    const existing=document.querySelector('#ekodiAssistLauncher');
    if(existing){document.querySelector('#ekodiAssistBootstrap')?.remove();if(open)existing.click();loadControlPlane();return}
    if(!loading){
      const demand=window.EKODIAdminDemand;
      if(!demand?.loadStyle||!demand?.loadScript)return;
      loading=Promise.all([demand.loadStyle('ai-ops-admin.css'),demand.loadScript('admin-lazy-features.js'),loadControlPlane()]).catch(error=>{loading=null;throw error});
    }
    try{
      await loading;
      document.querySelector('#ekodiAssistBootstrap')?.remove();
      const launcher=document.querySelector('#ekodiAssistLauncher');
      if(open&&launcher)launcher.click();
    }catch(error){console.warn('[EKODI Assist] lazy load failed',error)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installButton,{once:true});else installButton();
  window.addEventListener('ekodi-authenticated',installButton);
})();
