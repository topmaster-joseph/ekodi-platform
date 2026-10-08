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

test('Control public preview smoke enforces the effective no-store edge policy on candidate and stable traffic', () => {
  const manifest = JSON.parse(readFileSync(new URL('../deploy/manifests/control-api.worker.json', import.meta.url), 'utf8'));
  const preview = manifest.worker.requests.find(item => item.url.includes('/api/public/preview/map?scope=ekodi&mode=platform'));
  assert.ok(preview, 'the canonical public preview must remain in the guarded smoke set');
  assert.ok(preview.headerExpect.includes('cache-control: no-store'));
  assert.ok(preview.candidateHeaderExpect.includes('cache-control: no-store'));
  assert.ok(preview.headerExpect.includes('x-content-type-options: nosniff'));
  assert.ok(preview.candidateHeaderExpect.includes('x-content-type-options: nosniff'));
  assert.ok(preview.expect.includes('"secrets":false'));
  assert.ok(preview.candidateExpect.includes('"personalData":false'));
  assert.ok(coordinator.includes("'deploy/manifests/control-api.worker.json'"));
});

test('approved merge explicitly schedules latest-main checks when GITHUB_TOKEN suppresses push triggers', () => {
  for (const filename of ['ci.yml', 'constitution-check.yml', 'device-control-windows.yml']) {
    const source = readFileSync(new URL('../.github/workflows/' + filename, import.meta.url), 'utf8');
    assert.match(source, /^on:\n  workflow_dispatch:/m, filename + ' must support exact-main explicit checks');
    assert.ok(coordinator.includes("'" + filename + "'"), filename + ' must be dispatched after guarded merge');
  }
  assert.ok(coordinator.includes("'device-agent-production-verification.yml/dispatches'"));
  assert.ok(coordinator.includes("'/git/ref/heads/main'"));
  assert.ok(coordinator.includes('liveMainSha!==expectedMainSha'));
  assert.ok(coordinator.includes("await dispatchPostMergeDeploys(String(merged.data.sha||''))"));
  assert.ok(coordinator.includes('receipt.data?.authorized!==true'), 'Orchestrator receipt remains required');
});

test('real-device verification derives merged main provenance and preserves the release receipt gate', () => {
  const source = readFileSync(new URL('../.github/workflows/device-agent-production-verification.yml', import.meta.url), 'utf8');
  assert.match(source, /workflow_dispatch:[\s\S]*?release_branch_ref:[\s\S]*?release_task_id:/);
  assert.ok(source.includes('commits/$GITHUB_SHA/pulls'));
  assert.ok(source.includes('branch" != "$merged_branch"'));
  assert.ok(source.includes('EKODI_RELEASE_TASK_ID=$derived_task'));
  assert.ok(source.includes('validate-ekodi-ai-change-orchestration.mjs" --release'));
  assert.ok(source.includes('pull-requests: read'));
});
