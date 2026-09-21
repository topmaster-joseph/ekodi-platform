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
  assert.match(source,/access\/update/);
  assert.match(source,/roleChanged/);
  assert.match(source,/visibility = excluded\.visibility/);
});

test('unified directory exposes visibility and external vendor role',async()=>{
  const source=await read('customer-member-directory.js');
  assert.match(source,/ensureCustomerAccessSchema/);
  assert.match(source,/external_vendor: '외부업체'/);
  assert.match(source,/a\.visibility/);
  assert.match(source,/visibility: row\.visibility === 'public' \? 'public' : 'private'/);
  assert.match(source,/schemaVersion: 5/);
});
