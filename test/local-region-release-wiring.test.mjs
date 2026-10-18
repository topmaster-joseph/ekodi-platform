import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localRegionAdminAuthScript } from '../local-region-admin-auth.js';
import { cheonggyePassVendorIntakeScript } from '../cheonggyepass-vendor-intake-ui.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Shared Site Core guarded deploy is retriggered by every standalone regional script, not just shell changes',async()=>{
  const workflow=await read('.github/workflows/deploy-site-core.yml');
  const [pushSection]=workflow.split(/^\s{2}(?:pull_request|jobs):/m);
  assert.match(pushSection,/push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(pushSection,/'\.github\/workflows\/deploy-site-core\.yml'/);
  for(const name of [
    'local-region-admin-auth.js','cheonggyepass-vendor-intake-ui.js',
    'local-region-access-admin.js','local-region-operations-admin.js',
    'local-region-module-admin.js','local-region-module-public.js',
    'local-region-forest-admin.js','local-region-forest-public.js',
  ]){
    assert.ok(pushSection.includes("      - '"+name+"'"),name+' missing from guarded main push trigger');
  }
  assert.match(workflow,/native_surface_verification_desktop:/);
  assert.match(workflow,/native_surface_verification_mobile:/);
  assert.match(workflow,/release_branch_ref:/);
  assert.match(workflow,/release_task_id:/);
});

test('production canary inspects both independently served Cheonggye Pass scripts for name shim',async()=>{
  const manifest=JSON.parse(await read('deploy/manifests/shared-site.worker.json'));
  for(const [url,make] of [
    ['https://ekodi.kr/cheonggye/local-region-admin-auth.js',localRegionAdminAuthScript],
    ['https://ekodi.kr/cheonggye/cheonggyepass-vendor-intake-ui.js',cheonggyePassVendorIntakeScript],
  ]){
    const probes=manifest.worker.requests.filter(x=>x.url===url);
    assert.equal(probes.length,1,url);
    const probe=probes[0];
    assert.deepEqual(probe.statuses,[200],url);
    assert.ok(probe.expect.includes('const __name=(target,value)=>Object.defineProperty'),url);
    assert.ok(probe.headerExpect.includes('cache-control: no-store'),url);
    assert.ok(probe.headerExpect.includes('x-content-type-options: nosniff'),url);
    assert.equal(probe.rollbackVerify,false,url);
    const response=make();
    assert.equal(response.status,200);
    const js=await response.text();
    for(const excerpt of probe.expect){
      assert.ok(js.includes(excerpt),url+' missing expected substring: '+excerpt);
    }
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  }
});
