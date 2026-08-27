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
  assert.match(handoff, /location\.pathname\.startsWith\('\/legacy'\)\?'ai-ops'/);
  assert.match(shell, /function canonicalizeLegacyEntry\(\)/);
  assert.match(shell, /'#ai-ops'/);
  assert.doesNotMatch(shell, /await loadScript\('control-center\.js'\)/);
  assert.doesNotMatch(shell, /loadStyle\('control-center-ops\.css'\)/);
});

test('authenticated Admin Tools links cannot reopen legacy UI', async () => {
  const shell = await read('admin-authenticated-shell.js');
  assert.match(shell, /function repairLegacyLinks\(\)/);
  assert.match(shell, /hero\.href='#ai-ops'/);
  assert.match(shell, /a\[href="\/legacy"\]/);
  assert.match(shell, /link\.href='#ai-ops'/);
});

test('Storage remains an explicit demand-loaded admin destination', async () => {
  const loader = await read('admin-demand-loader.js');
  const storage = await read('storage-admin.js');
  assert.match(loader, /storage:\s*\{/);
  assert.match(loader, /hashes:\s*\['#storage'\]/);
  assert.match(loader, /scripts:\s*\['storage-admin\.js'\]/);
  assert.match(storage, /location\.hash!=='#storage'/);
});
