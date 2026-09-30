import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEkodiCapabilityExecutor,
  EKODI_EXECUTION_FALLBACK_POLICY,
} from '../ekodi-capability-executor.js';

function baseInput() {
  return {
    taskId: 'fallback-task',
    capabilityId: 'core.automation',
    goal: 'Run a reversible automation through the first healthy execution lane.',
    risk: 'low',
    target: { capability: 'core.automation' },
    delegation: {
      allowed: true,
      reversible: true,
      audited: true,
      preflightVerified: true,
      verificationDefined: true,
    },
    authority: {
      personId: 'person-test',
      workspaceId: 'workspace-test',
      role: 'owner',
      capabilityGrants: ['core.automation'],
    },
  };
}

function verifiedAdapter(id, overrides = {}) {
  return {
    id,
    priority: 10,
    lane: id,
    available: true,
    async execute() {
      return { effectPerformed: true, rollbackTarget: 'before-test' };
    },
    async verify({ receipt }) {
      return { passed: true, verificationId: `verify-${receipt.executionId}`, method: 'test' };
    },
    async rollback() {
      return { succeeded: true, rollbackId: `rollback-${id}` };
    },
    ...overrides,
  };
}

test('quota-exhausted Remote Desktop is skipped and execution automatically falls back to the next registered lane', async () => {
  let remoteCalls = 0;
  let githubCalls = 0;
  const remote = verifiedAdapter('remote-desktop', {
    priority: 10,
    lane: 'remote_desktop',
    monthlyQuotaRemaining: 0,
    async execute() {
      remoteCalls += 1;
      return { effectPerformed: true, rollbackTarget: 'remote-before' };
    },
  });
  const github = verifiedAdapter('github-connector', {
    priority: 20,
    lane: 'github_connector',
    async execute() {
      githubCalls += 1;
      return { effectPerformed: true, rollbackTarget: 'github-before' };
    },
  });

  const executor = buildEkodiCapabilityExecutor({
    adapters: { 'core.automation': [remote, github] },
  });
  const result = await executor.execute(baseInput());

  assert.equal(result.state, 'verified');
  assert.equal(result.selectedAdapterId, 'github-connector');
  assert.equal(result.fallbackUsed, true);
  assert.equal(remoteCalls, 0);
  assert.equal(githubCalls, 1);
  assert.deepEqual(result.executionAttempts.map(item => [item.adapterId, item.state, item.reason]), [
    ['remote-desktop', 'skipped', 'quota_exhausted'],
    ['github-connector', 'verified', null],
  ]);
});

test('dynamic preflight outage is treated as a safe lane failure and automatically falls back', async () => {
  let cloudCalls = 0;
  const githubActions = verifiedAdapter('github-actions', {
    priority: 10,
    lane: 'github_actions',
    async preflight() {
      return { ok: false, reason: 'runner_capacity_unavailable' };
    },
  });
  const cloud = verifiedAdapter('managed-cloud-runner', {
    priority: 20,
    lane: 'managed_cloud_runner',
    async execute() {
      cloudCalls += 1;
      return { effectPerformed: true, rollbackTarget: 'cloud-before' };
    },
  });

  const result = await buildEkodiCapabilityExecutor({
    adapters: { 'core.automation': [githubActions, cloud] },
  }).execute(baseInput());

  assert.equal(result.state, 'verified');
  assert.equal(result.selectedAdapterId, 'managed-cloud-runner');
  assert.equal(result.fallbackUsed, true);
  assert.equal(cloudCalls, 1);
  assert.equal(result.executionAttempts[0].reason, 'runner_capacity_unavailable');
});

test('verification failure may continue to the next lane only after rollback succeeds', async () => {
  let rollbackCalls = 0;
  let secondCalls = 0;
  const first = verifiedAdapter('first-lane', {
    priority: 10,
    async verify() {
      return { passed: false, reason: 'postcondition_mismatch' };
    },
    async rollback() {
      rollbackCalls += 1;
      return { succeeded: true, rollbackId: 'rollback-first' };
    },
  });
  const second = verifiedAdapter('second-lane', {
    priority: 20,
    async execute() {
      secondCalls += 1;
      return { effectPerformed: true, rollbackTarget: 'second-before' };
    },
  });

  const result = await buildEkodiCapabilityExecutor({
    adapters: { 'core.automation': [first, second] },
  }).execute(baseInput());

  assert.equal(result.state, 'verified');
  assert.equal(result.selectedAdapterId, 'second-lane');
  assert.equal(result.fallbackUsed, true);
  assert.equal(rollbackCalls, 1);
  assert.equal(secondCalls, 1);
  assert.equal(result.executionAttempts[0].state, 'rolled_back');
  assert.equal(result.executionAttempts[1].state, 'verified');
});

test('ambiguous execution failure stops fanout unless the adapter explicitly marks fallback as safe', async () => {
  let secondCalls = 0;
  const first = verifiedAdapter('uncertain-lane', {
    priority: 10,
    async execute() {
      throw new Error('connection_dropped_after_dispatch');
    },
  });
  const second = verifiedAdapter('must-not-run', {
    priority: 20,
    async execute() {
      secondCalls += 1;
      return { effectPerformed: true, rollbackTarget: 'second-before' };
    },
  });

  const result = await buildEkodiCapabilityExecutor({
    adapters: { 'core.automation': [first, second] },
  }).execute(baseInput());

  assert.equal(result.state, 'failed');
  assert.equal(result.reason, 'capability_execution_failed');
  assert.equal(result.fallbackUsed, false);
  assert.equal(secondCalls, 0);
  assert.equal(result.executionAttempts.length, 1);
  assert.equal(result.executionAttempts[0].state, 'failed');
});

test('execution errors explicitly marked safe-to-fallback may continue automatically', async () => {
  let secondCalls = 0;
  const first = verifiedAdapter('known-no-effect-lane', {
    priority: 10,
    async execute() {
      const error = new Error('monthly_limit_reached');
      error.safeToFallback = true;
      throw error;
    },
  });
  const second = verifiedAdapter('github-connector', {
    priority: 20,
    async execute() {
      secondCalls += 1;
      return { effectPerformed: true, rollbackTarget: 'github-before' };
    },
  });

  const result = await buildEkodiCapabilityExecutor({
    adapters: { 'core.automation': [first, second] },
  }).execute(baseInput());

  assert.equal(result.state, 'verified');
  assert.equal(result.selectedAdapterId, 'github-connector');
  assert.equal(result.fallbackUsed, true);
  assert.equal(secondCalls, 1);
  assert.equal(result.executionAttempts[0].state, 'failed_safe_to_fallback');
});

test('fallback policy keeps orchestration gate preservation explicit', () => {
  assert.equal(EKODI_EXECUTION_FALLBACK_POLICY.preserveOrchestrationGate, true);
  assert.equal(EKODI_EXECUTION_FALLBACK_POLICY.unsafeFailureStopsFanout, true);
  assert.equal(EKODI_EXECUTION_FALLBACK_POLICY.recommendedLaneOrder.at(-1), 'remote_desktop');
});
