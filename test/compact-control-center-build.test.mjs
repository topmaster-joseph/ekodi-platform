import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [build, shell, postbuild] = await Promise.all([
  read('scripts/build.mjs'), read('admin-authenticated-shell.js'), read('scripts/admin-thin-postbuild.mjs')
]);

test('compact assets are generated and activated only after authenticated Admin becomes visible', () => {
  assert.match(build, /'admin-compact\.css'/);
  assert.match(build, /'admin-authenticated-shell\.js'/);
  assert.match(postbuild, /admin-compact\.js/);
  assert.doesNotMatch(build, /<script src="admin-compact\.js"/);
  assert.match(shell, /'admin-compact\.css'/);
  assert.match(shell, /'admin-compact\.js'/);
  assert.match(shell, /if\s*\(\s*started\s*\|\|\s*!authenticated\(\)\s*\)\s*return/);
});
