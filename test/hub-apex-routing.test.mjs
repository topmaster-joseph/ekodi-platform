import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const hub = await readFile(new URL('../hub.html', import.meta.url), 'utf8');

test('hub resolves Pay and Cloud from canonical apex paths', () => {
  assert.match(hub, /const path = .*location\.pathname/);
  assert.match(hub, /if \(path === '\/pay'\)/);
  assert.match(hub, /else if \(path === '\/cloud'\)/);
  assert.match(hub, /title:'EKODI Pay', context:canonicalContext/);
  assert.match(hub, /title:'EKODI Cloud', context:canonicalContext/);
});

test('hub internal Admin and Auth links stay on canonical ekodi.kr paths', () => {
  assert.doesNotMatch(hub, /https:\/\/admin\.ekodi\.kr/);
  assert.doesNotMatch(hub, /https:\/\/auth\.ekodi\.kr/);
  assert.match(hub, /https:\/\/ekodi\.kr\/admin\//);
  assert.match(hub, /https:\/\/ekodi\.kr\/auth\//);
});
