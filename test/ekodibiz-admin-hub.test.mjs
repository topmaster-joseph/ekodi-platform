import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EKODIBIZ_ADMIN_SCOPES,
  EKODIBIZ_TAX_MENU,
  ekodiBizAdminScopeForPath,
  ekodiBizAdminScopeSnapshot,
} from '../ekodibiz-admin-registry.js';
import { workspaceAdminPage, workspaceAdminScript, workspaceAdminCss } from '../workspace-admin-page.js';
import { workspaceTradeAdminScript } from '../workspace-trade-admin-page.js';

test('EKODIBIZ site registry contains sites, not Finance Core tools', () => {
  assert.deepEqual(EKODIBIZ_ADMIN_SCOPES.map(item => item.id), ['common', 'mall', 'trade', 'books', 'lab']);
  assert.ok(EKODIBIZ_ADMIN_SCOPES.every(item => item.tenantSlugs?.length));
  assert.equal(ekodiBizAdminScopeForPath('/ekodibiz/admin'), 'common');
  assert.equal(ekodiBizAdminScopeForPath('/ekodimall/admin/channel-settings'), 'mall');
  assert.equal(ekodiBizAdminScopeForPath('/ekodibiz/trade/admin/access'), 'trade');
  assert.equal(ekodiBizAdminScopeForPath('/books/admin/catalog'), 'books');
  assert.equal(ekodiBizAdminScopeForPath('/ekodi-lab/admin'), 'lab');
  assert.equal(ekodiBizAdminScopeForPath('/tax'), 'common');
  assert.equal(ekodiBizAdminScopeForPath('/tax/invoices'), 'common');
  assert.equal(EKODIBIZ_ADMIN_SCOPES.find(item => item.id === 'tax'), undefined);
  assert.equal(EKODIBIZ_ADMIN_SCOPES.find(item => item.id === 'invest'), undefined);
  assert.equal(EKODIBIZ_ADMIN_SCOPES.find(item => item.id === 'mall')?.adminHref, '/ekodimall/admin');
  assert.equal(EKODIBIZ_ADMIN_SCOPES.find(item => item.id === 'books')?.adminHref, '/admin/?route=books&source=ekodibiz');
});

test('tax submenus come from the single business registry', () => {
  assert.deepEqual(EKODIBIZ_TAX_MENU.map(item => item.id), ['invoices', 'suppliers', 'customers', 'ledger']);
  for (const item of EKODIBIZ_TAX_MENU) assert.equal(item.href, '/tax?tab=' + item.id);
  assert.deepEqual(ekodiBizAdminScopeSnapshot().taxMenu.map(item => item.id), EKODIBIZ_TAX_MENU.map(item => item.id));
});

test('site switching is at the very top of the tenant sidebar, not the main body', async () => {
  const [html, script, css] = await Promise.all([
    workspaceAdminPage().text(),
    workspaceAdminScript().text(),
    workspaceAdminCss().text(),
  ]);
  assert.match(html, /<aside class="sidebar" data-ekodi-admin-sidebar><div id="adminScopeSwitcher"/);
  assert.doesNotMatch(html, /<main data-ekodi-admin-main><nav id="adminScopeSwitcher"/);
  assert.match(script, /adminHubScopes\.filter\(scope=>permitted\.has\(scope\.id\)\)/);
  assert.match(script, /authorizedAdminScopeIds/);
  assert.match(script, /current_site_activity_contexts/);
  assert.match(script, /hasFullWorkspaceAdminScope\(row\?\.authorization_role\)/);
  assert.match(script, /!==\s*'platform_admin'/);
  assert.match(css, /\.sidebar \.admin-scope-switcher/);
  assert.match(css, /\.sidebar \.admin-scope-select\{width:100%/);
});

test('site Finance sidebar links directly to four tax operations under finance only for business site', async () => {
  const script = await (await workspaceAdminScript()).text();
  assert.match(script, /if\(key==='finance'&&isBizWorkspace&&!service&&canSection\('tax',role\)/);
  assert.match(script, /const taxMenu=Array\.isArray\(ADMIN_HUB\?\.taxMenu\)/);
  assert.match(script, /link\.href=item\.href/);
  assert.match((await workspaceAdminPage().text()), /data-ekodi-admin-menu-model="common-plus-site"/);
  assert.doesNotMatch(script, /\['tax','세금 · 증빙'\]/);
  assert.match(script, /isBizWorkspace&&section==='tax'/); // legacy workspace deep link kept
});

test('trade is independently role-and-membership filtered and tax portal keeps FREE-FIRST deep links', async () => {
  const trade = await (await workspaceTradeAdminScript()).text();
  const tax = await readFile(new URL('../tax-portal-worker.js', import.meta.url), 'utf8');
  assert.match(trade, /access\?\.role!=='workspace_admin'/);
  assert.match(trade, /current_site_activity_contexts/);
  assert.match(trade, /authorizedAdminScopes\.has\(item\.id\)/);
  assert.match(trade, /hasSiteAdminRole/);
  assert.match(tax, /href="\/ekodibiz\/admin\/finance"/);
  assert.doesNotMatch(tax, /id="ekodibizSiteSwitcher"/);
  assert.doesNotMatch(tax, /data-admin-scope-current="tax"/);
  assert.match(tax, /new URLSearchParams\(location\.search\)\.get\('tab'\)/);
  assert.match(tax, /encodeURIComponent\(location\.origin\+location\.pathname\+location\.search\)/);
  assert.match(tax, /FREE-FIRST/);
  assert.match(tax, /automationEnabled\?'ON':'OFF'/);
});
