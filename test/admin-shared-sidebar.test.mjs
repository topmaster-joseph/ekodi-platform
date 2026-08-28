import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../admin-sidebar.js', import.meta.url), 'utf8');
const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const postbuild = await readFile(new URL('../scripts/admin-performance-postbuild.mjs', import.meta.url), 'utf8');

test('Site Management is the canonical first admin menu and Operations is retired', () => {
  const campus = registry.indexOf("{ id: 'campus'");
  assert.ok(campus >= 0);
  assert.doesNotMatch(registry, /id: 'overview'/);
  assert.match(registry, /id: 'campus'.*ko: '사이트 관리'.*en: 'Site Management'/);
  assert.match(sidebar, /RETIRED_MENU_SECTIONS = new Set\(\['overview'\]\)/);
  assert.match(sidebar, /RETIRED_MENU_SECTIONS\.has\(id\)/);
  assert.match(sidebar, /item\.remove\(\)/);
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

test('Menu labels are repaired after feature scripts or clicks mutate them', () => {
  assert.match(sidebar, /MutationObserver\(schedule\)/);
  assert.match(sidebar, /characterData: true/);
  assert.match(sidebar, /nav\.addEventListener\('click'/);
  assert.match(sidebar, /requestAnimationFrame\(sync\)/);
  assert.match(sidebar, /window\.EKODIAdminMenu\?\.locale\?\.\(\)/);
});

test('Operations remains a public compatibility route even though Site Management is the login home', () => {
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
