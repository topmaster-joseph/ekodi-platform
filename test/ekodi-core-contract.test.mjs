import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

test('EKODI Core owns canonical control-plane identity and organization contracts', async () => {
  const core = await readJson('config/ekodi-core-contract.json');
  assert.equal(core.status, 'adopted');
  assert.equal(core.canonicalHosts.api, 'api.ekodi.kr');
  assert.equal(core.controlPlane.platformId, 'control-api');
  assert.equal(core.controlPlane.database, 'ekodi-auth D1');
  assert.equal(core.controlPlane.canonicalEntities.organization, 'customer_tenants');
  assert.equal(core.controlPlane.canonicalEntities.person, 'customer_users');
  assert.equal(core.controlPlane.canonicalEntities.membership, 'customer_memberships');
  assert.equal(core.controlPlane.canonicalEntities.audit, 'customer_audit_logs');
});

test('EKODI Core remains hybrid, provider-independent and AI-optional', async () => {
  const core = await readJson('config/ekodi-core-contract.json');
  assert.equal(core.dataStrategy.mode, 'hybrid');
  assert.equal(core.providerIndependence.required, true);
  assert.equal(core.aiStrategy.mode, 'optional-enhancement');

  const principles = new Set(core.corePrinciples);
  for (const principle of ['tenant-isolation', 'provider-independence', 'ai-optional', 'data-portability', 'graceful-degradation']) {
    assert.ok(principles.has(principle), `missing principle: ${principle}`);
  }
});

test('EKODI Core completion requires production and restore verification', async () => {
  const core = await readJson('config/ekodi-core-contract.json');
  const gates = new Set(core.completionGates);
  assert.ok(gates.has('backup-and-restore-path-is-verified'));
  assert.ok(gates.has('production-hostname-regressions-pass'));
  assert.ok(gates.has('tenant-isolation-is-verified'));
});
