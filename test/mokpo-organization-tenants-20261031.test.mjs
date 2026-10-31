import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isOrganizationAdminPath, organizationAdminPage, organizationAdminScript, ORGANIZATION_ADMIN_TENANTS } from '../organization-admin-page.js';

test('presbytery and mission admin paths resolve to their own tenants; Hammu unchanged', async () => {
  const cases = [
    ['/hammu/admin', 'hammu', '함무시찰회'],
    ['/hammu/admin/finance', 'hammu', '함무시찰회'],
    ['/mokpo-presbytery/admin', 'mokpo-presbytery', '목포노회'],
    ['/mokpo-presbytery/admin/notices', 'mokpo-presbytery', '목포노회'],
    ['/mokpo-presbytery/mission/admin', 'mokpo-mission', '목포노회 선교부'],
    ['/mokpo-presbytery/mission/admin/finance', 'mokpo-mission', '목포노회 선교부'],
  ];
  for (const [path, slug, name] of cases) {
    assert.equal(isOrganizationAdminPath(path), true, path);
    const res = organizationAdminPage(path);
    const html = await res.text();
    assert.match(html, new RegExp(`data-ekodi-organization="${slug}"`), path);
    assert.match(html, new RegExp(`<title>[^<]* · ${name}</title>`), path);
    assert.equal(res.headers.get('x-ekodi-authority-scope'), 'tenant');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(html, /noindex/);
  }
});

test('non-admin and unknown sections are not organization admin paths', () => {
  for (const path of ['/mokpo-presbytery', '/mokpo-presbytery/', '/mokpo-presbytery/mission', '/mokpo-presbytery/members', '/mokpo-presbytery/admin/members', '/mokpo-presbytery/mission/admin/roster', '/other/admin', '/mokpo-presbytery-x/admin']) {
    assert.equal(isOrganizationAdminPath(path), false, path);
  }
});

test('mission admin links stay inside the mission tenant', async () => {
  const html = await organizationAdminPage('/mokpo-presbytery/mission/admin').text();
  const links = [...html.matchAll(/href="(\/[^"]*\/admin[^"]*)"/g)].map(m => m[1]);
  assert.ok(links.length >= 5);
  for (const href of links) assert.ok(href.startsWith('/mokpo-presbytery/mission/admin'), href);
  assert.doesNotMatch(html, /href="\/hammu/);
});

test('admin browser script resolves tenant from the registry, not the first path segment', async () => {
  const js = await (await organizationAdminScript()).text();
  for (const org of ORGANIZATION_ADMIN_TENANTS) assert.ok(js.includes(JSON.stringify(org.base)), org.base);
  assert.doesNotMatch(js, /location\.pathname\.split\('\/'\)\[1\]/);
  new Function(js); // parses
});

test('migration is additive and ships no roster or contact data', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261031123000_mokpo_presbytery_organization_tenants.sql', import.meta.url), 'utf8');
  assert.match(sql, /'mokpo-presbytery'/);
  assert.match(sql, /'mokpo-mission'/);
  assert.doesNotMatch(sql, /^\s*(drop|truncate|delete|update)\b/im);
  assert.doesNotMatch(sql, /01[016789]-\d{3,4}-\d{4}/);
  assert.match(sql, /'review'/);
});

test('static presbytery pages link to tenant admin and keep the roster locked', () => {
  const home = fs.readFileSync(new URL('../sites/mokpo-presbytery/index.html', import.meta.url), 'utf8');
  const mission = fs.readFileSync(new URL('../sites/mokpo-presbytery/mission/index.html', import.meta.url), 'utf8');
  assert.match(home, /href="\/mokpo-presbytery\/admin"/);
  assert.match(mission, /href="\/mokpo-presbytery\/mission\/admin"/);
  assert.doesNotMatch(home, /href="[^"]*member/i);
});
