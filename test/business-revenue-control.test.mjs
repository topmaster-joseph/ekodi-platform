import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCampaignPlan, normalizeBusinessType, normalizeWorkspaceKey, summarizeRevenueReport } from '../business-revenue-control.js';
import { evaluateMissionAction } from '../ai-governance-runtime.js';

test('buildCampaignPlan creates an approval-gated food campaign', () => {
  const plan = buildCampaignPlan({
    workspaceKey: 'jadam-mokpo',
    businessType: 'food_b2c',
    goal: '평일 저녁 주문을 늘린다',
  });

  assert.equal(plan.workspaceKey, 'jadam-mokpo');
  assert.equal(plan.businessType, 'food_b2c');
  assert.equal(plan.channel, 'local_social');
  assert.equal(plan.approvalRequired, true);
  assert.equal(plan.actions.find(action => action.step === 'publish')?.mode, 'human_gate');
});

test('normalizeBusinessType safely falls back to service_b2b', () => {
  assert.equal(normalizeBusinessType('affiliate_commerce'), 'affiliate_commerce');
  assert.equal(normalizeBusinessType('unknown'), 'service_b2b');
});

test('workspace keys are normalized and bounded before database access', () => {
  assert.equal(normalizeWorkspaceKey('  ekodibiz   main  '), 'ekodibiz main');
  assert.equal(normalizeWorkspaceKey('x'.repeat(200)).length, 120);
  assert.equal(normalizeWorkspaceKey(null), '');
});

test('summarizeRevenueReport calculates measurable revenue and ROI', () => {
  const summary = summarizeRevenueReport(
    [{ status: 'measured' }, { status: 'draft' }],
    [
      { inquiries: 7, conversions: 2, revenue_krw: 120000, cost_krw: 10000 },
      { inquiries: 3, conversions: 1, revenue_krw: 80000, cost_krw: 10000 },
    ],
  );

  assert.equal(summary.campaigns, 2);
  assert.equal(summary.completed, 1);
  assert.equal(summary.inquiries, 10);
  assert.equal(summary.conversions, 3);
  assert.equal(summary.totalRevenueKrw, 200000);
  assert.equal(summary.totalCostKrw, 20000);
  assert.equal(summary.roiPercent, 900);
});

test('external publication is always sent to a human gate', () => {
  const decision = evaluateMissionAction({
    agentId: 'marketing',
    area: 'external_publication',
    reversible: true,
    delegated: true,
    logged: true,
    preflightVerified: true,
  });

  assert.equal(decision.tier, 'human_gate');
  assert.equal(decision.reason, 'external_publication');
});

test('campaign plan rejects missing workspace or goal', () => {
  assert.throws(() => buildCampaignPlan({ goal: '매출 증가' }), /workspace_required/);
  assert.throws(() => buildCampaignPlan({ workspaceKey: 'ekodibiz' }), /goal_required/);
});
