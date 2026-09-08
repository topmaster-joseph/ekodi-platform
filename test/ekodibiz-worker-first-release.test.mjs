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
