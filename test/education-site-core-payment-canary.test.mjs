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
 // Since #4733 (2026-10-15) the stable rollback target already redirects /pay to /ekodipay/,
 // so rollback must verify that live redirect, never the retired /pay/ hub surface.
 for(const probe of probes){
   assert.deepEqual(probe.rollbackStatuses,[308]);
   assert.ok(probe.rollbackHeaderExpect.includes('location: https://ekodi.kr/ekodipay/'));
   assert.ok(!probe.rollbackHeaderExpect.some(h=>h.includes('location: https://ekodi.kr/pay/')));
   assert.equal(probe.rollbackExpect,undefined);
 }
 assert.match(router,/url\.pathname==='\/pay'/);
 assert.match(router,/https:\/\/ekodi\.kr\/ekodipay\//);
 assert.match(router,/status:308/);
 assert.match(router,/status:410/);
 assert.match(router,/cache-control':'no-store'/);
});
