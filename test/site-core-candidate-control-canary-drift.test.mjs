import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('production Control candidate probes current owner-confirmed Control JS paths, not retired pulse marker',async()=>{
  const [manifestText,control]=await Promise.all([
    read('deploy/manifests/shared-site.worker.json'),read('control.js'),
  ]);
  const manifest=JSON.parse(manifestText);
  const probes=manifest.worker.requests.filter(r=>r.url==='https://ekodi.kr/control.js');
  assert.equal(probes.length,1,'canonical Control JS canary must be unique');
  const probe=probes[0];
  assert.deepEqual(probe.statuses,[200]);
  assert.ok(probe.headerExpect.includes('cache-control: no-store'));
  assert.ok(probe.headerExpect.includes('x-ekodi-route: control-surface'));
  assert.ok(probe.headerExpect.includes('x-ekodi-canonical-surface: control'));
  assert.deepEqual(probe.expect,[
    '/api/control/ai/v8/sovereignty/preview',
    '/api/control/ai/assist',
    'control-surface',
  ]);
  for(const marker of probe.expect){
    assert.ok(control.includes(marker),'canary marker absent in current source: '+marker);
  }
  assert.ok(!control.includes('/api/control/ai/v8/pulse'),'retired marker should not be reintroduced into unrelated Control UI');
});

test('unrelated Pay legacy stable rollback stays strictly protected; never disable verification to hide a rollback error',async()=>{
  const manifest=JSON.parse(await read('deploy/manifests/shared-site.worker.json'));
  const bare=manifest.worker.requests.find(r=>r.url==='https://ekodi.kr/pay');
  const slash=manifest.worker.requests.find(r=>r.url==='https://ekodi.kr/pay/');
  for(const route of [bare,slash]){
    assert.ok(route,'Pay legacy route missing');
    assert.deepEqual(route.statuses,[308]);
    assert.ok(route.headerExpect.includes('location: https://ekodi.kr/ekodipay/'));
    assert.notEqual(route.rollbackVerify,false);
  }
  assert.deepEqual(bare.rollbackStatuses,[308]);
  assert.ok(bare.rollbackHeaderExpect.includes('location: https://ekodi.kr/pay/'));
  assert.deepEqual(slash.rollbackStatuses,[200]);
  assert.ok(slash.rollbackExpect.includes("title:'EKODI Pay'"));
  assert.ok(slash.rollbackHeaderExpect.includes('x-ekodi-canonical-path: /pay'));
});

test('Cheonggye Pass rollback and script canaries remain intact while Control manifest changes',async()=>{
  const manifest=JSON.parse(await read('deploy/manifests/shared-site.worker.json'));
  for(const url of [
    'https://ekodi.kr/cheonggye/local-region-admin-auth.js',
    'https://ekodi.kr/cheonggye/cheonggyepass-vendor-intake-ui.js',
  ]){
    const p=manifest.worker.requests.find(r=>r.url===url);
    assert.ok(p,url);
    assert.ok(p.expect.includes('const __name=(target,value)=>Object.defineProperty'));
    assert.ok(p.headerExpect.includes('cache-control: no-store'));
    assert.ok(p.headerExpect.includes('x-content-type-options: nosniff'));
  }
});
