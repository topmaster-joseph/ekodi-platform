import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import platformEntry from '../platform-router-entry-worker.js';

test('public Invest service is absent from registries and has no discoverable entry',async()=>{
 const registry=JSON.parse(await readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'));
 assert.equal(registry.services.some(x=>x.id==='invest'),false);
 const manifest=await readFile(new URL('../ekodi-service-manifest.js',import.meta.url),'utf8');
 assert.doesNotMatch(manifest,/id:'invest'/);
});
test('legacy investment paths are permanently retired, never redirected to a public analysis gate',async()=>{
 for(const path of ['/invest','/invest/personal','/invest/stock','/invest/automation','/invest/admin','/invest/anything']){
  const response=await platformEntry.fetch(new Request('https://ekodi.kr'+path),{ENVIRONMENT:'test'},{});
  assert.equal(response.status,410,path);
  assert.equal(response.headers.get('location'),null,path);
  assert.match(response.headers.get('cache-control'),/no-store/);
 }
});
