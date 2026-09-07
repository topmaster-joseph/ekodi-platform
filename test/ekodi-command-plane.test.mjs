import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEkodiCommandPlan,
  buildEkodiCommandPlane,
  normalizeEkodiResourceTarget,
} from '../ekodi-command-plane.js';

function provider(id, priority, capabilities, handler) {
  return {
    id,
    priority,
    capabilities,
    available: true,
    async invoke(input) {
      return handler ? handler(input) : { text: `${id}:${input?.context?.commandPlane?.role || 'unknown'}` };
    },
  };
}

test('command plan reserves distinct providers for specialists and independent Sentinel when capacity exists', () => {
  const providers = [
    provider('openai', 10, ['text', 'reasoning', 'code', 'review']),
    provider('anthropic', 20, ['text', 'reasoning', 'code', 'review']),
    provider('gemini', 30, ['text', 'reasoning', 'code', 'review']),
  ];
  const plan = buildEkodiCommandPlan({
    taskId: 'route-migration',
    goal: 'Move user and admin entry points to apex paths.',
  }, providers);

  assert.deepEqual(plan.assignments.map(item => [item.role, item.provider]), [
    ['planner', 'openai'],
    ['operator', 'anthropic'],
  ]);
  assert.equal(plan.sentinelProvider, 'gemini');
  assert.equal(plan.sentinelIndependent, true);
  assert.equal(plan.parallel, true);
});

test('command execution runs specialists in parallel and sends their evidence to an independent Sentinel', async () => {
  const started = [];
  let sentinelEvidence = null;
  const providers = [
    provider('openai', 10, ['text', 'reasoning', 'review'], async ({ context }) => {
      started.push(context.commandPlane.role);
      await new Promise(resolve => setTimeout(resolve, 10));
      return { text: 'planner-result' };
    }),
    provider('anthropic', 20, ['text', 'reasoning', 'review'], async ({ context }) => {
      started.push(context.commandPlane.role);
      await new Promise(resolve => setTimeout(resolve, 10));
      return { text: 'operator-result' };
    }),
    provider('gemini', 30, ['text', 'reasoning', 'review'], async ({ context }) => {
      started.push(context.commandPlane.role);
      sentinelEvidence = context.specialistEvidence;
      return { text: 'sentinel-verified' };
    }),
  ];

  const plane = buildEkodiCommandPlane({}, providers);
  const result = await plane.execute({
    taskId: 'parallel-proof',
    goal: 'Prove provider-diverse collaboration.',
  });

  assert.deepEqual(started.slice(0, 2).sort(), ['operator', 'planner']);
  assert.equal(started[2], 'sentinel');
  assert.equal(result.state, 'verified');
  assert.equal(result.evidence.providerDiversity, 3);
  assert.equal(result.evidence.sentinelIndependent, true);
  assert.deepEqual(sentinelEvidence.map(item => [item.role, item.provider, item.ok]), [
    ['planner', 'openai', true],
    ['operator', 'anthropic', true],
  ]);
});

test('Pulse may start delegated reversible work without another chat prompt', async () => {
  let calls = 0;
  const providers = [
    provider('openai', 10, ['text', 'reasoning', 'review'], async () => {
      calls += 1;
      return { text: 'openai' };
    }),
    provider('anthropic', 20, ['text', 'reasoning', 'review'], async () => {
      calls += 1;
      return { text: 'anthropic' };
    }),
    provider('gemini', 30, ['text', 'reasoning', 'review'], async () => {
      calls += 1;
      return { text: 'gemini' };
    }),
  ];
  const plane = buildEkodiCommandPlane({}, providers);
  const result = await plane.handlePulse({
    event: {
      id: 'evt-1',
      kind: 'repository',
      summary: 'A guarded route contract changed.',
      changeClass: 'green',
    },
    delegation: {
      allowed: true,
      reversible: true,
      audited: true,
      preflightVerified: true,
      verificationDefined: true,
    },
  });

  assert.equal(result.state, 'verified');
  assert.equal(result.taskId, 'evt-1');
  assert.equal(calls, 3);
});

test('Pulse stops at a human gate for high-impact or red changes', async () => {
  let calls = 0;
  const plane = buildEkodiCommandPlane({}, [
    provider('openai', 10, ['text', 'reasoning', 'review'], async () => {
      calls += 1;
      return { text: 'must-not-run' };
    }),
  ]);

  const result = await plane.handlePulse({
    event: {
      id: 'evt-red',
      kind: 'repository',
      summary: 'Change production identity authority.',
      changeClass: 'red',
    },
    risk: 'high',
    delegation: {
      allowed: true,
      reversible: true,
      audited: true,
      preflightVerified: true,
      verificationDefined: true,
    },
  });

  assert.equal(result.state, 'human_gate');
  assert.equal(result.reason, 'sovereign_or_high_impact_gate');
  assert.equal(calls, 0);
});

test('resource targets are symbolic identities, not hard-coded user or admin hostnames', () => {
  const target = normalizeEkodiResourceTarget({
    workspaceId: 'workspace-123',
    workspaceSlug: 'EkodiBiz',
    service: 'Mall',
    capability: 'mall.catalog.update',
    surface: 'workspace_admin',
  });

  assert.deepEqual(target, {
    workspaceId: 'workspace-123',
    workspaceSlug: 'ekodibiz',
    service: 'mall',
    capability: 'mall.catalog.update',
    surface: 'workspace_admin',
  });
  assert.equal(JSON.stringify(target).includes('admin.ekodi.kr'), false);
  assert.equal(JSON.stringify(target).includes('my.ekodi.kr'), false);
});

test('AI_PROVIDER=NONE leaves the Command Plane in Core-only degraded mode without invoking providers', async () => {
  let calls = 0;
  const plane = buildEkodiCommandPlane({ AI_PROVIDER: 'NONE' }, [
    provider('openai', 10, ['text', 'reasoning', 'review'], async () => {
      calls += 1;
      return { text: 'must-not-run' };
    }),
    provider('anthropic', 20, ['text', 'reasoning', 'review'], async () => {
      calls += 1;
      return { text: 'must-not-run' };
    }),
    provider('gemini', 30, ['text', 'reasoning', 'review'], async () => {
      calls += 1;
      return { text: 'must-not-run' };
    }),
  ]);

  const result = await plane.execute({ taskId: 'core-only', goal: 'Stay safe without AI.' });
  assert.equal(result.state, 'core_only');
  assert.equal(result.evidence.providerDiversity, 0);
  assert.equal(calls, 0);
});
