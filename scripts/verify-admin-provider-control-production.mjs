const origin=String(process.env.EKODI_PRODUCTION_ORIGIN||'https://ekodi.kr').replace(/\/+$/,'');
const probe=Date.now();
const failures=[];

async function get(path,{redirect='manual'}={}){
  try{
    return await fetch(`${origin}${path}${path.includes('?')?'&':'?'}provider_control_probe=${probe}`,{
      redirect,
      headers:{'cache-control':'no-cache','user-agent':'EKODI-Provider-Control-Production-Verifier/1.0'}
    });
  }catch(error){
    failures.push(`${path}: fetch failed ${error.message}`);
    return null;
  }
}

const admin=await get('/admin/status/aiops');
if(admin){
  if(admin.status!==200) failures.push(`/admin/status/aiops: expected 200, got ${admin.status}`);
  const route=admin.headers.get('x-ekodi-route');
  if(route!=='admin-shell') failures.push(`/admin/status/aiops: x-ekodi-route=${route||'(missing)'} expected admin-shell`);
  const cache=admin.headers.get('cache-control')||'';
  if(!/no-store/i.test(cache)) failures.push('/admin/status/aiops: admin shell must remain no-store');
  const html=await admin.text();
  for(const marker of ['admin-authenticated-shell.js','admin-demand-loader.js']){
    if(!html.includes(marker)) failures.push(`/admin/status/aiops: missing shell marker ${marker}`);
  }
}

const bundle=await get('/ai-ops-admin.js');
if(bundle){
  if(bundle.status!==200) failures.push(`/ai-ops-admin.js: expected 200, got ${bundle.status}`);
  const source=await bundle.text();
  for(const marker of ['EKODIProviderControl','renderMissingTargets','EKODI AI CONTROL CENTER','ekodi-ai-center-tabs']){
    if(!source.includes(marker)) failures.push(`/ai-ops-admin.js: missing bundled provider marker ${marker}`);
  }
}

const raw=await get('/admin-provider-control.js');
if(raw && raw.status!==404){
  failures.push(`/admin-provider-control.js: expected non-public source boundary 404, got ${raw.status}`);
}

if(failures.length){
  console.error('EKODI Provider Control production verification failed:');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('EKODI Provider Control production verified: canonical /admin/status/aiops shell + bundled /ai-ops-admin.js markers; raw source remains non-public.');
