import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [finance, e2e] = await Promise.all([
  readFile(new URL('../finance-monitor.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/admin-authenticated-e2e.mjs', import.meta.url), 'utf8'),
]);

test('Finance structure rendering indexes relationships instead of rescanning full arrays', () => {
  assert.match(finance, /const unitsByOrganization = new Map\(\)/);
  assert.match(finance, /const projectCountByUnit = new Map\(\)/);
  assert.match(finance, /document\.createDocumentFragment\(\)/);
  assert.match(finance, /root\.replaceChildren\(fragment\)/);
  assert.doesNotMatch(finance, /data\.businessUnits\.filter\(/);
  assert.doesNotMatch(finance, /data\.projects\.filter\(/);
});

test('Finance load exposes a real busy lifecycle and authenticated E2E waits for settlement', () => {
  assert.match(finance, /financePanel\?\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(finance, /financePanel\?\.removeAttribute\('aria-busy'\)/);
  assert.match(e2e, /await waitForSettledPanel\(id, 8_000\)/);
  assert.doesNotMatch(e2e, /await page\.waitForTimeout\(2_000\);\s*state = await menuDiagnostics\(id\)/);
});
