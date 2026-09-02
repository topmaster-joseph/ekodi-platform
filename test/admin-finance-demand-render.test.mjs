import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('finance assets load from direct clicks, contextual tabs and direct hash entry', async () => {
  const loader = await read('admin-demand-loader.js');
  assert.match(loader, /const loadFinanceAssets = \(\) =>/);
  assert.match(loader, /loadStyle\('admin-finance\.css'\)/);
  assert.match(loader, /loadScript\('finance-monitor\.js'\)/);
  assert.match(loader, /finance\.addEventListener\('click', loadFinanceAssets, true\)/);
  assert.match(loader, /ekodi-admin-section-changed/);
  assert.match(loader, /event\.detail\?\.section === 'finance'/);
  assert.match(loader, /location\.hash\.toLowerCase\(\) === '#finance'/);
  assert.match(loader, /finance\.classList\.contains\('active'\)/);
  assert.doesNotMatch(loader, /financeAssetsPromise/);
});

test('finance demand stylesheet remains readable on the light admin surface', async () => {
  const css = await read('admin-finance.css');
  assert.match(css, /body\.admin-compact \.finance-status article/);
  assert.match(css, /background:#fff!important/);
  assert.match(css, /--ekodi-admin-text/);
  assert.match(css, /body\.admin-compact \.finance-note\.good/);
  assert.match(css, /body\.admin-compact \.finance-table-wrap/);
});
