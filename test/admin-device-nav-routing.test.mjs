import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [layout, devices] = await Promise.all([
  readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8'),
  readFile(new URL('../device-control-admin.js', import.meta.url), 'utf8'),
]);

test('Device navigation is recognized by the central admin panel router', () => {
  assert.match(devices, /data\.deviceControlNav|dataset\.deviceControlNav/);
  assert.match(layout, /deviceControlNav/);
  assert.match(layout, /'devices'/);
  assert.match(layout, /data-device-control-nav/);
});
