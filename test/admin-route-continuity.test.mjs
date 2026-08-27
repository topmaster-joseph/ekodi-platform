import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin central handoff normalizes the historical storige alias to storage', async () => {
  const source = await read('admin-central-handoff.js');
  assert.match(source, /storige:'storage'/);
  assert.match(source, /target\.searchParams\.set\('route', r\)/);
  assert.match(source, /auth\.searchParams\.set\('return_to', target\.href\)/);
  assert.match(source, /new URLSearchParams\(location\.search\)\.get\('route'\)/);
  assert.match(source, /history\.replaceState\(\{\},document\.title,cleanRouteUrl\(route\)\)/);
});

test('authenticated shell restores routed destinations and demand-loads Storage', async () => {
  const shell = await read('admin-authenticated-shell.js');
  assert.match(shell, /storage:'storage'/);
  assert.match(shell, /window\.EKODIAdminDemand\?\.activate/);
  assert.match(shell, /window\.EKODIAdminDemand\.activate\(demand\)/);
  assert.match(shell, /announceReady\(\);restoreRoute\(\)/);
  assert.match(shell, /sessionStorage\.removeItem\(ROUTE_KEY\)/);
});

test('legacy admin entry converges into current AI operations instead of old dark tools', async () => {
  const handoff = await read('admin-central-handoff.js');
  const shell = await read('admin-authenticated-shell.js');
  assert.match(handoff, /location\.pathname\.startsWith\('\/legacy'\)\?'ai-ops'/);
  assert.match(handoff, /if\(u\.pathname\.startsWith\('\/legacy'\)\)u\.pathname='\/'/);
  assert.match(shell, /if\(adminTools\)adminTools\.href='#ai-ops'/);
});

test('sidebar account profile stays horizontal and truncates long email safely', async () => {
  const shell = await read('admin-authenticated-shell.js');
  assert.match(shell, /display:'flex','grid-template-columns':'none'/);
  assert.match(shell, /'white-space':'nowrap'/);
  assert.match(shell, /'text-overflow':'ellipsis'/);
  assert.match(shell, /'max-width':'145px'/);
});
