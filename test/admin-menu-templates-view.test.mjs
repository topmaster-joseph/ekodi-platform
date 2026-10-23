import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SITE_ADMIN_MENU_TEMPLATE, menuTemplateRows, renderMenuTemplateTable } from '../admin-menu-templates.js';
import { ADMIN_MENUS, getAdminMenuItem, getAdminMenuForSection, adminMenuOrder } from '../admin-menu-registry.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const policy = JSON.parse(await read('config/admin-menu-audience-policy.json'));

test('the browser template is held identical to the ADMIN-AUDIENCE-001 ledger', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(SITE_ADMIN_MENU_TEMPLATE)), {
    siteTypes: policy.siteTypes,
    groups: policy.siteAdminMenuContract,
  });
});

test('template rows resolve per-site-type menu availability from the contract', () => {
  const rows = menuTemplateRows();
  assert.equal(rows.length, policy.siteAdminMenuContract.length);
  const store = rows.find(row => row.id === 'store');
  assert.deepEqual(store.menus.find(menu => menu.id === 'orders').enabled, { church: false, store: true, org: false, brand: false });
  const devotional = rows.find(row => row.id === 'content').menus.find(menu => menu.id === 'devotional');
  assert.equal(devotional.enabled.church, true);
  assert.equal(devotional.enabled.store, false);
  assert.equal(rows.find(row => row.id === 'billing').readOnly, true);
});

test('rendered table is escaped, labels every site type and marks partial groups', () => {
  const html = renderMenuTemplateTable();
  for (const type of Object.values(policy.siteTypes)) assert.ok(html.includes(`<th scope="col">${type.ko}</th>`));
  assert.match(html, /data-state="some"/);
  assert.match(html, /열람 전용/);
  const hostile = renderMenuTemplateTable({ siteTypes: { a: { ko: '<b>x</b>' } }, groups: [{ id: 'g', ko: '<img src=x onerror=1>', menus: [{ id: 'm', ko: '"q"' }] }] });
  assert.doesNotMatch(hostile, /<img|<b>/);
  assert.match(hostile, /&lt;img src=x onerror=1&gt;/);
});

test('menu templates is a super-admin-only platform screen under 사이트 원장', async () => {
  const item = getAdminMenuItem('menu-templates');
  assert.equal(item.group, 'sites');
  assert.equal(item.superAdminOnly, true);
  assert.equal(getAdminMenuForSection('menu-templates')?.id, 'menu-templates');
  assert.deepEqual(ADMIN_MENUS.filter(menu => menu.group === 'sites').map(menu => menu.id), ['registry', 'menu-templates']);
  assert.ok(adminMenuOrder().includes('menu-templates'));
  assert.equal(policy.classification.entries['menu-templates'].audience, 'platform-super-admin');
  const [routes, postbuild, build, module] = await Promise.all([read('admin-canonical-routes.js'), read('scripts/admin-performance-postbuild.mjs'), read('scripts/build.mjs'), read('admin-menu-templates.js')]);
  assert.match(routes, /'menu-templates':'sites'/);
  assert.match(postbuild, /'platform-maturity-admin\.js', 'admin-menu-templates\.js'\]/);
  assert.match(build, /'admin-menu-templates\.js'/);
  assert.match(module, /if \(session\?\.role !== 'super_admin'\) return deny\(\);/);
});

test('a selected single-detail menu keeps its active contrast (2026-10-23 regression)', async () => {
  const css = await read('admin-design-engine.css');
  // .open must never recolour the item; colour belongs to .active.
  assert.doesNotMatch(css, /\.admin-detail-item\.open\{color:/);
  assert.match(css, /\.admin-detail-item\.open:not\(\.active\)\{font-weight:800!important\}/);
  assert.match(css, /\.admin-detail-item\.active\{\s*color:#050505!important;/);
});

test('inactive menu entries and nested detail routes stay readable on the light sidebar', async () => {
  const css = await read('admin-conversation-workbench.css');
  assert.match(css, /background:#f7f8fc!important;/);
  const block = css.slice(css.indexOf('ADMIN-IA-V3 readability'));
  assert.match(block, /\.sidebar \.admin-detail-item,\nhtml body\.admin-compact\.ekodi-admin-design-engine \.sidebar \.admin-detail-tab,\nhtml body\.admin-compact\.ekodi-admin-design-engine \.sidebar \.admin-detail-more\{\n  color:#3f4a59!important;/);
  // #3f4a59 on #f7f8fc is well above WCAG AA 4.5:1.
  const lum = hex => { const c = [1,3,5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  assert.ok(ratio('#3f4a59', '#f7f8fc') >= 4.5);
  assert.ok(ratio('#050505', '#e7ebf3') >= 4.5);
});
