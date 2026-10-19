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
  assert.match(parked, /status!==204\)fail\(/, 'a failed hand-off must be loud, not a silent park');
  // Immediate-merge path is unchanged and never dispatches convergence.
  const merged = source.slice(parkedEnd);
  assert.doesNotMatch(merged, /converge-orchestrated-pr-merge\.yml\/dispatches/);
});

test('recovery workflow may dispatch and convergence accepts workflow_dispatch', async () => {
  const [recovery, convergence] = await Promise.all([
    read('.github/workflows/recover-release-provenance.yml'),
    read('.github/workflows/converge-orchestrated-pr-merge.yml'),
  ]);
  assert.match(recovery, /\n  actions: write\n/);
  assert.match(convergence, /\n  workflow_dispatch:\n/);
});

test('convergence concurrency is per branch so other PRs cannot cancel a pending run', async () => {
  const wf = await read('.github/workflows/converge-orchestrated-pr-merge.yml');
  assert.match(wf, /\nconcurrency:\n  group: ekodi-orchestrated-merge-\$\{\{ github\.ref \}\}\n  cancel-in-progress: false\n/);
  assert.doesNotMatch(wf, /group: ekodi-orchestrated-merge\n/);
});
