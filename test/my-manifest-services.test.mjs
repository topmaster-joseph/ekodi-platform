import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('My worker derives services, SSO, targetability and priority from the canonical manifest',async()=>{
  const worker=await read('my-worker.js');
  assert.match(worker,/EKODI_SERVICE_MANIFEST/);
  assert.match(worker,/function visibleServices\(\)/);
  assert.match(worker,/service\.state!=='planned'/);
  assert.match(worker,/service\.openSso===true/);
  assert.match(worker,/service\.sso===true/);
  assert.match(worker,/service\.targetable===true/);
  assert.match(worker,/const SERVICES=/);
  assert.match(worker,/const OPEN_SSO_SITES=/);
  assert.match(worker,/const SSO_SITES=/);
  assert.match(worker,/const TARGETABLE_WORKSPACE_SITES=/);
  assert.match(worker,/const WORKSPACE_ENTRY_PRIORITY=/);
  assert.match(worker,/x-ekodi-my-services/,'manifest bridge response marker');
});

test('A future active manifest service requires no hardcoded My app edit',async()=>{
  const worker=await read('my-worker.js');
  const app=await read('my/app.js');
  const active=EKODI_SERVICE_MANIFEST.services.filter(service=>service.id!=='my'&&service.state!=='planned');
  assert.ok(active.length>=10);
  assert.match(worker,/source\.replace\(block,myServicePreamble\(\)\)/);
  assert.match(worker,/pathname==='\/app\.js'/);
  assert.match(worker,/\/service-manifest\.json/);
  // The static app may keep a bootstrap catalog for resilience; runtime is authoritative.
  assert.match(app,/const SERVICES=/);
});

test('Open SSO is declared centrally and can grow without a My-only allowlist edit',()=>{
  const open=EKODI_SERVICE_MANIFEST.services.filter(service=>service.openSso===true);
  const ids=open.map(service=>service.id).sort();
  for(const required of ['edu','energy','messenger','social'])assert.ok(ids.includes(required),required);
  for(const service of open){
    assert.equal(service.sso,true,`${service.id} openSso requires central SSO`);
    assert.notEqual(service.state,'planned',`${service.id} openSso cannot be planned`);
  }
});

test('Only planned services stay out of My while Education is active',()=>{
  const planned=EKODI_SERVICE_MANIFEST.services.filter(service=>service.state==='planned').map(service=>service.id);
  assert.ok(!planned.includes('edu'));
  assert.ok(planned.includes('media'));
  const education=EKODI_SERVICE_MANIFEST.services.find(service=>service.id==='edu');
  assert.equal(education?.openSso,true);
  assert.equal(education?.authMode,'client');
});
