const site=new URLSearchParams(location.search).get('site');
if(site==='admin') await import('./admin-auth.js');
else await import('./auth.js');
