import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isJadamAdminPath, jadamAdminPage, jadamAdminCss, jadamAdminScript } from '../jadam-admin-page.js';

const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
const menuControl=readFileSync(new URL('../store-menu-control.js',import.meta.url),'utf8');
const menuMigration=readFileSync(new URL('../migrations/0063_store_menu_registry.sql',import.meta.url),'utf8');
const snapshotMigration=readFileSync(new URL('../supabase/migrations/20260906003000_store_admin_snapshot.sql',import.meta.url),'utf8');
const apiEntry=readFileSync(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8');
const connectors=readFileSync(new URL('../marketing-order-connectors.js',import.meta.url),'utf8');

const JADAM_STORE='4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa';

test('Jadam admin is a dedicated local store route', async()=>{
  assert.equal(isJadamAdminPath('/jadam/admin'),true);
  assert.equal(isJadamAdminPath('/jadam/admin/menu'),true);
  assert.equal(isJadamAdminPath('/pizzamaru/admin'),false);
  assert.equal(isJadamAdminPath('/yogurt/admin'),false);
  const response=jadamAdminPage();
  const html=await response.text();
  assert.equal(response.headers.get('x-ekodi-route'),'jadam-store-admin');
  assert.equal(response.headers.get('x-ekodi-store-scope'),JADAM_STORE);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.match(html,/자담치킨 목포대점/);
  assert.match(html,/\/jadam-admin\.js/);
});
test('Jadam admin preserves Korean word boundaries and live-data semantics', async()=>{
  const css=await jadamAdminCss().text();
  const script=await jadamAdminScript().text();
  assert.match(css,/word-break:keep-all/);
  assert.match(css,/overflow-wrap:normal/);
  assert.match(script,/business_os_store_admin_snapshot/);
  assert.match(script,/\/api\/store\/menu/);
  assert.match(script,/\/api\/marketing\/connectors\/status/);
  assert.doesNotMatch(script,/sample\.sales|sample\.customers|fake menu/i);
});

test('router gives Jadam admin precedence over the generic workspace admin',()=>{
  const dedicated=router.indexOf('if(isJadamAdminPath(url.pathname))return jadamAdminPage()');
  const generic=router.indexOf('if(isWorkspaceAdminPath(url.pathname)&&!isEkodiBizInvestAdminPath(url.pathname))return workspaceAdminPage()');
  assert.ok(dedicated>=0);
  assert.ok(generic>=0);
  assert.ok(dedicated<generic);
  assert.match(router,/url\.pathname==='\/jadam-admin\.css'/);
  assert.match(router,/url\.pathname==='\/jadam-admin\.js'/);
});

test('menu registry is store scoped and credentials stay outside menu rows',()=>{
  assert.match(menuMigration,/store_id TEXT NOT NULL/);
  assert.match(menuMigration,/UNIQUE\(store_id, provider, external_item_id\)/);
  assert.match(menuMigration,/availability IN \('available','sold_out','hidden','unknown'\)/);
  assert.doesNotMatch(menuMigration,/password|secret|access_token|refresh_token/i);
  assert.match(menuControl,/current_site_workspaces/);
  assert.match(menuControl,/`store:\$\{store\}`/);
  assert.match(menuControl,/official-or-approved-bridge-only/);
  assert.match(menuControl,/externalWriteBack:false/);
});
test('store admin snapshot extends the existing access-checked aggregate contract',()=>{
  assert.match(snapshotMigration,/business_os_snapshot\(p_workspace_key\)/);
  assert.match(snapshotMigration,/business_os_store_admin_snapshot/);
  assert.match(snapshotMigration,/o\.store_id = v_store_id/);
  assert.match(snapshotMigration,/'averageTicket'/);
  assert.match(snapshotMigration,/'channels'/);
  assert.doesNotMatch(snapshotMigration,/customer_phone|customer_name/);
});

test('store menu API is wired through the mission control worker',()=>{
  assert.match(apiEntry,/handleStoreMenuControl/);
  assert.match(apiEntry,/path\.startsWith\('\/api\/store\/menu'\)/);
  assert.match(connectors,/host === 'ekodi\.kr'/);
  assert.match(connectors,/STORE_MANAGER_ROLES/);
  assert.match(connectors,/externalWriteBack:false/);
});
