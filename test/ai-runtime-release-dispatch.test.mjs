import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('orchestrated merge dispatches both AI and shared-site runtimes for central Admin fix', () => {
  const source=text('scripts/converge-orchestrated-pr-merge.mjs');
  assert.match(source, /const aiControlTouched=changedFiles\.some/);
  assert.match(source, /file==='ai-control-worker\.js'/);
  assert.match(source, /file==='common-services-admin\.js'/);
  assert.match(source, /if\(aiControlTouched\)\{/);
  assert.match(source, /\/actions\/workflows\/deploy-ai-control\.yml\/dispatches/);
  assert.match(source, /if\(sharedSiteTouched\)\{/);
  assert.match(source, /\/actions\/workflows\/deploy-site-core\.yml\/dispatches/);
  assert.match(source, /release_branch_ref:branch,release_task_id:taskId/);
});

test('AI Control workflow allows production only with orchestrator release inputs on dispatch', () => {
  const source=text('.github/workflows/deploy-ai-control.yml');
  assert.match(source, /workflow_dispatch:\s+inputs:/);
  assert.match(source, /EKODI_RELEASE_BRANCH_REF:.*inputs\.release_branch_ref/);
  assert.match(source, /EKODI_RELEASE_TASK_ID:.*inputs\.release_task_id/);
  assert.match(source, /deploy-production:\s+if:.*github\.ref == 'refs\/heads\/main'.*inputs\.release_branch_ref != '' && inputs\.release_task_id != ''/);
  assert.match(source, /validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(source, /needs: \[validate, deploy-staging\]/);
});
