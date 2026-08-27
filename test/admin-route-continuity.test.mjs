import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin central handoff normalizes the historical storige alias to storage', async () => {
  const source = await read('admin-central-handoff.js');
  assert.match(source, /storige:'storage'/);
  assert.match(source, /https:\/\/admin\.ekodi\.kr\/\?route=\$\{encodeURIComponent\(r\)\}/);
  assert.match(source, /return_to=\$\{encodeURIComponent\(target\)\}/);
  assert.match(source, /new URLSearchParams\(location\.search\)\.get\('route'\)/);
  assert.match(source, /history\.replaceState\(\{\},document\.title,cleanRouteUrl\(route\)\)/);
});

test('Storage is a canonical menu hash and remains demand-loaded after authenticated entry', async () => {
  const menu = await read('admin-menu-layout.js');
  const demand = await read('admin-demand-loader.js');
  assert.match(menu, /\['#storage', 'storage'\]/);
  assert.match(menu, /\['storage', '#storage'\]/);
  assert.match(demand, /storage:\s*\{/);
  assert.match(demand, /hashes: \['#storage'\]/);
  assert.match(demand, /scripts: \['storage-admin\.js'\]/);
});

test('legacy admin entry converges into current AI operations before old runtime can start', async () => {
  const handoff = await read('admin-central-handoff.js');
  assert.match(handoff, /location\.pathname\.startsWith\('\/legacy'\)\?'ai-ops'/);
  assert.match(handoff, /if\(u\.pathname\.startsWith\('\/legacy'\)\)u\.pathname='\/'/);
  assert.match(handoff, /u\.hash=r\?`#\$\{r\}`:''/);
});

test('sidebar account profile stays horizontal and truncates long email safely', async () => {
  const shell = await read('admin-authenticated-shell.js');
  assert.match(shell, /display:flex!important;min-width:0!important;width:100%!important/);
  assert.match(shell, /white-space:nowrap!important/);
  assert.match(shell, /text-overflow:ellipsis!important/);
  assert.match(shell, /max-width:145px!important/);
});
