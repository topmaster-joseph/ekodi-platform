import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sql=fs.readFileSync('migrations/0202_cgmurrc_tenant_registration.sql','utf8');

test('cgmurrc tenant is registered idempotently without importing any member roster',()=>{
  assert.match(sql,/INSERT OR IGNORE INTO customer_tenants\(slug,name,domain,status,created_at\)\s*VALUES\('cgmurrc','청계면 도시재생 주민협의체','ekodi\.kr\/cgmurrc','active'/);
  // Only one pre-registered site administrator; no roster, no merchant-association reuse.
  const grants=sql.match(/INSERT INTO customer_access_grants/g)||[];
  assert.equal(grants.length,1);
  assert.doesNotMatch(sql,/slug='cgma'/);
  assert.doesNotMatch(sql,/customer_users|customer_memberships|members\b/);
  assert.doesNotMatch(sql,/010[-\s]?\d{3,4}[-\s]?\d{4}/);
  assert.match(sql,/ON CONFLICT\(tenant_id,email\) DO UPDATE/);
  assert.match(sql,/platform\.admin/);
});
