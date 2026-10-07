import test from 'node:test';
import assert from 'node:assert/strict';
import { serveWithSafeEdgeCache } from '../edge-traffic-cache.js';

function fakeCache(){
  const store=new Map();
  return {
    async match(request){const hit=store.get(request.url);return hit?.clone()||undefined},
    async put(request,response){store.set(request.url,response.clone())},
  };
}

test('10,000 concurrent public reads collapse to one origin execution per edge isolate', async () => {
  const previous=globalThis.caches;
  globalThis.caches={default:fakeCache()};
  try{
    let produced=0;
    let release;
    const gate=new Promise(resolve=>{release=resolve});
    const request=new Request('https://ekodi.kr/seonammedi');
    const ctx={waitUntil(){}};
    const producer=async()=>{
      produced+=1;
      await gate;
      return new Response('public-ok',{status:200,headers:{'content-type':'text/html'}});
    };
    const pending=Array.from({length:10000},()=>serveWithSafeEdgeCache(request,ctx,producer));
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(produced,1,'same-key public surge must not stampede the origin');
    release();
    const responses=await Promise.all(pending);
    assert.equal(responses.length,10000);
    assert.equal(responses.filter(response=>response.status===200).length,10000);
    assert.equal(produced,1);
    const states=new Set(responses.map(response=>response.headers.get('x-ekodi-edge-cache')));
    assert.ok(states.has('MISS'));
    assert.ok(states.has('COALESCED'));
  } finally {
    if(previous===undefined)delete globalThis.caches;
    else globalThis.caches=previous;
  }
});

test('private authenticated traffic never shares response bodies through the public cache', async () => {
  const previous=globalThis.caches;
  globalThis.caches={default:fakeCache()};
  try{
    let produced=0;
    const ctx={waitUntil(){}};
    const calls=Array.from({length:100},(_,index)=>{
      const request=new Request('https://ekodi.kr/my/',{headers:{authorization:`Bearer token-${index}`}});
      return serveWithSafeEdgeCache(request,ctx,async()=>{
        produced+=1;
        return new Response(`private-${index}`,{status:200,headers:{'content-type':'text/html'}});
      });
    });
    const responses=await Promise.all(calls);
    assert.equal(produced,100,'private requests must not be coalesced or edge-cached across principals');
    assert.equal(responses.every(response=>response.headers.get('cache-control')==='no-store'),true);
    assert.equal(responses.every(response=>response.headers.get('x-ekodi-edge-cache-policy')==='private_or_sensitive'),true);
  } finally {
    if(previous===undefined)delete globalThis.caches;
    else globalThis.caches=previous;
  }
});
