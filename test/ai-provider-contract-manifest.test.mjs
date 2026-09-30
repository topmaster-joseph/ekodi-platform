import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contract = JSON.parse(await readFile(new URL('../config/ai-provider-independence.json', import.meta.url), 'utf8'));

test('all EKODI surfaces inherit provider-independent core policy', () => {
  assert.equal(contract.scope.includeAllEkodiSurfaces, true);
  assert.equal(contract.defaultPolicy.providerRequiredForCoreService, false);
  assert.equal(contract.defaultPolicy.providerFailureMustNotFailCoreRequest, true);
  assert.equal(contract.defaultPolicy.providerSecretsAllowedInBrowser, false);
  assert.equal(contract.releaseGate.requiredEnvironment, 'AI_PROVIDER=NONE');
  assert.equal(contract.releaseGate.blockProductionOnFailure, true);
});

test('critical service capabilities remain outside the AI provider boundary', () => {
  const capabilities = new Set(contract.coreCapabilities);
  for (const capability of [
    'authentication',
    'authorization',
    'read',
    'create',
    'update',
    'save',
    'membership',
    'admin_manual_controls',
    'backup_and_recovery',
  ]) {
    assert.equal(capabilities.has(capability), true, `missing core capability: ${capability}`);
  }
});
