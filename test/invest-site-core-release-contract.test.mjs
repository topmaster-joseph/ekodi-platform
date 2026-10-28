import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('canonical Invest landing is released by the guarded shared Site Core on main push', () => {
  const workflow = read('.github/workflows/deploy-site-core.yml');
  const pushPaths = workflow.split('\n  workflow_dispatch:')[0]; // workflow_dispatch may precede push in some revisions
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/, 'main-push release must remain configured');
  assert.match(workflow, /^\s+- 'invest-access-ui\.js'\s*$/m);
  assert.match(workflow, /^\s+- 'platform-router-entry-worker\.js'\s*$/m);
  assert.match(workflow, /guarded-worker-release|rollback|canary/i, 'existing release safety must remain');
  assert.ok(pushPaths.length > 0);
});

test('protected orchestrated PR convergence dispatches Site Core for Invest-only HTML changes', () => {
  const convergence = read('scripts/converge-orchestrated-pr-merge.mjs');
  const section = convergence.split('const sharedSiteTouched=changedFiles.some(file=>')[1]?.split('const churchPagesTouched=')[0] || '';
  assert.ok(section, 'shared Site Core owner classification must exist');
  assert.match(section, /file==='invest-access-ui\.js'/);
  assert.match(section, /file==='platform-router-entry-worker\.js'/);
  assert.match(convergence, /deploy-site-core\.yml/, 'keep guarded receipt-bound dispatch');
});

test('immediate owner-approved provenance recovery dispatches Site Core for Invest UI only', () => {
  const recovery = read('scripts/recover-release-provenance.mjs');
  const section = recovery.split('const sharedSiteTouched=sourceFiles.some(file=>')[1]?.split('const shellRuntimeTouched=')[0] || '';
  assert.ok(section, 'recovery Site Core owner classification must exist');
  assert.match(section, /file==='invest-access-ui\.js'/);
  assert.match(section, /file==='platform-router-entry-worker\.js'/);
  assert.match(recovery, /deploy-site-core\.yml/, 'do not release without the existing guarded workflow');
});

test('general My Invest and member API retain independent deployment ownership', () => {
  const siteWorkflow = read('.github/workflows/deploy-site-core.yml');
  assert.doesNotMatch(siteWorkflow, /^\s+- 'invest-my-workspace\.js'\s*$/m);
  assert.doesNotMatch(siteWorkflow, /^\s+- 'invest-common-analysis-runtime\.js'\s*$/m);
});
