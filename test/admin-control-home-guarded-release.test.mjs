import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('authenticated Control embed owns a guarded Site Core dispatch after token-authored merges', async () => {
  const source = await read('scripts/converge-orchestrated-pr-merge.mjs');
  const a = source.indexOf('const sharedSiteTouched=');
  const b = source.indexOf('const churchPagesTouched=', a);
  assert.ok(a >= 0 && b > a, 'guarded Site Core selector exists');
  const scope = source.slice(a, b);
  for (const path of ['admin-control-home.js', 'admin-control-home.css']) {
    assert.ok(scope.includes("'" + path + "'"), path + ' missing from orchestrator source classifier');
  }
  assert.match(source, /if\(sharedSiteTouched\)\{/);
  assert.match(source, /\/actions\/workflows\/deploy-site-core\.yml\/dispatches/);
  assert.match(source, /release_branch_ref:branch,release_task_id:taskId/);
});

test('authenticated Control embed is watched by the Site Core push fallback', async () => {
  const workflow = await read('.github/workflows/deploy-site-core.yml');
  const a = workflow.indexOf('  push:');
  const b = workflow.indexOf('\npermissions:', a);
  assert.ok(a >= 0 && b > a, 'expected push fallback');
  const paths = workflow.slice(a, b);
  for (const asset of ['admin-control-home.js', 'admin-control-home.css'])
    assert.ok(paths.includes("'" + asset + "'"), asset + ' missing from guarded deploy path filter');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /release_branch_ref:/);
  assert.match(workflow, /release_task_id:/);
});
