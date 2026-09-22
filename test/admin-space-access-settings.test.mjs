import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=path=>fs.readFile(new URL('../'+path,import.meta.url),'utf8');

test('super admin exposes separate administrator and user settings menus',async()=>{
  const registry=await read('admin-menu-registry.js');
  assert.match(registry,/id: 'admins'.*ko: '관리자설정'/s);
  assert.match(registry,/id: 'users-access'.*ko: '사용자설정'/s);
});

test('administrator settings include platform and site-space administrator management',async()=>{
  const runtime=await read('admin-menu-runtime.js');
  assert.match(runtime,/사이트·공간 관리자/);
  assert.match(runtime,/data-space-admin-tenant/);
  assert.match(runtime,/data-space-admin-visibility-filter/);
  assert.match(runtime,/SPACE_ADMIN_ROLE_SET/);
  assert.match(runtime,/\/api\/customers\/tenants\/'\+encodeURIComponent\(tenant\)\+'\/access\/update/);
  assert.match(runtime,/visibility:visibility\.value/);
});

test('user settings show only user roles and edit visibility per space',async()=>{
  const source=await read('client-access.js');
  assert.match(source,/USER_ROLE_OPTIONS/);
  assert.match(source,/USER_ROLE_SET\.has\(member\.role\)/);
  assert.match(source,/사용자설정/);
  assert.match(source,/비공개/);
  assert.match(source,/visibility:visibility\.value/);
  assert.match(source,/access\/update/);
  assert.doesNotMatch(source,/for \(const \[value, label\] of ROLE_OPTIONS\) role\.append/);
});

test('access grants default private and support controlled role status visibility updates',async()=>{
  const source=await read('customer-google-prereg.js');
  assert.match(source,/visibility TEXT NOT NULL DEFAULT 'private'/);
  assert.match(source,/ALTER TABLE customer_access_grants ADD COLUMN visibility/);
  assert.match(source,/normalizeVisibility/);
  assert.ok(source.includes('access\\/update'));
  assert.match(source,/roleChanged/);
  assert.ok(source.includes('visibility = excluded.visibility'));
});

test('unified directory exposes visibility and external vendor role',async()=>{
  const source=await read('customer-member-directory.js');
  assert.match(source,/ensureCustomerAccessSchema/);
  assert.match(source,/external_vendor: '외부업체'/);
  assert.match(source,/a\.visibility/);
  assert.match(source,/visibility: row\.visibility === 'public' \? 'public' : 'private'/);
  assert.match(source,/schemaVersion: 5/);
});


test('central administrator settings connect Cheonggye scopes to their own operation surfaces',async()=>{
  const runtime=await read('admin-menu-runtime.js');
  assert.match(runtime,/SPACE_ADMIN_MANAGE_PATHS/);
  assert.match(runtime,/'cheonggye-local':'\/cheonggye\/admin'/);
  assert.match(runtime,/'cheonggye-pass':'\/cheonggye\/admin\/pass'/);
  assert.match(runtime,/cgma:'\/cgma\/admin'/);
  assert.match(runtime,/data-space-admin-manage/);
  assert.match(runtime,/syncSpaceAdminManageLink/);
  assert.match(runtime,/tenant\.domain\?tenant\.name\+' · '\+tenant\.domain/);
});

test('CGMA active tenant directory uses the canonical apex path while regional scopes stay separate',async()=>{
  const [access,migration]=await Promise.all([
    read('customer-google-prereg.js'),
    read('migrations/0106_cgma_canonical_tenant_domain.sql'),
  ]);
  assert.match(access,/slug: 'cgma', name: '청계면상인회', domain: 'ekodi\.kr\/cgma'/);
  assert.match(access,/slug: 'cheonggye-local', name: '청계잇다 지역플랫폼', domain: 'ekodi\.kr\/cheonggye'/);
  assert.match(access,/slug: 'cheonggye-pass', name: '청계패스', domain: 'ekodi\.kr\/cheonggye\/pass'/);
  assert.match(access,/UPDATE customer_tenants SET domain = 'ekodi\.kr\/cgma' WHERE slug = 'cgma'/);
  assert.match(migration,/UPDATE customer_tenants/);
  assert.match(migration,/SET domain = 'ekodi\.kr\/cgma'/);
  assert.match(migration,/WHERE slug = 'cgma'/);
  assert.doesNotMatch(migration,/DELETE|DROP TABLE/i);
});
