import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EKODIBIZ_ADMIN_SCOPES, ekodiBizAdminScopeForPath } from '../ekodibiz-admin-registry.js';
import platform from '../platform-router-entry-worker.js';
test('investment admin is removed from business site switches',()=>{
 assert.equal(EKODIBIZ_ADMIN_SCOPES.some(scope=>scope.id==='invest'),false);
 assert.equal(ekodiBizAdminScopeForPath('/ekodibiz/invest/admin'),'');
});
test('investment admin paths fail closed without an admin redirect',async()=>{
 for(const path of ['/ekodibiz/invest/admin','/ekodibiz/invest/admin/projects','/ekodibiz/invest/admin/ir']){
  const response=await platform.fetch(new Request('https://ekodi.kr'+path),{ENVIRONMENT:'test'},{});
  assert.equal(response.status,410);assert.equal(response.headers.get('location'),null);
 }
});
test('shared-site release verifies Invest admin retirement',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
 const probe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/ekodibiz/invest/admin');
 assert.ok(probe);assert.deepEqual(probe.statuses,[410]);
 assert.ok(probe.headerExpect.includes('x-ekodi-route: invest-retired'));
});
