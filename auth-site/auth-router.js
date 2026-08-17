const url=new URL(location.href);
const params=url.searchParams;
const legacySiteAliases=Object.freeze({'mall-seller':'mall'});
const targetableWorkspaceSites=new Set(['cgma','marketing','biz','trade','mall','pay','books','church','lab','mission','community','edu','media','social','energy']);

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

const normalizedSite=params.get('site');
const marketingHomeMode=normalizedSite==='marketing'
  && params.get('review')!=='1'
  && !params.get('workspace')
  && !params.get('plan')
  && !params.get('intent');
if(marketingHomeMode){
  // Keep the authenticated Marketing entry on the workspace dashboard instead
  // of immediately handing off to a single workspace. `manage=1` is an
  // internal compatibility switch consumed by the current Marketing auth
  // module; the visual account-management controls stay hidden in home mode.
  params.set('manage','1');
  document.documentElement.dataset.ekodiDashboard='1';
  changed=true;
}
if(changed)history.replaceState({},document.title,url.href);

document.documentElement.dataset.identityManage=params.get('manage')==='1'&&!marketingHomeMode?'1':'0';
const site=params.get('site');
const targetedWorkspace=targetableWorkspaceSites.has(site)&&Boolean(params.get('workspace'));
async function loadMarketingAuth(){
  try{return await import('./marketing-auth-hotfix.js?v=20260817-workspace-entry-1')}
  catch(error){console.warn('Versioned Marketing auth load failed; retrying canonical asset.',error);return await import('./marketing-auth-hotfix.js')}
}
if(site==='admin')await import('./admin-auth.js?v=20260816-fedcm-button-1');
else if(site==='author')await import('./author-auth.js?v=20260816-author-ai-1');
else if(site==='business')await import('./business-auth.js?v=20260817-business-live-1');
else if(site==='my'||site==='work'||site==='community'||site==='cgma-client'||site==='jadam-client'||site==='pizzamaru-client'||site==='yogurt-client')await import('./client-auth.js?v=20260817-sso-1');
else{
  if(site==='marketing'&&params.get('review')!=='1')await loadMarketingAuth();
  else await import('./auth.js');
  if(targetedWorkspace)await import('./auth-workspace-target.js?v=20260817-all-sites-1');
  if(site==='marketing')await import('./marketing-onboarding.js?v=20260817-workspace-label-1');
  await import('./membership-ui.js');
}
