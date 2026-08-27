(()=>{
  const STORAGE_KEY='ekodi_my_active_workspace';
  const WORKSPACE_KEY_RE=/^[a-z]+:[a-zA-Z0-9:_-]+$/;
  const SERVICE_ID_RE=/^[a-z][a-z0-9-]*$/;
  const PRIVATE_PREFIX='/w/';
  const requested=parsePrivateRoute(location.pathname);

  function parsePrivateRoute(pathname){
    if(!String(pathname||'').startsWith(PRIVATE_PREFIX))return null;
    const parts=String(pathname).split('/').filter(Boolean);
    if(parts[0]!=='w'||parts.length<2||parts.length>3)return null;
    try{
      const workspaceKey=decodeURIComponent(parts[1]||'');
      const serviceId=parts[2]?decodeURIComponent(parts[2]):'';
      if(!WORKSPACE_KEY_RE.test(workspaceKey)||workspaceKey.length>180)return null;
      if(serviceId&&!SERVICE_ID_RE.test(serviceId))return null;
      return {workspaceKey,serviceId};
    }catch{return null}
  }
  function activeWorkspaceKey(){try{return localStorage.getItem(STORAGE_KEY)||''}catch{return''}}
  function rememberWorkspace(key){try{if(key)localStorage.setItem(STORAGE_KEY,key)}catch{}}
  function privatePath(workspaceKey,serviceId=''){
    if(!WORKSPACE_KEY_RE.test(String(workspaceKey||'')))return '/';
    const base=`/w/${encodeURIComponent(workspaceKey)}`;
    return serviceId&&SERVICE_ID_RE.test(serviceId)?`${base}/${encodeURIComponent(serviceId)}`:base;
  }
  function centralMyLogin(){
    const target=new URL('https://auth.ekodi.kr/');
    target.searchParams.set('site','my');
    const returnTo=new URL(location.href);
    returnTo.hash='';
    target.searchParams.set('return_to',returnTo.href);
    return target.href;
  }
  async function serviceMap(){
    try{
      const response=await fetch('/service-manifest.json',{cache:'no-store'});
      if(!response.ok)return new Map();
      const data=await response.json();
      return new Map((data.services||[]).map(service=>[String(service.id||''),service]));
    }catch{return new Map()}
  }
  function siteForLink(link,services){
    const raw=link.dataset.ekodiServiceTarget||link.getAttribute('href')||'';
    try{
      const target=new URL(raw,location.href);
      if(target.origin==='https://auth.ekodi.kr'){
        const site=String(target.searchParams.get('site')||'');
        return services.has(site)?site:'';
      }
      for(const [id,service] of services){
        try{if(new URL(service.url).origin===target.origin)return id}catch{}
      }
    }catch{}
    return '';
  }
  function rewritePlatformLinks(services){
    const workspaceKey=activeWorkspaceKey();
    if(!WORKSPACE_KEY_RE.test(workspaceKey))return;
    for(const link of document.querySelectorAll('.platform-card a.card-link')){
      const site=siteForLink(link,services);
      if(!site)continue;
      if(!link.dataset.ekodiServiceTarget)link.dataset.ekodiServiceTarget=link.href;
      link.href=privatePath(workspaceKey,site);
      link.dataset.ekodiPrivateWorkspace='v1';
    }
  }
  function redirectWorkspaceSelection(event){
    const button=event.target?.closest?.('[data-workspace-key]');
    if(!button)return;
    const workspaceKey=String(button.dataset.workspaceKey||'');
    if(!WORKSPACE_KEY_RE.test(workspaceKey))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    rememberWorkspace(workspaceKey);
    location.assign(privatePath(workspaceKey));
  }
  async function launchRequestedService(services){
    if(!requested?.serviceId)return;
    for(let attempt=0;attempt<80;attempt+=1){
      const remembered=activeWorkspaceKey();
      if(remembered&&remembered!==requested.workspaceKey){
        location.replace(privatePath(remembered));
        return;
      }
      for(const link of document.querySelectorAll('.platform-card a.card-link')){
        const site=siteForLink(link,services);
        if(site!==requested.serviceId)continue;
        const destination=link.dataset.ekodiServiceTarget||link.href;
        if(destination&&new URL(destination,location.href).origin!==location.origin){
          location.replace(destination);
          return;
        }
      }
      const authButton=document.getElementById('authButton');
      if(attempt>=8&&authButton&&!authButton.disabled&&authButton.textContent?.includes('Google로 시작')){
        location.replace(centralMyLogin());
        return;
      }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }

  if(requested)rememberWorkspace(requested.workspaceKey);
  document.addEventListener('click',redirectWorkspaceSelection,true);
  const servicesPromise=serviceMap();
  const start=async()=>{
    const services=await servicesPromise;
    rewritePlatformLinks(services);
    const observer=new MutationObserver(()=>rewritePlatformLinks(services));
    observer.observe(document.documentElement,{subtree:true,childList:true});
    await launchRequestedService(services);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void start(),{once:true});
  else void start();
})();