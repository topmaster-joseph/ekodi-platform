import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin session restore bypasses runtime schema work', async () => {
  const [entry, fast] = await Promise.all([
    read('mission-control-entry-worker.js'),
    read('admin-session-fastpath.js'),
  ]);
  assert.match(entry, /path === '\/api\/session'/);
  assert.match(entry, /handleAdminSessionFastPath/);
  assert.match(fast, /FROM sessions JOIN admins/);
  assert.match(fast, /crypto\.subtle\.digest\('SHA-256'/);
  assert.doesNotMatch(fast, /CREATE TABLE|ALTER TABLE|PRAGMA|ensureSchema/i);
});

test('initial admin handoff contains no Finance readiness runtime', async () => {
  const [handoff, billing, loader] = await Promise.all([
    read('admin-central-handoff.js'),
    read('author-billing-admin.js'),
    read('admin-demand-loader.js'),
  ]);
  assert.doesNotMatch(handoff, /ekodi-finance-overview/);
  assert.doesNotMatch(handoff, /paymentKeyStatusPanel|ensurePaymentKeyPanel|tossSecretConfigured/);
  assert.doesNotMatch(handoff, /MutationObserver|setInterval\(/);
  assert.match(billing, /ekodi-finance-overview/);
  assert.match(billing, /ensurePaymentKeyPanel/);
  assert.match(loader, /await loadScript\('author-billing-admin\.js'\);\s*\n\s*await loadScript\('finance-monitor\.js'\);/);
});
