import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const retrySource = () => readFile(new URL('../scripts/admin-authenticated-e2e-retry.mjs', import.meta.url), 'utf8');
const workerSource = () => readFile(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs', import.meta.url), 'utf8');
const workflowSource = () => readFile(new URL('../.github/workflows/admin-authenticated-e2e.yml', import.meta.url), 'utf8');

test('authenticated Admin E2E isolates every menu in a fresh Chromium process and retries only that menu once', async () => {
  const source = await retrySource();
  assert.match(source, /const maxAttemptsPerMenu = 2/);
  assert.match(source, /const menuTimeoutMs = 30_000/);
  assert.match(source, /adminMenuOrder\(\)/);
  assert.match(source, /spawn\(process\.execPath, \['scripts\/admin-authenticated-e2e-menu-worker\.mjs'\]/);
  assert.match(source, /E2E_MENU_ID: menuId/);
  assert.match(source, /brand-new Chromium process/);
  assert.match(source, /isolated-menu-renderers/);
});

test('isolated worker skips redundant clicks for an already-active context tab', async () => {
  const source = await workerSource();
  assert.match(source, /const alreadyActive = aria === 'true'/);
  assert.match(source, /if \(!alreadyActive\) await clickFast\(tab\)/);
  assert.match(source, /click\(\{ force: true, noWaitAfter: true/);
  assert.match(source, /destination\.hostname !== 'accounts\.google\.com'/);
  assert.match(source, /Production menu registry missing/);
});

test('production Admin workflow keeps the isolated recovery runner wired', async () => {
  const workflow = await workflowSource();
  assert.match(workflow, /scripts\/admin-authenticated-e2e-retry\.mjs/);
  assert.match(workflow, /run: node scripts\/admin-authenticated-e2e-retry\.mjs/);
});
