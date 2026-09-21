import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionTaskGrantBroker } from '../execution-task-grant.js';

test('task grant is short-lived, capability-scoped, revocable and never authorizes production mutation', () => {
  let now = Date.parse('2026-09-21T00:00:00Z');
  const broker = new ExecutionTaskGrantBroker({ clock: () => now, maxTtlSeconds: 600 });
  const issued = broker.issue({
    taskId: 'grant-proof',
    workspaceId: 'workspace-proof',
    role: 'operator',
    capabilities: ['execution:test', 'evidence:write'],
    ttlSeconds: 120,
  });

  assert.equal(typeof issued.token, 'string');
  assert.ok(issued.token.length >= 32);
  assert.equal(JSON.stringify(issued.grant).includes(issued.token), false);
  assert.equal(issued.grant.rawTokenPersisted, false);
  assert.equal(issued.grant.productionMutationAllowed, false);
  assert.equal(issued.grant.providerMutationAllowed, false);

  assert.equal(broker.authorize(issued.token, {
    taskId: 'grant-proof',
    workspaceId: 'workspace-proof',
    role: 'operator',
    capability: 'execution:test',
  }).ok, true);

  assert.equal(broker.authorize(issued.token, {
    taskId: 'other-task',
    workspaceId: 'workspace-proof',
    role: 'operator',
    capability: 'execution:test',
  }).reason, 'task_scope_mismatch');

  assert.equal(broker.authorize(issued.token, {
    taskId: 'grant-proof',
    workspaceId: 'workspace-proof',
    role: 'operator',
    capability: 'execution:deploy',
  }).reason, 'capability_scope_mismatch');

  assert.equal(broker.authorize(issued.token, {
    taskId: 'grant-proof',
    workspaceId: 'workspace-proof',
    role: 'operator',
    capability: 'execution:test',
    productionMutation: true,
  }).reason, 'mutation_outside_execution_boundary');

  assert.equal(broker.revoke(issued.token, { reason: 'proof-complete' }).ok, true);
  assert.equal(broker.authorize(issued.token, {
    taskId: 'grant-proof',
    workspaceId: 'workspace-proof',
    role: 'operator',
    capability: 'execution:test',
  }).reason, 'grant_revoked');
  assert.equal(broker.activeGrantCount, 0);
});

test('task grant expiry is enforced and forbidden authority cannot be issued', () => {
  let now = Date.parse('2026-09-21T00:00:00Z');
  const broker = new ExecutionTaskGrantBroker({ clock: () => now, maxTtlSeconds: 300 });
  const issued = broker.issue({
    taskId: 'expiry-proof',
    workspaceId: 'workspace-proof',
    role: 'operator',
    capability: 'execution:test',
    ttlSeconds: 30,
  });
  now += 31_000;
  assert.equal(broker.authorize(issued.token, {
    taskId: 'expiry-proof',
    workspaceId: 'workspace-proof',
    role: 'operator',
    capability: 'execution:test',
  }).reason, 'grant_expired');

  assert.throws(() => broker.issue({
    taskId: 'bad-proof',
    workspaceId: 'workspace-proof',
    role: 'operator',
    capability: 'production:deploy',
    ttlSeconds: 30,
  }), /forbidden/);
});
