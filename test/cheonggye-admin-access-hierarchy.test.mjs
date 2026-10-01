import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  accessGrantAssignableRoles,
  accessGrantManagementDecision,
} from '../tenant-access-authority.js';

const [directory,localAccess,localPage,workspace]=await Promise.all([
  readFile(new URL('../customer-member-directory.js',import.meta.url),'utf8'),
  readFile(new URL('../local-region-access-admin.js',import.meta.url),'utf8'),
  readFile(new URL('../local-region-page.js',import.meta.url),'utf8'),
  readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8'),
]);

const authority=(role,email='actor@example.com',tenantSlug='cgma')=>({
  ok:true,scope:'tenant',role,email,tenantSlug,
});

test('Cheonggye responsibility owner may manage admin while admin may not manage peer admin',()=>{
  assert.equal(accessGrantManagementDecision(
    authority('owner'),
    {email:'admin@example.com',role:'admin'},
    {role:'admin'},
  ).ok,true);
  const peer=accessGrantManagementDecision(
    authority('admin'),
    {email:'peer@example.com',role:'admin'},
    {role:'manager'},
  );
  assert.equal(peer.ok,false);
  assert.equal(peer.code,'ACCESS_PEER_OR_HIGHER_ROLE_PROTECTED');
  assert.equal(accessGrantManagementDecision(
    authority('admin'),
    {email:'manager@example.com',role:'manager'},
    {role:'viewer'},
  ).ok,true);
});

test('assignable roles are bounded below the acting role for Cheonggye scopes',()=>{
  const ownerRoles=accessGrantAssignableRoles(authority('owner')).map(String);
  const adminRoles=accessGrantAssignableRoles(authority('admin')).map(String);
  assert.ok(ownerRoles.includes('admin'));
  assert.ok(!adminRoles.includes('admin'));
  assert.ok(adminRoles.includes('manager'));
  assert.deepEqual(accessGrantAssignableRoles(
    authority('owner','owner@example.com'),
    {email:'owner@example.com',role:'owner'},
  ),[]);
});

test('directory publishes server-decided manageability and role choices',()=>{
  assert.match(directory,/assignableRoles: assignableRoleDirectory/);
  assert.match(directory,/schemaVersion:\s*7/);
});

test('regional admin pages expose manager lists and hierarchy-aware controls',()=>{
  assert.match(localPage,/data-region-admin-summary-list/);
  assert.match(localPage,/scope=cheonggye-local/);
  assert.match(localPage,/scope=cheonggye-pass/);
  assert.match(localAccess,/data-region-admin-summary-list/);
  assert.match(localAccess,/등록된 관리자가 없습니다/);
  assert.match(localAccess,/user\.assignableRoles/);
  assert.match(localAccess,/access\/update/);
});

test('CGMA workspace admin consumes the same hierarchy projection',()=>{
  assert.match(workspace,/관리자 목록 · 사용자 권한/);
  assert.match(workspace,/m\.assignableRoles/);
  assert.match(workspace,/data\.authority\?\.assignableRoles/);
  assert.match(workspace,/동급·상위 관리자/);
  assert.match(workspace,/access\/update/);
});
