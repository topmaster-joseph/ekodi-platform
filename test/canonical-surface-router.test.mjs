import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';
import { PLATFORM_EXECUTION_SURFACES } from '../platform-route-registry.js';
import { routeCanonicalSurface } from '../canonical-surface-router.js';
import platformEntry from '../platform-router-entry-worker.js';
import siteWorker from '../site-worker.js';

function binding(body='ok',type='text/plain'){
  const calls=[];
  return {calls,fetch:async request=>{calls.push(new URL(request.url));return new Response(body,{headers:{'content-type':type}})}};
}
function legacyRecorder(){
  const calls=[];
  const fetch=async request=>{
    const url=new URL(request.url);calls.push(url);
    return new Response('<html><head></head><body><script src="admin-central-handoff.js"></script></body></html>',{headers:{'content-type':'text/html'}});
  };
  return {calls,fetch};
}

test('canonical Cloud HTML keeps shared Shell after legacy host loses manifest lookup, while assets and existing chrome pass through',async t=>{
  const previous=globalThis.HTMLRewriter;
  let transforms=0;
  globalThis.HTMLRewriter=class {on(){return this}transform(response){transforms++;return response}};
  t.after(()=>{if(previous===undefined)delete globalThis.HTMLRewriter;else globalThis.HTMLRewriter=previous});
  const calls=[];
  let existingShell=false;
  const legacyFetch=async request=>{
    const url=new URL(request.url);calls.push(url);
    const html=url.pathname==='/';
    return new Response(html?'<html><head></head><body>EKODI Cloud</body></html>':'export const name="cloud";',{
      headers:{'content-type':html?'text/html; charset=utf-8':'text/javascript; charset=utf-8','x-ekodi-route':'hub','cache-control':'private, no-store',...(existingShell?{'x-ekodi-shell':'v2'}:{})}
    });
  };
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/cloud/?view=files'),{},{legacyFetch});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-shell'),'v2');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'),'cloud');
  assert.equal(response.headers.get('x-ekodi-canonical-path'),'/cloud');
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.ok(transforms>0,'Existing Shell must actually decorate the HTML response');
  assert.equal(calls[0].pathname,'/');assert.equal(calls[0].search,'?view=files');
  const completed=transforms;
  const asset=await routeCanonicalSurface(new Request('https://ekodi.kr/cloud/app.js'),{},{legacyFetch});
  assert.equal(await asset.text(),'export const name="cloud";');
  assert.equal(asset.headers.get('x-ekodi-shell'),null);assert.equal(transforms,completed);
  existingShell=true;
  const decorated=await routeCanonicalSurface(new Request('https://ekodi.kr/cloud/'),{},{legacyFetch});
  assert.equal(decorated.headers.get('x-ekodi-shell'),'v2');
  assert.equal(transforms,completed,'An already decorated upstream must not receive duplicate Shell chrome');
});

test('public execution surface roots canonicalize slashless URLs to the same trailing-slash route',async()=>{
  const publicRoots=PLATFORM_EXECUTION_SURFACES.filter(spec=>spec.id!=='ai'&&!spec.exact&&!spec.id.endsWith('-api')&&!spec.prefix.includes('/api/'));
  assert.ok(PLATFORM_EXECUTION_SURFACES.some(spec=>spec.id==='ai'));
  for(const spec of publicRoots){
    const response=await routeCanonicalSurface(new Request(`https://ekodi.kr${spec.prefix}`),{});
    assert.equal(response.status,308,`${spec.id} slashless root must redirect`);
    const location=new URL(response.headers.get('location'));
    assert.equal(location.pathname,`${spec.prefix}/`,`${spec.id} must preserve the canonical service root`);
    assert.equal(location.hostname,'ekodi.kr');
  }
});

