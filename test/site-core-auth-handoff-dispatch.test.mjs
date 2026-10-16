import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const convergence=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const siteWorkflow=readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');

test('Admin token handoff change triggers guarded Site Core production dispatch',()=>{
  const start=convergence.indexOf('const sharedSiteTouched=');
  const end=convergence.indexOf('const churchPagesTouched=',start);
  assert.ok(start>=0&&end>start,'guarded Site Core dispatch block must exist');
  const scope=convergence.slice(start,end);
  assert.ok(scope.includes("file==='admin-central-handoff.js'"),'Admin login handoff must be included in site-core release scope');
  assert.ok(convergence.includes("if(sharedSiteTouched){"),'Site Core post-merge dispatch must be guarded');
  assert.ok(convergence.includes("release_branch_ref:branch,release_task_id:taskId"),'Site Core dispatch must retain task and branch receipt');
  assert.ok(siteWorkflow.includes("- 'admin-central-handoff.js'"),'Site Core must also listen to main push on auth-handoff changes');
  assert.ok(convergence.includes("if(!await verifiedCheckRuns(headSha))"),'Admin release ownership must preserve genuine Check Run convergence');
});
