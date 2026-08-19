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

test('initial admin handoff does not prebuild Finance readiness UI', async () => {
  const handoff = await read('admin-central-handoff.js');
  assert.match(handoff, /ekodi-finance-overview/);
  assert.doesNotMatch(handoff, /\n\s*ensurePaymentKeyPanel\(\);\s*\n\s*window\.addEventListener\('ekodi-finance-overview'/);
  assert.match(handoff, /observer\.disconnect\(\),1200/);
});