test('Research canonical route is owned by Education and never served by the workspace fallback',async()=>{
 const calls=[];
 const education={fetch:async request=>{
  const url=new URL(request.url);
  calls.push({path:url.pathname,search:url.search});
  const payload=url.pathname==='/research/health'
    ? JSON.stringify({ok:true,service:'ekodi-research',phase:'foundation'})
    : 'EKODI Research';
  return new Response(payload,{headers:{'content-type':url.pathname.endsWith('/health')?'application/json':'text/plain'}});
 }};
 for(const path of ['/research/','/research/health','/research/app.css']){
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr'+path+'?from=public'),{EDUCATION:education});
  assert.equal(response.status,200,'Research route must return the Education response');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'),'education-research-alias');
  assert.equal(response.headers.get('x-ekodi-canonical-path'),'/research');
  assert.equal(response.headers.get('location'),null);
 }
 assert.deepEqual(calls.map(x=>x.path),['/research/','/research/health','/research/app.css']);
 assert.ok(calls.every(x=>x.search==='?from=public'),'query string preserved exactly');
 const absent=await routeCanonicalSurface(new Request('https://ekodi.kr/research/'),{});
 assert.equal(absent.status,503,'a missing Education binding must fail closed');
 assert.equal(absent.headers.get('x-ekodi-surface'),'education-research-alias');
 assert.doesNotMatch(await absent.text(),/운영공간|<html/i);
});

test('Research route registry has a reserved destination and guarded Site Core dispatch',()=>{
 const route=PLATFORM_EXECUTION_SURFACES.find(x=>x.prefix==='/research');
 assert.equal(route?.id,'education-research-alias');
 assert.equal(route?.binding,'EDUCATION');
 assert.equal(route?.preservePrefix,true);
 assert.equal(route?.basePathAware,true);
 const source=fs.readFileSync(new URL('../canonical-surface-router.js',import.meta.url),'utf8');
 assert.match(source,/if\(path==='\/research'\|\|path\.startsWith\('\/research\/'\)\)return serviceUnavailable\('research-route-unavailable'\)/);
 const release=fs.readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
 assert.match(release,/file==='canonical-surface-router\.js'/);
 assert.match(release,/if\(sharedSiteTouched\)/);
 assert.match(release,/release_branch_ref:branch,release_task_id:taskId/);
});

test('AI slashless and trailing slash paths both serve directly without a redirect',async()=>{
  for(const entry of ['canonical','site']){
    const service=binding('EKODI AI direct root','text/html');
    for(const path of ['/ai','/ai/']){
      const request=new Request('https://ekodi.kr'+path+'?source=test');
      const response=entry==='canonical'
        ? await routeCanonicalSurface(request,{AI:service})
        : await siteWorker.fetch(request,{AI:service});
      assert.equal(response.status,200,entry+' '+path);
      assert.equal(response.headers.get('location'),null,entry+' '+path);
      assert.equal(response.headers.get('x-ekodi-canonical-surface'),'ai',entry+' '+path);
      assert.equal(response.headers.get('x-ekodi-canonical-path'),'/ai',entry+' '+path);
      assert.equal(await response.text(),'EKODI AI direct root',entry+' '+path);
    }
    assert.deepEqual(service.calls.map(item=>item.pathname),['/','/']);
  }
});

test('canonical surface roots normalize with trailing slashes',async()=>{
  for(const path of ['/my','/admin','/auth']){
    const response=await routeCanonicalSurface(new Request(`https://ekodi.kr${path}`),{});
    assert.equal(response.status,308);assert.equal(new URL(response.headers.get('location')).pathname,`${path}/`);
  }
});
test('Desktop Bootstrap admin aliases bypass generic canonical shell rewriting at the true apex entry',async()=>{
  const legacy=legacyRecorder();
  for(const path of ['/admin/desktop/bootstrap','/admin/desktop/bootstrap/','/admin/desktop/bootstrap/index.html']){
    for(const entry of [
      () => routeCanonicalSurface(new Request(`https://ekodi.kr${path}?sensitive=discard`),{}, {legacyFetch:legacy.fetch}),
      () => platformEntry.fetch(new Request(`https://ekodi.kr${path}?sensitive=discard`),{},{}),
    ]){
      const response=await entry();
      assert.equal(response.status,307,path);
      assert.equal(response.headers.get('location'),'/admin/status/devices',path);
      assert.equal(response.headers.get('cache-control'),'no-store',path);
      assert.equal(response.headers.get('x-ekodi-route'),'desktop-bootstrap-canonical',path);
      assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive',path);
    }
  }
  assert.equal(legacy.calls.length,0,'the admin shell must not swallow the bootstrap alias');
  const rejected=await platformEntry.fetch(new Request('https://ekodi.kr/admin/desktop/bootstrap/',{method:'POST'}),{},{});
  assert.equal(rejected.status,405);
  assert.equal(rejected.headers.get('allow'),'GET, HEAD');
});

