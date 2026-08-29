const url=new URL(location.href);
const params=url.searchParams;
const legacySiteAliases=Object.freeze({'mall-seller':'mall'});
const targetableWorkspaceSites=new Set(['cgma','marketing','biz','trade','mall','pay','books','church','lab','mission','community','edu','media','social','energy','messenger','invest']);
const privateClientSites=new Set(['cgma-client','jadam-client','pizzamaru-client','yogurt-client']);

let changed=false;
const requestedSite=params.get('site');
if(requestedSite==='mall-seller'&&!params.get('return_to')&&!params.get('returnTo')){
  params.set('return_to','https://mall.ekodi.kr/seller/');
  changed=true;
}
if(legacySiteAliases[requestedSite]){
  params.set('site',legacySiteAliases[requestedSite]);
  changed=true;
}
if(!params.get('return_to')&&params.get('returnTo')){
  params.set('return_to',params.get('returnTo'));
  params.delete('returnTo');
  changed=true;
}
if(changed)history.replaceState({},document.title,url.href);

const manageMode=params.get('manage')==='1';
const reviewMode=params.get('review')==='1';
document.documentElement.dataset.identityManage=manageMode?'1':'0';
document.documentElement.dataset.seamlessSso=manageMode||reviewMode?'0':'1';
const site=params.get('site')||'portal';
const targetedWorkspace=targetableWorkspaceSites.has(site)&&Boolean(params.get('workspace'));

function hasTrustedEkodiReturn(){
  const raw=params.get('return_to')||params.get('returnTo');
  if(!raw)return false;
  try{
    const target=new URL(raw);
    const hostname=target.hostname.toLowerCase();
    return target.protocol==='https:'&&!target.username&&!target.password&&(hostname==='ekodi.kr'||hostname.endsWith('.ekodi.kr'));
  }catch{return false}
}

let manifestPromise;
async function manifestService(id){
  if(!id)return null;
  try{
    manifestPromise ||= fetch('https://shell.ekodi.kr/manifest.json',{cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null);
    const manifest=await manifestPromise;
    return manifest?.services?.find(service=>service.id===id)||null;
  }catch{return null}
}
async function loadMarketingAuth(){
  try{return await import('./marketing-auth-hotfix.js?v=20260824-return-origin-1')}
  catch(error){console.warn('Versioned Marketing auth load failed; retrying canonical asset.',error);return await import('./marketing-auth-hotfix.js')}
}
async function loadClientAuth(){
  try{return await import('./client-auth.js?v=20260829-stale-session-recovery-1')}
  catch(error){console.warn('Versioned universal identity auth load failed; retrying canonical asset.',error);return await import('./client-auth.js')}
}

if(site==='admin')await import('./admin-auth.js?v=20260823-mobile-handoff-1');
else if(site==='author')await import('./author-auth.js?v=20260816-author-ai-1');
else if(site==='business')await import('./business-auth.js?v=20260826-free-fallback-1');
else if(privateClientSites.has(site))await loadClientAuth();
else if(site==='marketing'&&params.get('review')!=='1'&&!targetedWorkspace)await loadMarketingAuth();
else{
  const registryService=await manifestService(site);
  const isRegistryUserService=Boolean(registryService?.id&&registryService?.url);
  const trustedEkodiReturn=hasTrustedEkodiReturn();
  if(!targetedWorkspace&&site!=='marketing'&&(site==='portal'||isRegistryUserService||trustedEkodiReturn))await loadClientAuth();
  else{
    await import('./auth.js?v=20260824-return-origin-1');
    if(targetedWorkspace)await import('./auth-workspace-target.js?v=20260817-all-sites-1');
    if(site==='marketing')await import('./marketing-onboarding.js?v=20260817-workspace-label-1');
    await import('./membership-ui.js');
  }
}