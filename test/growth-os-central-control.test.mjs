import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GROWTH_CORE_VERSION,GROWTH_DIMENSIONS,GROWTH_PROFILES,
  evaluateGrowthOrganization,validateGrowthEvidenceContract,
} from '../growth-intelligence-core.js';
import {ADMIN_MENUS,ADMIN_MENU_REGISTRY,adminMenuOrder,getAdminMenuForSection} from '../admin-menu-registry.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Growth Intelligence Core is purpose-specific and not a marketing-only engine',()=>{
  assert.equal(GROWTH_DIMENSIONS.length,7);
  assert.ok(GROWTH_PROFILES.ministry&&GROWTH_PROFILES.commerce&&GROWTH_PROFILES.cooperative);
  const church=evaluateGrowthOrganization({workspaceId:'ws-church',profile:'ministry'});
  const mall=evaluateGrowthOrganization({workspaceId:'ws-mall',profile:'commerce'});
  assert.equal(church.profile.id,'ministry');
  assert.equal(mall.profile.id,'commerce');
  assert.notDeepEqual(church.profile.focus,mall.profile.focus);
  assert.equal(church.coverage.unknown,7);
  assert.equal(church.coverage.observed,0);
  assert.equal(church.dimensions[0].value,null);
  assert.equal(church.governance.autonomousChanges,false);
  assert.equal(church.governance.spend,false);
  assert.equal(church.governance.crossTenantJoin,false);
  assert.doesNotMatch(JSON.stringify(church),/overallScore|rank|predictedRevenue/);
  assert.equal(GROWTH_CORE_VERSION,'1.0.0');
});

test('evidence must be scoped, authorized, dated, and verifiable',()=>{
  const valid={
    people:{status:'observed',workspaceId:'ws-church',authorization:'authorized_scoped_aggregate',
      source:'consent_aware_participation',observedAt:'2026-10-28T00:00:00Z',value:18},
    resources:{status:'withheld'},
  };
  assert.equal(validateGrowthEvidenceContract(valid,'ws-church'),true);
  const snap=evaluateGrowthOrganization({workspaceId:'ws-church',profile:'ministry',evidence:valid});
  assert.equal(snap.coverage.observed,1);
  assert.equal(snap.coverage.withheld,1);
  assert.equal(snap.coverage.unknown,5);
  assert.equal(snap.dimensions.find(x=>x.id==='people').value,18);
  assert.equal(snap.dimensions.find(x=>x.id==='resources').value,null);
  assert.equal(validateGrowthEvidenceContract(valid,'ws-mall'),false);
  const mixed=evaluateGrowthOrganization({workspaceId:'ws-mall',profile:'commerce',evidence:valid});
  assert.equal(mixed.coverage.observed,0);
  assert.equal(mixed.dimensions.find(x=>x.id==='people').value,null);
  assert.equal(validateGrowthEvidenceContract({people:{...valid.people,authorization:'unknown'}},'ws-church'),false);
  assert.equal(validateGrowthEvidenceContract({finance:valid.people},'ws-church'),false);
  assert.throws(()=>evaluateGrowthOrganization({profile:'ministry'}),/workspaceId/);
});

test('menu classification is platform-super-admin and separate from Marketing AI',()=>{
  const group=ADMIN_MENUS.find(x=>x.id==='growth-intelligence');
  const item=ADMIN_MENU_REGISTRY.find(x=>x.id==='growth-os');
  const audience=JSON.parse(read('config/admin-menu-audience-policy.json'));
  assert.deepEqual(group?.sections,['growth-os']);
  assert.equal(group?.group,'ai');
  assert.equal(item?.group,'ai');
  assert.equal(item?.superAdminOnly,true);
  assert.equal(audience.classification.entries['growth-os'].audience,'platform-super-admin');
  assert.equal(getAdminMenuForSection('growth-os')?.id,'growth-intelligence');
  assert.ok(adminMenuOrder().includes('growth-os'));
  assert.equal(ADMIN_MENU_REGISTRY.find(x=>x.id==='marketing-ai')?.group,'services');
});

test('new central route and lazy assets are served by canonical protected Admin runtime',()=>{
  const canonical=read('admin-canonical-routes.js');
  const loader=read('admin-demand-loader.js');
  const layout=read('admin-menu-layout.js');
  const site=read('site-worker.js');
  const build=read('scripts/build.mjs');
  const postbuild=read('scripts/admin-performance-postbuild.mjs');
  assert.match(canonical,/'growth-os':'ai'/);
  assert.match(canonical,/group==='growth-os'/);
  assert.match(layout,/\['growth-os','growth-os'\]/);
  assert.match(loader,/paths:\['\/admin\/ai\/growth-os','\/admin\/growth-os'\]/);
  assert.match(site,/\/'growth-os-admin\.js'/);
  assert.match(site,/\/'growth-os-admin\.css'/);
  assert.match(build,/growth-os-admin\.js/);
  assert.match(postbuild,/growth-os-admin\.css/);
});

test('Growth OS management is gated by super admin session and is read only',()=>{
  const ui=read('growth-os-admin.js');
  const source=read('growth-intelligence-core.js');
  assert.match(ui,/session\?\.role==='super_admin'/);
  assert.match(ui,/authorization/);
  assert.match(ui,/\/api\/session/);
  assert.match(ui,/\/public-registry\.json/);
  assert.match(ui,/\/admin\/admin-service-catalog\.js/);
  assert.match(ui,/근거 미연동 ≠ 성과 0점/);
  assert.doesNotMatch(ui,/method:\s*['"]POST['"]|fetch\([^)]*\{\s*method:\s*['"]POST/);
  assert.doesNotMatch(source,/fetch\(|INSERT INTO|UPDATE\s+\w+|DELETE FROM/);
});
