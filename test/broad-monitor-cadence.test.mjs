import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('broad registry monitor runs hourly on the delegated autonomy cadence', async () => {
  const text = await readFile('.github/workflows/monitor.yml', 'utf8');
  assert.match(text, /cron:\s*["']7 \* \* \* \*["']/);
  assert.doesNotMatch(text, /cron:\s*["']17 \*\/4 \* \* \*["']/);
});

test('critical availability monitor stays frequent while full production verification is deploy-only', async () => {
  const admin = await readFile('.github/workflows/admin-availability-watch.yml', 'utf8');
  const revenue = await readFile('.github/workflows/production-gate.yml', 'utf8');
  const perf = await readFile('.github/workflows/ecosystem-performance-watch.yml', 'utf8');
  assert.match(admin, /cron:\s*['"]\*\/15 \* \* \* \*['"]/);
  assert.match(perf, /cron:\s*['"]37 \* \* \* \*['"]/);
  assert.doesNotMatch(revenue, /cron:/);
  assert.match(revenue, /workflow_run:/);
  assert.match(revenue, /Deploy EKODI Shared Site Core/);
});


test('post-deploy verification consumes upstream release evidence instead of re-running release provenance gate on main', async () => {
  const revenue = await readFile('.github/workflows/production-gate.yml', 'utf8');
  const owner = await readFile('.github/workflows/verify-ekodi-owner-report.yml', 'utf8');
  for (const workflow of [revenue, owner]) {
    assert.doesNotMatch(workflow, /validate-ekodi-ai-change-orchestration\.mjs\"? --release/);
    assert.match(workflow, /validate-ekodi-ai-change-orchestration\.mjs/);
    assert.match(workflow, /workflow_run\.head_sha/);
    assert.match(workflow, /workflow_run\.conclusion/);
  }
  assert.match(revenue, /Deploy EKODI Shared Site Core/);
  assert.match(owner, /Deploy EKODI Shared Site Core/);
});
