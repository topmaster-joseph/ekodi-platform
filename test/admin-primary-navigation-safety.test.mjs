import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('primary Admin navigation fails closed against technical menu leakage', () => {
  const sidebar = read('admin-sidebar.js');
  const loader = read('admin-demand-loader.js');
  assert.match(sidebar, /\.sidebar nav\[data-ekodi-admin-nav-mode="primary"\] > \.nav\{display:none!important\}/);
  assert.match(sidebar, /\.sidebar nav\[data-ekodi-admin-nav-mode="primary"\] > \.admin-context-source\{display:none!important\}/);
  assert.match(sidebar, /\.sidebar nav\[data-ekodi-admin-nav-mode="primary"\] > \.admin-global-navs\{display:grid!important\}/);
  assert.doesNotMatch(loader, /document\.createElement\('button'\)/);
  assert.doesNotMatch(loader, /label\.textContent = feature\.label/);
});

test('delegated service deep links always reveal one-column operator content', () => {
  const common = read('common-services-admin.js');
  assert.match(common, /mounted\.hidden=false/);
  assert.match(common, /mounted\.classList\.remove\('hidden-panel'\)/);
  assert.match(common, /mounted\.dataset\.adminListLayout='single'/);
});
