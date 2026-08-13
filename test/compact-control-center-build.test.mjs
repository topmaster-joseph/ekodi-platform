import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('compact assets are copied and injected only into Control Center', () => {
  assert.match(build, /'compact-control-center\.css'/);
  assert.match(build, /'compact-control-center\.js'/);
  assert.match(build, /asset === 'control-center\.html'/);
  assert.match(build, /<link rel="stylesheet" href="compact-control-center\.css">/);
  assert.match(build, /<script src="compact-control-center\.js" defer><\/script>/);
});
