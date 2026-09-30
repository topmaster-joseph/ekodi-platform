(() => {
  'use strict';
  const TOKEN_KEY='ekodi-auth-token';
  let loading=false;
  function authenticated(){try{return Boolean(sessionStorage.getItem(TOKEN_KEY)&&document.querySelector('#app')&&!document.querySelector('#app').hidden);}catch{return false;}}
  function install(){
    if(!authenticated())return;
    const nav=document.querySelector('.sidebar nav');if(!nav||nav.querySelector('[data-section="storage"],[data-demand-storage]'))return;
    const button=document.createElement('button');button.type='button';button.className='nav';button.dataset.demandStorage='true';button.append(document.createTextNode('▣ '));const label=document.createElement('span');label.textContent='Storage';button.append(label);
    const security=nav.querySelector('[data-demand-feature="security"],[data-section="security"]');if(security)nav.insertBefore(button,security);else nav.append(button);
    button.addEventListener('click',async event=>{event.preventDefault();event.stopImmediatePropagation();if(loading)return;loading=true;button.disabled=true;button.setAttribute('aria-busy','true');try{const demand=window.EKODIAdminDemand;if(!demand)throw new Error('Admin demand loader unavailable');await demand.loadStyle('storage-admin.css');await demand.loadScript('storage-admin.js');button.remove();document.querySelector('[data-section="storage"]')?.click();}catch(error){console.warn('[EKODI Admin] Storage load failed',error);button.disabled=false;button.removeAttribute('aria-busy');loading=false;}},true);
    if(location.hash==='#storage')queueMicrotask(()=>button.click());
  }
  install();window.addEventListener('ekodi-admin-ready',install);window.addEventListener('ekodi-authenticated',install);window.addEventListener('hashchange',()=>{if(location.hash==='#storage')install();const button=document.querySelector('[data-demand-storage]');if(location.hash==='#storage'&&button)button.click();});
})();
