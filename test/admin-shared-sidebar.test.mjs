import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');

test('Operations is the canonical first admin menu and Site Management follows it', () => {
  assert.match(layout, /overview: \{ icon: '⌂', ko: '운영 현황', en: 'Operations' \}/);
  assert.match(layout, /campus: \{ icon: '▦', ko: '사이트 관리', en: 'Site Management' \}/);
  assert.match(layout, /\['overview', 'campus', 'aiops', 'health', 'security'/);
  assert.doesNotMatch(layout, /overview: \{[^}]*internal: true/);
});

test('The shipped menu layout is the reusable shared sidebar module', () => {
  assert.match(layout, /function renderSidebar\(target, ids = VISIBLE_NAV_ORDER\)/);
  assert.match(layout, /function syncSidebar\(root = nav\)/);
  assert.match(layout, /window\.EKODIAdminSidebar = Object\.freeze/);
  assert.match(layout, /render: renderSidebar/);
  assert.match(layout, /sync: syncSidebar/);
  assert.match(layout, /setLocale/);
});

test('Menu labels are stable across clicks and feature loading without persistent observers', () => {
  assert.match(layout, /nav\.addEventListener\('click'/);
  assert.match(layout, /queueMicrotask\(syncSidebar\)/);
  assert.match(layout, /requestAnimationFrame\(syncSidebar\)/);
  assert.match(layout, /window\.addEventListener\('ekodi-feature-installed', reconcileNavigation\)/);
  assert.match(layout, /const LOCALE_KEY = 'ekodi-admin-locale'/);
  assert.doesNotMatch(layout, /MutationObserver/);
  assert.doesNotMatch(layout, /setInterval\(/);
});

test('Operations uses its own public route instead of being redirected to AI Ops', () => {
  assert.match(layout, /INTERNAL_ONLY_SECTIONS = new Set\(\['services', 'deployments', 'policies'\]\)/);
  assert.match(layout, /\['overview', '#operations'\]/);
  assert.match(layout, /requestedSection = 'overview'/);
  assert.match(layout, /activatePanel\('overview'\)/);
});
