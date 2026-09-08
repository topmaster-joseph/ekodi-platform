import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DEFAULT_FREE_MEMBER_BENEFITS, normalizeSiteBenefitPayload } from '../site-membership-benefits.js';
import { TENANT_ADMIN_CAPABILITIES, tenantAdminCan } from '../tenant-admin-policy.js';

test('public access is not an editable membership benefit field', async()=>{
  const source=await fs.readFile(new URL('../site-membership-benefits.js',import.meta.url),'utf8');
  assert.match(source,/membershipRequiredForPublicContent:false/);
  assert.match(source,/immutable:true/);
  assert.doesNotMatch(source,/publicAccess\s*:\s*body/);
  assert.equal(TENANT_ADMIN_CAPABILITIES.membershipBenefits,'tenant.membership-benefits.manage');
  assert.equal(tenantAdminCan('workspace_admin',TENANT_ADMIN_CAPABILITIES.membershipBenefits),true);
  assert.equal(tenantAdminCan('member',TENANT_ADMIN_CAPABILITIES.membershipBenefits),false);
});

test('free benefits have safe defaults and remain site configurable',()=>{
  assert.equal(DEFAULT_FREE_MEMBER_BENEFITS.length,3);
  const profile=normalizeSiteBenefitPayload({freeBenefits:[{label:'단골 혜택',description:'매장별 혜택',enabled:true}]});
  assert.equal(profile.freeBenefits.length,1);
  assert.equal(profile.freeBenefits[0].label,'단골 혜택');
  assert.equal(profile.freeBenefits[0].displayOrder,10);
});

test('paid value can be composed as features addons packages services or organization plans',()=>{
  const profile=normalizeSiteBenefitPayload({paidPackages:[
    {name:'마케팅 AI',kind:'addon',priceKrw:9900,billingPeriod:'monthly',features:['자동 게시','성과 분석'],enabled:true},
    {name:'조직 플랜',kind:'organization_plan',priceKrw:100000,billingPeriod:'yearly',features:['협업']},
  ]});
  assert.deepEqual(profile.paidPackages.map(x=>x.kind),['addon','organization_plan']);
  assert.equal(profile.paidPackages[0].priceKrw,9900);
  assert.deepEqual(profile.paidPackages[0].features,['자동 게시','성과 분석']);
});

test('workspace admin exposes local membership benefit editor',async()=>{
  const source=await fs.readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
  assert.match(source,/회원 · 혜택/);
  assert.match(source,/membershipBenefitsAdmin/);
  assert.match(source,/site-benefits\/admin/);
  assert.match(source,/PUBLIC · 고정/);
});

test('store admin exposes the same local membership benefit editor',async()=>{
  const source=await fs.readFile(new URL('../store-admin-engine.js',import.meta.url),'utf8');
  assert.match(source,/membershipBenefits/);
  assert.match(source,/site-benefits\/admin/);
  assert.match(source,/PUBLIC/);
});

test('church pastor admin exposes membership benefits only through capability projection',async()=>{
  const source=await fs.readFile(new URL('../church-pastor-admin-page.js',import.meta.url),'utf8');
  assert.match(source,/membership:TENANT_ADMIN_CAPABILITIES\.membershipBenefits/);
  assert.match(source,/site-benefits\/admin\?workspace=ekodi-church&service=church/);
  assert.match(source,/section==='membership'/);
  assert.equal(tenantAdminCan('senior_pastor',TENANT_ADMIN_CAPABILITIES.membershipBenefits),true);
  assert.equal(tenantAdminCan('pastor',TENANT_ADMIN_CAPABILITIES.membershipBenefits),false);
});

test('membership benefit schema changes belong to additive migration, never public runtime reads',async()=>{
  const runtime=await fs.readFile(new URL('../site-membership-benefits.js',import.meta.url),'utf8');
  const migration=await fs.readFile(new URL('../migrations/0074_site_membership_benefits.sql',import.meta.url),'utf8');
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX/i);
  assert.match(runtime,/SELECT workspace_id FROM site_membership_benefit_profiles LIMIT 0/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS site_membership_benefit_profiles/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS site_membership_benefit_audit/);
});
