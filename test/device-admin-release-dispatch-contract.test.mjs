import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const assets = [
  'device-control-admin.js',
  'device-control-admin.css',
  'remote-power-admin.js',
  'remote-power-admin.css',
  'device-wake-admin.js',
];

test('shared-site Orchestrator dispatch includes all device roster and remote power assets', async () => {
  const script = await read('scripts/converge-orchestrated-pr-merge.mjs');
  const segment = script.slice(script.indexOf('const sharedSiteTouched='), script.indexOf('async function dispatchPostMergeDeploys()'));
  assert.ok(segment.startsWith('const sharedSiteTouched='));
  for (const asset of assets) assert.ok(segment.includes("'" + asset + "'"), 'missing shared-site asset mapping ' + asset);
  assert.match(script, /if\(sharedSiteTouched\)/);
  assert.match(script, /actions\/workflows\/deploy-site-core\.yml\/dispatches/);
  assert.match(script, /release_branch_ref:branch,release_task_id:taskId/);
});

test('push fallback covers exactly the same shared-site Device Control assets', async () => {
  const workflow = await read('.github/workflows/deploy-site-core.yml');
  const paths = workflow.slice(workflow.indexOf('  push:'), workflow.indexOf('\npermissions:'));
  assert.ok(paths.includes('    paths:'));
  for (const asset of assets) assert.ok(paths.includes("      - '" + asset + "'"), 'missing push deploy path ' + asset);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
});

test('only guarded shared-site core owns device admin asset production', async () => {
  const workflow = await read('.github/workflows/deploy-site-core.yml');
  const script = await read('scripts/converge-orchestrated-pr-merge.mjs');
  assert.match(script, /releaseBranchRef|release_branch_ref:branch/);
  assert.match(workflow, /EKODI AI Orchestration Gate/);
  assert.match(workflow, /guarded-worker-release\.mjs/);
  for (const marker of ['function rosterGroupKey(device)', '.device-roster-group', 'selectedAgentId', 'device-wake-group']) {
    assert.ok(workflow.includes(marker), 'production asset verification missing: ' + marker);
  }
  assert.match(workflow, /DEVICE-UI-RELEASE/);
});

test('admin menu ownership changes always dispatch guarded shared-site release', async () => {
  const script = await read('scripts/converge-orchestrated-pr-merge.mjs');
  const workflow = await read('.github/workflows/deploy-site-core.yml');
  const segment = script.slice(script.indexOf('const sharedSiteTouched='), script.indexOf('async function dispatchPostMergeDeploys()'));
  const assets = ['admin-menu-registry.js','admin-sidebar.js','admin-canonical-routes.js','admin-menu-layout.js','admin-menu-runtime.js','admin-design-engine.js','config/design-engine.json','config/admin-role-navigation.json'];
  for (const asset of assets) {
    assert.ok(segment.includes("'" + asset + "'"), 'missing orchestrator site-core ownership for ' + asset);
    if (['admin-menu-registry.js','admin-sidebar.js','admin-menu-layout.js','admin-menu-runtime.js','admin-design-engine.js','config/design-engine.json'].includes(asset))
      assert.ok(workflow.includes("'" + asset + "'"), 'missing GitHub push fallback ownership for ' + asset);
  }
  assert.match(script, /release_branch_ref:branch,release_task_id:taskId/);
});

test('EKODI native hybrid admin browser is always released via guarded Site Core after owner-approved merge', async () => {
  const script = await read('scripts/converge-orchestrated-pr-merge.mjs');
  const workflow = await read('.github/workflows/deploy-site-core.yml');
  const segment = script.slice(script.indexOf('const sharedSiteTouched='), script.indexOf('async function dispatchPostMergeDeploys()'));
  assert.ok(segment.includes("file==='hybrid-execution-admin.js'"), 'hybrid native browser admin must trigger protected Site Core deploy');
  assert.ok(workflow.includes("- 'hybrid-execution-admin.js'"), 'native hybrid admin asset must be covered by push fallback');
  assert.match(script, /if\(sharedSiteTouched\)/);
  assert.match(script, /release_branch_ref:branch,release_task_id:taskId/);
  const admin = await read('hybrid-execution-admin.js');
  assert.ok(admin.includes("id=\"enqueueHybridCgmaBoard\""), 'native CGMA button must exist in released asset');
  assert.ok(admin.includes("taskType:'computer.browser.execute'"), 'CGMA action must use EKODI native agent queue');
});
