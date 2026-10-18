import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
const router=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
const pay=manifest.worker.requests.filter(r=>r.url==='https://ekodi.kr/pay'||r.url==='https://ekodi.kr/pay/');

test('/pay and /pay/ are canonical 308 redirects to /ekodipay/ in the shared router',()=>{
  assert.match(router,/url\.pathname==='\/pay'\|\|url\.pathname==='\/pay\/'/);
  assert.match(router,/status:308,headers:\{location:'https:\/\/ekodi\.kr\/ekodipay\/'/);
});

test('rollback verification for /pay cannot expect the retired /pay/ hub surface',()=>{
  assert.equal(pay.length,2);
  for(const r of pay){
    assert.deepEqual(r.statuses,[308]);
    assert.ok(r.headerExpect.includes('location: https://ekodi.kr/ekodipay/'));
    const rollbackStatuses=r.rollbackStatuses||r.statuses;
    const rollbackHeaders=r.rollbackHeaderExpect||r.headerExpect;
    assert.deepEqual(rollbackStatuses,[308],r.url+' rollback must expect the live 308 redirect');
    assert.ok(rollbackHeaders.includes('location: https://ekodi.kr/ekodipay/'),r.url+' rollback must expect /ekodipay/');
    assert.ok(!rollbackHeaders.some(h=>h.includes('location: https://ekodi.kr/pay/')),r.url+' stale /pay/ rollback marker');
    assert.equal(r.rollbackExpect,undefined,r.url+' stale /pay hub body rollback marker');
  }
});
