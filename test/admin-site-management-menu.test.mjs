import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');
const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const campus = await readFile(new URL('../campus-actions.js', import.meta.url), 'utf8');
const homepage = await readFile(new URL('../homepage-admin.js', import.meta.url), 'utf8');

test('Campus and Sites are one canonical Site Management entry', () => {
  assert.match(registry, /id: 'campus'[\s\S]*ko: '사이트 관리'[\s\S]*en: 'Site Management'/);
  assert.doesNotMatch(registry, /id: 'sites'/);
  assert.match(layout, /#sites:sites/);
  assert.ok(layout.includes("if(section==='sites')return openSites();"));
  assert.match(layout, /navItemFor\('campus'\)\?\.classList\.add\('active'\)/);
});

test('Site Management renders one shared list for operations and homepage presentation', () => {
  assert.match(campus, /import\('\.\/homepage-admin\.js'\)/);
  assert.match(campus, /reconcileRegistryServices/);
  assert.match(campus, /EKODI\.KR 첫화면 공개 설정을 한 목록에서 관리합니다/);
  assert.match(homepage, /document\.querySelector\('#campusPanel'\)/);
  assert.match(homepage, /targets\.add\('sites'\)/);
  assert.match(homepage, /querySelectorAll\('#campusSiteGroups \.campus-site-item'\)/);
  assert.match(homepage, /EKODI\.KR 첫화면 비대상/);
  assert.doesNotMatch(homepage, /homepage-admin-grid/);
});

test('legacy #sites entry converges into Campus instead of creating a second list', () => {
  assert.match(layout, /#sites:sites/);
  assert.match(homepage, /mountWhenCampusReady/);
  assert.match(homepage, /data-demand-feature="campus"/);
  assert.match(homepage, /window\.EKODIAdminPanels\?\.activate\?\.\('sites'\)/);
  assert.match(homepage, /document\.querySelector\('#homepageAdminPanel'\)\?\.remove\(\)/);
});

test('Homepage ordering stays keyboard-accessible inside grouped Campus cards', () => {
  assert.match(homepage, /up\.dataset\.homepageMove = '-1'/);
  assert.match(homepage, /down\.dataset\.homepageMove = '1'/);
  assert.match(homepage, /moveRow\(row, Number\(button\.dataset\.homepageMove\)\)/);
  assert.match(homepage, /normalizeOrderValues/);
  assert.doesNotMatch(homepage, /order\.type = 'number'/);
  assert.doesNotMatch(homepage, /row\.draggable/);
});
