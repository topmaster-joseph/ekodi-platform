import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const [shell, worker, build] = await Promise.all([
  read('admin-authenticated-shell.js'),
  read('site-worker.js'),
  read('scripts/build.mjs'),
]);

test('deferred public-site controls are shipped as a secured admin asset', () => {
  assert.match(shell, /admin-public-site-controls\.js/);
  assert.match(build, /'admin-public-site-controls\.js'/);
  const adminAssets = worker.match(/const ADMIN_ASSETS = new Set\(\[[\s\S]*?\]\);/)?.[0] || '';
  assert.match(adminAssets, /'\/admin-public-site-controls\.js'/);
});
