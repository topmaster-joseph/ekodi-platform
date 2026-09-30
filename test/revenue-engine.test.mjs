import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildVerticalLaunchPlan,
  createRevenueCell,
  getRevenueCapabilityCatalog,
  getRevenueEnginePolicy,
  getRevenueEngineSummary,
  nextRevenueCellState,
  recommendRevenueIdeas,
  resolveRevenueCapabilityAccess,
  scoreRevenueOpportunity,
} from '../revenue-engine.js';

const root = new URL('../', import.meta.url);

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'));
}

test('Revenue Engine remains subordinate to mission and aligns as an OS-level EKODI core engine', () => {
  const policy = getRevenueEnginePolicy();
  assert.equal(policy.engineId, 'ekodi.revenue');
  assert.equal(policy.architecture.platformRole, 'core-engine');
  assert.equal(policy.architecture.layer, 'os');
  assert.equal(policy.architecture.responsibilityClass, 'ekodi-responsible');
  assert.equal(policy.principles.zeroRiskClaimForbidden, true);
  assert.match(policy.missionRule, /never outranks mission/i);
  assert.equal(policy.privacy.tenantIsolation, true);
  assert.equal(policy.privacy.crossTenantPrivateDataReuse, false);
});

test('EKODIBIZ is the exclusive commercial subject for Revenue Cells', () => {
  const cell = createRevenueCell({workspaceId:'workspace-1',title:'AI content operation',operator:'cgma',revenueOwner:'cgma',riskLimit:100000,stopConditions:['stop below conversion threshold']});
  assert.equal(cell.operator, 'ekodibiz');
  assert.equal(cell.revenueOwner, 'ekodibiz');
  assert.equal(cell.merchantOfRecord, 'ekodibiz');
  assert.equal(cell.contractingEntity, 'ekodibiz');
  assert.equal(cell.technologyProvider, 'ekodi');
  assert.equal(cell.authority.financialCommitment, 'human_gate');
  assert.equal(cell.zeroRiskClaim, false);
});

test('fitness scoring permits only bounded experiments and never production commitments', () => {
  const result = scoreRevenueOpportunity({
    demand: 95,
    recurringRevenue: 90,
    automation: 95,
    scalability: 95,
    capabilityReuse: 90,
    lowInitialCost: 95,
    lowOperatingCost: 85,
    boundedRisk: 90,
    demandEvidence: true,
    legalPolicyFit: true,
    tenantIsolation: true,
    riskLimit: 50000,
    stopConditions: ['14일 안에 유료 의향 신호가 없으면 종료'],
  });
  assert.ok(result.score >= 80);
  assert.equal(result.eligibleForBoundedExperiment, true);
  assert.equal(result.productionCommitmentAuthorized, false);
  assert.equal(result.boundedDownside.maxLoss, 50000);
});

test('fitness scoring blocks policy or tenant-isolation uncertainty', () => {
  const result = scoreRevenueOpportunity({
    demand: 100,
    recurringRevenue: 100,
    automation: 100,
    scalability: 100,
    capabilityReuse: 100,
    lowInitialCost: 100,
    lowOperatingCost: 100,
    boundedRisk: 100,
    demandEvidence: true,
    legalPolicyFit: false,
    tenantIsolation: false,
    stopConditions: ['stop'],
  });
  assert.equal(result.eligibleForBoundedExperiment, false);
  assert.deepEqual([...result.hardBlocks].sort(), [
    'legal-or-policy-fit-not-established',
    'tenant-isolation-not-established',
  ]);
});

test('Revenue Cell cannot scale without demand, economics, policy and stop-condition evidence', () => {
  assert.equal(nextRevenueCellState('validate', 'scale', {}), 'validate');
  assert.equal(nextRevenueCellState('validate', 'scale', {
    realDemand: true,
    unitEconomicsVisible: true,
    legalPolicyFit: true,
    stopConditionDefined: true,
  }), 'scale');
  assert.equal(nextRevenueCellState('retire', 'scale', {
    realDemand: true,
    unitEconomicsVisible: true,
    legalPolicyFit: true,
    stopConditionDefined: true,
  }), 'retire');
});

