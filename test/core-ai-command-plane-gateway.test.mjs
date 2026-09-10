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

  const plan = gateway.commandPlan({ taskId: 'gateway-plan', goal: 'Coordinate specialists.' });
  assert.equal(plan.assignments[0].provider, 'openai');
  assert.equal(plan.assignments[1].provider, 'anthropic');
  assert.equal(plan.sentinelProvider, 'gemini');

  const result = await gateway.command({ taskId: 'gateway-command', goal: 'Coordinate specialists.' });
  assert.equal(result.state, 'verified');
  assert.equal(result.evidence.providerDiversity, 3);
});
