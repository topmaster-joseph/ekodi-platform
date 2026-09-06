import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = () => readFile(new URL('../scripts/verify-admin-production-ui-e2e.mjs', import.meta.url), 'utf8');

test('synthetic production Admin UI verifier waits for lazy panel content to settle', async () => {
  const text = await source();
  assert.match(text, /text\.length > 0/);
  assert.match(text, /style\.display !== 'none'/);
  assert.match(text, /timeout: 12000/);
});

test('synthetic production Admin UI verifier isolates backend auth side effects between menus', async () => {
  const text = await source();
  assert.match(text, /backend 401 from one lazy module cannot hide the shell and poison later UI checks/);
  assert.match(text, /await page\.goto\(ADMIN_URL, \{ waitUntil: 'domcontentloaded', timeout: 45000 \}\);\s*await waitForAdminShell\(\);\s*selectedWorkArea = null;/);
});