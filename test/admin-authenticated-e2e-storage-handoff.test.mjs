import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = () => readFile(new URL('../scripts/admin-authenticated-e2e.mjs', import.meta.url), 'utf8');

test('authenticated Admin E2E treats Storage Google reauth as a verified handoff and returns to Admin', async () => {
  const script = await source();

  assert.match(script, /storageReauthHandoff/);
  assert.match(script, /url\.hostname === 'accounts\.google\.com'/);
  assert.match(script, /reauthHandoff: true/);
  assert.match(script, /destination\.hostname !== 'accounts\.google\.com'/);
  assert.match(script, /await page\.goto\(authenticatedEntryUrl/);
  assert.match(script, /selectedWorkArea = null/);
  assert.match(script, /await waitForAdminReady\(\)/);
  assert.match(script, /const group = groups\.tax/);
});
