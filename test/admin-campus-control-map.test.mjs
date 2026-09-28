import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [registry, campus, css] = await Promise.all([
  readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8'),
  readFile(new URL('../campus-actions.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-compact.css', import.meta.url), 'utf8'),
]);

test('Sites work area delegates to the canonical site management registry', () => {
  assert.match(registry, /id: 'sites-all'[^\n]*group: 'sites'[^\n]*delegateSection: 'campus'[^\n]*en: 'All Sites'/);
  assert.match(registry, /id: 'campus'[^\n]*group: 'sites'[^\n]*en: 'Site Management Registry'[^\n]*internal: true/);
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
  assert.ok(campus.includes("makeSurfaceLink('관리자'") || campus.includes("makeButton('Manage'"));
  assert.ok(campus.includes("makeButton('Status'"));
  assert.ok(campus.includes("link.target = '_blank'"));
  assert.ok(campus.includes("link.rel = 'noopener'"));
});

test('compact styling retains Site Structure focus affordances', () => {
  assert.match(css, /campus/);
  assert.match(css, /campus-focus/);
});


test('site registry exposes separate user and administrator surfaces for EKODI sites', () => {
  for (const marker of [
    "name: '에코디비즈'","publicHref:'/ekodibiz'","adminHref:'/ekodibiz/admin'",
    "name: '에코디몰'","publicHref:'/ekodimall'","adminHref:'/ekodimall/admin'",
    "name: '에코디투자'","publicHref:'/invest'","adminHref:'/invest/admin'",
    "name: '에코디무역'","publicHref:'/trade'","adminHref:'/trade/admin'"
  ]) assert.ok(campus.includes(marker), marker);
  assert.ok(campus.includes("makeSurfaceLink('사용자'"));
  assert.ok(campus.includes("makeSurfaceLink('관리자'"));
  assert.ok(campus.includes("relation.textContent=site.adminHref?'사용자·관리자 분리'"));
});
