import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const converge = root('scripts/converge-orchestrated-pr-merge.mjs');
const recovery = root('scripts/recover-release-provenance.mjs');
const deployment = root('.github/workflows/deploy-site-core.yml');

function ownership(source, begin, end) {
  const start = source.indexOf(begin);
  const stop = source.indexOf(end, start);
  assert.ok(start >= 0 && stop > start, 'release dispatch classification must be present');
  return source.slice(start, stop);
}

test('AI Ops frontend changes are owned by receipt-bound Site Core in both merge paths', () => {
  const merged = ownership(converge, 'const sharedSiteTouched=changedFiles.some(file=>', 'const churchPagesTouched=');
  const immediate = ownership(recovery, 'const sharedSiteTouched=sourceFiles.some(file=>', 'const shellRuntimeTouched=');
  const paths = ['ai-ops-admin.js', 'admin-readable-command.css'];
  for (const path of paths) {
    const marker = "'" + path + "'";
    assert.ok(merged.includes(marker), 'convergent dispatcher missing ' + path);
    assert.ok(immediate.includes(marker), 'immediate recovery dispatcher missing ' + path);
    assert.ok(deployment.includes("      - " + marker), 'main-push deployment fallback missing ' + path);
  }
});

test('both routes retain protected receipt and gated staging/deploy entrypoint', () => {
  assert.match(converge, /if\(sharedSiteTouched\)\{/);
  assert.match(converge, /release_branch_ref:branch,release_task_id:taskId/);
  assert.match(recovery, /if\(merge\.response\.ok&&\(independentBoardTouched\|\|shellRuntimeTouched\|\|sharedSiteTouched\)\)\{/);
  assert.match(recovery, /release_branch_ref:branchRef,release_task_id:taskId/);
  assert.match(converge, /release receipt is not authorized/);
  assert.match(recovery, /recovery receipt not authorized/);
  assert.match(deployment, /workflow_dispatch:/);
});
