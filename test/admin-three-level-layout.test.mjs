import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ADMIN_LAYOUT_MODEL,
  ADMIN_MENUS,
  ADMIN_MENU_REGISTRY,
  adminMenusForGroup,
  isAdminRiskSection,
} from '../admin-menu-registry.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [sidebar, campus, templates, hierarchyRaw, principles, designCss] = await Promise.all([
  read('admin-sidebar.js'), read('campus-actions.js'), read('admin-menu-templates.js'),
  read('config/admin-site-hierarchy.json'), read('ADMIN_UI_PRINCIPLES.md'), read('admin-design-engine.css'),
]);
const hierarchy = JSON.parse(hierarchyRaw);

test('ADMIN-LAYOUT-3L-001: left = 1차 group + 2차 menu, 3차 detail = workspace strip, settings below', () => {
  assert.equal(ADMIN_LAYOUT_MODEL, 'left-group-menu-top-detail-v1');
  assert.match(sidebar, /const STRIP_CLASS = 'admin-work-strip'/);
  assert.match(sidebar, /content\.insertAdjacentElement\('beforebegin', strip\)/, 'strip sits above the settings content');
  assert.match(sidebar, /export function renderAdminWorkStrip/);
  assert.match(sidebar, /window\.EKODIAdminWorkStrip = Object\.freeze\(\{ render: renderAdminWorkStrip \}\)/);
  // details are never nested on the left any more
  assert.doesNotMatch(sidebar, /nodes\.push\(detailButton\(id, getAdminMenuLabel\(id, locale\), TAB_CLASS/);
  // a one-detail menu shows no strip; the retired context tab shell stays retired
  assert.match(sidebar, /if \(tabs\.length < 2\)/);
  assert.match(sidebar, /main\?\.querySelector\(':scope>\.admin-context-tabs-shell'\)\?\.remove\(\)/);
  // the dark-sidebar tab palette must not leak into the light strip
  assert.match(designCss, /\.admin-work-strip \.admin-work-strip-item\{\n  color:#26303d!important;/);
  assert.match(principles, /ADMIN-LAYOUT-3L-001/);
});

test('사이트관리 2차 menus are the site classifications the campus filter understands', () => {
  const classes = adminMenusForGroup('sites').filter(menu => menu.siteClass);
  assert.equal(classes.length, 10);
  for (const menu of classes) {
    assert.equal(menu.sections.length, 1);
    assert.match(campus, new RegExp(`'${menu.sections[0]}': \\{ group:`), `${menu.sections[0]} must be a campus site filter`);
  }
  assert.match(sidebar, /if \(activeMenu\?\.menu\?\.siteClass\)/);
  assert.match(sidebar, /ekodi-admin-site-class-selected/);
  assert.match(campus, /window\.addEventListener\('ekodi-admin-site-class-selected'/);
});

test('selected site admin menus are hand-off links to the registered child admin root, never /admin aliases', () => {
  const block = campus.slice(campus.indexOf('const SITE_ADMIN_ROOTS'), campus.indexOf(']);', campus.indexOf('const SITE_ADMIN_ROOTS')));
  const roots = [...block.matchAll(/id: '([^']+)', publicPath: '([^']+)', adminPath: '([^']+)'/g)].map(m => ({ id: m[1], publicPath: m[2], adminPath: m[3] }));
  const expected = hierarchy.sites.map(({ id, publicPath, adminPath }) => ({ id, publicPath, adminPath }));
  const byId = list => Object.fromEntries(list.map(item => [item.id, item]));
  assert.deepEqual(byId(roots), byId(expected), 'campus site admin roots must mirror config/admin-site-hierarchy.json');
  assert.match(campus, /link\.href = `\$\{site\.adminRoot\.adminPath\}\/\$\{encodeURIComponent\(menu\.id\)\}`/);
  assert.doesNotMatch(campus, /['"`]\/admin\/(?:ekodichurch|ekodimall|jadam|pizzamaru|yogurt|cgma|cmpmyi)/);
  assert.match(campus, /url\.searchParams\.set\('site', activeSiteKey\)/, 'selected site is view state on the canonical classification route');
  assert.match(templates, /window\.EKODISiteAdminMenuTemplate = SITE_ADMIN_MENU_TEMPLATE/);
  assert.match(campus, /\(확인필요\)/, 'sites without a registered admin root are labelled, not guessed');
});

test('ADMIN-RISK-GUARD-001 flags high-risk settings and guards their saves', async () => {
  const risky = ADMIN_MENU_REGISTRY.filter(item => item.risk === 'high').map(item => item.id).sort();
  assert.deepEqual(risky, ['admins','ai-membership','ai-module-spec','ai-settings','aiops','audit-records','deployments','devices','finance','infra-costs','pos-agent','public-site-controls','security','storage','users-access']);
  assert.equal(isAdminRiskSection('finance'), true);
  assert.equal(isAdminRiskSection('books'), false);
  for (const id of risky) assert.ok(ADMIN_MENUS.some(menu => menu.sections.includes(id)), `${id} must be reachable from a menu`);
  assert.match(sidebar, /if \(isPlatformSuperAdminSurface\(\)\) installAdminRiskGuard\(\);/);
  assert.match(sidebar, /if \(!accepted\) throw new DOMException/);
  assert.match(sidebar, /RISK_READ_ONLY_PATH/);
  assert.match(sidebar, /url\.origin === win\.location\.origin && url\.pathname\.startsWith\('\/api\/'\)/, 'only same-origin admin API writes are guarded');
  const { undoBodyFor } = await import('../admin-sidebar.js');
  assert.equal(undoBodyFor('{"mid":"a","enabled":true,"extra":1}', '{"mid":"b","enabled":false}'), '{"mid":"a","enabled":true}');
  assert.equal(undoBodyFor('{"site":{"mid":"a"}}', '{"mid":"b"}'), null, 'shape mismatch never replays a different structure');
  assert.equal(undoBodyFor('not json', '{"mid":"b"}'), null);
  assert.equal(undoBodyFor('{"mid":"a"}', '[1,2]'), null);
});
