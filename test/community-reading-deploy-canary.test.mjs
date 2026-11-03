import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('guarded Community production release blocks /community/reading escape redirects',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/community.worker.json',import.meta.url),'utf8'));
  const probe=manifest.worker.requests.find(v=>v.url==='https://ekodi.kr/community/reading/');
  assert.ok(probe,'missing reading live canary');
  assert.deepEqual(probe.statuses,[200]);
  assert.equal(probe.redirect,'manual');
  assert.equal(probe.rollbackVerify,false);
  assert.ok(probe.expect.includes('함께읽기'));
  assert.ok(probe.expect.includes('/community/reading/app.js'));
});
