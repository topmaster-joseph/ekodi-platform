import test from 'node:test';
import assert from 'node:assert/strict';
import { investMyRoute } from '../invest-my-workspace.js';
import myWorker from '../my-worker.js';
import { routeCanonicalSurface } from '../canonical-surface-router.js';

const origin='https://ekodi.kr';
const get=path=>new Request(origin+path);
const authRequest=(path,token)=>new Request(origin+path,{headers:{authorization:'Bearer '+token}});
const tok='a'.repeat(30);

test('private My Invest has a disabled subscription by default',async()=>{
 const response=await investMyRoute(get('/invest'),{});
 assert.equal(response.status,200);
 assert.match(response.headers.get('cache-control'),/no-store/);
 assert.match(response.headers.get('x-robots-tag'),/noindex/);
 const html=await response.text();
 assert.match(html,/일반회원용 유료 구독.*비활성화/);
 assert.match(html,/<section id="owner" hidden>/);
 assert.match(html,/\/my\/invest\/style.css/);
 assert.doesNotMatch(html,/<style>/);
 const style=await investMyRoute(get('/invest/style.css'),{});
 assert.match(style.headers.get('content-type'),/text\/css/);
});
test('private My Invest access API rejects unauthenticated clients',async()=>{
 const response=await investMyRoute(get('/invest/access'),{});
 assert.equal(response.status,401);
 assert.equal((await response.json()).error,'authentication_required');
});
test('private My Invest fails closed for authenticated non-owner',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async ()=>new Response(JSON.stringify({id:'other-id',email:'other@example.com',email_confirmed_at:'2026-10-01T00:00:00Z'}),{status:200,headers:{'content-type':'application/json'}});
 try{
  const response=await investMyRoute(authRequest('/invest/access',tok),{});
  assert.equal(response.status,403);
  assert.equal((await response.json()).error,'subscription_not_active');
 }finally{globalThis.fetch=original}
});
test('private My Invest verifies the configured owner via confirmed Google member identity',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async ()=>new Response(JSON.stringify({id:'owner-id',email:'owner@example.com',email_confirmed_at:'2026-10-01T00:00:00Z'}),{status:200,headers:{'content-type':'application/json'}});
 try{
  const response=await investMyRoute(authRequest('/invest/access',tok),{INVEST_OWNER_EMAIL:'owner@example.com'});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.paidSubscriptionActive,false);
  assert.equal(body.liveTradingEnabled,false);
 }finally{globalThis.fetch=original}
});
test('unconfirmed matching email does not activate owner entitlement',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>String(url).includes('/api/session')
   ?new Response(JSON.stringify({authenticated:false}),{status:401})
   :new Response(JSON.stringify({id:'owner-id',email:'owner@example.com'}),{status:200});
 try{
  const response=await investMyRoute(authRequest('/invest/access',tok),{INVEST_OWNER_EMAIL:'owner@example.com'});
  assert.equal(response.status,403);
 }finally{globalThis.fetch=original}
});
test('super admin owner may use existing EKODI admin bearer token',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>String(url).includes('/api/session')
   ?new Response(JSON.stringify({authenticated:true,role:'super_admin',email:'owner@example.com'}),{status:200})
   :new Response('{}',{status:401});
 try{
  const response=await investMyRoute(authRequest('/invest/access',tok),{INVEST_OWNER_EMAIL:'owner@example.com'});
  assert.equal(response.status,200);
  assert.equal((await response.json()).scope,'self-research');
 }finally{globalThis.fetch=original}
});
test('private access does not expose member financial data and routes fail closed',async()=>{
 const access=await investMyRoute(get('/invest/access'),{});
 assert.equal(access.headers.get('cache-control'),'private, no-store');
 assert.equal(await investMyRoute(get('/invest/private-internal'),{}),null);
 const js=await investMyRoute(get('/invest/app.js'),{});
 const source=await js.text();
 assert.match(source,/\/my\/invest\/access/);
 assert.doesNotMatch(source,/localStorage\.setItem|\/automation\/resume|\/broker\/orders/);
});

test('canonical /my/invest routes through the MY worker with private non-cacheable HTML',async()=>{
 const env={MY:{fetch:request=>myWorker.fetch(request,{})}};
 const response=await routeCanonicalSurface(get('/my/invest'),env);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('x-ekodi-canonical-surface'),'my');
 assert.match(response.headers.get('cache-control'),/no-store/);
 assert.match(response.headers.get('x-robots-tag'),/noindex/);
 const html=await response.text();
 assert.match(html,/마이투자/);
 assert.match(html,/id="owner" hidden/);
});
test('canonical /my/invest/access rejects anonymous requests at the real MY entry',async()=>{
 const env={MY:{fetch:request=>myWorker.fetch(request,{})}};
 const response=await routeCanonicalSurface(get('/my/invest/access'),env);
 assert.equal(response.status,401);
 assert.equal((await response.json()).error,'authentication_required');
});


test('private owner investment dashboard keeps data local and labels assumptions',async()=>{
 const page=await investMyRoute(get('/invest'),{});
 const html=await page.text();
 assert.match(html,/나만의 투자분석 설계/);
 assert.match(html,/시나리오/);
 assert.match(html,/가상 예시/);
 assert.match(html,/실시간 시세가 연결되지 않습니다/);
 assert.match(html,/id="owner" hidden>/);
 assert.match(html,/holdingForm/);
 assert.match(html,/download/);
 const script=await investMyRoute(get('/invest/app.js'),{});
 const js=await script.text();
 assert.match(js,/verifyOtp/);
 assert.match(js,/getSession/);
 assert.match(js,/history\.replaceState/);
 assert.match(js,/ekodi_token/);
 assert.match(js,/\/my\/invest\/access/);
 assert.match(js,/textContent/);
 assert.doesNotMatch(js,/localStorage\.setItem|sessionStorage\.setItem|\/broker\/orders/);
 const stylesheet=await investMyRoute(get('/invest/style.css'),{});
 const css=await stylesheet.text();
 assert.match(css,/\.hero/);
 assert.match(css,/@media/);
});

test('private owner scenario entry does not expose analysis to unverified browsers',async()=>{
 const page=await investMyRoute(get('/invest'),{});
 const html=await page.text();
 assert.doesNotMatch(html,/access_token|sb_secret_|service_role/);
 assert.match(html,/<section id="owner" hidden>/);
 const response=await investMyRoute(get('/invest/access'),{});
 assert.equal(response.status,401);
 assert.equal(response.headers.get('cache-control'),'private, no-store');
});
