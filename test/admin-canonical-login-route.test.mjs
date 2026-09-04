import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('historical storige entry is normalized and preserved through central auth', async () => {
  const handoff = await read('admin-central-handoff.js');
  assert.match(handoff, /storige:'storage'/);
  assert.match(handoff, /target=`https:\/\/admin\.ekodi\.kr\/\?route=\$\{encodeURIComponent\(r\)\}`/);
  assert.match(handoff, /return_to=\$\{encodeURIComponent\(target\)\}/);
  assert.match(handoff, /query\.get\('route'\)/);
  assert.match(handoff, /cleanRouteUrl\(route\)/);
});

test('legacy path is compatibility-only and converges to current AI Ops', async () => {
  const handoff = await read('admin-central-handoff.js');
  const shell = await read('admin-authenticated-shell.js');
  const worker = await read('site-worker.js');
  for (const path of ['/legacy','/legacy/','/legacy.html']) assert.ok(worker.includes(`'${path}'`));
  assert.match(worker, /function retiredAdminResponse\(\)/);
  assert.ok(worker.includes("'admin-retired'"));
  assert.doesNotMatch(shell, /control-center\.js|control-center-ops\.css/);
});

test('authenticated Admin routing exposes only current hashes and cannot reopen retired legacy UI', async () => {
  const handoff = await read('admin-central-handoff.js');
  const shell = await read('admin-authenticated-shell.js');
  assert.doesNotMatch(handoff, /legacy/);
  assert.match(handoff, /ai-ops/);
  assert.match(shell, /'ai-ops':'aiops'/);
  assert.doesNotMatch(shell, /control-center|\/legacy/);
});

test('Storage remains an explicit demand-loaded admin destination', async () => {
  const loader = await read('admin-demand-loader.js');
  const storage = await read('storage-admin.js');
  assert.match(loader, /storage:\s*\{/);
  assert.match(loader, /hashes:\s*\['#storage'\]/);
  assert.match(loader, /scripts:\s*\['storage-admin\.js'\]/);
  assert.match(storage, /location\.hash!=='#storage'/);
});
