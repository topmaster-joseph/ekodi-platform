import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');
const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const campus = await readFile(new URL('../campus-actions.js', import.meta.url), 'utf8');
const homepage = await readFile(new URL('../homepage-admin.js', import.meta.url), 'utf8');

test('Campus and Sites are one canonical Site Management entry', () => {
  assert.match(registry, /ko: '사이트 관리'/);
  assert.match(registry, /en: 'Site Management'/);
  assert.doesNotMatch(layout, /'marketing-ai', 'sites', 'work'/);
  assert.match(layout, /Do not create a second top-level Sites item/);
});

test('Site Management contains all-sites and homepage-presentation nested views', () => {
  assert.match(campus, /사이트 관리 ·/);
  assert.match(campus, /dataset\.siteManagementHomepage/);
  assert.match(campus, /'첫화면 노출'/);
  assert.match(homepage, /homepageAdminAllSites/);
  assert.match(homepage, /activate\?\.\('campus'\)/);
});

test('Homepage ordering uses drag position instead of exposed numeric order input', () => {
  assert.match(homepage, /bindDragOrdering/);
  assert.match(homepage, /row\.draggable/);
  assert.match(homepage, /position \* 10 \+ 10/);
  assert.doesNotMatch(homepage, /order\.type = 'number'/);
  assert.match(homepage, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
