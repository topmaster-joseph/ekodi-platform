import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/ecosystem-performance-watch.yml', 'utf8');

test('performance guard covers canonical public, admin, and Support entry points', () => {
  for (const target of [
    "https://ekodi.kr/",
    "https://ekodi.kr/admin",
    "https://ekodi.kr/support/",
    "https://ekodi.kr/support/health",
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

test('performance guard measures the SeonamMedi customer domain against its origin', () => {
  for (const target of [
    'https://xn--3e0b8b58jw4co4mnpll3k.kr/',
    'https://ekodi.kr/seonammedi/',
    'https://xn--3e0b8b58jw4co4mnpll3k.kr/app.js',
    'https://xn--3e0b8b58jw4co4mnpll3k.kr/api/seonammedi/page-data',
  ]) assert.ok(workflow.includes(target), target);
});
