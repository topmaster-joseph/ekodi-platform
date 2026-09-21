import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  normalizeRegionalCommerceProgramContract,
  regionalCommerceProgramAdapterRequirements,
} from '../regional-commerce-program-contract.js';

test('Cheonggye Pass may use an external provider without provider ownership of the region',async()=>{
  const config=JSON.parse(await fs.readFile(new URL('../config/regional-commerce-programs.json',import.meta.url),'utf8'));
  const raw=config.programs.find(item=>item.id==='cheonggye-pass');
  const contract=normalizeRegionalCommerceProgramContract(raw);
  assert.equal(contract.regionId,'local:cheonggye');
  assert.equal(contract.publicName,'청계패스');
  assert.equal(contract.mode,'hybrid');
  assert.equal(contract.providerId,null);
  assert.equal(contract.providerReplaceable,true);
  assert.equal(contract.directDatabaseAccess,false);
  assert.equal(contract.credentials,'server-side-vault-only');
  assert.equal(raw.initialOperatorId,'cgma');
  assert.equal(raw.rules.providerMayOwnRegionalIdentity,false);
  assert.equal(raw.rules.financialExecutionEnabledBeforeProviderApproval,false);
});

test('external adapter requirements avoid private database coupling',()=>{
  const contract=normalizeRegionalCommerceProgramContract({
    id:'sample-pass',
    regionId:'local:sample',
    publicName:'Sample Pass',
    mode:'external',
    providerId:'vendor-a',
    capabilities:['health','merchant-status','webhook-events'],
  });
  const requirements=regionalCommerceProgramAdapterRequirements(contract);
  assert.ok(requirements.required.includes('merchant-sync'));
  assert.ok(requirements.security.includes('no-direct-ekodi-database-access'));
  assert.ok(requirements.security.includes('idempotency-for-mutations'));
});
