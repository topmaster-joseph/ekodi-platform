const site=new URLSearchParams(location.search).get('site');
if(site==='admin') await import('./admin-auth.js');
else if(site==='cgma-client'||site==='jadam-client'||site==='pizzamaru-client'||site==='yogurt-client') await import('./client-auth.js');
else {
  await import('./auth.js');
  if(site==='marketing') await import('./marketing-onboarding.js');
}
