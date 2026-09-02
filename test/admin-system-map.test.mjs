import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Release marker: keep the canonical admin production gate attached to this structure contract.
const mapJs = await readFile(new URL('../system-map-admin.js', import.meta.url), 'utf8');
const postbuild = await readFile(new URL('../scripts/admin-system-map-postbuild.mjs', import.meta.url), 'utf8');
const menuLayout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const menuRegistry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');
const routePair = (source, hash, section) => source.includes(`['${hash}', '${section}']`) || source.includes(`${hash}:${section}`);
const canonicalPair = (source, section, hash) => source.includes(`['${section}', '${hash}']`) || source.includes(`${section}:${hash}`);

test('admin system structure overview reads canonical structure, services and monitor status', () => {
  assert.match(mapJs, /\.architecture\[data-panel~="architecture"\]/);
  assert.match(mapJs, /에코디 시스템 구조 개요/);
  assert.match(mapJs, /Identity \+ Space \+ Data \+ AI \+ Journey/);
  assert.match(mapJs, /fetch\('\/platform-boundaries\.json'/);
  assert.match(mapJs, /fetch\('\/monitor-status\.json'/);
  assert.match(mapJs, /fetch\('\/ecosystem-services\.json'/);
  assert.match(mapJs, /fetch\('\/constitution-policy\.json'/);
  assert.match(mapJs, /헌법 기준 구조 ↔ 현재 실제 구조/);
  assert.match(mapJs, /legacyDomainTargets/);
  assert.match(mapJs, /EKODISystemMap/);
  assert.doesNotMatch(mapJs, /setInterval\(/);
});

test('postbuild keeps system map in lazy admin bundle and publishes canonical registries', () => {
  assert.match(postbuild, /\$\{output\}system-health-admin\.js/);
  assert.match(postbuild, /\$\{output\}system-health-admin\.css/);
  assert.match(postbuild, /platform-boundaries\.json/);
  assert.match(postbuild, /config\/ecosystem-services\.json/);
  assert.match(postbuild, /ecosystem-services\.json/);
  assert.match(postbuild, /governance\/constitution\/constitution\.json/);
  assert.match(postbuild, /constitution-policy\.json/);
});

test('system structure is a visible routed system tab', () => {
  assert.match(menuRegistry, /id: 'architecture'[\s\S]*?group: 'system'[\s\S]*?ko: '시스템 구조'/);
  assert.doesNotMatch(menuRegistry, /id: 'architecture'[^\n]*internal: true/);
  assert.ok(routePair(menuLayout, '#architecture', 'architecture'));
  assert.ok(canonicalPair(menuLayout, 'architecture', '#architecture'));
  assert.match(menuLayout, /section\s*===\s*['"]architecture['"]/);
  assert.match(menuLayout, /import\(\s*['"]\.\/system-health-admin\.js['"]\s*\)/);
});
