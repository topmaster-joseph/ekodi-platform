import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import platformRouter from '../platform-router-entry-worker.js';
import { memberHomeRouteFromPath, canonicalMemberHomeForService, siteMemberFoundationResponse } from '../site-member-home-page.js';
import { SITE_MEMBER_HOME_FOUNDATION, foundationForAudience } from '../generated/site-member-home-foundation.js';

const shell=await readFile(new URL('../shell/shell.js',import.meta.url),'utf8');
const injector=await readFile(new URL('../ekodi-shell-injector.js',import.meta.url),'utf8');
const userHeader=await readFile(new URL('../shell/user-ui-header.js',import.meta.url),'utf8');
const spaceApp=await readFile(new URL('../space/app.js',import.meta.url),'utf8');
const missionShell=await readFile(new URL('../space/ekodimission-shell.js',import.meta.url),'utf8');
const clientAuth=await readFile(new URL('../auth-site/client-auth.js',import.meta.url),'utf8');
const authorAuth=await readFile(new URL('../auth-site/author-auth.js',import.meta.url),'utf8');
const businessAuth=await readFile(new URL('../auth-site/business-auth.js',import.meta.url),'utf8');
const marketingAuth=await readFile(new URL('../auth-site/marketing-auth-hotfix.js',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/20260919235500_site_member_home_foundation.sql',import.meta.url),'utf8');
const membershipPolicy=JSON.parse(await readFile(new URL('../config/universal-membership.json',import.meta.url),'utf8'));
const workspacePolicy=JSON.parse(await readFile(new URL('../config/service-workspace-policy.json',import.meta.url),'utf8'));

test('canonical service and independent workspace paths resolve to their own My Page',()=>{
  assert.equal(memberHomeRouteFromPath('/ekodimission/my')?.siteKey,'mission');
  assert.equal(memberHomeRouteFromPath('/ekodimission/my')?.canonical,true);
  assert.equal(memberHomeRouteFromPath('/mission/my')?.siteKey,'mission');
  assert.equal(memberHomeRouteFromPath('/ekodibiz/marketing-ai/my')?.siteKey,'marketing');
  assert.equal(memberHomeRouteFromPath('/jadam/my')?.kind,'workspace');
  assert.equal(memberHomeRouteFromPath('/jadam/my')?.workspaceSlug,'jadam');
  assert.equal(memberHomeRouteFromPath('/my'),null);
  assert.equal(memberHomeRouteFromPath('/admin/my'),null);
  assert.equal(canonicalMemberHomeForService('mission'),'https://ekodi.kr/ekodimission/my');
  assert.equal(canonicalMemberHomeForService('marketing'),'https://ekodi.kr/ekodibiz/marketing-ai/my');
});

test('apex router owns service and workspace My Pages before public-service fallthrough',async()=>{
  for(const path of ['/jadam/my','/ekodimission/my','/bible/my']){
    const response=await platformRouter.fetch(new Request(`https://ekodi.kr${path}`),{},{waitUntil(){}});
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('x-ekodi-route'),'site-member-home',path);
    assert.equal(response.headers.get('x-ekodi-member-home'),'site-local-v1',path);
    assert.match(response.headers.get('x-robots-tag')||'',/noindex/i);
    const html=await response.text();
    assert.match(html,/마이페이지/);
    assert.match(html,/핵심서비스/);
    assert.match(html,/공통서비스/);
    assert.match(html,/전문서비스/);
    assert.ok(html.includes(encodeURIComponent(`https://ekodi.kr${path}`))||html.includes(`https%3A%2F%2Fekodi.kr%2F`));
  }
});

test('foundation projection is registry-live for every supported audience',async()=>{
  assert.equal(SITE_MEMBER_HOME_FOUNDATION.policyId,'site-local-member-home-v1');
  for(const audience of ['person','business','organization','church','community','team','project']){
    const foundation=foundationForAudience(audience);
    assert.ok(foundation.core.length>=5,audience);
    assert.ok(foundation.common.length>=2,audience);
    assert.ok(foundation.specialist.length>=1,audience);
  }
  const response=siteMemberFoundationResponse(new Request('https://ekodi.kr/_ekodi/member-home/foundation.json?audience=organization'));
  const data=await response.json();
  assert.equal(data.policy.projection,'registry-live');
  assert.ok(data.specialist.some(pack=>pack.id==='organization'));
  assert.ok(data.services.some(service=>service.id==='mission'));
});

test('shared shell login and account links target the current site My Page',()=>{
  assert.match(shell,/function siteMemberHomeBase\(\)/);
  assert.match(shell,/set\('return_to',siteMemberHomeBase\(\)\)/);
  assert.match(shell,/이 사이트 마이페이지/);
  assert.match(injector,/data-ekodi-site-member-home/);
  assert.match(injector,/serviceMemberHomeHref/);
  assert.match(userHeader,/data-ekodi-site-member-home/);
  assert.match(userHeader,/siteMemberHomeUrl\(\)/);
  assert.doesNotMatch(injector,/href="https:\/\/ekodi\.kr\/my\/">My EKODI<\/a>/);
  assert.doesNotMatch(userHeader,/href="https:\/\/ekodi\.kr\/my\/">My EKODI<\/a>/);
});

test('central and specialized auth handlers return successful site login to canonical site My Pages',()=>{
  assert.match(clientAuth,/function siteMemberHomeTarget\(\)/);
  assert.match(clientAuth,/const target=siteMemberHomeTarget\(\)/);
  assert.match(clientAuth,/jadam-client':'jadam/);
  assert.match(authorAuth,/AUTHOR_MEMBER_HOME='https:\/\/ekodi\.kr\/author\/my'/);
  assert.match(authorAuth,/location\.assign\(RETURN_TO\|\|AUTHOR_MEMBER_HOME\)/);
  assert.match(businessAuth,/BUSINESS_MEMBER_HOME='https:\/\/ekodi\.kr\/business\/my'/);
  assert.match(businessAuth,/location\.assign\(RETURN_TO\|\|BUSINESS_MEMBER_HOME\)/);
  assert.match(marketingAuth,/MARKETING_MEMBER_HOME='https:\/\/ekodi\.kr\/ekodibiz\/marketing-ai\/my'/);
  assert.match(marketingAuth,/isMarketingMemberHome/);
});

test('workspace login returns to slug-local My Page and Mission nav exposes Mission My Page',()=>{
  assert.match(spaceApp,/function siteMemberHome\(\)/);
  assert.match(spaceApp,/set\('return_to',siteMemberHome\(\)\)/);
  assert.match(spaceApp,/\/${encodeURIComponent\(slug\)}\/my/);
  assert.match(missionShell,/href:'\/ekodimission\/my',label:'마이페이지'/);
});

test('new people, tenants and stores eagerly receive a registry-live foundation without copied capabilities',()=>{
  assert.match(migration,/create table if not exists public\.workspace_experience_foundations/i);
  assert.match(migration,/people_site_member_foundation/);
  assert.match(migration,/tenants_site_member_foundation/);
  assert.match(migration,/stores_site_member_foundation/);
  assert.match(migration,/foundation_mode text not null default 'registry_live'/);
  assert.doesNotMatch(migration,/capabilities\s+jsonb/i);
  assert.match(migration,/site_member_home_preferences/);
  assert.match(migration,/does not|Never|never/i);
});

test('policy separates global My EKODI from site-local default login home',()=>{
  assert.equal(workspacePolicy.publicWorkspaceRouting.memberHomePattern,'/{slug}/my');
  assert.equal(workspacePolicy.publicWorkspaceRouting.loginReturnPolicy,'site-local-member-home');
  assert.equal(workspacePolicy.canonicalSurfaces.user,'/my');
  assert.equal(workspacePolicy.canonicalSurfaces.siteUser,'/{slug}/my');
  assert.equal(membershipPolicy.siteMemberHome.defaultAfterSiteLogin,true);
  assert.equal(membershipPolicy.siteMemberHome.foundationMaterialization,'eager_on_person_tenant_store_creation');
  assert.equal(membershipPolicy.automaticInheritance.futureRegistryServicesAppearWithoutPerUserMigration,true);
});
