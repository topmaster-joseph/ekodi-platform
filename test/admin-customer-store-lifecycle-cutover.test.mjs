import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sites from '../config/site-lifecycle-registry.json' with { type: 'json' };
import { ADMIN_SERVICE_CATALOG, channelAdminServices, socialManagedServices, canonicalServiceAdminPath } from '../admin-service-catalog.js';
import { buildAdminSiteDirectoryReply } from '../admin-site-directory-core.js';
import { projectSiteAiFleet } from '../ekodi-site-ai-fleet-readonly.js';

const source = name => readFileSync(new URL('../'+name, import.meta.url),'utf8');
const row = id => sites.existingWorkspaceSites.find(site => site.id === id);

test('2026-11-14 customer store transition uses one active BBQ and preserves historical Jadam',()=>{
  assert.equal(row('bbqcg').canonicalUrl,'https://ekodi.kr/bbqcg');
  assert.equal(row('bbqcg').lifecycleState,'active');
  assert.equal(row('bbqcg').runtime,'store_user_sites');
  assert.equal(row('jadam').lifecycleState,'retired');
  assert.equal(row('jadam').visibility,'archive-only');
  const liveStores=sites.existingWorkspaceSites
    .filter(site=>site.ownerKind==='store'&&site.lifecycleState!=='retired');
  assert.deepEqual(liveStores.map(site=>site.id),['bbqcg','pizzamaru','yogurt']);
  assert.equal(new Set(sites.existingWorkspaceSites.map(site=>site.canonicalUrl)).size,sites.existingWorkspaceSites.length);
});

test('central customer page selects BBQ, never active Jadam, and old links converge',()=>{
  const campus=source('campus-actions.js');
  const roster=campus.slice(campus.indexOf('const ALL_SITES'),campus.indexOf('const SITE_GROUPS'));
  for(const name of ['청계면상인회','BBQ 무안청계점','피자마루 목포대점','요거트퍼플 목포대점']) assert.ok(roster.includes(name),name);
  assert.ok(!roster.includes('자담치킨 목포대점'));
  assert.ok(!roster.includes(['jadam','ekodi.kr'].join('.')));
  assert.ok(roster.includes('https://ekodi.kr/bbqcg'));
  assert.ok(campus.includes("rawRequested === 'jadam' ? 'bbqcg'"));
  assert.ok(campus.includes("String(service?.id || '').toLowerCase() === 'jadam'"));
  const hierarchy=JSON.parse(source('config/admin-site-hierarchy.json'));
  assert.ok(hierarchy.sites.some(s=>s.id==='bbqcg'&&s.adminPath==='/bbqcg/admin'));
  assert.ok(hierarchy.sites.some(s=>s.id==='jadam'&&s.adminPath==='/jadam/admin'),'archive admin root must retain historical identity');
});

test('admin channel and public social choices exclude retired legacy storefront',()=>{
  const byId=new Map(ADMIN_SERVICE_CATALOG.map(s=>[s.id,s]));
  assert.equal(byId.get('bbqcg').name,'BBQ 무안청계점');
  assert.equal(canonicalServiceAdminPath(byId.get('bbqcg').basePath),'/bbqcg/admin');
  assert.equal(byId.get('jadam').visibility,'archive-only');
  assert.ok(channelAdminServices().some(s=>s.id==='bbqcg'));
  assert.ok(socialManagedServices().some(s=>s.id==='bbqcg'));
  assert.ok(!channelAdminServices().some(s=>s.id==='jadam'));
  assert.ok(!socialManagedServices().some(s=>s.id==='jadam'));
  for(const path of ['admin-lazy-features.js','ai-ops-admin.js']){
    const src=source(path);
    assert.match(src,/BBQ 무안청계점/);
    assert.doesNotMatch(src,/자담치킨 목포대점/);
  }
});

test('active directory and Site AI fleet remove retired entry without deletion',()=>{
  const directory=buildAdminSiteDirectoryReply({workspaces:sites.existingWorkspaceSites,services:[]});
  assert.match(directory,/BBQ 무안청계점/);
  assert.doesNotMatch(directory,/자담치킨 목포대점/);
  const fleet=projectSiteAiFleet(sites,[],{ledgerAvailable:false});
  assert.ok(fleet.entries.some(e=>e.siteId==='bbqcg'));
  assert.ok(!fleet.entries.some(e=>e.siteId==='jadam'));
  assert.ok(source('ekodi-site-improvement-scheduler.js').includes("site.lifecycleState==='retired'"));
  assert.ok(source('ekodi-site-ai-intent-preview.js').includes('site.lifecycleState==="retired"'));
});

test('BBQ site is automatically provisioned on its own Store UUID without data erasure',()=>{
  const provision=source('supabase/migrations/20260906005000_store_user_site_provisioning.sql');
  const bbq=source('supabase/migrations/20261108104500_bbqcg_hard_cutover.sql');
  assert.match(provision,/after insert or update of operating_space_slug/);
  assert.match(bbq,/v_store_id/);
  assert.match(bbq,/where store_id=v_store_id/);
  assert.ok(!bbq.includes('delete from public.stores'));
  const threeStores=source('store-gateway-page.js');
  for(const path of ['/bbqcg','/pizzamaru','/yogurt']) assert.ok(threeStores.includes(path),path);
});
