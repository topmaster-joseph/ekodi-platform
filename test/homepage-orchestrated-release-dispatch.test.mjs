import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const orchestrator=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');

test('LANG-UI-001 homepage assets belong to the guarded post-merge Site Core dispatch',()=>{
  const start=orchestrator.indexOf('const sharedSiteTouched=');
  const end=orchestrator.indexOf('const churchPagesTouched=',start);
  assert.ok(start>=0&&end>start,'Site Core dispatch predicate exists');
  const ownership=orchestrator.slice(start,end);
  for(const file of ['index.html','homepage-ambient.js','homepage-ambient.css']){
    assert.ok(ownership.includes("'"+file+"'"),`missing guarded Site Core dispatch for ${file}`);
  }
  assert.match(orchestrator,/if\(sharedSiteTouched\)\{/);
  assert.match(orchestrator,/\/actions\/workflows\/deploy-site-core\.yml\/dispatches/);
  assert.match(orchestrator,/release_branch_ref:branch,release_task_id:taskId/);
});

test('LANG-UI-001 homepage edits also stay in the guarded direct main-push fallback',()=>{
  for(const file of ['homepage-ambient.js','homepage-ambient.css']){
    assert.ok(workflow.includes("'"+file+"'"),`missing push trigger for ${file}`);
  }
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/release_task_id:/);
  assert.match(workflow,/release_branch_ref:/);
});
