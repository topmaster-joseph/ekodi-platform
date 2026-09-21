import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { validateAccessGrantInput, effectiveAccessCapabilities, canTenantActorAssignRole } from '../access-governance.js';
import { tenantAdminCapabilitiesForRole } from '../tenant-admin-policy.js';
import { localRegionBySlug } from '../local-region-registry.js';
import { localRegionAdminPage, localRegionAccessAdminPage } from '../local-region-page.js';
import { regionalCommerceProgramById } from '../regional-commerce-program-registry.js';
import { regionalCommerceProgramAdminPage, regionalCommerceProgramPublicPage } from '../regional-commerce-program-page.js';
import { localRegionAdminAuthScript } from '../local-region-admin-auth.js';
import { localRegionAccessAdminScript } from '../local-region-access-admin.js';

const NOW=new Date('2026-09-21T07:00:00.000Z');

test('external vendor is time-bounded and excludes sensitive authority',()=>{
  const result=validateAccessGrantInput({role:'external_vendor',expiresAt:'2026-12-01T00:00:00.000Z'},{now:NOW});
  assert.equal(result.ok,true);
  assert.equal(result.principalType,'external_collaborator');
  assert.equal(result.githubUsername,'');
  assert.ok(result.allowed.includes('tenant.integration.inspect'));
  assert.ok(result.allowed.includes('tenant.integration.test'));
  for(const denied of ['tenant.access.manage','tenant.member-roster.manage','tenant.finance.read','tenant.secrets.read','tenant.production.deploy']){
    assert.ok(result.denied.includes(denied),denied);
  }
  assert.equal(effectiveAccessCapabilities({role:'external_vendor',enabled:1,expires_at:'2026-12-01T00:00:00.000Z'}).includes('tenant.access.manage'),false);
  assert.equal(canTenantActorAssignRole('tenant_admin','external_vendor'),true);
  assert.equal(canTenantActorAssignRole('manager','external_vendor'),false);
});

test('tenant admin policy projects only integration-safe vendor capabilities',()=>{
  const capabilities=tenantAdminCapabilitiesForRole('external_vendor');
  assert.ok(capabilities.includes('tenant.dashboard.read'));
  assert.ok(capabilities.includes('tenant.integration.inspect'));
  assert.ok(capabilities.includes('tenant.integration.test'));
  assert.ok(!capabilities.includes('tenant.access.manage'));
  assert.ok(!capabilities.includes('tenant.finance.read'));
});

test('regional admin pages are auth-pending and access manager is separate',async()=>{
  const region=localRegionBySlug('cheonggye');
  const admin=await localRegionAdminPage(region).text();
  const access=await localRegionAccessAdminPage(region).text();
  assert.match(admin,/data-region-auth-pending="1"/);
  assert.match(admin,/local-region-admin-auth\.js/);
  assert.match(admin,/\/cheonggye\/admin\/access/);
  assert.match(admin,/data-region-capability="tenant\.access\.manage"/);
  assert.match(access,/Google 이메일/);
  assert.match(access,/regionAccessForm/);
  assert.match(access,/local-region-access-admin\.js/);
});

test('Cheonggye Pass public remains public while admin is scoped by auth',async()=>{
  const region=localRegionBySlug('cheonggye');
  const program=regionalCommerceProgramById('cheonggye-pass');
  const publicHtml=await regionalCommerceProgramPublicPage(region,program).text();
  const adminHtml=await regionalCommerceProgramAdminPage(region,program).text();
  assert.doesNotMatch(publicHtml,/local-region-admin-auth\.js/);
  assert.match(adminHtml,/data-region-auth-pending="1"/);
  assert.match(adminHtml,/local-region-admin-auth\.js/);
  assert.match(adminHtml,/data-region-capability="tenant\.integration\.inspect"/);
});

test('regional client scripts are served as CSP-compatible external JavaScript',async()=>{
  const auth=localRegionAdminAuthScript();
  const access=localRegionAccessAdminScript();
  assert.match(auth.headers.get('content-type')||'',/text\/javascript/);
  const authText=await auth.text();
  assert.match(authText,/\/api\/local-access\//);
  assert.match(access.headers.get('content-type')||'',/text\/javascript/);
  const accessText=await access.text();
  assert.match(accessText,/external_vendor/);
  assert.match(accessText,/scope\.value==='cheonggye-pass'\?PASS_ROLES:REGION_ROLES/);
  assert.match(accessText,/\/api\/customers\/tenants\//);
});

test('regional access scopes are registered without changing CGMA',async()=>{
  const prereg=await fs.readFile(new URL('../customer-google-prereg.js',import.meta.url),'utf8');
  assert.match(prereg,/slug: 'cheonggye-local'/);
  assert.match(prereg,/domain: 'ekodi\.kr\/cheonggye'/);
  assert.match(prereg,/slug: 'cheonggye-pass'/);
  assert.match(prereg,/external_vendor: '외부업체'/);
  assert.match(prereg,/slug: 'cgma'/);
});

test('regional governor may manage child pass grants but pass vendor does not inherit region access',async()=>{
  const authority=await fs.readFile(new URL('../tenant-access-authority.js',import.meta.url),'utf8');
  assert.match(authority,/slug==='cheonggye-pass'\?'cheonggye-local'/);
  assert.match(authority,/tenantRoleCanManageAccess\(parentGrant\.role\)/);
  const regional=await fs.readFile(new URL('../regional-access-control.js',import.meta.url),'utf8');
  assert.match(regional,/'cheonggye-local'/);
  assert.match(regional,/'cheonggye-pass'/);
  assert.match(regional,/customer_access_grants/);
});

test('router exposes auth assets and regional access page before generic workspace routing',async()=>{
  const router=await fs.readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(router,/localRegionAdminAuthScript/);
  assert.match(router,/localRegionAccessAdminScript/);
  assert.match(router,/localRegionAccessAdminPage/);
  const regional=router.indexOf('localRegionFromPath(url.pathname)');
  const generic=router.indexOf('isWorkspaceAdminPath(url.pathname)&&!isEkodiBizInvestAdminPath(url.pathname)');
  assert.ok(regional>0&&generic>regional);
  const wrangler=await fs.readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  assert.match(wrangler,/\/cheonggye\*/);
  assert.match(router,/\/cheonggye\/local-region-admin-auth\.js/);
  assert.match(router,/\/cheonggye\/local-region-access-admin\.js/);
});

test('customer API routes local access resolver before generic customer access',async()=>{
  const entry=await fs.readFile(new URL('../customer-entry-worker.js',import.meta.url),'utf8');
  const regional=entry.indexOf("path.startsWith('/api/local-access/')");
  const customer=entry.indexOf("path.startsWith('/api/customer/')");
  assert.ok(regional>0&&customer>regional);
  assert.match(entry,/handleRegionalAccessControl/);
});
