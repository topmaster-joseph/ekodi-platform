import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const contract = JSON.parse(await readFile(new URL('../config/singles-mvp-contract.json', import.meta.url), 'utf8'));
const spec = await readFile(new URL('../docs/EKODI-SINGLES-MVP.md', import.meta.url), 'utf8');
test('singles blueprint is explicitly not launched and keeps the privacy floor', () => {
  assert.equal(contract.phase, 'blueprint-only');
  assert.equal(contract.launch_mode, 'not-launched');
  assert.equal(contract.defaults.feature_active, false);
  for (const key of ['adult_only_19_plus','private_by_default','mutual_consent_before_chat','dedicated_sensitive_profile_storage']) assert.equal(contract.defaults[key], true, key);
  for (const key of ['public_profile_search_indexing','external_ai_sensitive_data','paid_brokerage','admins_read_private_messages']) assert.equal(contract.defaults[key], false, key);
});
test('routes and capability roles are unique; consent purposes are separate', () => {
  assert.equal(contract.canonical_path, '/singles');
  for (const key of ['route_plan','roles','independent_consent','proposed_tables']) assert.equal(new Set(contract[key]).size, contract[key].length, key);
  assert.ok(contract.independent_consent.includes('sensitive_religion'));
  assert.ok(contract.independent_consent.includes('marriage_purpose'));
  assert.ok(contract.route_plan.includes('/singles/admin'));
});
test('blueprint includes security, trust, regression, release and required data contracts', () => {
  for (const table of contract.proposed_tables) assert.ok(spec.includes(table), table);
  for (const phrase of ['/connect','RLS','차단','철회','동의','실증','회귀','만 19세']) assert.ok(spec.includes(phrase), phrase);
  assert.ok(contract.gates.includes('production-canary'));
});
