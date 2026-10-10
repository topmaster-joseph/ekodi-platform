import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const orchestrator=await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/deploy-cgma-apex-edge.yml',import.meta.url),'utf8');

test('orchestrator dispatches CGMA Apex after verified merge rather than relying on token-generated main pushes',()=>{
  assert.match(orchestrator,/const cgmaApexTouched=changedFiles\.includes\('\.github\/workflows\/deploy-cgma-apex-edge\.yml'\)/);
  assert.match(orchestrator,/if\(cgmaApexTouched\)\{/);
  assert.match(orchestrator,/\/actions\/workflows\/deploy-cgma-apex-edge\.yml\/dispatches/);
  assert.match(orchestrator,/ref:'main',inputs:\{release_branch_ref:branch,release_task_id:taskId\}/);
  assert.match(orchestrator,/CGMA Apex Edge deploy dispatch failed/);
  assert.doesNotMatch(orchestrator,/const cgmaApexTouched=changedFiles\.some\(file=>file\.startsWith\('sites\/'\)/);
  assert.match(orchestrator,/if\(p\?\.merged===true\)\{await dispatchPostMergeDeploys\(\)/);
});

test('CGMA production dispatch carries orchestrator receipt and never disables verification',()=>{
  assert.match(workflow,/workflow_dispatch:\s+inputs:\s+release_branch_ref:/);
  assert.match(workflow,/release_task_id:\s+description: 'Exact authorized EKODI task ID'/);
  assert.match(workflow,/EKODI_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref \|\| '' \}\}/);
  assert.match(workflow,/EKODI_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id \|\| '' \}\}/);
  assert.match(workflow,/github\.event_name != 'pull_request' && \(github\.event_name != 'workflow_dispatch'/);
  assert.equal((workflow.match(/validate-ekodi-ai-change-orchestration\.mjs\" --release/g)||[]).length,2);
  assert.match(workflow,/Verify EKODI Production account boundary/);
  assert.match(workflow,/deploy-site-core\.yml\/dispatches/);
  assert.match(workflow,/-f release_branch_ref="\$EKODI_RELEASE_BRANCH_REF"/);
  assert.match(workflow,/-f release_task_id="\$EKODI_RELEASE_TASK_ID"/);
  assert.match(workflow,/-f sync_domains=false/);
  assert.match(workflow,/Verify CGMA edge production/);
  assert.match(workflow,/check_board '\/cgma\/board'/);
});
