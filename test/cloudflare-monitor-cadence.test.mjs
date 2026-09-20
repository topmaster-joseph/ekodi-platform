import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');
const availability = read('.github/workflows/admin-availability-watch.yml');
const revenue = read('.github/workflows/production-gate.yml');
const performance = read('.github/workflows/ecosystem-performance-watch.yml');
const canary = read('scripts/post-deploy-canary.mjs');

test('scheduled production probes do not duplicate the deployment canary', () => {
  assert.match(availability, /cron: '\*\/15 \* \* \* \*'/);
  assert.match(performance, /cron: '37 \* \* \* \*'/);
  assert.doesNotMatch(revenue, /cron:/);
  assert.doesNotMatch(performance, /cron: '7,22,37,52 \* \* \* \*'/);
});

test('full production verification is triggered after guarded Shared Site deployment', () => {
  assert.match(revenue, /workflow_run:/);
  assert.match(revenue, /workflows: \['Deploy EKODI Shared Site Core'\]/);
  assert.match(revenue, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(availability, /push:\s*\n\s*branches: \[main\]/);
});

test('quota-aware probes identify themselves as EKODI internal traffic', () => {
  assert.match(canary, /EKODI-quota-aware-monitor\/1\.0/);
  assert.match(canary, /EKODI-post-deploy-canary\/1\.0/);
  assert.match(performance, /EKODI-github-monitor\/1\.0/);
  assert.match(performance, /user-agent =/);
});

test('hourly performance watch reads Production quota before generating endpoint traffic', () => {
  const quota = performance.indexOf('Read Production Cloudflare quota Source of Truth');
  const measure = performance.indexOf('Measure public entry performance');
  assert.ok(quota >= 0 && measure > quota);
  assert.match(performance, /cloudflare-production-budget\.mjs/);
  assert.match(performance, /steps\.quota\.outputs\.skip_nonessential != 'true'/);
  assert.match(performance, /endpoint requests: \*\*0\*\*/);
  assert.doesNotMatch(performance, /https:\/\/admin\.ekodi\.kr\//);
});
