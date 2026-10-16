import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../scripts/verify-church-production-guest-contract.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/verify-church-production-guest-contract.yml',import.meta.url),'utf8');
test('real production guest probe needs no auth, credentials, or mutation',()=>{
  assert.match(source,/scope=worship-access/);
  assert.match(source,/scope=finance-access/);
  assert.match(source,/AUTH_REQUIRED/);
  assert.match(source,/ORIGIN_NOT_ALLOWED/);
  assert.match(source,/foreign\.response\.status,403/);
  assert.match(source,/options\.response\.status,204/);
  assert.match(source,/guest\.response\.status,401/);
  assert.match(source,/finance\.response\.status,401/);
  assert.match(source,/HOME\+'church-release\.json'/);
  assert.match(source,/HOME\+'church-worship-admin\.js'/);
  assert.match(source,/if\(response\.status===429\)throw/);
  assert.doesNotMatch(source,/(service_role|sb_secret_|SUPABASE_ACCESS_TOKEN|Authorization:|Bearer )/);
  assert.doesNotMatch(source,/(method:'POST'|method:'PATCH'|method:'DELETE')/);
});
test('independent CI is read-only and does not require Supabase management secrets',()=>{
  assert.match(workflow,/permissions:\s+contents: read/);
  assert.match(workflow,/timeout-minutes: 5/);
  assert.match(workflow,/node scripts\/verify-church-production-guest-contract\.mjs/);
  assert.doesNotMatch(workflow,/environment: production/);
  assert.doesNotMatch(workflow,/secrets\./);
});
