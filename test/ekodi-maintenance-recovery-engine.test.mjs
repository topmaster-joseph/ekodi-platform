import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeMaintenanceSignals,
  classifyMaintenanceSignal,
  EKODI_MAINTENANCE_RECOVERY_POLICY,
  runEkodiMaintenanceRecoveryCycle,
} from '../ekodi-maintenance-recovery-engine.js';

function reversibleSignal(overrides = {}) {
  return {
    id: 'stale-cache-1',
    kind: 'stale_cache',
    state: 'stale',
    severity: 'normal',
    target: 'cache',
    reversible: true,
    verificationDefined: true,
    rollbackDefined: true,
    ...overrides,
  };
}

test('maintenance policy forbids direct deletion and requires quarantine-first reversible maintenance', () => {
  assert.equal(EKODI_MAINTENANCE_RECOVERY_POLICY.noDirectDelete, true);
  assert.equal(EKODI_MAINTENANCE_RECOVERY_POLICY.quarantineBeforePurge, true);
  assert.equal(EKODI_MAINTENANCE_RECOVERY_POLICY.mutationRequiresExplicitEnable, true);
  assert.equal(classifyMaintenanceSignal(reversibleSignal()), 'quarantine');
});

test('mutation is only planned when maintenance mutation is not explicitly enabled', async () => {
  let quarantineCalls = 0;
  const result = await runEkodiMaintenanceRecoveryCycle({
    signals: [reversibleSignal()],
    utilization: 0.1,
    adapters: {
      cache: {
        async quarantine() { quarantineCalls += 1; return { id: 'q1' }; },
        async verify() { return { passed: true }; },
        async rollback() { return { succeeded: true }; },
      },
    },
  });

  assert.equal(result.results[0].state, 'planned');
  assert.equal(result.results[0].reason, 'maintenance_mutation_disabled');
  assert.equal(quarantineCalls, 0);
});

test('reversible quarantine runs during low activity and must verify', async () => {
  const calls = [];
  const result = await runEkodiMaintenanceRecoveryCycle({
    signals: [reversibleSignal()],
    utilization: 0.1,
    mutationEnabled: true,
    adapters: {
      cache: {
        async quarantine() { calls.push('quarantine'); return { quarantineId: 'q1' }; },
        async verify() { calls.push('verify'); return { passed: true, evidence: 'isolated' }; },
        async rollback() { calls.push('rollback'); return { succeeded: true }; },
      },
    },
  });

  assert.equal(result.results[0].state, 'verified');
  assert.equal(result.results[0].mutated, true);
  assert.deepEqual(calls, ['quarantine', 'verify']);
  assert.equal(result.noDirectDelete, true);
});

test('busy systems defer non-critical maintenance instead of forcing mutation', async () => {
  let quarantineCalls = 0;
  const result = await runEkodiMaintenanceRecoveryCycle({
    signals: [reversibleSignal()],
    utilization: 0.9,
    mutationEnabled: true,
    adapters: {
      cache: {
        async quarantine() { quarantineCalls += 1; return {}; },
        async verify() { return { passed: true }; },
        async rollback() { return { succeeded: true }; },
      },
    },
  });

  assert.equal(result.results[0].state, 'deferred');
  assert.equal(result.results[0].reason, 'system_busy');
  assert.equal(quarantineCalls, 0);
});

test('failed post-action verification triggers rollback', async () => {
  const calls = [];
  const result = await runEkodiMaintenanceRecoveryCycle({
    signals: [reversibleSignal({ kind: 'worker_degraded', target: 'worker-a' })],
    utilization: 0.1,
    mutationEnabled: true,
    adapters: {
      'worker-a': {
        async recover() { calls.push('recover'); return { restartId: 'r1' }; },
        async verify() { calls.push('verify'); return { passed: false, reason: 'healthcheck_failed' }; },
        async rollback() { calls.push('rollback'); return { succeeded: true, rollbackId: 'rb1' }; },
      },
    },
  });

  assert.equal(result.results[0].state, 'rolled_back');
  assert.deepEqual(calls, ['recover', 'verify', 'rollback']);
});

test('mutation is blocked when reversibility or verification contracts are incomplete', async () => {
  const result = await runEkodiMaintenanceRecoveryCycle({
    signals: [reversibleSignal({ reversible: false })],
    utilization: 0.1,
    mutationEnabled: true,
    adapters: {
      cache: {
        async quarantine() { throw new Error('must not run'); },
      },
    },
  });

  assert.equal(result.results[0].state, 'blocked');
  assert.equal(result.results[0].reason, 'reversibility_or_verification_contract_missing');
});

test('runtime provider degradation becomes a maintenance signal without granting mutation authority', () => {
  const signals = buildRuntimeMaintenanceSignals({
    readiness: {
      providers: [
        { id: 'provider-a', operational: false, health: 'degraded', lastError: 'timeout' },
        { id: 'provider-b', operational: true, health: 'healthy' },
      ],
    },
  });

  assert.equal(signals.length, 1);
  assert.equal(signals[0].kind, 'provider_degraded');
  assert.equal(signals[0].target, 'provider-a');
  assert.equal(signals[0].reversible, false);
});
