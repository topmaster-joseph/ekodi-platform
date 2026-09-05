import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isJadamAdminPath, jadamAdminPage, jadamAdminCss, jadamAdminScript } from '../jadam-admin-page.js';
import { isPizzamaruAdminPath, pizzamaruAdminPage, pizzamaruAdminCss, pizzamaruAdminScript } from '../pizzamaru-admin-page.js';
import { isYogurtAdminPath, yogurtAdminPage, yogurtAdminCss, yogurtAdminScript } from '../yogurt-admin-page.js';

const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
const canonicalMenu=readFileSync(new URL('../supabase/migrations/20260906001000_store_operating_spaces.sql',import.meta.url),'utf8');
const snapshotMigration=readFileSync(new URL('../supabase/migrations/20260906004000_store_admin_snapshot.sql',import.meta.url),'utf8');
const connectors=readFileSync(new URL('../marketing-order-connectors.js',import.meta.url),'utf8');
const spaceApp=readFileSync(new URL('../space/app.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));

const stores=[
  {slug:'jadam',brand:'자담치킨 목포대점',id:'4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa',route:'jadam-store-admin',isPath:isJadamAdminPath,page:jadamAdminPage,css:jadamAdminCss,script:jadamAdminScript},
  {slug:'pizzamaru',brand:'피자마루 목포대점',id:'6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27',route:'pizzamaru-store-admin',isPath:isPizzamaruAdminPath,page:pizzamaruAdminPage,css:pizzamaruAdminCss,script:pizzamaruAdminScript},
  {slug:'yogurt',brand:'요거트퍼플 목포대점',id:'43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce',route:'yogurt-store-admin',isPath:isYogurtAdminPath,page:yogurtAdminPage,css:yogurtAdminCss,script:yogurtAdminScript},
];
test('three store admins are dedicated independent routes',async()=>{
  for(const store of stores){
    assert.equal(store.isPath(`/${store.slug}/admin`),true);
    assert.equal(store.isPath(`/${store.slug}/admin/menu`),true);
    for(const other of stores.filter(item=>item.slug!==store.slug))assert.equal(store.isPath(`/${other.slug}/admin`),false);
    const response=store.page();const html=await response.text();
    assert.equal(response.headers.get('x-ekodi-route'),store.route);
    assert.equal(response.headers.get('x-ekodi-store-scope'),store.id);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.match(html,new RegExp(store.brand));
    assert.match(html,new RegExp(`/${store.slug}-admin\\.js`));
    const css=await store.css().text();const script=await store.script().text();
    assert.match(css,/word-break:keep-all/);assert.match(css,/overflow-wrap:normal/);
    assert.match(script,/business_os_store_admin_snapshot/);
    assert.match(script,/store_operating_space_snapshot/);
    assert.match(script,/\/api\/marketing\/connectors\/status/);
    assert.doesNotMatch(script,/\/api\/store\/menu/);
    assert.doesNotMatch(script,/sample\.sales|sample\.customers|fake menu/i);
  }
});

test('router gives all store admins precedence over generic workspace admin',()=>{
  const generic=router.indexOf('if(isWorkspaceAdminPath(url.pathname)&&!isEkodiBizInvestAdminPath(url.pathname))return workspaceAdminPage()');
  assert.ok(generic>=0);
  for(const [needle,asset] of [['if(isJadamAdminPath(url.pathname))return jadamAdminPage()','jadam'],['if(isPizzamaruAdminPath(url.pathname))return pizzamaruAdminPage()','pizzamaru'],['if(isYogurtAdminPath(url.pathname))return yogurtAdminPage()','yogurt']]){
    const dedicated=router.indexOf(needle);assert.ok(dedicated>=0);assert.ok(dedicated<generic);assert.ok(router.includes(`url.pathname==='/${asset}-admin.js'`));
  }
});

test('canonical store menu is Supabase-scoped and synthetic data stays forbidden',()=>{
  assert.match(canonicalMenu,/create table if not exists public\.store_menu_items/);
  assert.match(canonicalMenu,/create table if not exists public\.store_channel_menu_listings/);
  assert.match(canonicalMenu,/public\.has_store_private_access\(store_id\)/);
  assert.match(canonicalMenu,/'synthetic_menu_data', false/);
  assert.match(canonicalMenu,/'price_change_requires_human_approval', true/);
  assert.match(canonicalMenu,/operating_space_slug = 'jadam'/);
  assert.match(canonicalMenu,/operating_space_slug = 'pizzamaru'/);
  assert.match(canonicalMenu,/operating_space_slug = 'yogurt'/);
});

test('store admin snapshot remains aggregate-only and generic across store slugs',()=>{
  assert.match(snapshotMigration,/business_os_snapshot\(p_workspace_key\)/);
  assert.match(snapshotMigration,/business_os_store_admin_snapshot/);
  assert.match(snapshotMigration,/o\.store_id = v_store_id/);
  assert.match(snapshotMigration,/'averageTicket'/);
  assert.match(snapshotMigration,/'channels'/);
  assert.doesNotMatch(snapshotMigration,/customer_phone|customer_name/);
});
test('connector runtime remains store scoped without external write-back',()=>{
  assert.match(connectors,/STORE_MANAGER_ROLES/);
  assert.match(connectors,/workspace_key.*store/si);
  assert.match(connectors,/externalWriteBack:false/);
  assert.match(connectors,/host === 'ekodi\.kr'/);
});

test('store operating spaces expose admin only to manager roles',()=>{
  assert.match(spaceApp,/\['store_owner','tenant_admin','platform_admin'\]/);
  assert.ok(spaceApp.includes('/${encodeURIComponent(slug)}/admin'));
  assert.match(spaceApp,/renderServiceActions\(workspace\.slug,workspace\.role\)/);
});

test('production smoke covers all three store admin entries',()=>{
  const urls=new Map(manifest.worker.requests.map(row=>[row.url,row]));
  for(const store of stores){
    const row=urls.get(`https://ekodi.kr/${store.slug}/admin`);
    assert.ok(row,`missing smoke ${store.slug}`);
    assert.deepEqual(row.statuses,[200]);
    assert.ok(row.expect.includes(store.brand));
    assert.ok(row.headerExpect.includes(`x-ekodi-route: ${store.route}`));
  }
});
