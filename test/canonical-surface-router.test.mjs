import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';
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

test('canonical surface roots normalize with trailing slashes',async()=>{
  for(const path of ['/my','/admin','/auth']){
    const response=await routeCanonicalSurface(new Request(`https://ekodi.kr${path}`),{});
    assert.equal(response.status,308);assert.equal(new URL(response.headers.get('location')).pathname,`${path}/`);
  }
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
  assert.equal(assets.calls[0].hostname,'ekodi.kr');assert.equal(assets.calls[0].pathname,'/auth-center');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'),'auth');
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
test('Auth has no legacy host contract in the canonical entry routers',()=>{
  const source=fs.readFileSync(new URL('../canonical-surface-router.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/auth\.ekodi\.kr/);
});

test('Admin canonical route registry mirrors the five management work areas and migrates legacy groups',()=>{
  const source=fs.readFileSync(new URL('../admin-canonical-routes.js',import.meta.url),'utf8');
  const location={href:'https://ekodi.kr/admin/',hostname:'ekodi.kr',pathname:'/admin/',search:'',hash:''};
  const window={location};vm.runInNewContext(source,{window,URL,URLSearchParams,Object,Set,String});
  const routes=window.EKODIAdminRoutes;
  assert.equal(routes.pathFor('campus'),'/admin/home/campus');
  assert.equal(routes.pathFor('communication'),'/admin/operations/communication');
  assert.equal(routes.pathFor('insurance'),'/admin/services/insurance');
  assert.equal(routes.pathFor('workspace'),'/admin/workspaces/workspace');
  assert.equal(routes.pathFor('clients'),'/admin/workspaces/clients');
  assert.equal(routes.pathFor('aiops'),'/admin/system/aiops');
  assert.equal(routes.sectionFromPath('/admin/system/security'),'security');
  assert.equal(routes.sectionFromPath('/admin/system/campus'),'campus');
  assert.equal(routes.sectionFromPath('/admin/common/common-services'),'common-services');
  assert.equal(routes.sectionFromPath('/admin/professional/insurance'),'insurance');
  assert.equal(routes.sectionFromPath('/admin/space/clients'),'clients');
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


test('legacy Admin release probes follow canonical redirects while canonical Admin owns release truth',async()=>{
  const manifest=JSON.parse(await fs.promises.readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const canonical=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/admin/');
  assert.equal(canonical?.rollbackVerify,false);
  const legacy=manifest.worker.requests.filter(item=>item.url.startsWith('https://admin.ekodi.kr/'));
  assert.ok(legacy.length>1);
  for(const probe of legacy) assert.equal(probe.redirect,'follow',probe.url);
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
