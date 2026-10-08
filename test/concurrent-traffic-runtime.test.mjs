import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTrafficResponsePolicy,
  assessTrafficTier,
  isTrafficCacheEligible,
  recordTrafficOutcome,
  resetTrafficGovernorForTests,
  trafficRequestGuard,
  trafficRuntimeSnapshot
} from '../traffic-governor.js';

function limiter(success){return {limit:async()=>({success})}}
function env({l2=true,l3=true,protect=true}={}){
  return {
    TRAFFIC_L2_RATE_LIMITER:limiter(l2),
    TRAFFIC_L3_RATE_LIMITER:limiter(l3),
    TRAFFIC_PROTECT_RATE_LIMITER:limiter(protect)
  };
}
const request=(path='/',headers={})=>new Request('https://ekodi.kr'+path,{headers});

test('traffic governor promotes through L1 L2 L3 PROTECT from shared pressure windows',async()=>{
  resetTrafficGovernorForTests();
  assert.equal((await assessTrafficTier(request(),env())).tier,'L1');
  resetTrafficGovernorForTests();
  assert.equal((await assessTrafficTier(request(),env({l2:false}))).tier,'L2');
  resetTrafficGovernorForTests();
  assert.equal((await assessTrafficTier(request(),env({l2:false,l3:false}))).tier,'L3');
  resetTrafficGovernorForTests();
  assert.equal((await assessTrafficTier(request(),env({l2:false,l3:false,protect:false}))).tier,'PROTECT');
  resetTrafficGovernorForTests();
  const degraded=await assessTrafficTier(request(),{});
  assert.equal(degraded.tier,'L1');
  assert.equal(degraded.degraded,true);
});

test('latency and errors can promote traffic protection without RPS pressure',async()=>{
  resetTrafficGovernorForTests();
  for(let i=0;i<10;i++)recordTrafficOutcome({durationMs:2500,status:200});
  const latency=trafficRuntimeSnapshot();
  assert.equal(latency.tier,'L3');
  assert.equal((await assessTrafficTier(request(),env())).tier,'L3');

  resetTrafficGovernorForTests();
  for(let i=0;i<10;i++)recordTrafficOutcome({durationMs:100,status:i<2?500:200});
  const errors=trafficRuntimeSnapshot();
  assert.equal(errors.errorPercent,20);
  assert.equal(errors.tier,'PROTECT');
  assert.equal((await assessTrafficTier(request(),env())).tier,'PROTECT');
});

test('surge shedding removes noncritical traffic before core public reads and writes',()=>{
  const crawler=request('/history',{'user-agent':'examplebot/1.0'});
  assert.equal(trafficRequestGuard(crawler,{tier:'L3'}).status,429);
  assert.equal(trafficRequestGuard(request('/preview/demo'),{tier:'PROTECT'}).status,503);
  assert.equal(trafficRequestGuard(new Request('https://ekodi.kr/api/ai/background/job',{method:'POST'}),{tier:'PROTECT'}).status,503);
  assert.equal(trafficRequestGuard(request('/'),{tier:'PROTECT'}),null);
  assert.equal(trafficRequestGuard(request('/health',{'user-agent':'examplebot'}),{tier:'PROTECT'}),null);
  assert.equal(trafficRequestGuard(new Request('https://ekodi.kr/api/forms',{method:'POST'}),{tier:'PROTECT'}),null);
});

test('only anonymous public successful reads receive edge cache policy',()=>{
  const html=()=>new Response('<h1>EKODI</h1>',{headers:{'content-type':'text/html; charset=utf-8'}});
  const publicRequest=request('/');
  assert.equal(isTrafficCacheEligible(publicRequest,html()),true);
  const cached=applyTrafficResponsePolicy(html(),publicRequest,{tier:'L3',reasons:['rps']});
  assert.match(cached.headers.get('cloudflare-cdn-cache-control')||'',/max-age=300/);
  assert.match(cached.headers.get('cloudflare-cdn-cache-control')||'',/stale-while-revalidate=1800/);
  assert.equal(cached.headers.get('x-ekodi-edge-cache'),'public-anonymous');
  assert.equal(cached.headers.get('x-ekodi-traffic-tier'),'L3');
  assert.equal(cached.headers.get('x-ekodi-traffic-reason'),'rps');

  assert.equal(isTrafficCacheEligible(request('/my'),html()),false);
  assert.equal(isTrafficCacheEligible(request('/',{authorization:'Bearer token'}),html()),false);
  assert.equal(isTrafficCacheEligible(request('/?q=1'),html()),false);
  assert.equal(isTrafficCacheEligible(publicRequest,new Response('{}',{headers:{'content-type':'application/json','cache-control':'private, no-store'}})),false);
});

test('private documents are forced no-store even if an upstream marks them public',()=>{
  const response=new Response('<h1>private</h1>',{headers:{'content-type':'text/html','cache-control':'public, max-age=600','cloudflare-cdn-cache-control':'public, max-age=600'}});
  const out=applyTrafficResponsePolicy(response,request('/my'),{tier:'L2'});
  assert.equal(out.headers.get('cache-control'),'no-store');
  assert.equal(out.headers.get('cloudflare-cdn-cache-control'),null);
});
