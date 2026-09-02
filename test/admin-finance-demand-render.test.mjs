import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('finance assets load whenever the finance panel becomes active', async () => {
  const loader = await read('admin-demand-loader.js');
  assert.match(loader, /function ensureFinanceAssets\(\)/);
  assert.match(loader, /loadStyle\('admin-finance\.css'\)/);
  assert.match(loader, /loadScript\('finance-monitor\.js'\)/);
  assert.match(loader, /ekodi-admin-section-changed/);
  assert.match(loader, /event\.detail\?\.section === 'finance'/);
  assert.match(loader, /if \(financeRequested\(\)\) ensureFinanceAssets\(\)/);
  assert.match(loader, /location\.hash\.toLowerCase\(\) === '#finance'/);
});

test('finance demand stylesheet remains readable on the light admin surface', async () => {
  const css = await read('admin-finance.css');
  assert.match(css, /body\.admin-compact \.finance-status article/);
  assert.match(css, /background:#fff!important/);
  assert.match(css, /--ekodi-admin-text/);
  assert.match(css, /body\.admin-compact \.finance-note\.good/);
  assert.match(css, /body\.admin-compact \.finance-table-wrap/);
});
