import test from 'node:test';
import assert from 'node:assert/strict';
import { planContinuity, recoveryLifecycle } from '../resilience-continuity.js';

const approved = (id, role, extra = {}) => ({
  id,
  role,
  approved: true,
  healthy: true,
  securityEquivalentOrStronger: true,
  ...extra,
});

test('all AI providers unavailable does not block core service', () => {
  const result = planContinuity({ capability: 'ai', alternatives: [] });
  assert.equal(result.action, 'continue-without-optional-ai');
});

test('read failure switches to approved healthy route', () => {
  const result = planContinuity({
    capability: 'read',
    alternatives: [approved('read-b', 'read-plane')],
  });
  assert.equal(result.action, 'switch-approved-read-route');
  assert.equal(result.target, 'read-b');
});

test('ambiguous write is queued and reconciled instead of replayed', () => {
  const result = planContinuity({
    capability: 'write',
    outcome: 'ambiguous',
    alternatives: [
      approved('write-b', 'write-plane', {
        sharedCanonicalOwnership: true,
        idempotencyCompatible: true,
      }),
    ],
  });
  assert.equal(result.action, 'queue-and-reconcile');
  assert.equal(result.blindReplayForbidden, true);
  assert.equal(result.target, null);
});

test('known failed write may switch only to compatible canonical write plane', () => {
  const result = planContinuity({
    capability: 'write',
    alternatives: [
      approved('write-b', 'write-plane', {
        sharedCanonicalOwnership: true,
        idempotencyCompatible: true,
      }),
    ],
  });
  assert.equal(result.action, 'switch-compatible-write-plane');
  assert.equal(result.target, 'write-b');
});

test('worker failure switches only to approved idempotent worker', () => {
  const result = planContinuity({
    capability: 'worker',
    alternatives: [approved('worker-b', 'worker', { idempotencyCompatible: true })],
  });
  assert.equal(result.action, 'switch-approved-worker');
});

test('third party module failure is isolated from canonical core', () => {
  const result = planContinuity({ capability: 'third-party-module' });
  assert.equal(result.action, 'isolate-extension-use-canonical-core');
});

test('bad deployment candidate rolls back to last known good', () => {
  const result = planContinuity({ capability: 'deployment' });
  assert.equal(result.action, 'rollback-last-known-good');
});

test('privileged identity outage fails closed', () => {
  const result = planContinuity({ capability: 'identity', privileged: true });
  assert.equal(result.action, 'fail-closed-privileged');
});

test('safe continuity action is followed by root-cause improvement', () => {
  const decision = planContinuity({ capability: 'ai', alternatives: [] });
  const lifecycle = recoveryLifecycle(decision);
  assert.ok(lifecycle.immediate.includes('continue-without-optional-ai'));
  assert.deepEqual(lifecycle.postRecovery, [
    'repair-root-cause',
    'retest',
    'restore-or-permanently-replace',
    'production-reverify',
  ]);
});
