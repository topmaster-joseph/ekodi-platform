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
  const centralFetch=async(input)=>{
    observed.push({path:new URL(input.url).pathname,authorization:input.headers.get('authorization')});
    return respond({authenticated:true,email:'admin@example.com',role:'super_admin',expiresAt:'2026-10-11T00:00:00Z'});
  };
  try{
    const headers={authorization:'Bearer known-central-session','content-type':'application/json'};
    const env={DB:fakeDb(),CONTROL_API:{fetch:centralFetch}};
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
  const centralFetch=async()=>respond({authenticated:true,email:'viewer@example.com',role:'viewer'});
  try{
    const response=await aiWorker.fetch(new Request('https://ai.internal/api/nodes/pair',{
      method:'POST',headers:{authorization:'Bearer viewer-session'},body:'{}'
    }),{DB:fakeDb(),CONTROL_API:{fetch:centralFetch}},{waitUntil(){}});
    assert.notEqual(response.status,201);
  }finally{globalThis.fetch=previous}
});

test('central EKODI Control API service binding exists in developer and production AI manifests',()=>{
  for(const path of ['wrangler.ai.toml','wrangler.ai.release.toml']){
    const manifest=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
    assert.match(manifest,/\[\[services\]\][\s\S]*?binding = "CONTROL_API"\nservice = "ekodi-auth-api"/);
  }
  const source=fs.readFileSync(new URL('../ai-control-worker.js',import.meta.url),'utf8');
  const auth=source.slice(source.indexOf('async function centralAdminSession('),source.indexOf('async function legacySupabaseAdmin('));
  assert.match(auth,/env\.CONTROL_API\.fetch\(sessionRequest\)/);
  assert.doesNotMatch(auth,/await fetch\(\x60\$\{base\}\/api\/session/);
});
test('admin pairing fails closed with 503 if the central service binding is absent',async()=>{
  const previous=globalThis.fetch;
  let outgoing=0;
  globalThis.fetch=async()=>{outgoing++;throw new Error('public worker routing forbidden')};
  try{
    const response=await aiWorker.fetch(new Request('https://ai.internal/api/nodes/pair',{
      method:'POST',headers:{authorization:'Bearer prior-session','content-type':'application/json'},body:'{}'
    }),{DB:fakeDb()},{waitUntil(){}});
    assert.equal(response.status,503);
    assert.equal((await response.json()).error,'central_identity_unavailable');
    assert.equal(outgoing,0,'must not route privileged sessions through the public internet');
  }finally{globalThis.fetch=previous}
});
test('AI admin session uses service binding without public HTTP fetch',async()=>{
  const previous=globalThis.fetch;
  let publicFetches=0;
  globalThis.fetch=async()=>{publicFetches++;throw new Error('forbidden public request')};
  const observed=[];
  const env={CONTROL_API:{fetch:async request=>{
    observed.push({url:request.url,method:request.method,authorization:request.headers.get('authorization')});
    return respond({authenticated:true,email:'admin@example.com',role:'super_admin'});
  }}};
  try{
    const response=await aiWorker.fetch(new Request('https://ai.internal/api/session',{
      headers:{authorization:'Bearer admin-token-sample'}
    }),env,{waitUntil(){}});
    assert.equal(response.status,200);
    assert.equal((await response.json()).user.email,'admin@example.com');
    assert.deepEqual(observed,[{url:'https://ekodi.kr/api/session',method:'GET',authorization:'Bearer admin-token-sample'}]);
    assert.equal(publicFetches,0);
  }finally{globalThis.fetch=previous}
});
