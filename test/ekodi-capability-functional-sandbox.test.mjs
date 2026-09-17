import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITY_SANDBOX_POLICY,
  runFunctionalCapabilitySandbox,
} from '../ekodi-capability-sandbox.js';

function candidate() {
  return {
    id: 'functional-sandbox-core-automation',
    goal: 'Prove an executable capability can create an isolated effect, verify it, and roll it back.',
    proposalOnly: true,
    productionMutation: false,
    authorityExpansion: false,
    rollbackRequired: true,
    verificationRequired: true,
    steps: [
      { type: 'invoke_capability', capabilityId: 'core.automation' },
    ],
  };
}

test('functional sandbox performs isolated effects, verification, and rollback on every trial', async () => {
  const calls = [];
  const state = new Map();
  const adapter = {
    id: 'sandbox-core-automation',
    sandboxSafe: true,
    async execute(context) {
      const key = context.target.workspaceId;
      state.set(key, 'changed');
      calls.push(['execute', key]);
      return { effectPerformed: true, rollbackTarget: `${key}:clean`, value: 'changed' };
    },
    async verify(context) {
      const key = context.target.workspaceId;
      calls.push(['verify', key]);
      return { passed: state.get(key) === 'changed', method: 'in-memory-isolated-state' };
    },
    async rollback(context) {
      const key = context.receipt?.target?.workspaceId;
      calls.push(['rollback', key]);
      state.delete(key);
      return { succeeded: true, rollbackId: `rollback-${context.trial || 'executor'}` };
    },
  };

  const result = await runFunctionalCapabilitySandbox(candidate(), { adapter, trials: 3 });

  assert.equal(CAPABILITY_SANDBOX_POLICY.functionalIsolation, 'isolated-sandbox-adapter-with-rollback');
  assert.equal(result.evaluation.verified, true);
  assert.equal(result.promotion, 'architecture_benchmark_required');
  assert.equal(result.evidence.testCount, 3);
  assert.equal(result.evidence.passed, 3);
  assert.equal(result.evidence.rollbackPassed, 3);
  assert.equal(result.evidence.isolatedEffects, 3);
  assert.equal(result.isolatedEffectPerformed, true);
  assert.equal(result.productionMutationPerformed, false);
  assert.equal(result.authorityExpansionPerformed, false);
  assert.deepEqual(calls.map(item => item[0]), [
    'execute', 'verify', 'rollback',
    'execute', 'verify', 'rollback',
    'execute', 'verify', 'rollback',
  ]);
  assert.equal(state.size, 0);
});

test('functional sandbox blocks adapters that are not explicitly sandbox-safe', async () => {
  const result = await runFunctionalCapabilitySandbox(candidate(), {
    trials: 3,
    adapter: {
      async execute() { return { effectPerformed: true }; },
      async verify() { return { passed: true }; },
      async rollback() { return { succeeded: true }; },
    },
  });

  assert.equal(result.evaluation.verified, false);
  assert.equal(result.promotion, 'blocked');
  assert.equal(result.reason, 'sandbox_safe_execute_verify_rollback_adapter_required');
  assert.equal(result.evidence.passed, 0);
});

test('functional sandbox does not promote when post-execution verification fails', async () => {
  let rollbackCalls = 0;
  const adapter = {
    id: 'failing-sandbox-adapter',
    sandboxSafe: true,
    async execute(context) {
      return { effectPerformed: true, rollbackTarget: `${context.target.workspaceId}:clean` };
    },
    async verify() {
      return { passed: false, reason: 'forced-regression' };
    },
    async rollback() {
      rollbackCalls += 1;
      return { succeeded: true, rollbackId: `recovery-${rollbackCalls}` };
    },
  };

  const result = await runFunctionalCapabilitySandbox(candidate(), { adapter, trials: 3 });

  assert.equal(result.evaluation.verified, false);
  assert.equal(result.promotion, 'blocked');
  assert.equal(result.evidence.passed, 0);
  assert.equal(result.evidence.criticalRegressions, 3);
  assert.equal(rollbackCalls, 3);
});
