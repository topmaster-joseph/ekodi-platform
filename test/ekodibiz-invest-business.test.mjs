import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import platform from '../platform-router-entry-worker.js';
import site from '../site-worker.js';
test('EKODIBIZ investment business and admin paths are retired',async()=>{
 for(const path of ['/ekodibiz/invest','/ekodibiz/invest/projects','/ekodibiz/invest/ir','/ekodibiz/invest/connect','/ekodibiz/invest/programs','/ekodibiz/invest/admin']){
  const request=new Request('https://ekodi.kr'+path);
  const primary=await platform.fetch(request,{ENVIRONMENT:'test'},{});
  const fallback=await site.fetch(request,{ENVIRONMENT:'test'});
  for(const response of [primary,fallback]){
   assert.equal(response.status,410,path);
   assert.equal(response.headers.get('x-ekodi-route'),'invest-retired',path);
   assert.match(response.headers.get('cache-control'),/no-store/);
  }
 }
});
test('EKODIBIZ investment release probes require 410',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
 for(const path of ['/ekodibiz/invest','/ekodibiz/invest/admin']){
  const probe=manifest.worker.requests.find(x=>x.url==='https://ekodi.kr'+path);
  assert.ok(probe,path);assert.deepEqual(probe.statuses,[410]);assert.deepEqual(probe.expect,['Gone']);
 }
});
