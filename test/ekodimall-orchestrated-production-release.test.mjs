import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const coordinator = readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url), 'utf8');
const control = readFileSync(new URL('../.github/workflows/deploy-control-api.yml', import.meta.url), 'utf8');
const growth = readFileSync(new URL('../.github/workflows/deploy-marketing-growth.yml', import.meta.url), 'utf8');

test('verified Mall merge dispatches both production services with the same orchestrator receipt', () => {
  assert.ok(coordinator.includes('receipt.data?.authorized!==true'));
  assert.ok(coordinator.includes('const controlApiTouched=changedFiles.some'));
  assert.ok(coordinator.includes('const marketingGrowthTouched=changedFiles.some'));
  for (const workflow of ['deploy-control-api.yml', 'deploy-marketing-growth.yml']) {
    assert.ok(coordinator.includes('/actions/workflows/' + workflow + '/dispatches'));
  }
  assert.ok(coordinator.split('inputs:{release_branch_ref:branch,release_task_id:taskId}').length - 1 >= 4);
  assert.ok(coordinator.includes('merged.data?.merged===true'));
  assert.ok(!coordinator.includes("file==='scripts/converge-orchestrated-pr-merge.mjs'||"));
});

test('manual release inputs require both task fields and Growth gate receives them', () => {
  for (const source of [control, growth]) {
    const start = source.indexOf('  workflow_dispatch:');
    const end = source.indexOf('  push:', start);
    assert.ok(start >= 0 && end > start);
    const inputs = source.slice(start, end);
    assert.match(inputs, /release_branch_ref:[\s\S]*?required: true/);
    assert.match(inputs, /release_task_id:[\s\S]*?required: true/);
    assert.ok(source.includes('validate-ekodi-ai-change-orchestration.mjs" --release'));
  }
  assert.ok(growth.includes('EKODI_RELEASE_BRANCH_REF:'));
  assert.ok(growth.includes('EKODI_RELEASE_TASK_ID:'));
  assert.ok(growth.includes('group: ekodi-control-api-release-production'));
  assert.ok(control.includes('ekodi-control-api-release-'));
  assert.ok(growth.includes('paidActivation:false'));
});
