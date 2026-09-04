import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../admin-authenticated-shell.js', import.meta.url), 'utf8');
const postbuild = await readFile(new URL('../scripts/admin-thin-postbuild.mjs', import.meta.url), 'utf8');

test('compact runtime is generated postbuild and activated only after the authenticated Admin Shell is visible', () => {
  assert.match(build, /'admin-compact\.css'/);
  assert.doesNotMatch(build, /'admin-compact\.js'/);
  assert.match(postbuild, /admin-compact\.js/);
  assert.match(build, /admin-authenticated-shell\.js/);
  assert.doesNotMatch(build, /asset === 'control-center\.html'/);
  assert.match(shell, /'admin-compact\.css'/);
  assert.match(shell, /'admin-compact\.js'/);
  assert.ok(shell.includes('if(started||!authenticated())return'));
});
