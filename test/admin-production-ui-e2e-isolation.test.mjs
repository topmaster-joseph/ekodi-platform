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

test('synthetic production Admin UI verifier stubs the canonical apex session route', async () => {
  const text = await source();
  assert.match(text, /page\.route\('https:\/\/ekodi\.kr\/api\/session'/);
  assert.doesNotMatch(text, /page\.route\('https:\/\/api\.ekodi\.kr\/api\/session'/);
});


test('synthetic production Admin UI verifier targets the canonical apex Admin path', async () => {
  const text = await source();
  assert.match(text, /const ADMIN_URL = process\.env\.ADMIN_URL \|\| 'https:\/\/ekodi\.kr\/admin\/'/);
  assert.doesNotMatch(text, /https:\/\/admin\.ekodi\.kr\//);
});

test('synthetic production Admin UI verifier validates tax handoff without navigating the Admin page', async () => {
  const text = await source();
  assert.match(text, /const href = await source\.getAttribute\('href'\)/);
  assert.match(text, /context\.request\.get\(href, \{ maxRedirects: 5, timeout: 20000 \}\)/);
  assert.match(text, /if \(!page\.url\(\)\.startsWith\(ADMIN_URL\)\)/);
  assert.match(text, /ok handoff-link/);
  assert.doesNotMatch(text, /taxNavigationPattern|taxRequestPending|taxCommitPending/);
});

test('synthetic production Admin UI verifier follows direct registry href menus through a popup contract', async () => {
  const text = await source();
  assert.match(text, /getAdminMenuItem/);
  assert.match(text, /definition\?\.href && definition\.adminHandoff !== true/);
  assert.match(text, /page\.waitForEvent\('popup', \{ timeout: 10000 \}\)/);
  assert.match(text, /ok direct-href/);
  const directHrefBranch = text.indexOf('definition?.href && definition.adminHandoff !== true');
  const panelWait = text.indexOf('window.EKODIAdminPanels?.current?.() === section');
  assert.ok(directHrefBranch >= 0 && panelWait > directHrefBranch, 'direct href menus must exit before local panel assertions');
});
