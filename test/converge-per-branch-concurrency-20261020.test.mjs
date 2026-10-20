// Owner decision 2026-10-20: convergence concurrency is per branch. Guard the
// two invariants that make that safe: every post-merge production deploy that
// convergence can dispatch serializes itself, and same-branch runs never overlap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const concurrencyOf = yml => {
  const m = yml.match(/\nconcurrency:\n((?:  .*\n)+)/);
  return m ? m[1] : '';
};

test('convergence serializes per branch only, never cancelling in progress', async () => {
  const c = concurrencyOf(await read('.github/workflows/converge-orchestrated-pr-merge.yml'));
  assert.match(c, /group: ekodi-orchestrated-merge-\$\{\{ github\.ref \}\}/);
  assert.match(c, /cancel-in-progress: false/);
});

test('every workflow convergence dispatches has its own concurrency group', async () => {
  const script = await read('scripts/converge-orchestrated-pr-merge.mjs');
  const workflows = [...new Set([...script.matchAll(/actions\/workflows\/([a-z0-9-]+\.yml)\/dispatches/g)].map(m => m[1]))]
    .filter(w => w !== 'converge-orchestrated-pr-merge.yml');
  assert.ok(workflows.length >= 10, 'expected the post-merge dispatch set');
  for (const wf of workflows) {
    const c = concurrencyOf(await read('.github/workflows/' + wf));
    assert.match(c, /group: \S/, `${wf} must declare a concurrency group now that merges can run in parallel`);
  }
});

test('Access API production releases are serialized while PR validation stays per PR', async () => {
  const c = concurrencyOf(await read('.github/workflows/deploy-access-api.yml'));
  assert.match(c, /group: ekodi-access-api-\$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.number \|\| 'production' \}\}/);
  assert.match(c, /cancel-in-progress: false/);
});
