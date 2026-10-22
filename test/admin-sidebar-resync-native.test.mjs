import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('native administrator sidebar never drops a work-area update during synchronous hydration', async () => {
  const source = await readFile(new URL('../admin-sidebar.js',import.meta.url),'utf8');
  assert.match(source,/let resyncRequested = false;/);
  assert.match(source,/if \(syncing\) \{\s*resyncRequested = true;\s*return;\s*\}/);
  assert.match(source,/finally \{\s*syncing = false;\s*if \(resyncRequested\) \{\s*resyncRequested = false;\s*schedule\(\);/);
  assert.doesNotMatch(source,/if \(queued \|\| syncing\) return;/);
  assert.match(source,/const observer = new MutationObserver\(schedule\)/);
  assert.match(source,/window\.addEventListener\('ekodi-admin-section-changed', sectionChanged\)/);
  assert.match(source,/services: \['engine-all', 'engine-core'/);
  assert.match(source,/details\.replaceChildren\(\.\.\.nodes\)/);
  assert.match(source,/details\.hidden = nodes\.length === 0/);
});

test('Admin Chromium still fails closed when an actual native left-navigation detail remains absent', async () => {
  const verify=await readFile(new URL('../scripts/verify-admin-production-ui-e2e.mjs',import.meta.url),'utf8');
  assert.match(verify,/throw new Error\(\x60\$\{id\}: no visible left-navigation trigger after selecting work area/);
  assert.match(verify,/await dispatchClick\(groupButton, 8_000\)/);
  assert.doesNotMatch(verify,/no visible left-navigation trigger[\s\S]{0,160}return true/);
});
