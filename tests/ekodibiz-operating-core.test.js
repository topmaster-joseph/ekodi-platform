import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const configUrl = new URL('../config/ekodibiz-operating-core.json', import.meta.url);
const config = JSON.parse(await readFile(configUrl, 'utf8'));

test('EKODIBIZ remains the single official operating umbrella', () => {
  assert.equal(config.official_entity.key, 'ekodibiz');
  assert.equal(config.official_entity.name_en, 'EKODIBIZ');
  assert.equal(config.official_entity.role, 'legal_and_operating_umbrella');
});

test('core remains operable without an external AI provider', () => {
  assert.equal(config.principles.stable_core, true);
  assert.equal(config.principles.replaceable_ai, true);
  assert.equal(config.principles.portable_data, true);
  assert.equal(config.principles.ai_optional_for_core_operation, true);
});

test('business divisions have unique stable codes and no duplicate domains', () => {
  const divisions = config.initial_divisions;
  const codes = divisions.map((item) => item.code);
  const domains = divisions.map((item) => item.domain_hint).filter(Boolean);

  assert.equal(new Set(codes).size, codes.length);
  assert.equal(new Set(domains).size, domains.length);
  assert.ok(divisions.some((item) => item.code === 'BOOKS'));
  assert.ok(divisions.some((item) => item.code === 'LAB'));
  assert.ok(divisions.some((item) => item.code === 'TRADE'));
  assert.ok(divisions.some((item) => item.code === 'MARKETING'));
});

test('high-risk AI actions always require approval', () => {
  const guarded = new Set(config.ai_action_policy.approval_required);
  for (const action of ['payment', 'contract_commitment', 'external_send', 'tax_filing', 'public_release', 'destructive_delete']) {
    assert.ok(guarded.has(action), `${action} must remain approval-gated`);
  }
});
