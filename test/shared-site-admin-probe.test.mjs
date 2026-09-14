import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
const compactCss=await readFile(new URL('../admin-compact.css',import.meta.url),'utf8');
test('shared-site release probes the canonical slash form of apex Admin',()=>{
  assert.equal(manifest.worker.requests.some(item=>item.url==='https://ekodi.kr/admin'),false);
  const admin=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/admin/');
  assert.ok(admin);
  assert.deepEqual(admin.statuses,[200]);
  assert.ok(admin.expect.includes('EKODI Admin'));
  assert.ok(admin.headerExpect.includes('x-ekodi-route: admin-shell'));
  assert.equal(admin.rollbackVerify,false);
});
test('shared-site compact CSS probe follows the live responsive breakpoint',()=>{
  const compact=manifest.worker.requests.find(item=>item.url==='https://admin.ekodi.kr/admin-compact.css?assist=v2');
  assert.ok(compact);
  assert.ok(compact.expect.includes('@media(max-width:760px)'));
  assert.ok(compactCss.includes('@media(max-width:760px)'));
  assert.equal(compact.expect.includes('@media(max-width:720px)'),false);
});