import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import aiWorker from '../ai-control-worker.js';

const respond=(payload,status=200)=>new Response(JSON.stringify(payload), {
  status,headers:{'content-type':'application/json'}
});
const fakeDb=()=>({
  prepare(){return{
    bind(){return this},
    async run(){return{success:true}},
    async all(){return{results:[]}},
  }},
});

test('canonical Admin AI controls call the existing /ai/api service routes, not a missing Control API',()=>{
  const client=fs.readFileSync(new URL('../common-services-admin.js',import.meta.url),'utf8');
  assert.match(client,/const common=\(path,options\)=>jsonFetch\(\x60\/ai\/api\//);
  assert.match(client,/common\('ai\/status'\)/);
  assert.match(client,/common\('ai\/nodes\/pair'/);
  assert.doesNotMatch(client,/const common=\(path,options\)=>jsonFetch\(\x60\/api\/control\/common-services\//);
});

test('D1-backed central super-admin session can create pairing and read Commons review',async()=>{
  const previous=globalThis.fetch;
  const observed=[];
  globalThis.fetch=async(input,options)=>{
    observed.push({path:new URL(String(input)).pathname,authorization:options?.headers?.authorization});
    return respond({authenticated:true,email:'admin@example.com',role:'super_admin',expiresAt:'2026-10-11T00:00:00Z'});
  };
  try{
    const headers={authorization:'Bearer known-central-session','content-type':'application/json'};
    const env={DB:fakeDb()};
    const pairing=await aiWorker.fetch(new Request('https://ai.internal/api/nodes/pair',{method:'POST',headers,body:'{}'}),env,{waitUntil(){}});
    assert.equal(pairing.status,201);
    assert.match((await pairing.json()).code,/^[A-HJ-NP-Z2-9]{10}$/);
    const review=await aiWorker.fetch(new Request('https://ai.internal/api/commons/admin/requests',{headers}),env,{waitUntil(){}});
    assert.equal(review.status,200);
    assert.deepEqual((await review.json()).requests,[]);
    assert.equal(observed.length,2);
    assert.ok(observed.every(entry=>entry.path==='/api/session'&&entry.authorization==='Bearer known-central-session'));
  }finally{globalThis.fetch=previous}
});

test('original central response never grants missing viewer capabilities',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>respond({authenticated:true,email:'viewer@example.com',role:'viewer'});
  try{
    const response=await aiWorker.fetch(new Request('https://ai.internal/api/nodes/pair',{
      method:'POST',headers:{authorization:'Bearer viewer-session'},body:'{}'
    }),{DB:fakeDb()},{waitUntil(){}});
    assert.notEqual(response.status,201);
  }finally{globalThis.fetch=previous}
});
