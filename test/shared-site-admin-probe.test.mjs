import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
const requests=manifest.worker.requests;

test('shared-site release probes canonical apex Admin and old stable rollback contract',()=>{
  assert.equal(requests.some(item=>item.url==='https://ekodi.kr/admin'),false);
  const admin=requests.find(item=>item.url==='https://ekodi.kr/admin/');
  assert.ok(admin);
  assert.deepEqual(admin.statuses,[200]);
  assert.ok(admin.expect.includes('EKODI Admin'));
  assert.ok(admin.headerExpect.includes('x-ekodi-route: admin-shell'));
  assert.ok(admin.rollbackHeaderExpect.includes('x-ekodi-route: admin-fallback'));
});

test('legacy Admin probes follow the canonical redirect during candidate verification',()=>{
  const legacy=requests.filter(item=>item.url.startsWith('https://admin.ekodi.kr/'));
  assert.ok(legacy.length>=10);
  for(const probe of legacy){
    assert.equal(probe.redirect,'follow',probe.url);
    assert.deepEqual(probe.statuses,[200],probe.url);
  }
});
