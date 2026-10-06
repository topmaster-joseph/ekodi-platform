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
    costClass: 'account-managed',
    async invoke(input) {
      return handler ? handler(input) : { text: `${id}:${input?.context?.commandPlane?.role || 'unknown'}` };
    },
  };
}

test('command plan reserves distinct providers for specialists and independent Sentinel for high-impact work', () => {
  const providers = [
    provider('openai', 10, ['text', 'reasoning', 'code', 'review']),
    provider('anthropic', 20, ['text', 'reasoning', 'code', 'review']),
    provider('gemini', 30, ['text', 'reasoning', 'code', 'review']),
  ];
  const plan = buildEkodiCommandPlan({
    taskId: 'route-migration',
    goal: 'Move OAuth authentication and production admin entry points to apex paths.',
    mutation: true,
  }, providers);

  assert.equal(plan.consultationDecision.status, 'multi_consult');
  assert.deepEqual(plan.assignments.map(item => [item.role, item.provider]), [
    ['planner', 'openai'],
    ['operator', 'anthropic'],
  ]);
  assert.equal(plan.sentinelProvider, 'gemini');
  assert.equal(plan.sentinelIndependent, true);
  assert.equal(plan.parallel, true);
});

test('high-impact command execution runs specialists in parallel and sends evidence to an independent Sentinel', async () => {
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
    goal: 'Change authentication controls and prove provider-diverse consultation.',
    mutation: true,
  });

  assert.deepEqual(started.slice(0, 2).sort(), ['operator', 'planner']);
  assert.equal(started[2], 'sentinel');
  assert.equal(result.state, 'verified');
  assert.equal(result.consultation.status, 'multi_consult');
  assert.equal(result.evidence.providerDiversity, 3);
  assert.equal(result.evidence.sentinelIndependent, true);
  assert.deepEqual(sentinelEvidence.map(item => [item.role, item.provider, item.ok]), [
    ['planner', 'openai', true],
    ['operator', 'anthropic', true],
  ]);
});

test('Pulse may start delegated reversible work without another chat prompt and does not over-consult', async () => {
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
  assert.equal(result.consultation.status, 'single_review');
  assert.equal(calls, 2);
});

test('Pulse auto-blocks high-impact or red changes without executing providers', async () => {
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

  assert.equal(result.state, 'auto_blocked');
  assert.equal(result.reason, 'sovereign_or_high_impact_gate');
  assert.equal(calls, 0);
});

test('task-scoped super-admin approval resumes only the exact high-risk pulse', async () => {
  let calls = 0;
  const plane = buildEkodiCommandPlane({}, [
    provider('openai', 10, ['text', 'reasoning', 'review'], async () => { calls += 1; return { text: 'openai' }; }),
    provider('anthropic', 20, ['text', 'reasoning', 'review'], async () => { calls += 1; return { text: 'anthropic' }; }),
    provider('gemini', 30, ['text', 'reasoning', 'review'], async () => { calls += 1; return { text: 'gemini' }; }),
  ]);
  const taskId = 'orch_approval_exact_task_123456789';
  const result = await plane.handlePulse({
    taskId,
    risk: 'high',
    event: {
      id: taskId,
      kind: 'repository',
      summary: 'Apply an explicitly approved high-risk change.',
      changeClass: 'red',
      requiresHumanDecision: true,
    },
    delegation: { allowed:true, reversible:true, audited:true, preflightVerified:true, verificationDefined:true },
    context: {
      humanApproval: {
        approved: true,
        approvalId: `approval_${taskId}_v3`,
        taskId,
        scope: 'task',
        approvedBy: 'person-super-admin',
        approvedByRole: 'super_admin',
        approvedAt: '2026-10-06T13:20:00.000Z',
        expectedStateVersion: 3,
      },
    },
  });
  assert.notEqual(result.state, 'auto_blocked');
  assert.ok(calls > 0);
});

test('human approval receipt cannot be replayed onto another task or by a non-super-admin role', async () => {
  let calls = 0;
  const plane = buildEkodiCommandPlane({}, [
    provider('openai', 10, ['text', 'reasoning', 'review'], async () => { calls += 1; return { text: 'must-not-run' }; }),
  ]);
  const base = {
    taskId: 'orch_target_task_123456789',
    risk: 'high',
    event: {
      id: 'orch_target_task_123456789',
      kind: 'repository',
      summary: 'High-risk change must remain blocked.',
      changeClass: 'red',
      requiresHumanDecision: true,
    },
    delegation: { allowed:true, reversible:true, audited:true, preflightVerified:true, verificationDefined:true },
  };
  const wrongTask = await plane.handlePulse({
    ...base,
    context: { humanApproval: { approved:true, approvalId:'approval_orch_other_task_123456789_v2', taskId:'orch_other_task_123456789', scope:'task', approvedBy:'person-super-admin', approvedByRole:'super_admin', approvedAt:'2026-10-06T13:20:00.000Z', expectedStateVersion:2 } },
  });
  const wrongRole = await plane.handlePulse({
    ...base,
    context: { humanApproval: { approved:true, approvalId:`approval_${base.taskId}_v2`, taskId:base.taskId, scope:'task', approvedBy:'person-admin', approvedByRole:'admin', approvedAt:'2026-10-06T13:20:00.000Z', expectedStateVersion:2 } },
  });
  assert.equal(wrongTask.state, 'auto_blocked');
  assert.equal(wrongRole.state, 'auto_blocked');
  assert.equal(calls, 0);
});

test('malformed approval id remains blocked even when task and role fields look valid', async () => {
  let calls = 0;
  const taskId = 'orch_receipt_shape_123456789';
  const plane = buildEkodiCommandPlane({}, [
    provider('openai', 10, ['text', 'reasoning', 'review'], async () => { calls += 1; return { text: 'must-not-run' }; }),
  ]);
  const result = await plane.handlePulse({
    taskId,
    risk: 'high',
    event: { id:taskId, kind:'repository', summary:'Do not run malformed approval.', changeClass:'red', requiresHumanDecision:true },
    delegation: { allowed:true, reversible:true, audited:true, preflightVerified:true, verificationDefined:true },
    context: { humanApproval: {
      approved:true,
      approvalId:'approval_wrong_v2',
      taskId,
      scope:'task',
      approvedBy:'person-super-admin',
      approvedByRole:'super_admin',
      approvedAt:'2026-10-06T13:20:00.000Z',
      expectedStateVersion:2,
    } },
  });
  assert.equal(result.state,'auto_blocked');
  assert.equal(calls,0);
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
