import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { localRegionBySlug } from '../local-region-registry.js';
import { localRegionModulePublicPage, localRegionModuleAdminPage } from '../local-region-page.js';

const read=path=>fs.readFile(new URL('../'+path,import.meta.url),'utf8');
const region=localRegionBySlug('cheonggye');
const ledgerModules=region.modules.filter(module=>module.contentMode==='regional-ledger');

test('Cheonggye generic modules use the regional content ledger while specialized modules stay isolated',()=>{
  assert.deepEqual(ledgerModules.map(item=>item.id),['directory','commerce','events','jobs','sharing','broadcast','proposals']);
  assert.equal(region.modules.find(item=>item.id==='commerce-pass')?.contentMode,'specialized');
  assert.equal(region.modules.find(item=>item.id==='forest')?.contentMode,'specialized');
});

test('regional content ledger migration is additive and auditable',async()=>{
  const sql=await read('migrations/0108_local_region_content_ledger.sql');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS local_region_content_items/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS local_region_content_events/);
  assert.match(sql,/event_key TEXT NOT NULL UNIQUE/);
  assert.match(sql,/visibility TEXT NOT NULL DEFAULT 'public'/);
  assert.match(sql,/idx_local_region_content_public/);
  assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM|TRUNCATE/i);
});

test('generic public and admin module surfaces load operational content clients',async()=>{
  for(const module of ledgerModules){
    const publicHtml=await localRegionModulePublicPage(region,module).text();
    const adminHtml=await localRegionModuleAdminPage(region,module).text();
    assert.match(publicHtml,/data-local-region-content-root/);
    assert.match(publicHtml,/지역 공개정보/);
    assert.match(publicHtml,/local-region-module-public\.js/);
    assert.match(adminHtml,/data-local-region-content-admin/);
    assert.match(adminHtml,/운영정보 등록·수정/);
    assert.match(adminHtml,/local-region-module-admin\.js/);
  }
});

test('specialized Cheonggye module surfaces do not load the generic content ledger clients',async()=>{
  for(const id of ['commerce-pass','forest']){
    const module=region.modules.find(item=>item.id===id);
    const publicHtml=await localRegionModulePublicPage(region,module).text();
    const adminHtml=await localRegionModuleAdminPage(region,module).text();
    assert.doesNotMatch(publicHtml,/local-region-module-public\.js/);
    assert.doesNotMatch(adminHtml,/local-region-module-admin\.js/);
  }
});

test('module content API is public-read, scoped-write, auditable, and fail-closed for specialized modules',async()=>{
  const control=await read('local-region-operations-control.js');
  assert.match(control,/\/modules\\\/\(\[a-z0-9-\]\+\)/);
  assert.match(control,/module\.contentMode!==\'regional-ledger\'/);
  assert.match(control,/canOperateModuleContent/);
  assert.match(control,/delegated\.moduleIds\.includes\(moduleId\)/);
  assert.match(control,/item_created/);
  assert.match(control,/item_updated/);
  assert.match(control,/item_archived/);
  assert.match(control,/sameOriginForWrite/);
  assert.match(control,/visibility='public'/);
});

test('shared router serves both regional module content client assets',async()=>{
  const router=await read('platform-router-entry-worker.js');
  assert.match(router,/localRegionModulePublicScript/);
  assert.match(router,/localRegionModuleAdminScript/);
  assert.match(router,/\/cheonggye\/local-region-module-public\.js/);
  assert.match(router,/\/cheonggye\/local-region-module-admin\.js/);
});

test('regional module content clients use canonical APIs and never write organization-owned records',async()=>{
  const [publicClient,adminClient]=await Promise.all([
    read('local-region-module-public.js'),
    read('local-region-module-admin.js'),
  ]);
  assert.match(publicClient,/\/api\/local-operations\/cheonggye\/modules\//);
  assert.match(adminClient,/\/api\/local-operations\/cheonggye\/modules\//);
  assert.match(adminClient,/create_item/);
  assert.match(adminClient,/update_item/);
  assert.match(adminClient,/archive_item/);
  assert.doesNotMatch(publicClient,/\/cgma\/api|member|dues/i);
  assert.doesNotMatch(adminClient,/\/cgma\/api|member|dues/i);
});
