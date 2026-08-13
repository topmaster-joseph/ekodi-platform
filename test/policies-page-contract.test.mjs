import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ui = await readFile(new URL('../compact-control-center.js', import.meta.url), 'utf8');

test('Policies is a separate Control Center panel', () => {
  assert.match(ui, /section\.id = 'policiesPanel'/);
  assert.match(ui, /section\.dataset\.panel = 'policies'/);
  assert.match(ui, /button\.dataset\.section = 'policies'/);
  assert.match(ui, /#policies/);
});
