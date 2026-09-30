import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/ekodibiz.worker.json',import.meta.url),'utf8'));
const workflow=await readFile(new URL('../.github/workflows/deploy-ekodibiz.yml',import.meta.url),'utf8');

test('EKODIBIZ root defers only the 0% asset bootstrap probe',()=>{
  const root=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/ekodibiz');
  assert.ok(root);
  assert.equal(root.candidateVerify,false);
  assert.match(root.candidateVerifyReason||'',/canonical ekodi\.kr gateway/);
  assert.deepEqual(root.expect,['EKODIBIZ','WHAT WE DO']);
  for(const marker of ['EKODIBIZ','WHAT WE DO']) assert.ok(root.rollbackExpect.includes(marker));
  assert.ok(workflow.includes("grep -Fq 'WHAT WE DO'"));
});

test('new EKODIBIZ APIs wait for promoted canonical service binding without weakening post-promotion checks',()=>{
  for(const path of ['/api/health','/api/catalog','/api/runtime','/api/ops/status']){
    const probe=manifest.worker.requests.find(item=>new URL(item.url).pathname.endsWith(path));
    assert.ok(probe,`missing ${path}`);
    assert.equal(probe.candidateVerify,false,`${path} must defer 0% service-binding smoke`);
    assert.match(probe.candidateVerifyReason||'',/canonical ekodi\.kr gateway/);
    assert.equal(probe.rollbackVerify,false,`${path} must not make rollback depend on a newly introduced API`);
    assert.ok(Array.isArray(probe.expect)&&probe.expect.length>0,`${path} must retain strict post-promotion markers`);
  }
  for(const marker of ['operational-mvp','approval-gated','durable-object-sqlite','행사 완성팩','finance_gatekeeper']) assert.ok(workflow.includes(marker),`workflow must retain ${marker}`);
});