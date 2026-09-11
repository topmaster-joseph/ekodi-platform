import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isSafeExternalAiEndpoint,
  normalizeExternalAiModuleInput,
  externalAiModuleStatusTransitionAllowed,
  loadExternalAiModules,
  EXTERNAL_AI_MODULE_REGISTRY_CONTRACT,
} from '../external-ai-module-registry-control.js';

function managedRow(overrides = {}) {
  return {
    module_id:'vendor.test-ai', display_name:'Test AI', vendor_name:'Vendor', module_version:'1.0.0',
    endpoint:'https://vendor.example.com', capabilities_json:'["marketing.analysis"]',
    secret_binding:'EKODI_EXT_AI_VENDOR_TEST_AI_SECRET', timeout_ms:12000, retry_safe:0,
    retry_max_attempts:1, retry_backoff_ms:250, response_max_bytes:1048576,
    circuit_breaker_threshold:3, circuit_breaker_cooldown_ms:30000,
    status:'draft', health_status:'unknown', last_checked_at:'', last_error:'', reference_module:0,
    ...overrides,
  };
}

function dbWith(rows) {
  return { prepare() { return { async all() { return { results: rows }; } }; } };
}
test('registry accepts only public HTTPS module endpoints and normalizes safe manifests', () => {
  const item = normalizeExternalAiModuleInput({
    id:'Vendor.Marketing-AI', name:'Marketing Specialist', vendor:'Example Vendor',
    endpoint:'https://vendor.example.com/', capabilities:['marketing.analysis','marketing.analysis'], retrySafe:true,
  });
  assert.equal(item.id, 'vendor.marketing-ai');
  assert.equal(item.endpoint, 'https://vendor.example.com');
  assert.deepEqual(item.capabilities, ['marketing.analysis']);
  assert.equal(item.retryMaxAttempts, 2);
  assert.match(item.secretBinding, /^EKODI_EXT_AI_/);
  for (const url of ['http://vendor.example.com','https://localhost','https://127.0.0.1','https://10.0.0.2','https://192.168.1.4','https://user:pass@vendor.example.com']) {
    assert.equal(isSafeExternalAiEndpoint(url), false, url);
  }
});

test('registry lifecycle requires healthy validation before staging and production', () => {
  const allowed = externalAiModuleStatusTransitionAllowed;
  assert.equal(allowed('draft','validating'), true);
  assert.equal(allowed('validating','staging', { healthy:false, secretConfigured:true }), false);
  assert.equal(allowed('validating','staging', { healthy:true, secretConfigured:true }), true);
  assert.equal(allowed('staging','production', { healthy:true, secretConfigured:true }), true);
  assert.equal(allowed('staging','production', { healthy:true, secretConfigured:true, reference:true }), false);
  assert.equal(allowed('production','blocked'), true);
  assert.equal(allowed('blocked','draft'), true);
});
test('draft managed rows do not silently disable legacy production modules, while blocked rows do', async () => {
  const legacy = [{
    id:'vendor.test-ai', name:'Legacy', version:'1.0.0', endpoint:'https://legacy.example.com',
    capabilities:['marketing.analysis'], secretBinding:'LEGACY_SECRET', enabled:true,
  }];
  const baseEnv = { EKODI_AI_MODULE_REGISTRY_JSON:JSON.stringify(legacy), LEGACY_SECRET:'secret' };
  const draft = await loadExternalAiModules({ ...baseEnv, DB:dbWith([managedRow({ status:'draft' })]) });
  assert.equal(draft.length, 1);
  assert.equal(draft[0].source, 'environment');
  const blocked = await loadExternalAiModules({ ...baseEnv, DB:dbWith([managedRow({ status:'blocked' })]) });
  assert.equal(blocked.length, 0);
  const production = await loadExternalAiModules({ ...baseEnv, DB:dbWith([managedRow({ status:'production' })]) });
  assert.equal(production.length, 1);
  assert.equal(production[0].source, 'managed');
});

test('reference module remains staging-only and visible only to all-scope registry reads', async () => {
  const row = managedRow({
    module_id:'ekodi.reference-module', display_name:'EKODI Reference Module', vendor_name:'EKODI',
    endpoint:'https://reference.invalid', capabilities_json:'["reference.contract"]', secret_binding:'',
    status:'staging', health_status:'healthy', reference_module:1,
  });
  assert.equal((await loadExternalAiModules({ DB:dbWith([row]) })).length, 0);
  const all = await loadExternalAiModules({ DB:dbWith([row]) }, { scope:'all' });
  assert.equal(all.length, 1);
  assert.equal(all[0].reference, true);
  assert.equal(EXTERNAL_AI_MODULE_REGISTRY_CONTRACT.referenceModuleId, 'ekodi.reference-module');
});
test('migration creates managed registry, audit ledger and staging reference module', async () => {
  const sql = await readFile(new URL('../migrations/0079_external_ai_module_registry.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS external_ai_module_registry\b/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS external_ai_module_registry_audit\b/);
  assert.match(sql, /'ekodi\.reference-module'/);
  assert.match(sql, /'staging','healthy'/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|RENAME COLUMN/i);
});