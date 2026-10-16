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
 const oldBare=probes.find(x=>x.url==='https://ekodi.kr/pay');
 const oldSlash=probes.find(x=>x.url==='https://ekodi.kr/pay/');
 assert.deepEqual(oldBare.rollbackStatuses,[308]);
 assert.ok(oldBare.rollbackHeaderExpect.includes('location: https://ekodi.kr/pay/'));
 assert.deepEqual(oldSlash.rollbackStatuses,[200]);
 assert.ok(oldSlash.rollbackExpect.includes("title:'EKODI Pay'"));
 assert.ok(oldSlash.rollbackHeaderExpect.includes('x-ekodi-canonical-path: /pay'));
 assert.match(router,/url\.pathname==='\/pay'/);
 assert.match(router,/https:\/\/ekodi\.kr\/ekodipay\//);
 assert.match(router,/status:308/);
 assert.match(router,/status:410/);
 assert.match(router,/cache-control':'no-store'/);
});
