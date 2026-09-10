(() => {
  'use strict';
  const TOKEN_KEY='ekodi-auth-token';
  let loading=null;
  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}}
  function ready(){return Boolean(token()&&!document.querySelector('#app')?.hidden)}
  function position(){const sidebar=document.querySelector('.sidebar');const right=sidebar?.getBoundingClientRect?.().right||0;document.documentElement.style.setProperty('--ekodi-assist-left',`${Math.max(0,Math.round(right))}px`)}
  function installButton(){
    if(!ready()||document.querySelector('#ekodiAssistDock')||document.querySelector('#ekodiAssistBootstrap'))return;
    position();
    const shell=document.createElement('div');shell.id='ekodiAssistBootstrap';shell.className='ekodi-assist-bootstrap';
    const form=document.createElement('form');form.className='ekodi-assist-bootstrap-form';form.setAttribute('aria-label','에코디 AI 명령');
    const plus=document.createElement('button');plus.type='button';plus.className='ekodi-assist-bootstrap-plus';plus.textContent='＋';plus.setAttribute('aria-label','EKODI AI 열기');
    const input=document.createElement('input');input.type='text';input.maxLength=1800;input.autocomplete='off';input.placeholder='에코디 AI에게 물어보세요';
    const send=document.createElement('button');send.type='submit';send.className='ekodi-assist-bootstrap-send';send.textContent='↑';send.setAttribute('aria-label','보내기');
    form.append(plus,input,send);shell.append(form);document.body.appendChild(shell);
    const button=plus;button.addEventListener('click',()=>loadAssist(true));
    form.addEventListener('submit',async event=>{event.preventDefault();const text=input.value.trim();if(!text){await loadAssist(true);return}send.disabled=true;try{await loadAssist(true);window.dispatchEvent(new CustomEvent('ekodi-admin-assist-request',{detail:{text}}));input.value=''}finally{send.disabled=false}});
    window.addEventListener('resize',position,{passive:true});
  }
  async function loadControlPlane(){
    if(window.EKODIAdminAIControlPlane)return;
    const demand=window.EKODIAdminDemand;if(!demand?.loadScript)return;
    try{await demand.loadScript('admin-ai-control-plane.js')}catch(error){console.warn('[EKODI Control Plane] lazy load failed',error)}
  }
  async function loadAssist(open){
    const existing=document.querySelector('#ekodiAssistLauncher');
    if(existing){document.querySelector('#ekodiAssistBootstrap')?.remove();if(open)existing.click();void loadControlPlane();return}
    if(!loading){
      const demand=window.EKODIAdminDemand;if(!demand?.loadStyle||!demand?.loadScript)return;
      loading=Promise.all([demand.loadStyle('ai-ops-admin.css'),demand.loadScript('admin-lazy-features.js'),loadControlPlane()]).catch(error=>{loading=null;throw error});
    }
    try{await loading;document.querySelector('#ekodiAssistBootstrap')?.remove();const launcher=document.querySelector('#ekodiAssistLauncher');if(open&&launcher)launcher.click()}catch(error){console.warn('[EKODI Assist] lazy load failed',error)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installButton,{once:true});else installButton();
  window.addEventListener('ekodi-authenticated',installButton);
})();