import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const controls = await readFile(new URL('../admin-public-site-controls.js', import.meta.url), 'utf8');

test('public-site controls call the canonical EKODI API origin', () => {
  assert.match(controls, /const API = 'https:\/\/ekodi\.kr\/api\/control\/public-sites';/);
  assert.doesNotMatch(controls, /const API = '\/api\/control\/public-sites';/);
});
