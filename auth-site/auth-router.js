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
if(site==='marketing'&&params.get('review')!=='1'&&params.get('intent')!=='pro'){
  params.set('intent','pro');
  history.replaceState({},document.title,url.href);
}
if(site==='admin') await import('./admin-auth.js');
else if(site==='work'||site==='community'||site==='cgma-client'||site==='jadam-client'||site==='pizzamaru-client'||site==='yogurt-client') await import('./client-auth.js');
else {
  await import('./auth.js');
  if(site==='marketing') await import('./marketing-onboarding.js');
  await import('./membership-ui.js');
}