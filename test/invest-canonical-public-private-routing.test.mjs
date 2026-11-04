import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { routeInvestApex } from '../platform-router-entry-worker.js';
import { investMyRoute } from '../invest-my-workspace.js';
import myWorker from '../my-worker.js';

const get=path=>new Request('https://ekodi.kr'+path);
test('private Invest mount routes to existing MY binding, never to public analysis fallback',async()=>{
 const received=[];
 const env={MY:{fetch:request=>{received.push(new URL(request.url).pathname);return myWorker.fetch(request,{})}}};
 for(const path of ['/invest/my','/invest/my/manual','/invest/my/value','/invest/my/style.css','/invest/my/app.js']){
  const response=await routeInvestApex(get(path),env,{});
  assert.equal(response.status,200,path);
  assert.equal(received.at(-1),path);
 }
 const denied=await routeInvestApex(get('/invest/my/access'),env,{});
 assert.equal(denied.status,401);
 assert.equal((await denied.json()).error,'authentication_required');
 const unknown=await routeInvestApex(get('/invest/my/not-real'),env,{});
 assert.equal(unknown.status,404,'private unknown paths must not reveal the public analysis fallback');
});
test('the separate Invest public routes are always viewable without calling MY',async()=>{
 const env={MY:{fetch(){throw Error('public page must not call private service')}}};
 const root=await routeInvestApex(get('/invest'),env,{});
 const analysis=await routeInvestApex(get('/invest/analysis'),env,{});
 assert.equal(root.status,200);assert.equal(analysis.status,200);
 assert.match(await root.text(),/근거를 먼저 보는 투자분석/);
 assert.match(await analysis.text(),/공개 투자분석 안내/);
});
test('private login preserves the exact page and approved same-origin query',async()=>{
 const js=await investMyRoute(get('/invest/my/app.js'),{}).then(r=>r.text());
 const start=js.indexOf('function loginHref(){'),end=js.indexOf('const login=loginHref();',start);
 assert.ok(start>=0&&end>start);
 const pathname='/invest/my/value',search='?year=2025';
 const loginHref=vm.runInNewContext(js.slice(start,end)+';loginHref',{location:{pathname,search},encodeURIComponent});
 const login=new URL(loginHref(),'https://ekodi.kr');
 assert.equal(login.pathname,'/auth/');
 assert.equal(login.searchParams.get('site'),'invest');
 assert.equal(login.searchParams.get('return_to'),'https://ekodi.kr'+pathname+search);
});
test('private UI blocks pre-login content and does not accidentally expose trading controls',async()=>{
 const html=await investMyRoute(get('/invest/my/strategy'),{}).then(r=>r.text());
 assert.match(html,/id="ownerSidebar"[^>]*hidden/);
 assert.match(html,/<section id="owner" hidden>/);
 assert.match(html,/id="investAuthIntro"/);
 assert.doesNotMatch(html,/<header class="top"|href="\/my">내 계정/);
 const js=await investMyRoute(get('/invest/my/app.js'),{}).then(r=>r.text());
 assert.match(js,/location\.pathname/);
 assert.match(js,/history\.pushState/);
 assert.match(js,/verified=true/);
 assert.doesNotMatch(js,/\/broker\/orders|localStorage\.setItem/);
});