test('a canonical apex admin routing change dispatches the guarded shared-site deployment',()=>{
  const orchestrator=fs.readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  assert.match(orchestrator,/file==='canonical-surface-router\.js'/);
  assert.match(orchestrator,/if\(sharedSiteTouched\)/);
  assert.match(orchestrator,/\/actions\/workflows\/deploy-site-core\.yml\/dispatches/);
  assert.match(orchestrator,/release_branch_ref:branch,release_task_id:taskId/);
});

test('My and system paths preserve the internal execution boundary',async()=>{
  const my=binding(),control=binding();
  let response=await routeCanonicalSurface(new Request('https://ekodi.kr/my/docs/app.js'),{MY:my,CONTROL_API:control});
  assert.equal(response.status,200);assert.equal(my.calls[0].pathname,'/docs/app.js');assert.equal(response.headers.get('x-ekodi-canonical-surface'),'my');
  response=await routeCanonicalSurface(new Request('https://ekodi.kr/api/session'),{MY:my,CONTROL_API:control});
  assert.equal(response.status,200);assert.equal(control.calls[0].pathname,'/api/session');
  response=await routeCanonicalSurface(new Request('https://ekodi.kr/mcp'),{CONTROL_API:control});
  assert.equal(response.status,200);assert.equal(control.calls[1].pathname,'/mcp');
  response=await routeCanonicalSurface(new Request('https://ekodi.kr/.well-known/oauth-protected-resource'),{CONTROL_API:control});
  assert.equal(response.status,200);assert.equal(control.calls[2].pathname,'/.well-known/oauth-protected-resource');
  response=await routeCanonicalSurface(new Request('https://ekodi.kr/api/control/ai/v8/status'),{CONTROL_API:control});
  assert.equal(response.status,200);assert.equal(control.calls[3].pathname,'/api/control/ai/v8/status');
});

test('canonical Control preview keeps an explicit public cache contract through the apex gateway',async()=>{
  const calls=[];
  const control={fetch:async request=>{calls.push(new URL(request.url));return new Response(JSON.stringify({schemaVersion:1,secrets:false,personalData:false}),{status:200,headers:{'content-type':'application/json; charset=utf-8'}})}};
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/api/public/preview/map?scope=ekodi&mode=platform'),{CONTROL_API:control});
  assert.equal(response.status,200);
  assert.equal(calls[0].pathname,'/api/public/preview/map');
  assert.equal(calls[0].search,'?scope=ekodi&mode=platform');
  assert.match(response.headers.get('cache-control')||'',/^public, max-age=15/);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('x-ekodi-cache-policy'),'control-public-preview-v1');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'),'system');
});

test('Personal Finance admin control is owned before the generic Control API',async()=>{
  const calls=[];const personal={fetch:async request=>{calls.push(new URL(request.url));return new Response(JSON.stringify({authenticated:false}),{status:401,headers:{'content-type':'application/json'}})}};
  const control=binding('generic-control');
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/api/control/personal-finance'),{PERSONAL_FINANCE:personal,CONTROL_API:control});
  assert.equal(response.status,401);assert.equal(calls.length,1);assert.equal(calls[0].pathname,'/api/admin/personal-finance/control');assert.equal(calls[0].search,'');
  assert.equal(control.calls.length,0);
  const data=await response.json();assert.equal(data.code,'PF_ADMIN_AUTH_REQUIRED');assert.equal(data.authenticated,undefined);
  assert.equal(response.headers.get('x-ekodi-personal-finance-proxy'),'service-binding-v1');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
});

