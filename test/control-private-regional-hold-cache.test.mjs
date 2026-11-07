import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import customerEntryWorker from '../customer-entry-worker.js';
import {applyApiSecurityHeaders} from '../security-edge.js';
import {cheonggyePublicApiHoldResponse} from '../region-publication-hold.js';

const url='https://ekodi.kr/api/local-operations/cheonggye/modules/directory';
const held=()=>new Request(url,{method:'GET'});

function assertPrivateHold(response,label){
  assert.equal(response.status,404,label);
  assert.equal(response.headers.get('x-ekodi-route'),'regional-private-hold',label);
  assert.equal(response.headers.get('x-ekodi-region-publication'),'private-owner-release-required',label);
  assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0',label);
  assert.match(response.headers.get('x-robots-tag'),/noindex/,label);
  assert.equal(response.headers.get('cloudflare-cdn-cache-control'),null,label);
  assert.equal(response.headers.get('cdn-cache-control'),null,label);
  assert.equal(response.headers.get('surrogate-control'),null,label);
}

test('Control API customer entry preserves owner-frozen 404 and final cache headers',async()=>{
  const response=await customerEntryWorker.fetch(held(),{});
  const secured=applyApiSecurityHeaders(response);
  assertPrivateHold(secured,'customer-to-control');
  assert.deepEqual(await secured.json(),{ok:false,code:'REGIONAL_PUBLICATION_PRIVATE',message:'서비스 비공개'});
});

test('final Control boundary restores private + no-store when intermediate policy supplied only no-store',()=>{
  const upstream=cheonggyePublicApiHoldResponse(held());
  for(const cache of ['no-store','public, max-age=3600','no-cache']){
    const lowered=new Response('',{status:404,headers:new Headers(upstream.headers)});
    lowered.headers.set('Cache-Control',cache);
    lowered.headers.set('Cloudflare-CDN-Cache-Control','public, max-age=3600');
    lowered.headers.set('CDN-Cache-Control','public, max-age=3600');
    lowered.headers.set('Surrogate-Control','public, max-age=3600');
    assertPrivateHold(applyApiSecurityHeaders(lowered),cache);
  }
});

test('ordinary private API and synthetic non-404 responses do not receive a fake regional override',()=>{
  const regular=applyApiSecurityHeaders(new Response('{}',{status:401,headers:{'content-type':'application/json','cache-control':'no-store'}}));
  assert.equal(regular.headers.get('cache-control'),'no-store');
  const misleading=applyApiSecurityHeaders(new Response('{}',{status:200,headers:{
    'x-ekodi-route':'regional-private-hold','x-ekodi-region-publication':'private-owner-release-required',
    'cache-control':'no-store',
  }}));
  assert.equal(misleading.headers.get('cache-control'),'no-store');
});

test('release manifest continues to enforce the strict private/no-store canary',async()=>{
  const m=JSON.parse(await readFile(new URL('../deploy/manifests/control-api.worker.json',import.meta.url),'utf8'));
  const check=m.worker.requests.find(x=>x.url===url);
  assert.ok(check);
  assert.deepEqual(check.statuses,[404]);
  assert.ok(check.headerExpect.includes('cache-control: private, no-store'));
  assert.ok(check.headerExpect.includes('x-ekodi-region-publication: private-owner-release-required'));
  assert.ok(check.expect.includes('REGIONAL_PUBLICATION_PRIVATE'));
  const entry=await readFile(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8');
  assert.match(entry,/const response = await customerEntryWorker\.fetch\(request, env, ctx\);\s*return applyApiSecurityHeaders\(response\);/);
});
