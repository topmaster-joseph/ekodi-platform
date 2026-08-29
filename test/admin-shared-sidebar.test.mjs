import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../admin-sidebar.js', import.meta.url), 'utf8');
const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const postbuild = await readFile(new URL('../scripts/admin-performance-postbuild.mjs', import.meta.url), 'utf8');

test('eight stable work areas replace the former many-group admin taxonomy', () => {
  for (const id of ['home', 'operations', 'people', 'services', 'ai', 'business', 'data', 'system']) {
    assert.match(registry, new RegExp(`id: '${id}'`));
  }
  for (const retired of ['site-management', 'security-audit', 'settings', 'access', 'space']) {
    assert.doesNotMatch(registry, new RegExp(`id: '${retired}'`));
  }
  assert.match(sidebar, /admin-global-navs/);
  assert.match(sidebar, /data-admin-global-group/);
  assert.match(sidebar, /getAdminMenuGroupDefault/);
  assert.match(sidebar, /getAdminMenuGroupForSection/);
});

test('left navigation is a reusable shared module backed only by the registry', () => {
  assert.match(sidebar, /export function renderAdminSidebar/);
  assert.match(sidebar, /export function syncAdminSidebar/);
  assert.match(sidebar, /export function mountAdminSidebar/);
  assert.match(sidebar, /adminMenuOrder\(\)/);
  assert.match(sidebar, /getAdminMenuLabel\(id, locale\)/);
  assert.match(sidebar, /window\.EKODIAdminSidebar/);
  assert.match(layout, /import\('\.\/admin-sidebar\.js'\)/);
  assert.match(layout, /VISIBLE_NAV_ORDER = Object\.freeze\(adminMenuOrder\(\)\)/);
});

test('contextual subservices render as a sticky top tab strip and source nav stays hidden', () => {
  assert.match(sidebar, /SOURCE_CLASS = 'admin-context-source'/);
  assert.match(sidebar, /TABS_SHELL_CLASS = 'admin-context-tabs-shell'/);
  assert.match(sidebar, /TABS_CLASS = 'admin-context-tabs'/);
  assert.match(sidebar, /data-admin-context-section/);
  assert.match(sidebar, /position:sticky/);
  assert.match(sidebar, /backdrop-filter:none/);
  assert.doesNotMatch(sidebar, /RECENT_KEY|FAVORITES_KEY|data-admin-quick-section/);
});

test('menu labels and tab state are repaired when features are installed or sections change', () => {
  assert.match(sidebar, /MutationObserver\(schedule\)/);
  assert.match(sidebar, /observer\.observe\(nav, \{ childList: true, subtree: false \}\)/);
  assert.match(sidebar, /ekodi-nav-changed/);
  assert.match(sidebar, /ekodi-feature-installed/);
  assert.match(sidebar, /ekodi-admin-section-changed/);
  assert.match(sidebar, /window\.EKODIAdminMenu\?\.locale\?\.\(\)/);
  assert.doesNotMatch(sidebar, /subtree: true/);
});

test('internal operational capabilities stay off the global work areas as direct items', () => {
  assert.match(layout, /INTERNAL_ONLY_SECTIONS = new Set\(\['services', 'deployments', 'policies'\]\)/);
  assert.match(layout, /#operations:overview/);
  assert.match(layout, /overview:#operations/);
  assert.match(layout, /requestedSection = 'campus'/);
  assert.doesNotMatch(layout, /INTERNAL_ONLY_SECTIONS[^\n]*overview/);
});

test('shared menu ES modules are published and cache-busted with the admin release', () => {
  assert.match(postbuild, /sharedAdminMenuModules = \['admin-menu-registry\.js', 'admin-sidebar\.js', 'admin-menu-runtime\.js'\]/);
  assert.match(postbuild, /copyFile\(`\$\{root\}\$\{asset\}`, `\$\{dist\}\$\{asset\}`\)/);
  assert.match(postbuild, /\.\.\.sharedAdminMenuModules/);
  assert.match(postbuild, /moduleImportVersions = new Map/);
  assert.match(postbuild, /`\.\/\$\{imported\}\?v=\$\{assetVersion\}`/);
});
