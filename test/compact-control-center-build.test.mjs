import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../admin-authenticated-shell.js', import.meta.url), 'utf8');

test('compact assets are copied but activated only after authenticated Control Center app is visible', () => {
  assert.match(build, /'admin-compact\.css'/);
  assert.match(build, /'admin-compact\.js'/);
  assert.match(build, /asset === 'control-center\.html'/);
  assert.match(build, /admin-authenticated-shell\.js/);
  assert.doesNotMatch(build, /html = html\.replace\('<\/head>', '<link rel="stylesheet" href="admin-compact\.css">/);
  assert.doesNotMatch(build, /html = html\.replace\('<\/body>', '<script src="admin-compact\.js"/);
  assert.match(shell, /'admin-compact\.css'/);
  assert.match(shell, /'admin-compact\.js'/);
  assert.match(shell, /if \(started \|\| !authenticated\(\)\) return/);
});
