import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [stage, deploy] = await Promise.all([
  readFile(new URL('../.github/workflows/stage-books-shell.yml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/deploy-books.yml', import.meta.url), 'utf8'),
]);

test('Books reusable staging accepts and exports the orchestrator release receipt', () => {
  assert.match(stage, /workflow_call:\n    inputs:/);
  assert.match(stage, /release_branch_ref:/);
  assert.match(stage, /release_task_id:/);
  assert.match(stage, /EKODI_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref \|\| '' \}\}/);
  assert.match(stage, /EKODI_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id \|\| '' \}\}/);
  assert.match(stage, /validate-ekodi-ai-change-orchestration\.mjs" --release/);
});

test('Books production workflow passes the receipt into staging', () => {
  const staging=deploy.slice(deploy.indexOf('  staging_gate:'),deploy.indexOf('\n  deploy:'));
  assert.match(staging, /with:/);
  assert.match(staging, /release_branch_ref: \$\{\{ inputs\.release_branch_ref \|\| '' \}\}/);
  assert.match(staging, /release_task_id: \$\{\{ inputs\.release_task_id \|\| '' \}\}/);
});

test('Books production verification proves the live first-title sale surface', () => {
  assert.match(deploy,/https:\/\/books\.ekodi\.kr\/ekodian\//);
  assert.match(deploy,/https:\/\/ekodi\.upaper\.kr\/content\/1223429/);
  assert.match(deploy,/9,900원 · 전자책 구매하기/);
  assert.match(deploy,/guarded-worker-release\.mjs --manifest deploy\/manifests\/books\.worker\.json/);
});
