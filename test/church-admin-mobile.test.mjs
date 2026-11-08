import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('church admin collapses the sidebar into a scrollable row and contains tables on mobile', () => {
  const css = readFileSync(new URL('../church-reports-admin.css', import.meta.url), 'utf8');
  const mobile = css.slice(css.indexOf('@media (max-width:900px)'));
  assert.ok(mobile.includes('#adminNav{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important'));
  assert.ok(mobile.includes('.sidebar .scope'));
  assert.ok(mobile.includes('.panel table{display:block;max-width:100%;overflow-x:auto'));
  const page = readFileSync(new URL('../church-pastor-admin-page.js', import.meta.url), 'utf8');
  assert.match(page, /church-reports-admin\.css\?v=20261109-mobile1/);
});
