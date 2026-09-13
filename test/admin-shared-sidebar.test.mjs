import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const registryUrl = new URL('../admin-menu-registry.js', import.meta.url);
const registry = await readFile(registryUrl, 'utf8');
const registryModule = await import(registryUrl);
const sidebar = await readFile(new URL('../admin-sidebar.js', import.meta.url), 'utf8');
const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const postbuild = await readFile(new URL('../scripts/admin-performance-postbuild.mjs', import.meta.url), 'utf8');

test('five canonical axes replace the former many-group admin taxonomy', () => {
  for (const id of ['home', 'operations', 'workspaces', 'services', 'system']) {
    assert.match(registry, new RegExp(`id: '${id}'`));
  }
  for (const retired of ['site-management', 'security-audit', 'settings', 'access']) {
    assert.doesNotMatch(registry, new RegExp(`id: '${retired}'`));
  }
  assert.match(sidebar, /admin-global-navs/);
  assert.match(sidebar, /data-admin-global-group/);
  assert.match(sidebar, /getAdminMenuGroupDefault/);
  assert.match(sidebar, /getAdminMenuGroupForSection/);
});

test('every global work area opens its configured visible default submenu', () => {
  const { ADMIN_MENU_GROUPS, ADMIN_MENU_REGISTRY, getAdminMenuGroupDefault } = registryModule;
  for (const group of ADMIN_MENU_GROUPS) {
    const configured = ADMIN_MENU_REGISTRY.find(item => item.id === group.defaultSection && item.group === group.id && !item.internal && !item.superAdminOnly);
    assert.ok(configured, `${group.id} should have a visible configured default`);
    assert.equal(getAdminMenuGroupDefault(group.id), group.defaultSection);
  }
  assert.match(registry, /const explicit = ADMIN_MENU_REGISTRY\.find/);
});

