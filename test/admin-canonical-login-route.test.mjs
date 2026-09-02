import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const worker = await read('site-worker.js');

test('historical storige entry is normalized and preserved through central auth', async () => {
  const handoff = await read('admin-central-handoff.js');
  assert.ok(handoff.includes("storige:'storage'"));
  assert.ok(handoff.includes('target=`https://admin.ekodi.kr/?route=${encodeURIComponent(r)}`'));
  assert.ok(handoff.includes('return_to=${encodeURIComponent(target)}'));
  assert.ok(handoff.includes("query.get('route')"));
  assert.ok(handoff.includes('cleanRouteUrl(route)'));
});

test('legacy admin paths are retired instead of reopening an old UI', async () => {
  const handoff = await read('admin-central-handoff.js');
  const shell = await read('admin-authenticated-shell.js');
  assert.ok(worker.includes('RETIRED_ADMIN_PATHS'));
  assert.ok(worker.includes("'/legacy'"));
  assert.ok(worker.includes('return retiredAdminResponse()'));
  assert.ok(!handoff.includes('legacy'));
  assert.ok(!/canonicalizeLegacyEntry|repairLegacyLinks|control-center\.js/.test(shell));
});

test('authenticated Admin Tools use only the current shared menu runtime', async () => {
  const shell = await read('admin-authenticated-shell.js');
  assert.ok(shell.includes('admin-menu-layout.js'));
  assert.ok(shell.includes('admin-demand-loader.js'));
  assert.ok(!/\/legacy|control-center\.js|control-center-ops\.css/.test(shell));
});

test('Storage remains an explicit demand-loaded admin destination', async () => {
  const loader = await read('admin-demand-loader.js');
  const storage = await read('storage-admin.js');
  assert.match(loader, /storage:\s*\{/);
  assert.match(loader, /hashes:\s*\['#storage'\]/);
  assert.match(loader, /scripts:\s*\['storage-admin\.js'\]/);
  assert.match(storage, /location\.hash!=='#storage'/);
});
