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
    if(url.hostname==='auth.ekodi.kr')return new Response('<html><head><link href="/auth.css"></head><body><script src="/auth.js"></script></body></html>',{headers:{'content-type':'text/html'}});
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
test('Auth uses the legacy runtime but exposes apex-prefixed assets',async()=>{
  const legacy=legacyRecorder();
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/auth/'),{}, {legacyFetch:legacy.fetch});
  assert.equal(legacy.calls[0].hostname,'auth.ekodi.kr');assert.equal(legacy.calls[0].pathname,'/');
  const html=await response.text();assert.match(html,/href="\/auth\/auth\.css"/);assert.match(html,/src="\/auth\/auth\.js"/);
});

test('Auth runtime text assets cannot render as top-level documents',async()=>{
  const legacy=legacyRecorder();
  let response=await routeCanonicalSurface(new Request('https://ekodi.kr/auth/client-auth.js?v=31',{headers:{'sec-fetch-dest':'document'}}),{}, {legacyFetch:legacy.fetch});
  assert.equal(response.status,302);assert.equal(new URL(response.headers.get('location')).href,'https://ekodi.kr/auth/');assert.equal(response.headers.get('x-ekodi-route'),'auth-document-guard');assert.equal(legacy.calls.length,0);
  response=await routeCanonicalSurface(new Request('https://ekodi.kr/auth/client-auth.js?v=31',{headers:{'sec-fetch-dest':'script'}}),{}, {legacyFetch:legacy.fetch});
  assert.equal(response.status,200);assert.equal(legacy.calls.length,1);assert.equal(legacy.calls[0].pathname,'/client-auth.js');
});

test('Auth secured text responses explicitly declare UTF-8',async()=>{
  const assets={fetch:async request=>{
    const path=new URL(request.url).pathname;
    if(path==='/auth-center')return new Response('<!doctype html><meta charset="utf-8"><title>인증</title>',{headers:{'content-type':'text/html'}});
    return new Response("const label='자담치킨 목포대점';",{headers:{'content-type':'text/javascript'}});
  }};
  let response=await siteWorker.fetch(new Request('https://auth.ekodi.kr/'),{ASSETS:assets},{});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');
  response=await siteWorker.fetch(new Request('https://auth.ekodi.kr/client-auth.js'),{ASSETS:assets},{});
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
test('legacy Admin and Auth entry hosts converge to apex canonical paths',async()=>{
  let response=await platformEntry.fetch(new Request('https://auth.ekodi.kr/?site=my'),{},{});
  assert.equal(response.status,308);assert.equal(new URL(response.headers.get('location')).pathname,'/auth/');
  response=await platformEntry.fetch(new Request('https://admin.ekodi.kr/books'),{},{});
  assert.equal(response.status,308);const target=new URL(response.headers.get('location'));assert.equal(target.pathname,'/admin/');assert.equal(target.searchParams.get('route'),'books');
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
    assert.equal(routes.pathFor(item.id).split('/')[2], item.group, `${item.id} route group must match its canonical Admin path area`);
  }
});

test('Business canonical paths hide execution hosts while EKODIBIZ Trade stays tenant-owned',async()=>{
  const externalCalls=[];
  const externalFetch=async request=>{
    const url=new URL(request.url);externalCalls.push(url);
    if(url.hostname==='business.ekodi.kr')return new Response("fetch('/api/workspaces');https://auth.ekodi.kr/?site=business&return_to=https%3A%2F%2Fbusiness.ekodi.kr%2F\nfunction routeWorkspaceId(){\n  const path=location.pathname.replace(/^\\/+|\\/+$/g,'').toLowerCase();\n  if(path)return path;\n}\nif(push&&location.pathname!==`/${workspace.id}`)history.pushState({workspace:workspace.id},'',`/${workspace.id}`);",{headers:{'content-type':'text/javascript'}});
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
