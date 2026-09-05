import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isStoreAdminPathShape,
  resolveStoreAdminRoute,
  storeAdminPage,
  storeAdminCss,
  storeAdminScript,
} from '../store-admin-engine.js';

const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
const engine=readFileSync(new URL('../store-admin-engine.js',import.meta.url),'utf8');
const canonicalMenu=readFileSync(new URL('../supabase/migrations/20260906001000_store_operating_spaces.sql',import.meta.url),'utf8');
const snapshotMigration=readFileSync(new URL('../supabase/migrations/20260906004000_store_admin_snapshot.sql',import.meta.url),'utf8');
const routingMigration=readFileSync(new URL('../supabase/migrations/20260906005000_store_admin_routing.sql',import.meta.url),'utf8');
const connectors=readFileSync(new URL('../marketing-order-connectors.js',import.meta.url),'utf8');
const spaceApp=readFileSync(new URL('../space/app.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));

const stores=[
  {slug:'jadam',brand:'자담치킨 목포대점',id:'4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa'},
  {slug:'pizzamaru',brand:'피자마루 목포대점',id:'6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27'},
  {slug:'yogurt',brand:'요거트퍼플 목포대점',id:'43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce'},
];
test('existing first stores are compatibility profiles on one Store Admin Engine',async()=>{
  for(const store of stores){
    assert.equal(isStoreAdminPathShape(`/${store.slug}/admin`),true);
    assert.equal(isStoreAdminPathShape(`/${store.slug}/admin/menu`),true);
    const profile=await resolveStoreAdminRoute(`/${store.slug}/admin`,()=>{throw new Error('bootstrap profile must not fetch')});
    assert.equal(profile.slug,store.slug);assert.equal(profile.name,store.brand);assert.equal(profile.id,store.id);
    const response=storeAdminPage(profile);const html=await response.text();
    assert.equal(response.headers.get('x-ekodi-route'),`${store.slug}-store-admin`);
    assert.equal(response.headers.get('x-ekodi-store-scope'),store.id);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.match(html,new RegExp(store.brand));assert.match(html,/\/store-admin\.js\?v=20260906-provisioning/);
  }
  assert.match(await storeAdminCss().text(),/word-break:keep-all/);
  const script=await storeAdminScript().text();
  assert.match(script,/business_os_store_admin_snapshot/);assert.match(script,/store_operating_space_snapshot/);
  assert.match(script,/\['store_owner','tenant_admin','platform_admin'\]/);
  assert.match(script,/state\.menu\?\.menu/);assert.doesNotMatch(script,/state\.menu\?\.items/);
  assert.doesNotMatch(script,/\/api\/store\/menu/);
});

test('a future registered store is resolved from the canonical database route profile',async()=>{
  let requestBody=null;
  const profile=await resolveStoreAdminRoute('/future-cafe/admin',async(_url,options)=>{
    requestBody=JSON.parse(options.body);
    return new Response(JSON.stringify({slug:'future-cafe',name:'미래카페 2호점'}),{status:200,headers:{'content-type':'application/json'}});
  });
  assert.deepEqual(requestBody,{p_operating_slug:'future-cafe'});
  assert.deepEqual(profile,{slug:'future-cafe',name:'미래카페 2호점',mark:'ST',brand:'STORE OPERATIONS'});
  const html=await storeAdminPage(profile).text();assert.match(html,/미래카페 2호점/);assert.match(html,/\/future-cafe\/admin/);
});
test('router classifies store admin before generic workspace admin and keeps legacy asset aliases',()=>{
  const dynamic=router.indexOf('if(isStoreAdminPathShape(url.pathname))');
  const generic=router.indexOf('if(isWorkspaceAdminPath(url.pathname)&&!isEkodiBizInvestAdminPath(url.pathname))return workspaceAdminPage()');
  assert.ok(dynamic>=0);assert.ok(generic>dynamic);
  assert.match(router,/resolveStoreAdminRoute\(url\.pathname\)/);
  assert.match(router,/\/store-admin\.js/);assert.match(router,/\/jadam-admin\.js/);
  assert.doesNotMatch(router,/jadam-admin-page\.js|pizzamaru-admin-page\.js|yogurt-admin-page\.js/);
});

test('route profile exposes only public routing identity and makes DB registration the creation trigger',()=>{
  assert.match(routingMigration,/store_admin_route_profile/);
  assert.match(routingMigration,/s\.operating_space_slug/);assert.match(routingMigration,/s\.name/);
  assert.match(routingMigration,/grant execute on function public\.store_admin_route_profile\(text\) to anon, authenticated/);
  assert.doesNotMatch(routingMigration,/public_phone|public_address|store_members|tenant_members/);
  assert.match(engine,/p_operating_slug:slug/);assert.match(engine,/ROUTE_CACHE/);
});

test('canonical store data stays RLS scoped, verified, and aggregate only',()=>{
  assert.match(canonicalMenu,/create table if not exists public\.store_menu_items/);
  assert.match(canonicalMenu,/public\.has_store_private_access\(store_id\)/);
  assert.match(canonicalMenu,/'synthetic_menu_data', false/);
  assert.match(canonicalMenu,/'price_change_requires_human_approval', true/);
  assert.match(snapshotMigration,/business_os_store_admin_snapshot/);
  assert.match(snapshotMigration,/o\.store_id = v_store_id/);
  assert.doesNotMatch(snapshotMigration,/customer_phone|customer_name/);
});
test('connector runtime and store entry remain manager scoped',()=>{
  assert.match(connectors,/STORE_MANAGER_ROLES/);
  assert.match(connectors,/externalWriteBack:false/);
  assert.match(spaceApp,/\['store_owner','tenant_admin','platform_admin'\]/);
  assert.ok(spaceApp.includes('/${encodeURIComponent(slug)}/admin'));
});

test('production smoke preserves all three first-store URLs on the common engine',()=>{
  const urls=new Map(manifest.worker.requests.map(row=>[row.url,row]));
  for(const store of stores){
    const row=urls.get(`https://ekodi.kr/${store.slug}/admin`);
    assert.ok(row,`missing smoke ${store.slug}`);assert.deepEqual(row.statuses,[200]);
    assert.ok(row.expect.includes(store.brand));
    assert.ok(row.headerExpect.includes(`x-ekodi-route: ${store.slug}-store-admin`));
  }
});