test('OAuth callback apex paths reach Storage and Marketing service bindings',async()=>{
  const storage=binding('storage-callback');
  const marketing=binding('marketing-callback');
  let response=await routeCanonicalSurface(new Request('https://ekodi.kr/storage/api/control/storage/google/callback?state=s&code=c'),{STORAGE:storage,MARKETING_GROWTH:marketing});
  assert.equal(response.status,200);
  assert.equal(storage.calls[0].pathname,'/api/control/storage/google/callback');
  assert.equal(storage.calls[0].search,'?state=s&code=c');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'),'storage');

  response=await routeCanonicalSurface(new Request('https://ekodi.kr/marketing-connect-api/oauth/youtube/callback?state=s&ticket=t'),{STORAGE:storage,MARKETING_GROWTH:marketing});
  assert.equal(response.status,200);
  assert.equal(marketing.calls[0].pathname,'/oauth/youtube/callback');
  assert.equal(marketing.calls[0].search,'?state=s&ticket=t');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'),'marketing-connect-api');
});

test('Shell canonical path uses its service binding and strips the apex prefix',async()=>{
  const shell=binding(JSON.stringify({ok:true,service:'ekodi-shell'}),'application/json');
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/shell/manifest.json?release=1'),{SHELL:shell});
  assert.equal(response.status,200);assert.equal(shell.calls[0].pathname,'/manifest.json');assert.equal(shell.calls[0].search,'?release=1');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'),'shell');assert.equal(response.headers.get('x-ekodi-canonical-path'),'/shell');
});

test('Support canonical binding keeps the apex prefix without a retired execution host',async()=>{
  const support=binding(JSON.stringify({ok:true,service:'ekodi-support-opportunity'}),'application/json');
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/support/health'),{SUPPORT:support});
  assert.equal(response.status,200);assert.equal(support.calls[0].hostname,'ekodi.kr');assert.equal(support.calls[0].pathname,'/support/health');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'),'support');assert.equal(response.headers.get('x-ekodi-canonical-path'),'/support');
  assert.doesNotMatch(fs.readFileSync(new URL('../canonical-surface-router.js',import.meta.url),'utf8'),/support\.ekodi\.kr/);
});

