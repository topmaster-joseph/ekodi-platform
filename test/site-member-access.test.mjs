import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files=await Promise.all([
  readFile(new URL('../tenant-access-authority.js',import.meta.url),'utf8'),
  readFile(new URL('../customer-member-directory.js',import.meta.url),'utf8'),
  readFile(new URL('../customer-google-prereg.js',import.meta.url),'utf8'),
  readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8'),
  readFile(new URL('../store-admin-engine.js',import.meta.url),'utf8'),
  readFile(new URL('../client-access.js',import.meta.url),'utf8'),
  readFile(new URL('../admin-menu-registry.js',import.meta.url),'utf8'),
  readFile(new URL('../migrations/0101_site_member_access.sql',import.meta.url),'utf8'),
  readFile(new URL('../supabase/migrations/20260921014500_cgma_site_admin_access.sql',import.meta.url),'utf8'),
]);
const [authority,directory,prereg,workspace,store,central,menu,d1,supabase]=files;

test('site access authority authenticates before enforcing tenant context',()=>{
  const authIndex=authority.indexOf('principalFromSupabaseRequest(request)');
  const tenantIndex=authority.indexOf("code:'TENANT_CONTEXT_REQUIRED'");
  assert.ok(authIndex>=0&&tenantIndex>authIndex);
  assert.match(authority,/code:'ACCESS_AUTH_REQUIRED'/);
  assert.match(authority,/status:401/);
});

test('site access authority distinguishes platform super-admin from tenant-local access managers',()=>{
  assert.match(authority,/role==='super_admin'/);
  assert.match(authority,/TENANT_ADMIN_CAPABILITIES\.access/);
  assert.match(authority,/principalFromSupabaseRequest/);
  assert.match(authority,/ACCESS_SELF_MUTATION_FORBIDDEN/);
  assert.match(authority,/ACCESS_RESPONSIBILITY_ROLE_PROTECTED/);
  assert.match(authority,/SITE_RESPONSIBILITY_ROLES/);
});

test('member directory preserves the production auth marker for anonymous callers',()=>{
  assert.match(directory,/ACCESS_AUTH_REQUIRED: 'EKODI 관리자 인증이 필요합니다\.'/);
});

test('member directory is filtered at the database query for tenant administrators',()=>{
  assert.match(directory,/resolveTenantAccessAuthority/);
  assert.match(directory,/tenantScope/);
  assert.match(directory,/WHERE t\.slug = \?/);
  assert.match(directory,/canManage: accessGrantManageable/);
  assert.match(directory,/authority: \{ scope: authority\.scope/);
});

test('site access mutation accepts dynamic registered tenant slugs and enforces protected-role rules',()=>{
  assert.match(prereg,/\^\[a-z0-9\]\[a-z0-9-\]\{0,79\}\$/);
  assert.doesNotMatch(prereg,/Object\.hasOwn\(TENANT_REALMS, tenant\)/);
  assert.match(prereg,/resolveTenantAccessAuthority/);
  assert.match(prereg,/accessGrantManagementDecision/);
  assert.match(prereg,/displayNameNote/);
  assert.match(prereg,/owner: '사이트 책임관리자'/);
  assert.match(prereg,/admin: '사이트 관리자'/);
});

test('workspace and store admin surfaces both expose the same user-access workflow',()=>{
  assert.match(workspace,/\['members','사용자 · 권한'\]/);
  assert.match(workspace,/async function membersAdmin\(\)/);
  assert.match(workspace,/memberAccessApi\('\/directory\?tenant='/);
  assert.match(workspace,/if\(section==='members'\)return membersAdmin\(\)/);
  assert.match(store,/members:TENANT_ADMIN_CAPABILITIES\.access/);
  assert.match(store,/\['members','사용자 · 권한'\]/);
  assert.match(store,/async function memberAccessPanel\(\)/);
  assert.match(store,/siteAccess\('\/directory\?tenant='/);
  assert.match(store,/overview\|site\|members\|chrome/);
});

test('super-admin separates user settings from administrator settings while sharing site access registry',()=>{
  assert.match(menu,/ko: '사용자설정'/);
  assert.match(menu,/ko: '관리자설정'/);
  assert.match(central,/사용자설정/);
  assert.match(central,/USER_ROLE_OPTIONS/);
  assert.match(central,/\['member','회원'\]/);
  assert.match(central,/displayName/);
  assert.match(central,/\/pre-register/);
});

test('CGMA administrator seeds keep platform and tenant authority separate',()=>{
  for(const email of [
    'cgma4989@gmail.com',
    'topmaster.joseph@gmail.com',
    'mijini0430@gmail.com',
    'matrixism@gmail.com',
    'rokmc895tak@gmail.com',
    'allforyou3957@gmail.com',
  ]){
    assert.match(d1,new RegExp(email.replaceAll('.','\\.')));
    assert.match(supabase,new RegExp(email.replaceAll('.','\\.')));
  }
  assert.match(d1,/'cgma4989@gmail\.com','owner'/);
  assert.match(d1,/'topmaster\.joseph@gmail\.com','admin'/);
  assert.match(d1,/display-name:정찬균/);
  assert.match(supabase,/'tenant_admin'::public\.app_role/);
  assert.match(supabase,/Platform super-admin remains a separate authority/);
});

test('changed JavaScript artifacts are syntactically compilable as modules or scripts',async()=>{
  await import(new URL('../tenant-access-authority.js',import.meta.url));
  await import(new URL('../workspace-admin-page.js',import.meta.url));
  await import(new URL('../store-admin-engine.js',import.meta.url));
  await import(new URL('../customer-google-prereg.js',import.meta.url));
  new Function(central);
});
