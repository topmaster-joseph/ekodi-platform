import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [registry, campus, css] = await Promise.all([
  readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8'),
  readFile(new URL('../campus-actions.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-compact.css', import.meta.url), 'utf8'),
]);

test('Site Management is the canonical home entry and renders registry-driven site groups', () => {
  assert.match(registry, /id: 'campus'[\s\S]*en: 'Site Management'/);
  assert.ok(campus.includes('const ALL_SITES = ['));
  assert.ok(campus.includes('const SITE_GROUPS = ['));
  assert.ok(campus.includes('function renderSiteItem(site)'));
  assert.ok(campus.includes("className = 'campus-site-item'"));
  assert.ok(campus.includes('function renderGroup(group)'));
});

test('site rows keep bounded manage, status and public-open actions', () => {
  assert.ok(campus.includes("function openSection(section, domain, fallback = '')"));
  assert.ok(campus.includes('function focusService(domain)'));
  assert.ok(campus.includes('dataset.campusAction') && campus.includes('dataset.campusTarget'));
  assert.ok(campus.includes("makeButton('Manage'"));
  assert.ok(campus.includes("makeButton('Status'"));
  assert.ok(campus.includes("link.target = '_blank'"));
  assert.ok(campus.includes("link.rel = 'noopener'"));
});

test('compact styling retains Site Management focus affordances', () => {
  assert.match(css, /campus/);
  assert.match(css, /campus-focus/);
});
