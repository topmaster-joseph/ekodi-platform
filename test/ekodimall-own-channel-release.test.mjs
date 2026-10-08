import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const coordinator = readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/deploy-ekodi-mall.yml', import.meta.url), 'utf8');

test('Mall Pages release is dispatched by the verified EKODI merger, with the same receipt', () => {
  assert.ok(coordinator.includes('receipt.data?.authorized!==true'));
  assert.ok(coordinator.includes('const mallSiteTouched=changedFiles.some'));
  assert.ok(coordinator.includes('file.startsWith(\'sites/ekodi-mall/\')'));
  assert.ok(coordinator.includes("'/actions/workflows/deploy-ekodi-mall.yml/dispatches'"));
  assert.ok(coordinator.includes("inputs:{release_branch_ref:branch,release_task_id:taskId}"));
  assert.ok(coordinator.includes("merged.data?.merged===true"));
});

test('Mall release workflow requires orchestrator receipt on manual production dispatch', () => {
  const dispatch = workflow.slice(workflow.indexOf('  workflow_dispatch:'), workflow.indexOf('\npermissions:'));
  assert.match(dispatch, /release_branch_ref:[\s\S]*?required: true/);
  assert.match(dispatch, /release_task_id:[\s\S]*?required: true/);
  assert.equal((workflow.match(/EKODI_RELEASE_BRANCH_REF:/g) || []).length, 2);
  assert.equal((workflow.match(/EKODI_RELEASE_TASK_ID:/g) || []).length, 2);
  assert.equal((workflow.match(/validate-ekodi-ai-change-orchestration\.mjs" --release/g) || []).length, 2);
  assert.match(workflow, /github\.event_name != 'pull_request'/);
  assert.match(workflow, /CLOUDFLARE_DEVELOPMENT_API_TOKEN/);
});
