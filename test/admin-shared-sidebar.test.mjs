import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../admin-sidebar.js', import.meta.url), 'utf8');
const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const postbuild = await readFile(new URL('../scripts/admin-performance-postbuild.mjs', import.meta.url), 'utf8');

test('five global axes replace the former many-group admin taxonomy', () => {
  for (const id of ['home', 'operations', 'space', 'services', 'system']) {
    assert.match(registry, new RegExp(`id: '${id}'`));
  }
  for (const retired of ['site-management', 'ai', 'security-audit', 'settings', 'access', 'data']) {
    assert.doesNotMatch(registry, new RegExp(`id: '${retired}'`));
  }
  assert.match(sidebar, /admin-global-navs/);
  assert.match(sidebar, /data-admin-global-group/);
  assert.match(sidebar, /getAdminMenuGroupDefault/);
  assert.match(sidebar, /getAdminMenuGroupForSection/);
});

test('Left navigation is a reusable shared module backed only by the registry', () => {
  assert.match(sidebar, /export function renderAdminSidebar/);
  assert.match(sidebar, /export function syncAdminSidebar/);
  assert.match(sidebar, /export function mountAdminSidebar/);
  assert.match(sidebar, /adminMenuOrder\(\)/);
  assert.match(sidebar, /getAdminMenuLabel\(id, locale\)/);
  assert.match(sidebar, /window\.EKODIAdminSidebar/);
  assert.match(layout, /import\('\.\/admin-sidebar\.js'\)/);
  assert.match(layout, /VISIBLE_NAV_ORDER = Object\.freeze\(adminMenuOrder\(\)\)/);
});

test('Context-first navigation hides unrelated subservices and keeps recent/favorites shortcuts', () => {
  assert.match(sidebar, /CONTEXT_CLASS = 'admin-context-nav'/);
  assert.match(sidebar, /item\.hidden = getAdminMenuGroupForSection\(id\) !== group/);
  assert.match(sidebar, /RECENT_KEY = 'ekodi-admin-recent-sections'/);
  assert.match(sidebar, /FAVORITES_KEY = 'ekodi-admin-favorite-sections'/);
  assert.match(sidebar, /data-admin-quick-section/);
});

test('Menu labels are repaired after feature scripts or clicks mutate them', () => {
  assert.match(sidebar, /MutationObserver\(schedule\)/);
  assert.match(sidebar, /characterData: true/);
  assert.match(sidebar, /nav\.addEventListener\('click'/);
  assert.match(sidebar, /requestAnimationFrame\(sync\)/);
  assert.match(sidebar, /window\.EKODIAdminMenu\?\.locale\?\.\(\)/);
});

test('Internal operational capabilities stay off the global axes as direct items', () => {
  assert.match(layout, /INTERNAL_ONLY_SECTIONS = new Set\(\['services', 'deployments', 'policies'\]\)/);
  assert.match(layout, /#operations:overview/);
  assert.match(layout, /overview:#operations/);
  assert.match(layout, /requestedSection = 'campus'/);
  assert.doesNotMatch(layout, /INTERNAL_ONLY_SECTIONS[^\n]*overview/);
});

test('Shared menu ES modules are published and cache-busted with the admin release', () => {
  assert.match(postbuild, /sharedAdminMenuModules = \['admin-menu-registry\.js', 'admin-sidebar\.js', 'admin-menu-runtime\.js'\]/);
  assert.match(postbuild, /copyFile\(`\$\{root\}\$\{asset\}`, `\$\{dist\}\$\{asset\}`\)/);
  assert.match(postbuild, /\.\.\.sharedAdminMenuModules/);
  assert.match(postbuild, /moduleImportVersions = new Map/);
  assert.match(postbuild, /`\.\/\$\{imported\}\?v=\$\{assetVersion\}`/);
});
