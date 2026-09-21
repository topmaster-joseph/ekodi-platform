import test from 'node:test';
import assert from 'node:assert/strict';
import { delegatedRegionalCapabilitiesFor } from '../regional-access-control.js';
import { TENANT_ADMIN_CAPABILITIES } from '../tenant-admin-policy.js';

test('CGMA responsibility roles receive delegated Cheonggye regional operations only',()=>{
  for(const role of ['owner','admin','manager','tenant_admin','workspace_admin','client_admin']){
    const caps=[...delegatedRegionalCapabilitiesFor('cheonggye-local','cgma',role)];
    assert.ok(caps.includes(TENANT_ADMIN_CAPABILITIES.dashboard),role);
    assert.ok(caps.includes(TENANT_ADMIN_CAPABILITIES.operations),role);
    assert.ok(!caps.includes(TENANT_ADMIN_CAPABILITIES.access),role);
    assert.ok(!caps.includes('*'),role);
  }
});

test('CGMA delegated Cheonggye Pass rights stay operational and exclude access management',()=>{
  const caps=[...delegatedRegionalCapabilitiesFor('cheonggye-pass','cgma','admin')];
  assert.deepEqual(caps,[
    TENANT_ADMIN_CAPABILITIES.dashboard,
    TENANT_ADMIN_CAPABILITIES.integrationInspect,
    TENANT_ADMIN_CAPABILITIES.integrationTest,
    TENANT_ADMIN_CAPABILITIES.logs,
  ]);
  assert.ok(!caps.includes(TENANT_ADMIN_CAPABILITIES.access));
  assert.ok(!caps.includes(TENANT_ADMIN_CAPABILITIES.finance));
});

test('viewer, member and unrelated tenants do not inherit regional operating rights',()=>{
  assert.deepEqual([...delegatedRegionalCapabilitiesFor('cheonggye-local','cgma','viewer')],[]);
  assert.deepEqual([...delegatedRegionalCapabilitiesFor('cheonggye-local','cgma','member')],[]);
  assert.deepEqual([...delegatedRegionalCapabilitiesFor('cheonggye-local','other-org','admin')],[]);
  assert.deepEqual([...delegatedRegionalCapabilitiesFor('unknown','cgma','admin')],[]);
});
