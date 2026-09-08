import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
const requests=manifest.worker.requests;

test('apex Admin uses the new shell while rollback validates the prior stable shell',()=>{
  assert.equal(requests.some(item=>item.url==='https://ekodi.kr/admin'),false);
  const admin=requests.find(item=>item.url==='https://ekodi.kr/admin/');
  assert.ok(admin);
  assert.deepEqual(admin.statuses,[200]);
  assert.ok(admin.expect.includes('EKODI Admin'));
  assert.ok(admin.headerExpect.includes('x-ekodi-route: admin-shell'));
  assert.ok(admin.rollbackHeaderExpect.includes('x-ekodi-route: admin-fallback'));
});

test('legacy Admin host must converge to apex while rollback still proves the old stable host',()=>{
  const legacy=requests.find(item=>item.url==='https://admin.ekodi.kr/');
  assert.ok(legacy);
  assert.deepEqual(legacy.statuses,[200,308]);
  assert.deepEqual(legacy.expect,[]);
  assert.ok(legacy.headerExpect.includes('location: https://ekodi.kr/admin/?source=admin.ekodi.kr'));
  assert.ok(legacy.headerExpect.includes('x-ekodi-legacy-surface: admin.ekodi.kr'));
  assert.ok(legacy.rollbackExpect.includes('EKODI Admin'));
  assert.ok(legacy.rollbackHeaderExpect.includes('x-ekodi-route: admin-shell'));
});
