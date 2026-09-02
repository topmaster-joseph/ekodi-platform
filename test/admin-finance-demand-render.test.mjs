import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('finance assets are owned by the route layer and use the generic demand loader', async () => {
  const [loader, menu] = await Promise.all([read('admin-demand-loader.js'), read('admin-menu-layout.js')]);
  assert.match(menu, /function financeAssets\(\)/);
  assert.match(menu, /loadStyle\('admin-finance\.css'\)/);
  assert.match(menu, /loadScript\('finance-monitor\.js'\)/);
  assert.match(menu, /if\(section==='finance'\)financeAssets\(\)/);
  assert.match(menu, /ekodi-admin-ready/);
  assert.doesNotMatch(loader, /admin-finance\.css|finance-monitor\.js|financeDemandBound|financeAssetsRequested/);
});

test('finance demand stylesheet remains readable on the light admin surface', async () => {
  const css = await read('admin-finance.css');
  assert.match(css, /body\.admin-compact \.finance-status article/);
  assert.match(css, /background:#fff!important/);
  assert.match(css, /--ekodi-admin-text/);
  assert.match(css, /body\.admin-compact \.finance-note\.good/);
  assert.match(css, /body\.admin-compact \.finance-table-wrap/);
});