test('left navigation is a reusable shared module backed only by the registry', () => {
  assert.match(sidebar, /export function renderAdminSidebar/);
  assert.match(sidebar, /export function syncAdminSidebar/);
  assert.match(sidebar, /export function mountAdminSidebar/);
  assert.match(sidebar, /adminMenuOrder\(\)/);
  assert.match(sidebar, /getAdminMenuLabel\(id, locale\)/);
  assert.match(sidebar, /window\.EKODIAdminSidebar/);
  assert.match(layout, /import\('\.\/admin-sidebar\.js'\)/);
  assert.match(layout, /const ORDER=Object\.freeze\(adminMenuOrder\(\)\)/);
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

test('global navigation remains synchronized to the actually active panel', () => {
  const activeNavIndex = sidebar.indexOf("find(item => item.classList.contains('active'))");
  const requestedPanelIndex = sidebar.indexOf('window.EKODIAdminPanels?.current?.()');
  assert.ok(activeNavIndex >= 0 && requestedPanelIndex > activeNavIndex, 'active rendered panel should win over a pending requested section');
  const activateStart = sidebar.indexOf('function activateSection');
  const activateEnd = sidebar.indexOf('export function createAdminSidebarItem', activateStart);
  const activateSource = sidebar.slice(activateStart, activateEnd);
  assert.doesNotMatch(activateSource, /syncWorkbenchState/);
  assert.doesNotMatch(sidebar, /activateSection\(nav, getAdminMenuGroupDefault\(global\.dataset\.adminGlobalGroup\)\)/);
  assert.match(sidebar, /nav\.dataset\.adminFocusedGroup = global\.dataset\.adminGlobalGroup \|\| ''/);
  assert.match(sidebar, /const displayedSection = group === activeGroup \? section : ''/);
});

test('global menu labels use readable contrast on the light sidebar', () => {
  assert.match(sidebar, /\.admin-global-nav\{[^}]*color:#40566d!important/);
  assert.match(sidebar, /\.admin-global-nav\.active\{[^}]*background:#edf4ff[^}]*color:#0b4f8a!important/);
  assert.match(sidebar, /\.admin-global-nav span\{color:inherit!important;opacity:1!important\}/);
  assert.match(sidebar, /font-size:14px;font-weight:780/);
});

test('context tabs keep the same light readable hierarchy as the sidebar', () => {
  assert.match(sidebar, /\.\$\{TABS_SHELL_CLASS\}\{[^}]*min-height:56px[^}]*background:rgba\(255,255,255,\.98\)/);
  assert.match(sidebar, /\.admin-context-title\{[^}]*font-size:13px/);
  assert.match(sidebar, /\.admin-context-tab\{[^}]*min-height:40px[^}]*font-size:14px[^}]*line-height:1\.35/);
  assert.match(sidebar, /\.admin-context-tab\.active\{[^}]*background:#edf4ff[^}]*color:#0b5cab/);
  assert.match(sidebar, /\.admin-capability-shortcut\{[^}]*min-height:40px[^}]*font-size:14px/);
  assert.match(sidebar, /@media\(max-width:760px\)[^`]*\.admin-context-tab\{min-height:42px[^}]*font-size:15px/);
});

test('site-management workbench keeps operational text above miniature-preview density', () => {
  assert.match(sidebar, /#campusPanel \.campus-toolbar p:not\(\.kicker\)\{font-size:14px!important/);
  assert.match(sidebar, /#campusSiteGroups \.campus-group-head h3\{font-size:17px!important/);
  assert.match(sidebar, /#campusSiteGroups \.campus-site-identity strong\{font-size:15px!important/);
  assert.match(sidebar, /#campusSiteGroups \.campus-site-domain\{font-size:13px!important/);
  assert.match(sidebar, /#campusSiteGroups \.campus-row-action\{[^}]*min-height:38px!important[^}]*font-size:13px!important/);
  assert.match(sidebar, /#campusSiteGroups \.campus-homepage-state small\{[^}]*font-size:11px!important/);
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

test('context tabs keep working when the authenticated shell replaces main', () => {
  assert.match(sidebar, /const contextClick = event =>/);
  assert.match(sidebar, /root\.addEventListener\?\.\('click', contextClick, true\)/);
  assert.match(sidebar, /root\.removeEventListener\?\.\('click', contextClick, true\)/);
  assert.doesNotMatch(sidebar, /main\?\.addEventListener\('click',[\s\S]*data-admin-context-section/);
});

test('internal operational capabilities stay off the global work areas as direct items', () => {
  assert.match(layout, /const INTERNAL=new Set\(\['services','deployments','policies'\]\)/);
  assert.match(layout, /#campus:campus/);
  assert.match(layout, /campus:#campus/);
  assert.match(layout, /requestedSection = 'campus'/);
  assert.doesNotMatch(layout, /INTERNAL_ONLY_SECTIONS[^\n]*overview/);
});

test('shared menu ES modules are published and cache-busted with the admin release', () => {
  assert.match(postbuild, /sharedAdminMenuModules = \['admin-menu-registry\.js', 'admin-sidebar\.js', 'admin-menu-runtime\.js', 'ekodibiz-admin-registry\.js', 'platform-maturity-admin\.js'\]/);
  assert.match(postbuild, /copyFile\(`\$\{root\}\$\{asset\}`, `\$\{dist\}\$\{asset\}`\)/);
  assert.match(postbuild, /\.\.\.sharedAdminMenuModules/);
  assert.match(postbuild, /moduleImportVersions = new Map/);
  assert.match(postbuild, /\['admin-menu-registry\.js', \['admin-design-engine\.js', 'platform-maturity-admin\.js'\]\]/);
  assert.match(postbuild, /`\.\/\$\{imported\}\?v=\$\{assetVersion\}`/);
});


test('active global axis expands every submenu directly inside the fixed sidebar', () => {
  assert.ok(sidebar.includes("DETAILS_CLASS = 'admin-global-details'"));
  assert.ok(sidebar.includes('function renderSidebarDetails(nav, globals, group, section, locale)'));
  assert.ok(sidebar.includes('data-admin-detail-section'));
  assert.ok(sidebar.includes('const ids = availableIds(nav, group)'));
  assert.ok(sidebar.includes('const nodes = ids.map(id =>'));
  assert.ok(sidebar.includes('renderSidebarDetails(nav, globals, group, section, locale)'));
  assert.ok(sidebar.includes('activateSection(nav, detail.dataset.adminDetailSection)'));
  assert.ok(!sidebar.includes("document.createElement('details')"));
  assert.ok(!sidebar.includes('getAdminMenuCategoryLabel(category, locale)'));
});
