const url=new URL(location.href);
const params=url.searchParams;
const legacySiteAliases=Object.freeze({
  'mall-seller':'mall'
});

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
if(changed) history.replaceState({},document.title,url.href);

const site=params.get('site');
const targetedWorkspace=site==='marketing'&&Boolean(params.get('workspace'));
async function loadMarketingAuth(){
  try{return await import('./marketing-auth-hotfix.js?v=20260815-fedcm-cache-2')}
  catch(error){console.warn('Versioned Marketing auth load failed; retrying canonical asset.',error);return await import('./marketing-auth-hotfix.js')}
}
if(site==='admin') await import('./admin-auth.js?v=20260816-fedcm-button-1');
else if(site==='work'||site==='community'||site==='cgma-client'||site==='jadam-client'||site==='pizzamaru-client'||site==='yogurt-client') await import('./client-auth.js');
else {
  if(site==='marketing'&&params.get('review')!=='1') await loadMarketingAuth();
  else await import('./auth.js');
  if(targetedWorkspace) await import('./auth-workspace-target.js');
  if(site==='marketing') await import('./marketing-onboarding.js');
  await import('./membership-ui.js');
}
