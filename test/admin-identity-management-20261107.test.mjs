import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../supabase/functions/access-api/index.ts', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/migrations/20261107090000_admin_identity_detach.sql', import.meta.url), 'utf8');
const page = readFileSync(new URL('../person-authority-page.js', import.meta.url), 'utf8');

test('admin detach is platform-admin only, step-up gated, reason required', () => {
  const route = api.slice(api.indexOf('const detachMatch='), api.indexOf('if(req.method==="GET"&&path==="/platform-authority")'));
  assert.match(route, /platformAdmin\(auth\.user\.id\)\)return json\(req,\{error:"platform_admin_required"\},403\)/);
  assert.match(route, /recentSignIn\(auth\.user\)\)return json\(req,\{error:"reauth_required"\},401\)/);
  assert.match(route, /reason\.length<5\)return json\(req,\{error:"reason_required"\},400\)/);
  assert.match(route, /person_identity_admin_detach/);
  assert.doesNotMatch(route, /administeredTenantIds/, 'site admins never reach the write path');
  assert.match(api, /const STEP_UP_MS=15\*60\*1000/);
});

test('merge revert now also needs step-up and a reason', () => {
  const route = api.slice(api.indexOf('const revertMatch='), api.indexOf('const detachMatch='));
  assert.match(route, /reauth_required/);
  assert.match(route, /reason_required/);
  assert.match(route, /admin\.merge_revert_reason/);
});

test('site admins get a masked, own-site, read-only view', () => {
  const route = api.slice(api.indexOf('path==="/admin/person"'), api.indexOf('const revertMatch='));
  assert.match(route, /administeredTenantIds\(auth\.user\.id\)/);
  assert.match(route, /mode:"site_admin_readonly"/);
  assert.match(route, /site_admin\.member_login_lookup/);
  const view = api.slice(api.indexOf('async function siteAdminMemberView'), api.indexOf('const STEP_UP_MS'));
  assert.match(view, /email:maskEmail\(r\.email\)/);
  assert.match(view, /\.in\("tenant_id",tenantIds\)/);
  assert.doesNotMatch(view, /\bid:r\.id\b/, 'no identity ids, so nothing to act on');
  assert.doesNotMatch(view, /provider_subject|site_access_registry|person_merge_requests/);
});

test('maskEmail hides most of the address', () => {
  const src = api.slice(api.indexOf('const maskEmail='), api.indexOf('async function siteAdminMemberView'));
  const maskEmail = new Function(`${src.replace('const maskEmail=', 'return ').replace('(value:unknown)', '(value)')}`)();
  assert.equal(maskEmail('joseph@ekodi.kr'), 'jo***@e***.kr');
  assert.equal(maskEmail('a@b.com'), 'a***@b***.com');
  assert.equal(maskEmail(''), null);
  assert.ok(!maskEmail('someone.long@example.com').includes('someone'));
});

test('DB function keeps the money and last/primary-login guards and is service_role only', () => {
  for (const code of ['reason_required', 'detach_primary_login', 'detach_last_login', 'detach_financial_records', 'identity_not_found'])
    assert.match(sql, new RegExp(`'${code}'`));
  assert.match(sql, /admin\.identity_detached/);
  assert.match(sql, /revoke all on function public\.person_identity_admin_detach\(uuid, uuid, text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.person_identity_admin_detach\(uuid, uuid, text\) to service_role/);
  assert.doesNotMatch(sql, /update public\.(payments|orders|subscriptions|points|point_)/i);
});

test('admin page: detach and revert only for platform admins, never link on behalf', () => {
  assert.match(page, /if\(mode==='platform'\)\{\s*const td=el\('td'\)/);
  assert.match(page, /m\.status==='executed'&&mode==='platform'/);
  assert.match(page, /\/detach','POST',\{reason\}/);
  assert.match(page, /\/revert','POST',\{reason\}/);
  assert.match(page, /https:\/\/ekodi\.kr\/auth\/\?manage=1/);
  assert.match(page, /사이트 관리자 · 보기 전용/);
  assert.doesNotMatch(page, /\/identities\/link|link_identity|linkIdentity/);
});
