import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const orchestrator=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8');
const predicate=orchestrator.slice(
  orchestrator.indexOf('const controlApiTouched='),
  orchestrator.indexOf('const marketingGrowthTouched=')
);

test('LANG-UI-001 public language publication authority is owned by guarded Control API release',()=>{
  for(const file of ['language-automation.js','config/language-registry.js','config/managed-language-sites.js']){
    assert.ok(predicate.includes("'"+file+"'"),'missing Control API release owner for '+file);
    assert.ok(workflow.includes("'"+file+"'"),'missing push/PR fallback for '+file);
  }
});
test('a GITHUB_TOKEN source merge must invoke the trusted Control API dispatcher and receipt',()=>{
  assert.match(orchestrator,/if\(controlApiTouched\)\{/);
  assert.match(orchestrator,/\/actions\/workflows\/deploy-control-api\.yml\/dispatches/);
  assert.match(orchestrator,/release_branch_ref:branch,release_task_id:taskId/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/release_branch_ref:/);
  assert.match(workflow,/release_task_id:/);
});
