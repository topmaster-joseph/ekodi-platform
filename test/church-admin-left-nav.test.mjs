import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { churchPastorAdminPage, churchPastorAdminScript } from '../church-pastor-admin-page.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('church admin switches church-owned sections client-side so the left menu never reloads', async () => {
  const script = await churchPastorAdminScript().text();
  assert.match(script, /let section=sectionFromPath\(\)/);
  assert.match(script, /history\.pushState\(\{churchAdminSection:next\}/);
  assert.match(script, /addEventListener\('popstate'/);
  assert.match(script, /#adminNav a\[href\],#sectionNav a\[href\]/);
  assert.match(script, /if\(!meta\[next\]\)return;/);
});

test('reports/documents admin API stays same-origin to satisfy the page CSP (connect-src self)', () => {
  const asset = read('church-reports-admin.js');
  assert.match(asset, /const API='';/);
  assert.doesNotMatch(asset, /https:\/\/api\.ekodi\.kr/);
});

test('right panel defaults to left alignment and the top view tabs are gone', async () => {
  const html = await churchPastorAdminPage().text();
  assert.ok(!html.includes('admin-view-tabs'));
  const css = read('church-reports-admin.css');
  assert.match(css, /main\[data-ekodi-admin-main\]>\*\{margin-left:0;margin-right:auto;max-width:none\}/);
  assert.match(css, /#summaryCards,html\[data-ekodi-church-unified-admin="true"\] \.admin-view-tabs\{display:none!important\}/);
});
