import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import siteWorker from '../platform-router-entry-worker.js';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('guarded /pay legacy probes match exact safe 308 to canonical /ekodipay without financial execution',async()=>{
  const [manifestText,router]=await Promise.all([
    read('deploy/manifests/shared-site.worker.json'),read('platform-router-entry-worker.js')
  ]);
  const manifest=JSON.parse(manifestText);
  const probes=manifest.worker.requests.filter(x=>['https://ekodi.kr/pay','https://ekodi.kr/pay/'].includes(x.url));
  assert.equal(probes.length,2);
  for(const probe of probes){
    assert.deepEqual(probe.statuses,[308]);
    assert.equal(probe.redirect,'manual');
    assert.deepEqual(probe.expect,[]);
    assert.ok(probe.headerExpect.includes('location: https://ekodi.kr/ekodipay/'));
    assert.ok(probe.headerExpect.includes('cache-control: no-store'));
    assert.ok(probe.headerExpect.includes('x-content-type-options: nosniff'));
    assert.equal(probe.rollbackVerify,false,
      'Legacy payment redirect canaries must not invalidate rollback to the previous stable routing contract');
  }
  assert.match(router,/url\.pathname==='\/pay'/);
  assert.match(router,/https:\/\/ekodi\.kr\/ekodipay\//);
  assert.match(router,/status:308/);
  assert.match(router,/status:410/);
  assert.match(router,/cache-control':'no-store'/);
  assert.doesNotMatch(manifestText,/location: https:\/\/ekodi\.kr\/pay\//);
});
