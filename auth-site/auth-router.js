const url=new URL(location.href);
const params=url.searchParams;
const legacySiteAliases=Object.freeze({
  'mall-seller':'mall'
});

let changed=false;
const requestedSite=params.get('site');
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
if(site==='admin') await import('./admin-auth.js');
else if(site==='work'||site==='community'||site==='cgma-client'||site==='jadam-client'||site==='pizzamaru-client'||site==='yogurt-client') await import('./client-auth.js');
else {
  if(site==='marketing'&&params.get('review')!=='1') await import('./marketing-auth-hotfix.js?v=20260815-loading-hotfix-1');
  else await import('./auth.js');
  if(targetedWorkspace) await import('./auth-workspace-target.js');
  if(site==='marketing') await import('./marketing-onboarding.js');
  await import('./membership-ui.js');
}
