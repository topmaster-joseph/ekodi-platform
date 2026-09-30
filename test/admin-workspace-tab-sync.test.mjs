import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');

test('site global switch synchronizes shared context tabs immediately', () => {
  assert.match(registry, /id:\s*'sites'.*defaultSection:\s*'sites-all'/s);
  assert.match(registry, /id:\s*'clients'.*group:\s*'sites'/s);
  assert.match(layout, /const sharedSidebar=mountAdminSidebar\(document\);/);
  assert.match(layout, /\[data-admin-global-group\][\s\S]*sharedSidebar\?\.sync\?\.\(\);/);
});

test('global-area synchronization remains delegated to the shared sidebar instead of duplicating tab rendering', () => {
  assert.doesNotMatch(layout, /createElement\(['"]button['"]\)[\s\S]{0,240}admin-context-tab/);
  assert.match(layout, /import\('\.\/admin-sidebar\.js'\)/);
});
