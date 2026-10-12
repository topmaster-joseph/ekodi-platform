import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const orchestration=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
const start=orchestration.indexOf('const sharedSiteTouched=');
const end=orchestration.indexOf('const churchPagesTouched=',start);
assert.ok(start>=0&&end>start,'shared-site deployment ownership clause exists');
const owner=orchestration.slice(start,end);

test('EKODI Orchestrator dispatches guarded Site Core for each shared homepage source asset',()=>{
  for(const asset of ['index.html','homepage-ambient.js','homepage-ambient.css']){
    assert.ok(owner.includes("'"+asset+"'"),'missing homepage asset '+asset);
    assert.ok(workflow.includes("'"+asset+"'"),'deploy workflow must own '+asset);
  }
});
test('merge receipt remains mandatory, and same official workflow deploys source on main',()=>{
  assert.match(orchestration,/if\(sharedSiteTouched\)\{/);
  assert.match(orchestration,/\/actions\/workflows\/deploy-site-core\.yml\/dispatches/);
  assert.match(orchestration,/release_branch_ref:branch,release_task_id:taskId/);
  assert.match(orchestration,/GITHUB_TOKEN merges do not trigger main push workflows/);
  assert.match(workflow,/release_branch_ref:/);
  assert.match(workflow,/release_task_id:/);
  assert.match(workflow,/refs\/heads\/main/);
});
