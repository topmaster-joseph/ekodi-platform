// Regression (#5383, 2026-10-20): the provenance bot creates `ai/*/orch_*`
// recovery branches with the Actions token. GitHub does not start push-triggered
// workflows for GITHUB_TOKEN pushes, so the convergent merge never ran and the
// parked recovery PR waited forever with green checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('a parked recovery PR explicitly dispatches convergence on its orchestrator branch', async () => {
  const source = await read('scripts/recover-release-provenance.mjs');
  const parkedStart = source.indexOf('if(!checksReady||!upToDate){');
  assert.ok(parkedStart > 0, 'parked branch must exist');
  const parkedEnd = source.indexOf('\nconst merge=checksReady&&upToDate', parkedStart);
  const parked = source.slice(parkedStart, parkedEnd);
  assert.match(parked, /actions\/workflows\/converge-orchestrated-pr-merge\.yml\/dispatches/);
  assert.match(parked, /body:JSON\.stringify\(\{ref:branchRef\}\)/);
  // `fail()` is awaited since it records the refusal to D1 before exiting; the
  // assertion is unchanged — a failed hand-off still refuses rather than parking.
  assert.match(parked, /status!==204\)await fail\(/, 'a failed hand-off must be loud, not a silent park');
  // Immediate-merge path never runs the merging converger on the branch; since
  // RECOVERY-POST-MERGE-LANES-001 it only hands the merged PR to post-merge reconcile on main.
  const merged = source.slice(parkedEnd);
  assert.doesNotMatch(merged, /converge-orchestrated-pr-merge\.yml\/dispatches[\s\S]{0,200}ref:branchRef/);
  assert.match(merged, /body:JSON\.stringify\(\{ref:'main',inputs:\{post_merge_reconcile_branch:branchRef\}\}\)/);
});

test('recovery workflow may dispatch and convergence accepts workflow_dispatch', async () => {
  const [recovery, convergence] = await Promise.all([
    read('.github/workflows/recover-release-provenance.yml'),
    read('.github/workflows/converge-orchestrated-pr-merge.yml'),
  ]);
  assert.match(recovery, /\n  actions: write\n/);
  assert.match(convergence, /\n  workflow_dispatch:\n/);
});
