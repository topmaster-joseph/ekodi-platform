import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { localRegionBySlug } from '../local-region-registry.js';
import { localRegionForestPublicPage, localRegionForestAdminPage } from '../local-region-forest-page.js';

test('Cheonggye forest is a regional module with delegated CGMA operation',()=>{
  const region=localRegionBySlug('cheonggye');
  const module=region.modules.find(item=>item.id==='forest');
  assert.ok(module);
  assert.equal(module.leadOperatorId,'cgma');
  assert.deepEqual(module.operatorIds,['cgma']);
});

test('forest public and admin pages expose project-first surfaces',async()=>{
  const region=localRegionBySlug('cheonggye');
  const publicHtml=await localRegionForestPublicPage(region,['history']).text();
  const adminHtml=await localRegionForestAdminPage(region).text();
  assert.match(publicHtml,/청계면 국민의숲/);
  assert.match(publicHtml,/data-forest-history/);
  assert.match(publicHtml,/local-region-forest-public\.js/);
  assert.match(publicHtml,/href="\/cheonggye\/forest\/history"/);
  assert.match(adminHtml,/국민의숲 이력관리/);
  assert.match(adminHtml,/data-forest-record-form/);
  assert.match(adminHtml,/local-region-admin-auth\.js/);
  assert.match(adminHtml,/local-region-forest-admin\.js/);
});

test('regional router gives forest routes priority over generic Cheonggye page',async()=>{
  const router=await fs.readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(router,/forestPublic/);
  assert.match(router,/forestAdmin/);
  assert.match(router,/localRegionForestPublicPage/);
  assert.match(router,/localRegionForestAdminPage/);
  assert.match(router,/\/cheonggye\/local-region-forest-public\.js/);
  assert.match(router,/\/cheonggye\/local-region-forest-admin\.js/);
});

test('forest project API preserves public read, authenticated admin and archive semantics',async()=>{
  const control=await fs.readFile(new URL('../local-region-operations-control.js',import.meta.url),'utf8');
  assert.match(control,/projectMatch/);
  assert.match(control,/projects/);
  assert.match(control,/visibility='public'/);
  assert.match(control,/record_created/);
  assert.match(control,/record_updated/);
  assert.match(control,/record_archived/);
  assert.match(control,/project_updated/);
  assert.match(control,/sameOriginForWrite/);
  assert.match(control,/resolveRegionalAccess/);
});

test('forest migration seeds project, history and regional operating right',async()=>{
  const migration=await fs.readFile(new URL('../migrations/0107_cheonggye_forest_project.sql',import.meta.url),'utf8');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS local_region_projects/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS local_region_project_records/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS local_region_project_events/);
  assert.match(migration,/2026-09-03/);
  assert.match(migration,/2026-09-10/);
  assert.match(migration,/local:cheonggye','forest','cgma'/);
});