test('ordinary users receive revenue information only while EKODIBIZ operators retain managed capabilities', () => {
  const catalog = getRevenueCapabilityCatalog();
  const access = resolveRevenueCapabilityAccess({ membershipTier: 'free' });
  assert.ok(catalog.length >= 8);
  assert.equal(access.model, 'ekodibiz-managed-service');
  assert.equal(access.ordinaryUserMode, 'information-only');
  assert.equal(access.commercialSubject, 'ekodibiz');
  assert.equal(access.directRevenueOperationAllowed, false);
  assert.equal(access.publicAccessUnaffected, true);
  assert.equal(access.userOwnedResultsRetained, true);
  assert.ok(access.capabilities.every(item => item.access === 'information_only'));
  assert.ok(access.capabilities.every(item => item.checkoutAvailable === false));
  const operator = resolveRevenueCapabilityAccess({actorClass:'ekodibiz-operator',membershipTier:'paid',subscribedCapabilities:['revenue.site-launch']});
  assert.equal(operator.directRevenueOperationAllowed, true);
  assert.equal(operator.capabilities.find(item => item.id === 'revenue.site-launch')?.access, 'enabled');
});

test('Vertical Launch Factory uses canonical EKODI path and shared-shell configuration', () => {
  const plan = buildVerticalLaunchPlan({
    title: 'Creator Lab',
    slug: 'creator-lab',
    workspaceId: 'workspace-creator',
    service: 'shop',
    externalChannels: ['youtube'],
  });
  assert.equal(plan.internalSite.canonicalUrl, 'https://ekodi.kr/creator-lab');
  assert.equal(plan.internalSite.serviceUrl, 'https://ekodi.kr/creator-lab/shop');
  assert.equal(plan.internalSite.implementation, 'shared-shell-configuration');
  assert.equal(plan.internalSite.copyApplicationCode, false);
  assert.equal(plan.externalChannels[0].publishing, 'blocked-until-authorized');
  assert.equal(plan.commercialSubject, 'ekodibiz');
  assert.equal(plan.ordinaryUserMode, 'information-only');
  assert.equal(plan.directProductionMutation, false);

  const authorized = buildVerticalLaunchPlan({
    title: 'Creator Lab',
    slug: 'creator-lab',
    externalChannels: ['youtube'],
    authorizedConnections: { youtube: true },
  });
  assert.equal(authorized.externalChannels[0].publishing, 'entitlement-and-policy-gated');
});

test('Vertical Launch Factory creates a deterministic safe path for Korean-only titles', () => {
  const first = buildVerticalLaunchPlan({ title: '소상공인 자동마케팅' });
  const second = buildVerticalLaunchPlan({ title: '소상공인 자동마케팅' });
  assert.match(first.slug, /^project-[a-z0-9]+$/);
  assert.equal(first.slug, second.slug);
  assert.equal(first.internalSite.canonicalUrl, `https://ekodi.kr/${first.slug}`);
});

test('Vertical Launch Factory rejects reserved platform roots', () => {
  assert.throws(() => buildVerticalLaunchPlan({ title: 'Admin', slug: 'admin' }), /LAUNCH_SLUG_INVALID_OR_RESERVED/);
  assert.throws(() => buildVerticalLaunchPlan({ title: 'My', slug: 'my' }), /LAUNCH_SLUG_INVALID_OR_RESERVED/);
});

test('Revenue Engine composes only registered reusable capabilities', async () => {
  const registry = await json('config/capability-registry.json');
  const registered = new Set([
    ...(registry.capabilities || []),
    ...(registry.fabricCapabilities || []),
  ].map(item => item.id));
  const plan = buildVerticalLaunchPlan({
    title: 'Small Business AI',
    slug: 'small-business-ai',
    externalChannels: ['youtube'],
  });
  for (const capability of plan.requiredCapabilities) {
    assert.ok(registered.has(capability), `missing registered capability: ${capability}`);
  }
});

test('idea recommendations are explicit unvalidated opportunities, not invented market facts', () => {
  const ideas = recommendRevenueIdeas({ goal: '지역 상인들의 홍보와 유튜브 쇼츠 운영을 자동화하고 싶다' });
  assert.equal(ideas.length, 3);
  assert.equal(ideas[0].status, 'idea-not-market-validated');
  assert.equal(ideas[0].nextStep, 'ekodibiz-information-or-managed-service-request');
});

test('engine summary exposes guarded production authority', () => {
  const summary = getRevenueEngineSummary();
  assert.equal(summary.defaultRevenueOwner, 'ekodibiz');
  assert.equal(summary.commercialSubject, 'ekodibiz');
  assert.equal(summary.ordinaryUserMode, 'information-only');
  assert.equal(summary.productionAuthority, 'human-governed-guarded-release');
  assert.equal(summary.zeroRiskClaimForbidden, true);
});
