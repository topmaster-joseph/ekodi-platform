import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const menuLayout = readFileSync(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const healthModule = readFileSync(new URL('../system-health-admin.js', import.meta.url), 'utf8');

test('home overview has a bounded same-origin fallback for a missing delegated Health panel', () => {
  assert.match(menuLayout, /if\(delegate==='health'&&!hasPanel\(section\)&&!hasPanel\(delegate\)\)\{/);
  assert.match(menuLayout, /await import\('\.\/system-health-admin\.js'\);/);
  assert.match(menuLayout, /if\(requestedSection!==section\)return;\s*applyOrder\(\);/);
});

test('the fallback module is idempotent and mounts the original overview section', () => {
  assert.match(healthModule, /if \(document\.getElementById\(MODULE_ID\)\) return;/);
  assert.match(healthModule, /section\.dataset\.panel = `\$\{SECTION\} platform-overview`;/);
  assert.match(healthModule, /content\.append\(section\);/);
});
