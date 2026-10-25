import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [converger, deployBooks, marker] = await Promise.all([
  readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/deploy-books.yml', import.meta.url), 'utf8'),
  readFile(new URL('../books/release/ekodian-live-sale-20261025.md', import.meta.url), 'utf8'),
]);

test('Books static changes own an explicit guarded post-merge deployment lane', () => {
  assert.match(converger, /const booksTouched=changedFiles\.some/);
  assert.match(converger, /file\.startsWith\('books\/'\)/);
  assert.match(converger, /\[booksTouched,'deploy-books\.yml'\]/);
  assert.match(converger, /if\(booksTouched\)\{/);
  assert.match(converger, /\/actions\/workflows\/deploy-books\.yml\/dispatches/);
  assert.match(converger, /release_branch_ref:branch,release_task_id:taskId/);
  assert.match(converger, /Books deploy dispatch failed/);
});

test('Books release lane remains guarded and accepts the orchestrator receipt', () => {
  assert.match(deployBooks, /workflow_dispatch:/);
  assert.match(deployBooks, /release_branch_ref:/);
  assert.match(deployBooks, /release_task_id:/);
  assert.match(deployBooks, /validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(deployBooks, /guarded-worker-release\.mjs --manifest deploy\/manifests\/books\.worker\.json/);
  assert.match(deployBooks, /Deep verify Books production hostname/);
});

test('live-sale deployment replay is explicitly tied to the merged first-title release', () => {
  assert.match(marker, /BOOK-EKODI-000001/);
  assert.match(marker, /6401cd138a42f907831fc1a7b36409efa32cce6b/);
  assert.match(marker, /orch_recovery_251f5f8058ee2db2fa528cdd01c8169f/);
  assert.match(marker, /deploy-books\.yml/);
});
