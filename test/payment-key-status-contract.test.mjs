import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const handoff = await readFile(new URL('../admin-central-handoff.js', import.meta.url), 'utf8');
const financeMonitor = await readFile(new URL('../finance-monitor.js', import.meta.url), 'utf8');
const financeWorker = await readFile(new URL('../finance-worker.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const siteWorker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');

test('admin payment key panel consumes only shared readiness metadata', () => {
  assert.doesNotMatch(handoff, /api\/finance\/overview/);
  assert.doesNotMatch(handoff, /FINANCE_API/);
  assert.match(handoff, /ekodi-finance-overview/);
  assert.match(handoff, /tossSecretConfigured/);
  assert.match(handoff, /tossLiveKey/);
  assert.match(handoff, /tossMidConfigured/);
  assert.match(handoff, /원문 비노출/);
  assert.doesNotMatch(handoff, /TOSS_SECRET_KEY\s*[:=]/);
  assert.match(financeMonitor, /api\/finance\/overview/);
  assert.match(financeMonitor, /new CustomEvent\('ekodi-finance-overview'/);
});

test('finance readiness exposes status booleans without exposing the server key value', () => {
  assert.match(financeWorker, /tossSecretConfigured:\s*Boolean\(env\.TOSS_SECRET_KEY\)/);
  assert.match(financeWorker, /tossLiveKey:\s*String\(env\.TOSS_SECRET_KEY\s*\|\|\s*''\)\.startsWith\('live_'\)/);
  assert.match(financeWorker, /tossMidConfigured:\s*Boolean\(env\.TOSS_MID\)/);
  assert.doesNotMatch(financeWorker, /readiness:\s*\{[^}]*TOSS_SECRET_KEY\s*[,}]/s);
});

test('payment key status client is included in the production asset build', () => {
  assert.match(build, /'admin-central-handoff\.js'/);
});

test('admin HTML stays no-store while static admin assets are browser-revalidated', () => {
  assert.match(siteWorker, /'\/admin-central-handoff\.js'/);
  assert.match(siteWorker, /ADMIN_ASSETS/);
  assert.match(siteWorker, /'no-store', 'admin-control-center'/);
  assert.match(siteWorker, /'public, max-age=0, must-revalidate', 'admin-asset'/);
});
