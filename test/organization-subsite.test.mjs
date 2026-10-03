import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isOrganizationWorkspaceSlug, renderOrganizationPublicPage } from '../organization-public-page.js';
import { isOrganizationAdminPath, organizationAdminPage, organizationAdminScript } from '../organization-admin-page.js';

test('Hammu uses reusable organization workspace projection', async () => {
  assert.equal(isOrganizationWorkspaceSlug('hammu'), true);
  assert.equal(isOrganizationWorkspaceSlug('cgma'), false);
  const response = await renderOrganizationPublicPage(new Request('https://ekodi.kr/hammu'), {}, {}, 'hammu');
  const html = await response.text();
  for (const marker of ['함무시찰회','공지사항','임원','회계보고','출석현황','/hammu/admin']) assert.match(html, new RegExp(marker));
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  const workerSource = fs.readFileSync(new URL('../space-worker.js', import.meta.url), 'utf8');
  assert.match(workerSource, /['space-storefront','space-organization']/);
});

test('organization admin is tenant-local and only enabled for Hammu path', async () => {
  for (const path of ['/hammu/admin','/hammu/admin/officers','/hammu/admin/notices','/hammu/admin/finance','/hammu/admin/attendance']) assert.equal(isOrganizationAdminPath(path), true, path);
  assert.equal(isOrganizationAdminPath('/other/admin'), false);
  const response = organizationAdminPage('/hammu/admin/finance');
  const html = await response.text();
  assert.match(html,/data-ekodi-authority-scope="tenant"/);
  assert.match(html,/data-ekodi-organization-admin="true"/);
  assert.match(html,/임원 승계/);
  assert.match(html,/회계보고/);
  assert.match(html,/출석체크/);
  assert.equal(response.headers.get('x-ekodi-authority-scope'),'tenant');
});

test('organization admin browser script receives serialized Supabase public config', async () => {
  const script = await (await organizationAdminScript()).text();
  assert.match(script,/https:\/\/renzehysxirjilvdxacv\.supabase\.co/);
  assert.doesNotMatch(script,/SUPABASE_URL|SUPABASE_KEY/);
});

test('organization migration separates public aggregate projection from private details', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20260914095000_organization_subsite_operations.sql', import.meta.url), 'utf8');
  for (const marker of ['organization_office_rules','organization_finance_entries','organization_attendance','organization_audit_logs','organization_public_snapshot','organization_admin_snapshot','organization_admin_command','explicit_user_delegation_issue_1691']) assert.match(sql,new RegExp(marker));
  const publicProjection = sql.split('create or replace function public.organization_public_snapshot')[1].split('create or replace function public.organization_preview_succession')[0];
  assert.doesNotMatch(publicProjection,/attendee_name|attendee_key|evidence_ref|organization_finance_entries/i);
  assert.match(publicProjection,/attended_count/);
  assert.match(publicProjection,/publication_state='published'/);
});

test('succession rules are configurable and do not fabricate officer identities', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20260914095000_organization_subsite_operations.sql', import.meta.url), 'utf8');
  assert.match(sql,/\('chair','회장',10,'vice_chair',true\)/);
  assert.match(sql,/\('secretary','서기',30,'assistant_secretary',true\)/);
  assert.match(sql,/officers remain empty until verified/);
  assert.doesNotMatch(sql,/윤재희|문대용/);
});


test('Space production release heals and verifies required Supabase RPC schema before Worker promotion', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/deploy-space.yml', import.meta.url), 'utf8');
  assert.match(workflow,/SUPABASE_PROJECT_REF: renzehysxirjilvdxacv/);
  assert.match(workflow,/20260906006000_store_admin_routing\.sql/);
  assert.match(workflow,/20260914095000_organization_subsite_operations\.sql/);
  assert.match(workflow,/Select Supabase production deployment credential/);
  assert.match(workflow,/Heal and verify Supabase Space schema contract/);
  assert.match(workflow,/store_admin_route_profile\(text\)/);
  assert.match(workflow,/organization_public_snapshot\(text\)/);
  assert.match(workflow,/store_user_site_public_snapshot\(text\)/);
  assert.match(workflow,/api\.supabase\.com\/v1\/projects\/\$SUPABASE_PROJECT_REF\/database\/query/);
  assert.match(workflow,/Verify anonymous public projection RPCs/);
});
