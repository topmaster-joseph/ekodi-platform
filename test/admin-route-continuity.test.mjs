import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin central handoff normalizes the historical storige alias to storage', async () => {
  const source = await read('admin-central-handoff.js');
  assert.match(source, /\['storige', 'storage'\]/);
  assert.match(source, /target\.searchParams\.set\('route', normalized\)/);
  assert.match(source, /auth\.searchParams\.set\('return_to', target\.href\)/);
  assert.match(source, /const route = normalizeRoute\(query\.get\('route'\)\)/);
  assert.match(source, /history\.replaceState\(\{\}, document\.title, cleanRouteUrl\(route\)\)/);
});

test('admin restores routed destinations after authentication and can demand-load Storage', async () => {
  const source = await read('admin-central-handoff.js');
  assert.match(source, /\['storage', \{ section:'storage', demand:'storage' \}\]/);
  assert.match(source, /window\.EKODIAdminDemand\?\.activate/);
  assert.match(source, /window\.EKODIAdminDemand\.activate\(config\.demand\)/);
  assert.match(source, /window\.addEventListener\('ekodi-admin-ready', restorePendingAdminRoute\)/);
  assert.match(source, /window\.addEventListener\('hashchange'/);
});

test('legacy admin entry points migrate into the current AI operations surface', async () => {
  const source = await read('admin-central-handoff.js');
  assert.match(source, /location\.pathname\.startsWith\('\/legacy'\).*return 'ai-ops'/);
  assert.match(source, /a\[href="\/legacy"\].*a\[href="\/legacy#activity"\]/s);
  assert.match(source, /heroActions\[1\]\.setAttribute\('href', '#ai-ops'\)/);
});

test('sidebar account profile is repaired after it is moved into side-bottom', async () => {
  const source = await read('admin-central-handoff.js');
  assert.match(source, /document\.querySelector\('\.profile\.side-profile'\)/);
  assert.match(source, /profile\.style\.setProperty\('display', 'flex', 'important'\)/);
  assert.match(source, /profileEmail\.style\.setProperty\('white-space', 'nowrap', 'important'\)/);
  assert.match(source, /profileEmail\.style\.setProperty\('text-overflow', 'ellipsis', 'important'\)/);
});
