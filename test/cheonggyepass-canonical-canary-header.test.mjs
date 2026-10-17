import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Cheonggye Pass protected Control API canary honors normalized no-store cache security',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/control-api.worker.json',import.meta.url),'utf8'));
  const requests=manifest.worker.requests.filter(req=>req.url==='https://ekodi.kr/api/cheonggyepass/vendor-intake');
  assert.equal(requests.length,1);
  const probe=requests[0];
  assert.deepEqual(probe.statuses,[401]);
  assert.ok(probe.expect.includes('REGION_AUTH_REQUIRED'));
  assert.ok(probe.headerExpect.includes('cache-control: no-store'));
  assert.ok(probe.headerExpect.includes('x-content-type-options: nosniff'));
  assert.equal(probe.candidateVerify,false);
  assert.equal(probe.rollbackVerify,false);
  assert.ok(!probe.headerExpect.some(header=>/private,\s*no-store/i.test(header)));
  assert.ok(!probe.headerExpect.some(header=>/public|max-age/i.test(header)));
});

test('Pass worker still sends private uncachable JSON even when canonical proxy normalizes header',async()=>{
  const { handleCheonggyePassVendorIntake } = await import('../cheonggyepass-vendor-intake.js');
  const result=await handleCheonggyePassVendorIntake(new Request('https://ekodi.kr/api/cheonggyepass/vendor-intake'),{});
  assert.equal(result.status,503);
  assert.equal(result.headers.get('cache-control'),'private, no-store');
  assert.equal(result.headers.get('x-content-type-options'),'nosniff');
  const body=await result.json();
  assert.equal(body.code,'INTAKE_DATABASE_UNAVAILABLE');
});
