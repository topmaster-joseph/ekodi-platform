import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLiveDataStores, validatePublicProbeBody } from '../scripts/verify-live-data-stores.mjs';
import { verifyProviderD1 } from '../scripts/verify-provider-data-stores.mjs';

const json = (data,status=200)=>new Response(JSON.stringify(data),{
  status, headers:{'content-type':'application/json; charset=utf-8'}
});
const health = {ok:true,service:'independent-board',storage:'independent-board-d1',
  db:true,files:true,queue:'ready',rateLimiter:true};
const posts = {ok:true,storage:'independent-board-d1',items:[]};
const collection = {ok:true,storage:'independent-board-d1'};

test('limited health monitor confirms real D1 read and omits post data',async()=>{
  const requested = [];
  const fetchImpl = async url => {
    requested.push(url);
    return url.includes('/health')?json(health):json({...posts,items:[{message:'PRIVATE FIXTURE'}]});
  };
  const result = await verifyLiveDataStores({fetchImpl});
  assert.equal(result.ok,true);
  assert.equal(result.probes.length,2);
  assert.equal(result.resourceIdentityConfirmed,false);
  assert.equal(result.backupRestoreVerified,false);
  assert.ok(!JSON.stringify(result).includes('PRIVATE FIXTURE'));
  assert.equal(requested.length,2);
});

test('full monitor checks both URL surfaces and anonymous admin denial',async()=>{
  const fetchImpl = async url => {
    if(url.includes('/api/admin/finance'))return json({error:'forbidden'},403);
    if(url.endsWith('/health'))return json(health);
    if(url.endsWith('/api/posts'))return json(posts);
    return json(collection);
  };
  const result=await verifyLiveDataStores({fetchImpl,scope:'full'});
  assert.equal(result.ok,true);
  assert.equal(result.probes.length,7);
  assert.equal(result.probes.find(x=>x.name==='anonymous-admin-denied').status,403);
});

test('missing DB binding and HTML fallback both fail',async()=>{
  const dbFail = await verifyLiveDataStores({fetchImpl:async u=>json(u.endsWith('/health')?{...health,db:false}:posts)});
  assert.equal(dbFail.ok,false);
  const html = await verifyLiveDataStores({fetchImpl:async()=>new Response('<html>SPA</html>',{headers:{'content-type':'text/html'}})});
  assert.equal(html.ok,false);
});

test('quota 429 opens circuit without retry storm',async()=>{
  let calls=0;
  const r=await verifyLiveDataStores({fetchImpl:async()=>{calls++;return new Response('',{status:429})},scope:'full'});
  assert.equal(calls,1);
  assert.equal(r.circuitOpen,true);
  assert.equal(r.ok,false);
});

test('payload validation refuses invented health and missing records',()=>{
  assert.equal(validatePublicProbeBody('health',{...health,files:false}),false);
  assert.equal(validatePublicProbeBody('posts',{ok:true,storage:'independent-board-d1'}),false);
});

test('provider control-plane inventory recognizes both registered D1 names without IDs',async()=>{
  const fetchImpl=async(url,opts)=>{
    assert.match(url,/^https:\/\/api\.cloudflare\.com\/client\/v4\//);
    assert.equal(opts.method,'GET');
    return json({success:true,result:[{name:'ekodi-auth',uuid:'sensitive-ref'},
      {name:'ekodi-independent-board',uuid:'secret-ref'}],result_info:{total_count:2}});
  };
  const result=await verifyProviderD1({fetchImpl,accountId:'f'.repeat(32),token:'server-token',
    expectedNames:['ekodi-auth','ekodi-independent-board']});
  assert.equal(result.ok,true);
  assert.equal(result.registered.length,2);
  assert.equal(result.resourceIdentifiersExposed,false);
  assert.ok(!JSON.stringify(result).includes('secret-ref'));
  assert.ok(!JSON.stringify(result).includes('server-token'));
});

test('provider inventory fails when registered DB missing',async()=>{
  const r=await verifyProviderD1({fetchImpl:async()=>json({success:true,result:[{name:'ekodi-auth'}]}),
    accountId:'a'.repeat(32),token:'token',expectedNames:['ekodi-auth','ekodi-independent-board']});
  assert.equal(r.ok,false);
  assert.equal(r.error,'registered-d1-database-missing');
});

test('provider 429 opens circuit without repeated calls',async()=>{
  let calls=0;
  const r=await verifyProviderD1({fetchImpl:async()=>{calls++;return new Response('',{status:429})},
    accountId:'a'.repeat(32),token:'token',expectedNames:['ekodi-auth']});
  assert.equal(r.circuitOpen,true);
  assert.equal(calls,1);
});

test('provider inventory fails closed without credentials',async()=>{
  const r=await verifyProviderD1({accountId:'a'.repeat(32),expectedNames:['ekodi-auth']});
  assert.equal(r.ok,false);
  assert.equal(r.error,'missing-or-invalid-provider-configuration');
});

test('scheduled database watch is separate, quota-gated and read-only',async()=>{
  const {readFileSync}=await import('node:fs');
  const path=new URL('../.github/workflows/data-store-readonly-watch.yml',import.meta.url);
  const source=readFileSync(path,'utf8');
  assert.match(source,/schedule:/);
  assert.match(source,/contents: read/);
  assert.doesNotMatch(source,/issues:\s*write|contents:\s*write|wrangler deploy|d1 create|gh issue create/);
  assert.match(source,/if: steps\.quota\.outputs\.state == 'normal'/);
  assert.match(source,/verify-provider-data-stores\.mjs/);
  assert.match(source,/verify-live-data-stores\.mjs --scope=lite/);
  assert.match(source,/--static-policy/);
});
