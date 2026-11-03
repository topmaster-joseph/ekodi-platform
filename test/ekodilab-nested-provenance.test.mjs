import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Lab nested guarded Pages release inherits receipt without bypassing the release gate',async()=>{
  const workflow=(await readFile('.github/workflows/deploy-ekodi-lab-homepage.yml','utf8')).replace(/\r\n/g,'\n');
  const start=workflow.indexOf('  deploy:\n');
  const end=workflow.indexOf('    steps:\n',start);
  assert.ok(start>=0&&end>start,'deploy job contract found');
  const job=workflow.slice(start,end);
  assert.match(job,/if: github\.event_name == 'workflow_dispatch'/);
  assert.match(job,/environment: production/);
  assert.match(job,/EKODI_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref \|\| '' \}\}/);
  assert.match(job,/EKODI_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id \|\| '' \}\}/);
  const gate=workflow.slice(end);
  assert.match(gate,/validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(gate,/node scripts\/guarded-pages-release\.mjs/);
  const controller=await readFile('scripts/guarded-pages-release.mjs','utf8');
  assert.match(controller,/runChangeOrchestrationGate\(\);/);
  assert.match(controller,/env: process\.env/);
});
