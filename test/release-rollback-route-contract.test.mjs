import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
const requests=manifest.worker.requests;
const probe=path=>requests.find(item=>item.url==='https://ekodi.kr'+path);
test('Pay rollback verifies the currently deployed canonical redirect without bypassing rollback',()=>{
 for(const path of ['/pay','/pay/']){
  const entry=probe(path);
  assert.ok(entry,path);
  assert.deepEqual(entry.statuses,[308]);
  assert.deepEqual(entry.rollbackStatuses,[308]);
  assert.notEqual(entry.rollbackVerify,false);
  assert.ok(entry.headerExpect?.includes('location: https://ekodi.kr/ekodipay/'));
  assert.ok(entry.rollbackHeaderExpect?.includes('location: https://ekodi.kr/ekodipay/'));
  assert.ok(!entry.rollbackExpect?.length,'Redirect has no HTML body to inspect');
 }
});
test('Cooperative administration still requires no-store and route headers, hub does not permit caching',()=>{
 for(const slug of ['jubilee-distribution','open-distribution']){
  const admin=probe('/'+slug+'/admin');
  assert.ok(admin?.headerExpect?.includes('x-ekodi-route: cooperative-admin'));
  assert.ok(admin?.headerExpect?.some(marker=>marker.includes('no-store')));
 }
 const hub=probe('/business-coop/');
 assert.ok(hub?.headerExpect?.includes('cache-control: no-store'));
 assert.notEqual(hub?.rollbackVerify,true,'Candidate-only cooperative hub must not invalidate existing rollback');
});
