(() => {
  'use strict';
  const TOKEN_KEY='ekodi-auth-token';
  let loading=null;
  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}}
  function ready(){return Boolean(token()&&!document.querySelector('#app')?.hidden)}
  function installButton(){
    if(!ready()||document.querySelector('#ekodiAssistDock')||document.querySelector('#ekodiAssistBootstrap'))return;
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
  async function loadAssist(open){
    if(document.querySelector('#ekodiAssistDock')){if(open)window.dispatchEvent(new Event('ekodi-assist-open'));return}
    if(!loading){
      const demand=window.EKODIAdminDemand;
      if(!demand?.loadStyle||!demand?.loadScript)return;
      loading=Promise.all([demand.loadStyle('ai-ops-admin.css'),demand.loadScript('admin-lazy-features.js')]).catch(error=>{loading=null;throw error});
    }
    try{await loading;if(open)window.dispatchEvent(new Event('ekodi-assist-open'))}catch(error){console.warn('[EKODI Assist] lazy load failed',error)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installButton,{once:true});else installButton();
  window.addEventListener('ekodi-authenticated',installButton);
})();
