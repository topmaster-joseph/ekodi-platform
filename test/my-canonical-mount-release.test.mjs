import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import myWorker from '../my-worker.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const manifest=JSON.parse(read('deploy/manifests/my.worker.json'));
const env={DATA_ENABLED:'false',DATA_MODE:'isolated-staging'};

test('My health remains reachable with either canonical mount forwarding convention',async()=>{
  for(const url of [
    'https://ekodi.kr/health',
    'https://ekodi.kr/my/health',
    'https://ekodi.kr/my/health?verification=1',
  ]){
    const response=await myWorker.fetch(new Request(url),env);
    assert.equal(response.status,200,url);
    const json=await response.json();
    assert.equal(json.ok,true,url);
    assert.equal(json.service,'ekodi-my',url);
    assert.equal(json.digitalCardShortPath,'/{handle}',url);
    assert.equal(json.documentWorkspace,true,url);
  }
});

test('My canonical mounted docs are served by same assets as unmounted docs',async()=>{
  const paths=[];
  const context={...env,ASSETS:{fetch:async request=>{
    const path=new URL(request.url).pathname;
    paths.push(path);
    // Use plain text in the Node route contract: Cloudflare's HTMLRewriter is
    // exercised separately by the Chromium/live browser checks, not this mock.
    if(path==='/docs/')return new Response('EKODI Docs AI route fixture',{headers:{'content-type':'text/plain'}});
    return new Response('missing',{status:404});
  }}};
  for(const pathname of ['/docs/','/my/docs/']){
    const response=await myWorker.fetch(new Request('https://ekodi.kr'+pathname+'?keep=1'),context);
    assert.equal(response.status,200,pathname);
    assert.match(await response.text(),/EKODI Docs AI/);
  }
  assert.deepEqual(paths,['/docs/','/docs/']);
});

test('digital card short handles do not shadow reserved My endpoints',async()=>{
 const reserved=['health','docs','approvals','admin','api','creator','personal-brand','config','w'];
 const route=read('my/person-digital-card.js');
 for(const key of reserved)assert.match(route,new RegExp("'"+key+"'"));
 for(const key of ['health','docs']){
   const shortResponse=await myWorker.fetch(new Request('https://ekodi.kr/my/'+key),{
     ...env,ASSETS:{fetch:async()=>new Response('missing',{status:404})}
   });
   assert.notEqual(shortResponse.headers.get('x-ekodi-surface-context'),'person-digital-card');
   if(key==='health')assert.equal(shortResponse.status,200);
   if(key==='docs')assert.equal(shortResponse.status,307);
 }
});

test('My mount normalization is exact and leaves unrelated paths alone',()=>{
  const source=read('my-worker.js');
  assert.match(source,/incoming\.pathname==='\/my'\|\|incoming\.pathname\.startsWith\('\/my\/'\)/);
  assert.match(source,/forwarded\.pathname=incoming\.pathname\.slice\('\/my'\.length\)\|\|'\/'/);
  assert.match(source,/request=new Request\(forwarded\.toString\(\),request\)/);
});

test('candidate health proof stays strict while rollback proof uses actual stable baseline',()=>{
  const request=manifest.worker.requests.find(x=>x.url==='https://ekodi.kr/my/health');
  assert.ok(request);
  assert.ok(request.expect.includes('digitalCardShortPath'),'new candidate still must expose new feature');
  assert.ok(!request.rollbackExpect.includes('digitalCardShortPath'),'older stable version need not claim a new feature');
  for(const existingFeature of ['ekodi-my','my-ekodi','documentWorkspace','digitalCardPath','digitalCardQrCenter']){
    assert.ok(request.expect.includes(existingFeature));
    assert.ok(request.rollbackExpect.includes(existingFeature));
  }
  assert.equal(manifest.worker.name,'ekodi-my');
});
