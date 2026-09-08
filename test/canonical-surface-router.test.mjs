import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { routeCanonicalSurface } from '../canonical-surface-router.js';
import myWorker from '../my-worker.js';
import platformEntry from '../platform-router-entry-worker.js';

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

test('Auth uses the legacy runtime but exposes apex-prefixed assets',async()=>{
  const legacy=legacyRecorder();
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/auth/'),{}, {legacyFetch:legacy.fetch});
  assert.equal(legacy.calls[0].hostname,'auth.ekodi.kr');assert.equal(legacy.calls[0].pathname,'/');
  const html=await response.text();assert.match(html,/href="\/auth\/auth\.css"/);assert.match(html,/src="\/auth\/auth\.js"/);
});

test('Admin deep routes render the shell while runtime assets stay addressable',async()=>{
  const legacy=legacyRecorder();
  let response=await routeCanonicalSurface(new Request('https://ekodi.kr/admin/professional/insurance'),{}, {legacyFetch:legacy.fetch});
  assert.equal(legacy.calls[0].hostname,'admin.ekodi.kr');assert.equal(legacy.calls[0].pathname,'/');
  assert.match(await response.text(),/<base href="\/admin\/">/);
  response=await routeCanonicalSurface(new Request('https://ekodi.kr/admin/admin-menu-layout.js'),{}, {legacyFetch:legacy.fetch});
  assert.equal(legacy.calls[1].pathname,'/admin-menu-layout.js');
});
test('legacy My, Admin and Auth entry hosts converge to apex canonical paths',async()=>{
  let response=await myWorker.fetch(new Request('https://my.ekodi.kr/docs/?x=1'),{});
  assert.equal(response.status,308);assert.equal(new URL(response.headers.get('location')).href,'https://ekodi.kr/my/docs/?x=1');
  response=await platformEntry.fetch(new Request('https://auth.ekodi.kr/?site=my'),{},{});
  assert.equal(response.status,308);assert.equal(new URL(response.headers.get('location')).pathname,'/auth/');
  response=await platformEntry.fetch(new Request('https://admin.ekodi.kr/books'),{},{});
  assert.equal(response.status,308);const target=new URL(response.headers.get('location'));assert.equal(target.pathname,'/admin/');assert.equal(target.searchParams.get('route'),'books');
});

test('Admin canonical route registry maps menu sections into constitutional groups',()=>{
  const source=fs.readFileSync(new URL('../admin-canonical-routes.js',import.meta.url),'utf8');
  const location={href:'https://ekodi.kr/admin/',hostname:'ekodi.kr',pathname:'/admin/',search:'',hash:''};
  const window={location};vm.runInNewContext(source,{window,URL,URLSearchParams,Object,Set,String});
  const routes=window.EKODIAdminRoutes;
  assert.equal(routes.pathFor('insurance'),'/admin/professional/insurance');
  assert.equal(routes.pathFor('workspace'),'/admin/common/workspace');
  assert.equal(routes.pathFor('clients'),'/admin/workspaces/clients');
  assert.equal(routes.pathFor('aiops'),'/admin/operations/aiops');
  assert.equal(routes.sectionFromPath('/admin/system/security'),'security');
});

test('Business and Trade canonical paths hide execution hosts',async()=>{
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
  assert.equal(assets.calls.at(-1).pathname,'/trade');text=await response.text();assert.match(text,/https:\/\/ekodi\.kr\/ekodibiz\/trade/);assert.doesNotMatch(text,/trade\.biz\.ekodi\.kr/);
  response=await routeCanonicalSurface(new Request('https://ekodi.kr/ekodibiz/trade/admin'),{ASSETS:assets},{externalFetch});
  assert.equal(response,null);
});
