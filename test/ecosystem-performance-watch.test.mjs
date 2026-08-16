import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/ecosystem-performance-watch.yml', 'utf8');

test('performance guard covers canonical public and admin entry points', () => {
  for (const target of [
    "https://ekodi.kr/",
    "https://admin.ekodi.kr/",
    "https://ekodi.kr/admin",
  ]) assert.match(workflow, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('performance guard uses warning and incident response budgets', () => {
  assert.match(workflow, /WARN_SECONDS: '2\.0'/);
  assert.match(workflow, /FAIL_SECONDS: '5\.0'/);
  assert.match(workflow, /time_starttransfer/);
  assert.match(workflow, /time_total/);
  assert.match(workflow, /EKODI entry performance incident/);
});

test('performance incident guard forbids risky automatic latency repairs', () => {
  assert.match(workflow, /Do not change DNS, authentication policy, payment configuration, or customer data/);
});
