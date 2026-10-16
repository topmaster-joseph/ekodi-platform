import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('Church Pastor API production deployment requires EKODI release receipt and staged checks',async()=>{
  const workflow=await read('.github/workflows/deploy-church-pastor-api.yml');
  assert.match(workflow,/workflow_dispatch:\s+inputs:/);
  assert.match(workflow,/release_branch_ref:/);
  assert.match(workflow,/release_task_id:/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/EKODI_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref \}\}/);
  assert.match(workflow,/EKODI_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id \}\}/);
  assert.match(workflow,/validate-ekodi-ai-change-orchestration\.mjs --release/);
  assert.match(workflow,/STAGING_PROJECT_REF: lxcxwbdwwojjkgybbqii/);
  assert.match(workflow,/PROJECT_REF: renzehysxirjilvdxacv/);
  assert.ok(workflow.indexOf('Stage Church API')<workflow.indexOf('Deploy canonical Church API'));
  assert.match(workflow,/\.error == "AUTH_REQUIRED"/);
  assert.match(workflow,/\.error == "ORIGIN_NOT_ALLOWED"/);
  assert.match(workflow,/--no-verify-jwt/,'preserve existing custom Auth boundary');
  assert.doesNotMatch(workflow,/secrets\.SUPABASE_SERVICE_ROLE_KEY/);
});
test('EKODI convergence dispatches API release only on relevant source change',async()=>{
  const script=await read('scripts/converge-orchestrated-pr-merge.mjs');
  assert.match(script,/const churchApiTouched=changedFiles\.some\(/);
  assert.match(script,/file\.startsWith\('supabase\/functions\/church-pastor-api\/'\)/);
  assert.match(script,/if\(churchApiTouched\)/);
  assert.match(script,/actions\/workflows\/deploy-church-pastor-api\.yml\/dispatches/);
  assert.match(script,/release_branch_ref:branch,release_task_id:taskId/);
});
