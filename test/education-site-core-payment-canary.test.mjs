import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('canonical Pay 308 canaries retain explicit verified stable rollback requirements',async()=>{
 const [text,router]=await Promise.all([read('deploy/manifests/shared-site.worker.json'),read('platform-router-entry-worker.js')]);
 const manifest=JSON.parse(text);
 const probes=manifest.worker.requests.filter(x=>['https://ekodi.kr/pay','https://ekodi.kr/pay/'].includes(x.url));
 assert.equal(probes.length,2);
 for(const probe of probes){
   assert.deepEqual(probe.statuses,[308]);
   assert.equal(probe.redirect,'manual');
   assert.deepEqual(probe.expect,[]);
   assert.ok(probe.headerExpect.includes('location: https://ekodi.kr/ekodipay/'));
   assert.notEqual(probe.rollbackVerify,false,'Stable rollback checks must not be bypassed');
 }
 // Both live and stable fallback URLs must use the current canonical payment hub.
 // Do not skip rollback checks or accept the superseded /pay page as a successful rollback.
 for(const probe of probes){
   assert.deepEqual(probe.rollbackStatuses,[308]);
   assert.deepEqual(probe.rollbackExpect,[]);
   assert.ok(probe.rollbackHeaderExpect.includes('location: https://ekodi.kr/ekodipay/'));
   assert.ok(probe.rollbackHeaderExpect.includes('cache-control: no-store'));
   assert.notEqual(probe.rollbackVerify,false);
 }
 assert.match(router,/url\.pathname==='\/pay'/);
 assert.match(router,/https:\/\/ekodi\.kr\/ekodipay\//);
 assert.match(router,/status:308/);
 assert.match(router,/status:410/);
 assert.match(router,/cache-control':'no-store'/);
});
