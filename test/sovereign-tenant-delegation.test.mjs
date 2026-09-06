import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const access=await readFile(new URL('../supabase/functions/access-api/index.ts',import.meta.url),'utf8');
const membership=await readFile(new URL('../supabase/functions/membership-api/index.ts',import.meta.url),'utf8');
const auth=await readFile(new URL('../auth-site/auth.js',import.meta.url),'utf8');

test('access-api exposes a payload-minimal tenant reviewer authority check',()=>{
  assert.match(access,/path==="\/reviewer"/);
  assert.match(access,/site_and_tenant_required/);
  assert.match(access,/authority:"platform"/);
  assert.match(access,/role:"platform_admin"/);
  assert.match(access,/scope:"tenant:"\+tenant\.slug/);
});

test('platform admins retain platform authority instead of becoming tenant members',()=>{
  assert.match(access,/platformAdmin\(userId\)/);
  assert.match(access,/roles:\["platform_admin"\]/);
  assert.match(access,/role==="tenant_admin"/);
  assert.match(access,/tenantAdminSite/);
  assert.match(access,/source:"reviewer"/);
});

test('central auth can hand off CGMA reviewer authority without member enrollment',()=>{
  assert.match(auth,/site==='cgma'&&authorized\.length===0/);
  assert.match(auth,/await handoffToService\(\)/);
  assert.match(auth,/site_access_required/);
});

test('legacy store-claim review accepts platform authority and audits its source',()=>{
  assert.match(membership,/platform_admin/);
  assert.match(membership,/tenantReviewer\(auth\.db,auth\.user\.id/);
  assert.match(membership,/reviewer_authority:reviewer\.authority/);
  assert.match(membership,/reviewer_role:reviewer\.role/);
});
