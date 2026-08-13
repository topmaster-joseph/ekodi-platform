import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const handoff = await readFile(new URL('../admin-central-handoff.js', import.meta.url), 'utf8');
const financeWorker = await readFile(new URL('../finance-worker.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const siteWorker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');

test('admin payment key panel reads only readiness metadata', () => {
  assert.match(handoff, /api\/finance\/overview/);
  assert.match(handoff, /tossSecretConfigured/);
  assert.match(handoff, /tossLiveKey/);
  assert.match(handoff, /tossMidConfigured/);
  assert.match(handoff, /원문 비노출/);
  assert.doesNotMatch(handoff, /TOSS_SECRET_KEY\s*[:=]/);
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

test('payment key status client receives admin no-store security headers', () => {
  assert.match(siteWorker, /'\/admin-central-handoff\.js'/);
  assert.match(siteWorker, /ADMIN_ASSETS/);
  assert.match(siteWorker, /'no-store', 'admin-asset'/);
});
