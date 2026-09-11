import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoreAiGateway } from '../core-ai-gateway.js';

function provider(id, priority) {
  return {
    id,
    priority,
    capabilities: ['text', 'reasoning', 'review'],
    available: true,
    costClass: 'account-managed',
    async invoke({ context }) {
      return { text: `${id}:${context?.commandPlane?.role || 'single'}` };
    },
  };
}

test('Core AI Gateway exposes command planning, execution and Pulse handling', async () => {
  const gateway = buildCoreAiGateway({}, [
    provider('openai', 10),
    provider('anthropic', 20),
    provider('gemini', 30),
  ]);

  const status = gateway.status();
  assert.equal(status.commandPlane.commandPlane, 'ekodi-v8');
  assert.equal(typeof gateway.commandPlan, 'function');
  assert.equal(typeof gateway.command, 'function');
  assert.equal(typeof gateway.handlePulse, 'function');

  const protectedChange = {
    goal: 'Change OAuth authentication policy with production impact.',
    mutation: true,
  };
  const plan = gateway.commandPlan({ taskId: 'gateway-plan', ...protectedChange });
  assert.equal(plan.consultationDecision.status, 'multi_consult');
  assert.equal(plan.assignments[0].provider, 'openai');
  assert.equal(plan.assignments[1].provider, 'anthropic');
  assert.equal(plan.sentinelProvider, 'gemini');

  const result = await gateway.command({ taskId: 'gateway-command', ...protectedChange });
  assert.equal(result.state, 'verified');
  assert.equal(result.evidence.providerDiversity, 3);
  assert.equal(result.consultation.status, 'multi_consult');
});
