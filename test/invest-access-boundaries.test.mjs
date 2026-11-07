import test from 'node:test';
import assert from 'node:assert/strict';
import { investIntroPage, investAnalysisPage, investAnalysisScript } from '../invest-access-ui.js';
import { investMyRoute } from '../invest-my-workspace.js';
import myWorker from '../my-worker.js';
import { routeCanonicalSurface } from '../canonical-surface-router.js';

const origin='https://ekodi.kr';
const get=path=>new Request(origin+path);
const authorized=(path,token='a'.repeat(30))=>new Request(origin+path,{headers:{authorization:'Bearer '+token}});

test('public /invest explains service without user data and starts login into /invest/my',async()=>{
 const result=investIntroPage();
 assert.equal(result.status,200);
 assert.match(result.headers.get('cache-control'),/no-store/);
 const html=await result.text();
 assert.match(html,/로그인 전에는 설명만/);
 assert.match(html,/로그인 후 마이투자/);
 assert.match(html,/공개 분석 안내 보기/);
 assert.match(html,/site=invest&return_to=https%3A%2F%2Fekodi.kr%2Finvest%2Fmy/);
 assert.match(html,/data-ekodi-platform="invest"/);
 assert.doesNotMatch(html,/id="result"|id="capital"|access_token|Bearer /);
});
test('public /invest/analysis is visible before sign-in and has zero personalized queries',async()=>{
 const html=await investAnalysisPage().text();
 assert.match(html,/공개 투자분석 안내/);
 assert.match(html,/종목별 분석/);
 assert.match(html,/검증되지 않은 수익률은 표시하지 않습니다/);
 assert.match(html,/src="\/invest\/analysis.js"/);
 assert.doesNotMatch(html,/id="analysis" hidden|내 자산|id="apply"|access_token/);
 const js=await investAnalysisScript().text();
 assert.match(js,/ekodi_token/);
 assert.match(js,/location.replace\('\/invest\/my#ekodi_token=/);
 assert.doesNotMatch(js,/Bearer |\/workspace-api\/v1\/invest\/common-analysis|\/broker\/orders/);
});
test('canonical private path renders only a minimal pre-login view',async()=>{
 const r=await investMyRoute(get('/invest/my'),{});
 assert.equal(r.status,200);
 assert.match(r.headers.get('cache-control'),/no-store/);
 assert.match(r.headers.get('x-robots-tag'),/noindex/);
 const html=await r.text();
 assert.match(html,/id="investAuthIntro"/);
 assert.match(html,/id="ownerSidebar"[^>]*hidden/);
 assert.match(html,/<section id="owner" hidden>/);
 assert.match(html,/id="stepUpButton"/);
 assert.match(html,/\/invest\/my\/style.css/);
 assert.doesNotMatch(html,/<header class="top"|href="\/my">내 계정|href="\/invest">투자 안내/);
});
test('every listed private page and asset resolves directly, unknown routes are 404',async()=>{
 const pages=['','manual','broker','market','portfolio','autopilot','auto-policy','live','strategy','value','design','scenario','risk','reports'];
 for(const slug of pages){
  const path='/invest/my'+(slug?'/'+slug:'');
  const r=await investMyRoute(get(path),{});
  assert.equal(r.status,200,path);
  assert.match(r.headers.get('cache-control'),/no-store/);
 }
 for(const asset of ['style.css','app.js']){
  const r=await investMyRoute(get('/invest/my/'+asset),{});
  assert.equal(r.status,200,asset);
 }
 assert.equal((await investMyRoute(get('/invest/my/not-real'),{})).status,404);
});
test('private access API rejects anonymous users for canonical and internal paths',async()=>{
 for(const path of ['/invest/my/access','/invest/access']){
  const r=await investMyRoute(get(path),{});
  assert.equal(r.status,401,path);
  assert.equal((await r.json()).error,'authentication_required');
  assert.equal(r.headers.get('cache-control'),'private, no-store');
 }
});
test('matching confirmed owner alone receives disabled paid and live entitlements',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({id:'owner-id',email:'owner@example.com',email_confirmed_at:'2026-10-01T00:00:00Z'}),{status:200,headers:{'content-type':'application/json'}});
 try{
  const r=await investMyRoute(authorized('/invest/my/access'),{INVEST_OWNER_EMAIL:'owner@example.com'});
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.scope,'self-research');
  assert.equal(body.paidSubscriptionActive,false);
  assert.equal(body.liveTradingEnabled,false);
 }finally{globalThis.fetch=original}
});
test('different owner email cannot use private research',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({id:'other-id',email:'other@example.com',email_confirmed_at:'2026-10-01T00:00:00Z'}),{status:200,headers:{'content-type':'application/json'}});
 try{
  const r=await investMyRoute(authorized('/invest/my/access'),{INVEST_OWNER_EMAIL:'owner@example.com'});
  assert.equal(r.status,403);
  assert.equal((await r.json()).error,'subscription_not_active');
 }finally{globalThis.fetch=original}
});
test('unconfirmed email fails closed even when the address matches',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async input=>String(input).includes('/api/session')?
  new Response(JSON.stringify({authenticated:false}),{status:401}):
  new Response(JSON.stringify({id:'owner-id',email:'owner@example.com'}),{status:200});
 try{
  const r=await investMyRoute(authorized('/invest/my/access'),{INVEST_OWNER_EMAIL:'owner@example.com'});
  assert.equal(r.status,403);
 }finally{globalThis.fetch=original}
});
test('verified superadmin token retains its existing research-only scope',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async input=>String(input).includes('/api/session')?
  new Response(JSON.stringify({authenticated:true,role:'super_admin',email:'owner@example.com'}),{status:200}):
  new Response('{}',{status:401});
 try{
  const r=await investMyRoute(authorized('/invest/my/access'),{INVEST_OWNER_EMAIL:'owner@example.com'});
  assert.equal(r.status,200);
  assert.equal((await r.json()).scope,'self-research');
 }finally{globalThis.fetch=original}
});
test('legacy /my/invest route redirects instead of creating a duplicate private page',async()=>{
 const env={MY:{fetch:request=>myWorker.fetch(request,{})}};
 const legacyPaths=['','manual','broker','market','portfolio','autopilot','auto-policy','live',
  'strategy','value','design','scenario','risk','reports','access','app.js','style.css'];
 for(const slug of legacyPaths){
  const legacy='/my/invest'+(slug?'/'+slug:'');
  const target='/invest/my'+(slug?'/'+slug:'');
  const r=await routeCanonicalSurface(get(legacy),env);
  assert.equal(r.status,308,legacy);
  const location=new URL(r.headers.get('location'));
  assert.equal(location.pathname,target,legacy);
  assert.equal(location.origin,'https://ekodi.kr');
  assert.match(r.headers.get('cache-control'),/no-store/);
 }
 const withQuery=await routeCanonicalSurface(get('/my/invest/manual?year=2025&market=KR'),env);
 assert.equal(withQuery.status,308);
 assert.equal(new URL(withQuery.headers.get('location')).search,'?year=2025&market=KR');
 // Never bounce the new canonical route back to itself.
 const canonical=await myWorker.fetch(get('/invest/my'),{});
 assert.equal(canonical.status,200);
 const denied=await myWorker.fetch(get('/invest/my/access'),{});
 assert.equal(denied.status,401);
});
test('owner client consumes one-time auth only in the private view; no credential storage or live orders',async()=>{
 const js=await (await investMyRoute(get('/invest/my/app.js'),{})).text();
 assert.match(js,/verifyOtp/);
 assert.match(js,/getSession/);
 assert.match(js,/\/invest\/my\/access/);
 assert.match(js,/loginHref\(/);
 assert.match(js,/site=invest&return_to/);
 assert.match(js,/history\.pushState/);
 assert.doesNotMatch(js,/localStorage\.setItem|sessionStorage\.setItem|\/broker\/orders/);
});
