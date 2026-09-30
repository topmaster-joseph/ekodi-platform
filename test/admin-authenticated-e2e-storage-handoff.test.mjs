import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = () => readFile(new URL('../scripts/admin-authenticated-e2e.mjs', import.meta.url), 'utf8');

test('authenticated Admin E2E verifies Storage Google reauth from the top-level navigation request and returns to Admin', async () => {
  const script = await source();

  assert.match(script, /storageReauthHandoff/);
  assert.match(script, /storageExternalNavigationRequest/);
  assert.match(script, /page\.waitForRequest/);
  assert.match(script, /request\.isNavigationRequest\(\)/);
  assert.match(script, /request\.frame\(\) === page\.mainFrame\(\)/);
  assert.match(script, /destination\.hostname !== 'admin\.ekodi\.kr'/);
  assert.match(script, /destination\.hostname !== 'accounts\.google\.com'/);
  assert.match(script, /reauthHandoff: true/);
  assert.match(script, /await page\.goto\(authenticatedEntryUrl/);
  assert.match(script, /selectedWorkArea = null/);
  assert.match(script, /await waitForAdminReady\(\)/);
  assert.match(script, /const group = groups\.tax/);
  assert.doesNotMatch(script, /storageOAuth[\s\S]{0,120}page\.waitForURL/);
});
