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


/* Security Admin workspace production contract.
 * Only public, static Admin assets and the unauthenticated shell are inspected.
 * Never request credentials or invoke Secret registration APIs.
 */
const securityShell=await get('/admin/accounts/security');
if(securityShell){
  if(securityShell.status!==200) failures.push(`/admin/accounts/security: expected 200, got ${securityShell.status}`);
  if(securityShell.status===200){
    const route=securityShell.headers.get('x-ekodi-route');
    if(route!=='admin-shell') failures.push(`/admin/accounts/security: x-ekodi-route=${route||'(missing)'}, expected admin-shell`);
    const cache=securityShell.headers.get('cache-control')||'';
    if(!/no-store/i.test(cache)) failures.push('/admin/accounts/security: admin shell must remain no-store');
  }
}

for(const check of [
  {path:'/admin/admin-secret-generator.css',markers:[
    'Security workspace v2',
    '.admin-secret-auto-card:has(>.ekodi-provider-context)',
    '.ekodi-provider-context>div:has([data-ekodi-cf-worker])'
  ]},
  {path:'/admin/admin-secret-generator.js',markers:[
    'admin-secret-setup',
    "field.addEventListener('change', resetReplaceMode)",
    'synchronizeAuthorizedTargets',
    'authorized.every(name=>inventoryNames.has(name))',
    'EKODIAdminAIControlPlane'
  ]}
]){
  const response=await get(check.path);
  if(!response)continue;
  if(response.status!==200){
    failures.push(`${check.path}: expected 200, got ${response.status}`);
    continue;
  }
  const source=await response.text();
  for(const marker of check.markers){
    if(!source.includes(marker))failures.push(`${check.path}: expected security UI marker missing: ${marker}`);
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

console.log('EKODI Provider Control + Security Admin workspace production verified: canonical routes, bundled assets, target-change guard and non-public source boundary.');
