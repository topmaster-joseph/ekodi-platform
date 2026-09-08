import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/ekodibiz.worker.json',import.meta.url),'utf8'));
const workflow=await readFile(new URL('../.github/workflows/deploy-ekodibiz.yml',import.meta.url),'utf8');

test('EKODIBIZ root defers only the 0% asset bootstrap probe',()=>{
  const root=manifest.worker.requests.find(item=>item.url==='https://biz.ekodi.kr/');
  assert.ok(root);
  assert.equal(root.candidateVerify,false);
  assert.match(root.candidateVerifyReason||'',/run_worker_first bootstrap/);
  assert.deepEqual(root.expect,['EKODIBIZ','WHAT WE DO']);
  for(const marker of ['EKODIBIZ','data-ekodi-service="biz"','data-ekodi-user-surface="public"']) assert.ok(root.rollbackExpect.includes(marker));
  assert.ok(workflow.includes("grep -Fq 'WHAT WE DO'"));
});

test('new EKODIBIZ APIs wait for promoted run_worker_first routing without weakening post-promotion checks',()=>{
  for(const path of ['/api/health','/api/catalog','/api/runtime','/api/ops/status']){
    const probe=manifest.worker.requests.find(item=>new URL(item.url).pathname===path);
    assert.ok(probe,`missing ${path}`);
    assert.equal(probe.candidateVerify,false,`${path} must defer 0% custom-domain smoke`);
    assert.match(probe.candidateVerifyReason||'',/run_worker_first bootstrap/);
    assert.equal(probe.rollbackVerify,false,`${path} must not make rollback depend on a newly introduced API`);
    assert.ok(Array.isArray(probe.expect)&&probe.expect.length>0,`${path} must retain strict post-promotion markers`);
  }
  for(const marker of ['operational-mvp','approval-gated','durable-object-sqlite','행사 완성팩','finance_gatekeeper']) assert.ok(workflow.includes(marker),`workflow must retain ${marker}`);
});