import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mapJs = await readFile(new URL('../system-map-admin.js', import.meta.url), 'utf8');
const postbuild = await readFile(new URL('../scripts/admin-system-map-postbuild.mjs', import.meta.url), 'utf8');
const menuLayout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const menuRegistry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');

test('admin system structure overview reads canonical structure, services and monitor status', () => {
  assert.match(mapJs, /\.architecture\[data-panel~="architecture"\]/);
  assert.match(mapJs, /에코디 시스템 구조 개요/);
  assert.match(mapJs, /Identity \+ Space \+ Data \+ AI \+ Journey/);
  assert.match(mapJs, /fetch\('\/platform-boundaries\.json'/);
  assert.match(mapJs, /fetch\('\/monitor-status\.json'/);
  assert.match(mapJs, /fetch\('\/ecosystem-services\.json'/);
  assert.match(mapJs, /EKODISystemMap/);
  assert.doesNotMatch(mapJs, /setInterval\(/);
});

test('postbuild keeps system map in lazy admin bundle and publishes canonical registries', () => {
  assert.match(postbuild, /\$\{output\}system-health-admin\.js/);
  assert.match(postbuild, /\$\{output\}system-health-admin\.css/);
  assert.match(postbuild, /platform-boundaries\.json/);
  assert.match(postbuild, /config\/ecosystem-services\.json/);
  assert.match(postbuild, /ecosystem-services\.json/);
});

test('system structure overview is a visible routed admin menu', () => {
  assert.match(menuRegistry, /id: 'architecture'[\s\S]*?ko: '시스템 구조 개요'/);
  assert.doesNotMatch(menuRegistry, /id: 'architecture'[^\n]*internal: true/);
  assert.match(menuLayout, /'health', 'security', 'architecture'/);
  assert.match(menuLayout, /\['#architecture', 'architecture'\]/);
  assert.match(menuLayout, /section === 'architecture'[\s\S]*?system-health-admin\.js/);
});
