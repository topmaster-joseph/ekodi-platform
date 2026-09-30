import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoreAiGateway, getCoreAiGatewayStatus } from '../core-ai-gateway.js';
import { resetAiResilienceCircuitsForTest } from '../ai-resilience-runtime.js';

function reviewProvider(id, priority = 10) {
  return {
    id,
    priority,
    capabilities: ['text', 'reasoning', 'review'],
    available: true,
    costClass: 'account-managed',
    async invoke({ context }) {
      return { text: `${id}:${context?.commandPlane?.role || 'unknown'}` };
    },
  };
}

const reversibleDelegation = Object.freeze({
  allowed: true,
  reversible: true,
  audited: true,
  preflightVerified: true,
  verificationDefined: true,
});

const automationAuthority = Object.freeze({
  personId: 'person-test',
  workspaceId: 'workspace-test',
  role: 'owner',
  capabilityGrants: ['core.automation'],
});

test('Core AI Gateway degrades to non-AI fallback when providers are disabled', async () => {
  const gateway = buildCoreAiGateway({ AI_PROVIDER: 'NONE' }, [{
    id: 'example-ai',
    invoke: async () => { throw new Error('must not run'); },
  }]);
  const result = await gateway.run({
    taskName: 'marketing-summary',
    context: { text: 'source' },
    fallback: ({ context }) => ({ summary: context.text }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'free_assist');
  assert.equal(result.degraded, true);
  assert.equal(result.provider, null);
  assert.deepEqual(result.value, { summary: 'source' });
});

test('Core AI Gateway can fail over to another replaceable provider', async () => {
  resetAiResilienceCircuitsForTest();
  const calls = [];
  const gateway = buildCoreAiGateway({}, [
    { id: 'provider-a', invoke: async () => { calls.push('a'); throw new Error('down'); } },
    { id: 'provider-b', invoke: async ({ taskName }) => { calls.push('b'); return `${taskName}:ok`; } },
  ]);
  const result = await gateway.run({
    taskName: 'assist',
    fallback: () => 'fallback',
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'ai');
  assert.equal(result.provider, 'provider-b');
  assert.equal(result.value, 'assist:ok');
  assert.deepEqual(calls, ['a', 'b']);
});

test('Core AI status is explicitly provider-independent', () => {
  const status = getCoreAiGatewayStatus({ AI_PROVIDER: 'NONE' });
  assert.equal(status.gateway, 'ekodi-core-ai');
  assert.equal(status.providerIndependent, true);
  assert.equal(status.aiOptional, true);
  assert.equal(status.providerDisabled, true);
  assert.equal(status.mode, 'free_assist');
});

test('Core AI Gateway rejects incomplete execution contracts before provider invocation', async () => {
  let invoked = false;
  const gateway = buildCoreAiGateway({}, [{
    id: 'provider-a',
    invoke: async () => { invoked = true; return 'unexpected'; },
  }]);

  await assert.rejects(
    gateway.run({ fallback: () => 'fallback' }),
    /requires taskName/,
  );
  await assert.rejects(
    gateway.run({ taskName: 'assist' }),
    /requires a non-AI fallback/,
  );
  assert.equal(invoked, false);
});

test('execution capability cannot be verified from AI consultation alone when no execution adapter exists', async () => {
  const gateway = buildCoreAiGateway({}, [reviewProvider('provider-a', 10), reviewProvider('provider-b', 20)]);
  const result = await gateway.command({
    taskId: 'execution-without-adapter',
    goal: 'Update a delegated workflow safely.',
    mutation: true,
    target: { workspaceId: 'workspace-test', capability: 'core.automation' },
    authority: automationAuthority,
    delegation: reversibleDelegation,
  });

  assert.equal(result.state, 'degraded');
  assert.equal(result.execution.state, 'degraded');
  assert.equal(result.execution.reason, 'execution_adapter_unavailable');
  assert.equal(result.evidence.executionRequired, true);
  assert.equal(result.evidence.verified, false);
  assert.equal(result.evidence.executionReceipt, null);
});

test('execution capability becomes verified only after adapter effect and post-execution verification evidence', async () => {
  const effects = [];
  const adapter = {
    id: 'test-core-automation-adapter',
    async execute(context) {
      effects.push(['execute', context.capabilityId, context.executionId]);
      return { effectPerformed: true, rollbackTarget: 'workflow:v1', revision: 'workflow:v2' };
    },
    async verify(context) {
      effects.push(['verify', context.capabilityId, context.executionId]);
      return { passed: true, method: 'deterministic-test-observation', observedRevision: 'workflow:v2' };
    },
    async rollback() {
      return { succeeded: true, rollbackId: 'rollback-test' };
    },
  };
  const gateway = buildCoreAiGateway({
    EKODI_CAPABILITY_ADAPTERS: { 'core.automation': adapter },
  }, [reviewProvider('provider-a', 10), reviewProvider('provider-b', 20)]);

  const result = await gateway.command({
    taskId: 'execution-with-adapter',
    goal: 'Update a delegated workflow safely.',
    mutation: true,
    target: { workspaceId: 'workspace-test', capability: 'core.automation' },
    authority: automationAuthority,
    delegation: reversibleDelegation,
    executionPayload: { workflow: 'test' },
  });

  assert.equal(result.state, 'verified');
  assert.equal(result.execution.state, 'verified');
  assert.equal(result.evidence.executionRequired, true);
  assert.equal(result.evidence.executionReceipt.effectPerformed, true);
  assert.equal(result.evidence.executionReceipt.capabilityId, 'core.automation');
  assert.equal(result.evidence.verificationEvidence.passed, true);
  assert.equal(result.evidence.verificationEvidence.executionId, result.evidence.executionReceipt.executionId);
  assert.deepEqual(effects.map(item => item[0]), ['execute', 'verify']);
});
