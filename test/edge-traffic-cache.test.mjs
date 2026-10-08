import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEdgeTrafficPolicy, classifyEdgeTrafficRequest, serveWithSafeEdgeCache } from '../edge-traffic-cache.js';

test('edge cache classifier isolates private and mutation traffic from public cache', () => {
  for (const path of ['/admin/','/auth/','/my/','/api/session','/mcp','/webhooks/github']) {
    const decision=classifyEdgeTrafficRequest(new Request('https://ekodi.kr'+path));
    assert.equal(decision.cacheable,false,path);
    assert.equal(decision.cacheControl,'no-store',path);
  }
  const write=classifyEdgeTrafficRequest(new Request('https://ekodi.kr/seonammedi',{method:'POST'}));
  assert.equal(write.id,'write');
  assert.equal(write.cacheable,false);
});

test('authorization cookies and range requests bypass otherwise public cacheable routes', () => {
  for (const [name,value] of [['authorization','Bearer secret'],['cookie','sid=abc'],['range','bytes=0-10']]) {
    const request=new Request('https://ekodi.kr/seonammedi',{headers:{[name]:value}});
    const decision=classifyEdgeTrafficRequest(request);
    assert.equal(decision.cacheable,false,name);
    assert.equal(decision.id,'private_context',name);
  }
});

test('versioned static assets are immutable while unversioned assets revalidate', () => {
  const versioned=classifyEdgeTrafficRequest(new Request('https://ekodi.kr/app.js?v=abc123'));
  assert.equal(versioned.id,'immutable_static');
  assert.match(versioned.cacheControl,/31536000/);
  assert.match(versioned.cacheControl,/immutable/);
  const ordinary=classifyEdgeTrafficRequest(new Request('https://ekodi.kr/app.js'));
  assert.equal(ordinary.id,'revalidated_static');
  assert.match(ordinary.cacheControl,/stale-while-revalidate=3600/);
});

test('private response policy forces no-store even when upstream tries to cache', () => {
  const request=new Request('https://ekodi.kr/my/');
  const response=applyEdgeTrafficPolicy(new Response('<html></html>',{headers:{'content-type':'text/html','cache-control':'public, max-age=999'}}),request);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-ekodi-edge-cache-policy'),'private_or_sensitive');
});

test('safe public cache coalesces concurrent misses and serves later hits', async () => {
  const previous=globalThis.caches;
  const store=new Map();
  globalThis.caches={
    default:{
      async match(request){const hit=store.get(request.url);return hit?.clone()||undefined},
      async put(request,response){store.set(request.url,response.clone())},
    },
  };
  try{
    let produced=0;
    let release;
    const wait=new Promise(resolve=>{release=resolve});
    const producer=async()=>{produced+=1;await wait;return new Response('ok',{headers:{'content-type':'text/html'}})};
    const request=new Request('https://ekodi.kr/seonammedi');
    const waits=[];
    const ctx={waitUntil(promise){waits.push(promise)}};
    const first=serveWithSafeEdgeCache(request,ctx,producer);
    const second=serveWithSafeEdgeCache(request,ctx,producer);
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(produced,1);
    release();
    const [a,b]=await Promise.all([first,second]);
    assert.equal(await a.text(),'ok');
    assert.equal(await b.text(),'ok');
    assert.deepEqual(new Set([a.headers.get('x-ekodi-edge-cache'),b.headers.get('x-ekodi-edge-cache')]),new Set(['MISS','COALESCED']));
    await Promise.all(waits);
    const hit=await serveWithSafeEdgeCache(request,ctx,async()=>{throw new Error('cache hit should not invoke producer')});
    assert.equal(hit.headers.get('x-ekodi-edge-cache'),'HIT');
  } finally {
    if(previous===undefined)delete globalThis.caches;
    else globalThis.caches=previous;
  }
});
