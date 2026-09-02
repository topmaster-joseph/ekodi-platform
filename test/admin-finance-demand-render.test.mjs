import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('finance remains demand-loaded without entering the first admin handoff', async () => {
  const [loader, menu] = await Promise.all([read('admin-demand-loader.js'), read('admin-menu-layout.js')]);
  assert.match(loader, /function bindBaseEnhancements\(\)/);
  assert.match(loader, /loadStyle\('admin-finance\.css'\)/);
  assert.match(loader, /loadScript\('finance-monitor\.js'\)/);
  assert.match(loader, /financeDemandBound/);
  assert.match(loader, /financeAssetsRequested/);
  assert.match(menu, /function financeAssets\(\)/);
  assert.match(menu, /if\(section==='finance'\)financeAssets\(\)/);
});

test('finance demand stylesheet remains readable on the light admin surface', async () => {
  const css = await read('admin-finance.css');
  assert.match(css, /body\.admin-compact \.finance-status article/);
  assert.match(css, /background:#fff!important/);
  assert.match(css, /--ekodi-admin-text/);
  assert.match(css, /body\.admin-compact \.finance-note\.good/);
  assert.match(css, /body\.admin-compact \.finance-table-wrap/);
});