test('canonical Shell bindings are environment-specific and dependent releases watch the gateway',async()=>{
  const files=['wrangler.site.toml','wrangler.site-staging.toml','.github/workflows/deploy-education.yml','.github/workflows/deploy-bible.yml','.github/workflows/deploy-life-ai.yml'];
  const [prod,stage,...workflows]=await Promise.all(files.map(file=>fs.promises.readFile(new URL('../'+file,import.meta.url),'utf8')));
  assert.match(prod,/binding = \"SHELL\"\s+service = \"ekodi-shell\"/);assert.match(stage,/binding = \"SHELL\"\s+service = \"ekodi-shell-staging\"/);assert.match(prod,/run_worker_first = \[[^\]]*\"\/shell\*\"/s);
  for(const workflow of workflows){assert.match(workflow,/canonical-surface-router\.js/);assert.match(workflow,/wrangler\.site\.toml/);assert.match(workflow,/wrangler\.site-staging\.toml/);assert.match(workflow,/seq 1 120[\s\S]*ekodi\.kr\/shell\/manifest\.json/);}
});

test('v8 control candidate probe does not make rollback depend on a newly introduced endpoint',async()=>{
  const manifest=JSON.parse(await fs.promises.readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const probe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/api/control/ai/v8/status');
  assert.equal(probe?.rollbackVerify,false);
});

test('shared-site guarded release keeps canonical My Docs alive',async()=>{
  const manifest=JSON.parse(await fs.promises.readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const probe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/my/docs/');
  assert.deepEqual(probe?.statuses,[200]);assert.equal(probe?.redirect,'manual');
  assert.ok(probe?.expect.includes('EKODI Docs AI'));assert.ok(probe?.expect.includes('docs-focus'));
  assert.ok(probe?.headerExpect.includes('x-ekodi-canonical-surface: my'));assert.equal(probe?.rollbackVerify,false);
});
test('Auth is served directly from canonical apex assets',async()=>{
  const assets={calls:[],fetch:async request=>{const url=new URL(request.url);assets.calls.push(url);if(url.pathname==='/auth-center')return new Response('<html><head><link href="/auth.css"></head><body><script src="/auth.js"></script></body></html>',{headers:{'content-type':'text/html'}});return new Response('asset',{headers:{'content-type':'text/javascript'}})}};
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/auth/'),{ASSETS:assets});
  assert.equal(assets.calls[0].hostname,'ekodi.kr');assert.equal(assets.calls[0].pathname,'/auth-center');assert.equal(response.headers.get('x-ekodi-canonical-surface'),'auth');
  const html=await response.text();assert.match(html,/href="\/auth\/auth\.css"/);assert.match(html,/src="\/auth\/auth\.js"/);
});

test('Auth runtime text assets cannot render as top-level documents',async()=>{
  const assets={calls:[],fetch:async request=>{const url=new URL(request.url);assets.calls.push(url);return new Response("const ok=true",{headers:{'content-type':'text/javascript'}})}};
  let response=await routeCanonicalSurface(new Request('https://ekodi.kr/auth/client-auth.js?v=31',{headers:{'sec-fetch-dest':'document'}}),{ASSETS:assets});
  assert.equal(response.status,302);assert.equal(new URL(response.headers.get('location')).href,'https://ekodi.kr/auth/');assert.equal(response.headers.get('x-ekodi-route'),'auth-document-guard');assert.equal(assets.calls.length,0);
  response=await routeCanonicalSurface(new Request('https://ekodi.kr/auth/client-auth.js?v=31',{headers:{'sec-fetch-dest':'script'}}),{ASSETS:assets});
  assert.equal(response.status,200);assert.equal(assets.calls.length,1);assert.equal(assets.calls[0].pathname,'/client-auth.js');assert.equal(response.headers.get('cache-control'),'no-store');
});

test('Auth secured text responses explicitly declare UTF-8 on canonical paths',async()=>{
  const assets={fetch:async request=>{
    const path=new URL(request.url).pathname;
    if(path==='/auth-center')return new Response('<!doctype html><meta charset="utf-8"><title>인증</title>',{headers:{'content-type':'text/html'}});
    return new Response("const label='자담치킨 목포대점';",{headers:{'content-type':'text/javascript'}});
  }};
  let response=await routeCanonicalSurface(new Request('https://ekodi.kr/auth/'),{ASSETS:assets});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');
  response=await routeCanonicalSurface(new Request('https://ekodi.kr/auth/client-auth.js'),{ASSETS:assets});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/javascript; charset=utf-8');assert.match(await response.text(),/자담치킨 목포대점/);
});
test('Admin deep routes render the shell while runtime assets stay addressable',async()=>{
  const legacy=legacyRecorder();
  let response=await routeCanonicalSurface(new Request('https://ekodi.kr/admin/services/insurance'),{}, {legacyFetch:legacy.fetch});
  assert.equal(legacy.calls[0].hostname,'admin.ekodi.kr');assert.equal(legacy.calls[0].pathname,'/');
  assert.match(await response.text(),/<base href="\/admin\/">/);
  response=await routeCanonicalSurface(new Request('https://ekodi.kr/admin/admin-menu-layout.js'),{}, {legacyFetch:legacy.fetch});
  assert.equal(legacy.calls[1].pathname,'/admin-menu-layout.js');
});
test('legacy Admin entry host still converges while Auth has no legacy host contract',async()=>{
  const source=fs.readFileSync(new URL('../canonical-surface-router.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/auth\.ekodi\.kr/);
  const legacyAdminHost=['admin','ekodi.kr'].join('.');
  const response=await platformEntry.fetch(new Request(`https://${legacyAdminHost}/books`),{},{});
  assert.equal(response.status,308);const target=new URL(response.headers.get('location'));assert.equal(target.pathname,'/admin/');assert.equal(target.searchParams.get('route'),'books');
});

test('Admin canonical route registry mirrors the eight management areas and migrates legacy groups',()=>{
  const source=fs.readFileSync(new URL('../admin-canonical-routes.js',import.meta.url),'utf8');
  const location={href:'https://ekodi.kr/admin/',hostname:'ekodi.kr',pathname:'/admin/',search:'',hash:''};
  const window={location};vm.runInNewContext(source,{window,URL,URLSearchParams,Object,Set,String});
  const routes=window.EKODIAdminRoutes;
  assert.equal(routes.pathFor('campus'),'/admin/sites/campus');
  assert.equal(routes.pathFor('communication'),'/admin/sites/communication');
  assert.equal(routes.pathFor('insurance'),'/admin/services/insurance');
  assert.equal(routes.pathFor('community'),'/admin/sites/community');
  assert.equal(routes.pathFor('ai-membership'),'/admin/ai/ai-membership');
  assert.equal(routes.pathFor('books'),'/admin/services/books');
  assert.equal(routes.pathFor('devotional'),'/admin/services/devotional');
  assert.equal(routes.pathFor('work'),'/work/admin');
  // Stage-1 v3 addresses of the dissolved site-tools menu still resolve.
  for (const [stage1, section] of [['/admin/sites/books','books'],['/admin/sites/devotional','devotional'],['/admin/sites/social','social'],['/admin/sites/ai-membership','ai-membership']]) assert.equal(routes.sectionFromPath(stage1), section, stage1);
  assert.equal(routes.pathFor('workspace'),'/admin/sites/workspace');
  assert.equal(routes.pathFor('clients'),'/admin/sites/clients');
  assert.equal(routes.pathFor('aiops'),'/admin/ai/aiops');
  // v2 (eleven-area) canonical addresses stay accepted and resolve to the v3 path.
  for (const [legacy, section, v3] of [
    ['/admin/releases/aiops','aiops','/admin/ai/aiops'],
    ['/admin/content/books','books','/admin/services/books'],
    ['/admin/people/ai-membership','ai-membership','/admin/ai/ai-membership'],
    ['/admin/devices-agent/devices','devices','/admin/ops/devices'],
    ['/admin/settings-records/storage','storage','/admin/settings/storage'],
    ['/admin/security-audit/security','security','/admin/accounts/security'],
    ['/admin/status/health','health','/admin/ops/health'],
    ['/admin/summary/platform-overview','platform-overview','/admin/home/platform-overview'],
  ]) {
    assert.equal(routes.sectionFromPath(legacy), section, legacy);
    assert.equal(routes.pathFor(section), v3, section);
  }
  assert.equal(routes.routeFromPath('/admin/releases').section,'deployments');
  assert.equal(routes.routeFromPath('/admin/ops').section,'health');
  assert.equal(routes.routeFromPath('/admin/ai').section,'aiops');
  assert.equal(routes.routeFromPath('/admin/home').section,'command-home');
  assert.equal(routes.routeFromPath('/admin/ops/books'),null);
  assert.equal(routes.sectionFromPath('/admin/system/security'),'security');
  assert.equal(routes.sectionFromPath('/admin/home/campus'),'campus');
  assert.equal(routes.sectionFromPath('/admin/system/campus'),'campus');
  assert.equal(routes.sectionFromPath('/admin/common/common-services'),'common-services');
  assert.equal(routes.sectionFromPath('/admin/professional/insurance'),'insurance');
  assert.equal(routes.sectionFromPath('/admin/services/community'),'community');
  assert.equal(routes.sectionFromPath('/admin/services/books'),'books');
  assert.equal(routes.sectionFromPath('/admin/space/clients'),'clients');
  assert.equal(routes.sectionFromPath('/admin/services/engine-ai'),'engine-ai');
  assert.equal(routes.sectionFromPath('/admin/sites/sites-user'),'sites-user');
  for (const item of ADMIN_MENU_REGISTRY.filter(item => !item.href)) {
    if (item.id === 'command-home') {
      assert.equal(routes.pathFor(item.id), '/admin/');
      continue;
    }
    assert.equal(routes.pathFor(item.id).split('/')[2], item.group, `${item.id} route group must match its canonical Admin path area`);
  }
});

test('Business canonical paths hide execution hosts while EKODIBIZ Trade stays tenant-owned',async()=>{
  const externalCalls=[];
  const externalFetch=async request=>{
    const url=new URL(request.url);externalCalls.push(url);
    if(url.pathname==='/app.js')return new Response("fetch('/api/workspaces');https://ekodi.kr/auth/?site=business&return_to=https%3A%2F%2Fekodi.kr%2Fbusiness%2F\nfunction routeWorkspaceId(){\n  const path=location.pathname.replace(/^\\/+|\\/+$/g,'').toLowerCase();\n  if(path)return path;\n}\nif(push&&location.pathname!==`/${workspace.id}`)history.pushState({workspace:workspace.id},'',`/${workspace.id}`);",{headers:{'content-type':'text/javascript'}});
    throw new Error(`unexpected execution host ${url.hostname}`);
  };
  const assets=binding('<html><body><a href="https://trade.biz.ekodi.kr/">trade.biz.ekodi.kr</a></body></html>','text/html');
  let response=await routeCanonicalSurface(new Request('https://ekodi.kr/business/app.js'),{ASSETS:assets},{externalFetch});
  assert.equal(externalCalls[0].hostname,'business.ekodi.kr');assert.equal(externalCalls[0].pathname,'/app.js');
  let text=await response.text();assert.match(text,/fetch\('\/business\/api\/workspaces'/);assert.match(text,/https:\/\/ekodi\.kr\/auth\//);assert.match(text,/path\.startsWith\('business\/'\)/);assert.match(text,/`\/business\/\$\{workspace\.id\}`/);assert.doesNotMatch(text,/business\.ekodi\.kr/);
  response=await routeCanonicalSurface(new Request('https://ekodi.kr/ekodibiz/trade'),{ASSETS:assets},{externalFetch});
  assert.equal(response,null);
  const portal=await platformEntry.fetch(new Request('https://ekodi.kr/ekodibiz/trade'),{},{});
  assert.equal(portal.status,200);assert.equal(portal.headers.get('x-ekodi-route'),'trade-partner-workspace');assert.match(await portal.text(),/PRIVATE TRADE WORKSPACE/);
  response=await routeCanonicalSurface(new Request('https://ekodi.kr/ekodibiz/trade/admin'),{ASSETS:assets},{externalFetch});
  assert.equal(response,null);
});

test('Bible canonical path uses its service binding without double-prefixing assets',async()=>{
  const bible=binding('<html><head><link href="/bible/styles.css"></head><body>Bible</body></html>','text/html');
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/bible/reader?provider=KRV1961'),{BIBLE:bible});
  assert.equal(response.status,200);assert.equal(bible.calls[0].pathname,'/reader');assert.equal(bible.calls[0].search,'?provider=KRV1961');
  assert.equal(bible.calls[0].hostname,'ekodi.kr');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'),'bible');assert.equal(response.headers.get('x-ekodi-canonical-path'),'/bible');
  const html=await response.text();assert.match(html,/href="\/bible\/styles\.css"/);assert.doesNotMatch(html,/\/bible\/bible\//);
});


test('canonical Admin release probes remain apex-only while preserving release truth',async()=>{
  const manifest=JSON.parse(await fs.promises.readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const canonical=manifest.worker.requests.filter(item=>item.url.startsWith('https://ekodi.kr/admin/'));
  assert.ok(canonical.length>1);
  assert.ok(canonical.some(item=>item.url==='https://ekodi.kr/admin/'&&item.rollbackVerify===false));
  const legacyHost=['admin','ekodi.kr'].join('.');
  const legacy=manifest.worker.requests.filter(item=>String(item.url||'').startsWith(`https://${legacyHost}/`));
  assert.equal(legacy.length,0);
});

test('shared-site release verifies Shell integration without requiring script URLs in service HTML',async()=>{
  const text=await fs.promises.readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8');
  assert.doesNotMatch(text,/https:\/\/shell\.ekodi\.kr\/shell\.js/);
  assert.doesNotMatch(text,/https:\/\/shell\.ekodi\.kr\//);
  assert.match(text,/https:\/\/ekodi\.kr\/shell\/manifest\.json/);
  const manifest=JSON.parse(text);
  const apexShell='https://ekodi.kr/shell/shell.js';
  const direct=manifest.worker.requests.find(item=>item.url===apexShell);
  assert.deepEqual(direct?.statuses,[200]);
  assert.ok(direct?.expect?.includes('ekodi-mobile-fixed-header-style'));
  assert.ok(direct?.expect?.includes('ResizeObserver'));
  const shellIntegrated=manifest.worker.requests.filter(item=>item.headerExpect?.includes('x-ekodi-shell: v2'));
  assert.ok(shellIntegrated.length>=4,'expected service pages to verify Shell v2 through response headers');
  for(const probe of shellIntegrated) assert.ok(!probe.expect?.includes(apexShell),`${probe.url} must not require a literal Shell script URL in HTML`);
});

test('Connect is reserved at the canonical edge before workspace routing',async()=>{
  const direct=await routeCanonicalSurface(new Request('https://ekodi.kr/connect'),{});
  assert.equal(direct.status,302);
  const target=new URL(direct.headers.get('location'));
  assert.equal(target.pathname,'/auth/');
  assert.equal(target.searchParams.get('site'),'ai');
  assert.equal(target.searchParams.get('return_to'),'https://ekodi.kr/ai/');
  assert.equal(target.searchParams.get('source'),'mcp-connect');
  assert.equal(direct.headers.get('x-ekodi-route'),'mcp-connect-auth');

  const routed=await platformEntry.fetch(new Request('https://ekodi.kr/connect'),{},{});
  assert.equal(routed.status,302);
  assert.equal(routed.headers.get('x-ekodi-route'),'mcp-connect-auth');
  assert.equal(new URL(routed.headers.get('location')).pathname,'/auth/');
});

test('connect cannot be claimed as a workspace slug',async()=>{
  const policy=await import('../workspace-route-policy.js');
  assert.equal(policy.isWorkspaceSlug('connect'),false);
  assert.equal(policy.workspaceRouteFromPublicPath('/connect'),null);
});


test('shared-site release probes honor canonical slash parity',async()=>{
  const manifest=JSON.parse(await fs.promises.readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  for(const root of ['/live','/pay','/cloud']){
    const slashless=manifest.worker.requests.find(item=>item.url===`https://ekodi.kr${root}`);
    const canonical=manifest.worker.requests.find(item=>item.url===`https://ekodi.kr${root}/`);
    const destination=root==='/pay'?'/ekodipay/':root+'/';
    assert.ok(slashless,`missing slashless probe for ${root}`);
    assert.deepEqual(slashless.statuses,[308]);
    assert.equal(slashless.redirect,'manual');
    assert.ok(slashless.headerExpect?.includes('location: https://ekodi.kr'+destination));
    assert.ok(canonical,`missing canonical trailing-slash probe for ${root}`);
    assert.deepEqual(canonical.statuses,root==='/pay'?[308]:[200]);
    if(root==='/pay'){
      assert.ok(canonical.headerExpect?.includes('location: https://ekodi.kr/ekodipay/'));
      for(const route of [slashless,canonical]){
        assert.deepEqual(route.rollbackStatuses,[308]);
        assert.deepEqual(route.rollbackExpect,[]);
        assert.notEqual(route.rollbackVerify,false);
        for(const expected of ['location: https://ekodi.kr/ekodipay/','cache-control: no-store','x-content-type-options: nosniff'])
          assert.ok(route.rollbackHeaderExpect?.includes(expected),'stable rollback must protect '+expected);
      }
    }
  }
});
