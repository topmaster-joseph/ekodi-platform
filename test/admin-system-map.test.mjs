import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mapJs = await readFile(new URL('../system-map-admin.js', import.meta.url), 'utf8');
const postbuild = await readFile(new URL('../scripts/admin-system-map-postbuild.mjs', import.meta.url), 'utf8');

test('admin system map reads canonical structure and monitor status', () => {
  assert.match(mapJs, /fetch\('\/platform-boundaries\.json'/);
  assert.match(mapJs, /fetch\('\/monitor-status\.json'/);
  assert.match(mapJs, /EKODISystemMap/);
  assert.doesNotMatch(mapJs, /setInterval\(/);
});

test('postbuild keeps system map inside lazy Health bundle', () => {
  assert.match(postbuild, /\$\{output\}system-health-admin\.js/);
  assert.match(postbuild, /\$\{output\}system-health-admin\.css/);
  assert.match(postbuild, /platform-boundaries\.json/);
});
