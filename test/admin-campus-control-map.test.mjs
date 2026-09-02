import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js = await readFile(new URL('../campus-actions.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../campus-actions.css', import.meta.url), 'utf8');

test('Site Management renders the canonical grouped site catalog', () => {
  assert.ok(js.includes('const ALL_SITES = ['));
  assert.ok(js.includes('const SITE_GROUPS = ['));
  assert.ok(js.includes('campusSiteGroups'));
  assert.ok(js.includes('campus-groups-grid'));
  for (const domain of ['books.ekodi.kr', 'church.ekodi.kr', 'mall.ekodi.kr']) assert.ok(js.includes(domain));
});

test('site rows expose bounded operational actions and external open links', () => {
  assert.ok(js.includes("makeButton('Manage'"));
  assert.ok(js.includes("makeButton('Status'"));
  assert.ok(js.includes("link.target = '_blank'"));
  assert.ok(js.includes('openSection('));
  assert.ok(js.includes('focusService('));
});

test('compact site-management styling remains available', () => {
  assert.match(css, /#campusPanel/);
  assert.match(css, /\.campus-toolbar/);
  assert.match(css, /\.campus-site-item/);
});
