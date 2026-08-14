const params=new URLSearchParams(location.search);
const site=params.get('site');
if(site==='marketing'&&params.get('review')!=='1'&&params.get('intent')!=='pro'){
  const url=new URL(location.href);
  url.searchParams.set('intent','pro');
  history.replaceState({},document.title,url.href);
}
if(site==='admin') await import('./admin-auth.js');
else if(site==='work'||site==='community'||site==='cgma-client'||site==='jadam-client'||site==='pizzamaru-client'||site==='yogurt-client') await import('./client-auth.js');
else {
  await import('./auth.js');
  if(site==='marketing') await import('./marketing-onboarding.js');
  await import('./membership-ui.js');
}
