import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storeAdminSlugFromPath, storeAdminPage, storeAdminCss, storeAdminScript } from '../store-admin-page.js';
import { isJadamAdminPath, jadamAdminPage } from '../jadam-admin-page.js';
import { isPizzamaruAdminPath, pizzamaruAdminPage } from '../pizzamaru-admin-page.js';
import { isYogurtAdminPath, yogurtAdminPage } from '../yogurt-admin-page.js';

const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
const canonicalMenu=readFileSync(new URL('../supabase/migrations/20260906001000_store_operating_spaces.sql',import.meta.url),'utf8');
const snapshotMigration=readFileSync(new URL('../supabase/migrations/20260906004000_store_admin_snapshot.sql',import.meta.url),'utf8');
const connectors=readFileSync(new URL('../marketing-order-connectors.js',import.meta.url),'utf8');
const spaceApp=readFileSync(new URL('../space/app.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));

const stores=[
  {slug:'jadam',brand:'자담치킨 목포대점',isPath:isJadamAdminPath,page:jadamAdminPage},
  {slug:'pizzamaru',brand:'피자마루 목포대점',isPath:isPizzamaruAdminPath,page:pizzamaruAdminPage},
  {slug:'yogurt',brand:'요거트퍼플 목포대점',isPath:isYogurtAdminPath,page:yogurtAdminPage},
];

test('three current stores share one Store Admin engine with isolated workspace context',async()=>{
  const css=await storeAdminCss().text();const script=await storeAdminScript().text();
  assert.match(css,/word-break:keep-all/);assert.match(script,/business_os_store_admin_snapshot/);
  assert.match(script,/store_operating_space_snapshot/);assert.match(script,/workspaceSlug/);
  for(const store of stores){
    assert.equal(store.isPath(`/${store.slug}/admin`),true);
    assert.equal(storeAdminSlugFromPath(`/${store.slug}/admin/menu`),store.slug);
    const response=store.page();const html=await response.text();
    assert.equal(response.headers.get('x-ekodi-route'),'store-admin');
    assert.equal(response.headers.get('x-ekodi-admin-surface'),'store');
    assert.equal(response.headers.get('x-ekodi-workspace'),store.slug);
    assert.match(html,new RegExp(store.brand));
    assert.match(html,/\/store-admin\.js/);
  }
});
test('future store admin path is structurally paired with its workspace slug',async()=>{
  assert.equal(storeAdminSlugFromPath('/future-store/admin'),'future-store');
  assert.equal(storeAdminSlugFromPath('/future-store/admin/site'),'future-store');
  const response=storeAdminPage({canonical_slug:'future-store',name:'미래 점포'});
  const html=await response.text();
  assert.equal(response.headers.get('x-ekodi-route'),'store-admin');
  assert.equal(response.headers.get('x-ekodi-workspace'),'future-store');
  assert.match(html,/미래 점포/);
  assert.match(html,/\/future-store\/admin/);
  assert.match(html,/store-site-admin/);
});

test('router resolves Store User Site before falling back to generic Workspace Admin',()=>{
  const generic=router.indexOf('if(isWorkspaceAdminPath(url.pathname)&&!isEkodiBizInvestAdminPath(url.pathname))return workspaceAdminPage()');
  const store=router.indexOf('const storeAdminSlug=storeAdminSlugFromPath(url.pathname)');
  assert.ok(store>=0);assert.ok(generic>store);
  assert.match(router,/store_user_site_public_profile/);
  assert.match(router,/resolveStoreAdminProfile/);
  assert.match(router,/url\.pathname==='\/store-admin\.js'/);
  assert.match(router,/x-ekodi-workspace-alias/);
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

test('production smoke verifies one admin engine plus per-workspace context',()=>{
  const urls=new Map(manifest.worker.requests.map(row=>[row.url,row]));
  for(const store of stores){
    const row=urls.get(`https://ekodi.kr/${store.slug}/admin`);
    assert.ok(row,`missing smoke ${store.slug}`);
    assert.deepEqual(row.statuses,[200]);
    assert.ok(row.expect.includes(store.brand));
    assert.ok(row.headerExpect.includes('x-ekodi-route: store-admin'));
    assert.ok(row.headerExpect.includes(`x-ekodi-workspace: ${store.slug}`));
  }
});
