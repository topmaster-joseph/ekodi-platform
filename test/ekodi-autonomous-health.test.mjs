import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessTrafficSurge,
  applyActionGuardrails,
  buildAutonomousHealthReport,
  computeIndices,
  proposeProtectiveActions,
  weightedScore
} from '../ekodi-autonomous-health.js';

test('normal traffic stays healthy without protective actions', () => {
  const report = buildAutonomousHealthReport({
    baselineRps: 100,
    currentRps: 150,
    cpuPct: 35,
    memoryPct: 40,
    dbPoolPct: 30,
    p95LatencyMs: 180,
    errorRatePct: 0.05
  }, { observedAt: '2026-09-10T15:00:00+09:00' });
  assert.equal(report.state, 'HEALTHY');
  assert.equal(report.traffic.level, 'NORMAL');
  assert.equal(report.proposedActions.length, 0);
  assert.equal(report.transparency.directProductionMutation, false);
});

test('twenty-fold legitimate traffic surge protects critical paths without bypassing guardrails', () => {
  const signals = {
    baselineRps: 100,
    currentRps: 2000,
    cpuPct: 91,
    memoryPct: 89,
    dbPoolPct: 92,
    p95LatencyMs: 2400,
    errorRatePct: 3.5,
    costBurnRatePct: 87
  };
  const assessment = assessTrafficSurge(signals);
  assert.equal(assessment.level, 'EXTREME');
  assert.equal(assessment.trafficRatio, 20);
  const actions = proposeProtectiveActions(assessment, signals);
  const ids = actions.map(action => action.id);
  assert.ok(ids.includes('scale_out_reversible'));
  assert.ok(ids.includes('protect_db_connection_budget'));
  assert.ok(ids.includes('enable_queue_backpressure'));
  assert.ok(ids.includes('defer_heavy_ai_work'));
  assert.ok(ids.includes('preserve_critical_user_paths'));
  const guarded = applyActionGuardrails(actions);
  assert.equal(guarded.find(action => action.id === 'preserve_critical_user_paths').decision, 'APPROVAL_REQUIRED');
  assert.ok(guarded.filter(action => action.risk === 'LOW').every(action => action.decision === 'AUTO_ALLOWED'));
});

test('missing evidence never fabricates a complete system score', () => {
  const result = computeIndices({ cpuPct: 30, p95LatencyMs: 200, errorRatePct: 0.1 });
  assert.ok(result.indices.EHI !== null);
  assert.equal(result.indices.ESI, null);
  assert.equal(result.indices.EAI, null);
  assert.ok(result.coveragePct < 100);
});

test('medium risk action requires explicit policy allowance', () => {
  const actions = [{ id: 'example', risk: 'MEDIUM', reason: 'test', reversible: true }];
  assert.equal(applyActionGuardrails(actions)[0].decision, 'APPROVAL_REQUIRED');
  assert.equal(applyActionGuardrails(actions, { allowMedium: true })[0].decision, 'AUTO_ALLOWED');
});

test('weighted score ignores missing dimensions instead of treating them as zero', () => {
  assert.equal(weightedScore([
    ['a', 80, 0.5],
    ['b', null, 0.25],
    ['c', 100, 0.25]
  ]), 86.7);
});
