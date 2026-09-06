import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildIntentPlan, recommendWorkspacePacks, routeIntent } from '../capability-intent-runtime.js';
import { validateCapabilityRegistry } from '../scripts/validate-capability-registry.mjs';

const readJson = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const registry = await readJson('config/capability-registry.json');
const packs = await readJson('config/workspace-packs.json');
const governance = await readJson('config/ai-mission-governance.json');
const ecosystem = await readJson('config/ecosystem-services.json');
const providerContract = await readJson('governance/architecture/capability-provider-contract.v1.json');
const catalog = { registry, packs };

test('universal capability registry respects governance, provider and pack contracts', () => {
  const result = validateCapabilityRegistry({ registry, packs, governance, ecosystem, providerContract });
  assert.deepEqual(result.errors, []);
  assert.equal(result.capabilityCount, 27);
  assert.equal(result.packCount, 10);
  assert.equal(result.humanGateCount, 5);
  assert.equal(result.reversibleCount, 2);
});

test('registry is Generation 3 ready while preserving Generation 8 north star', () => {
  assert.equal(registry.generation.capabilityTarget, 3);
  assert.equal(registry.generation.northStar, 8);
  assert.equal(registry.intentPolicy.modelMayInventCapabilities, false);
});
test('unclear personal intent falls back to My EKODI personal starter', () => {
  const result = recommendWorkspacePacks({ text: '', audience: 'person' }, packs);
  assert.equal(result[0]?.id, 'personal-starter');
});

test('creative intent selects the creator workspace', () => {
  const result = recommendWorkspacePacks({ text: '그림과 애니메이션을 만들어 포트폴리오를 만들고 싶어요', audience: 'person' }, packs);
  assert.equal(result[0]?.id, 'creator');
});

test('organization intent selects organization workspace', () => {
  const result = recommendWorkspacePacks({ text: '상인회 회원과 행사를 함께 관리하고 싶어요', audience: 'organization' }, packs);
  assert.equal(result[0]?.id, 'organization');
});

test('small business intent composes reusable capabilities before services', () => {
  const plan = buildIntentPlan({ text: '가게 고객 홍보와 매출 관리를 하고 싶어요', audience: 'business' }, catalog);
  assert.equal(plan.packIds[0], 'small-business');
  assert.ok(plan.capabilityIds.includes('business.marketing'));
  assert.ok(plan.capabilityIds.includes('business.crm'));
  assert.ok(plan.capabilityIds.includes('finance.stewardship'));
  assert.ok(plan.showroomEntries.includes('marketing'));
  assert.equal(plan.home, 'https://my.ekodi.kr');
  assert.equal(plan.contract, 'ekodi.intent-plan.v1');
});
test('execution modes expose autonomy preflight and sovereign human gates', () => {
  const plan = buildIntentPlan({ packIds: ['organization'], audience: 'organization' }, catalog);
  const automation = plan.steps.find(step => step.capabilityId === 'core.automation');
  assert.equal(automation?.executionMode, 'autonomy_preflight');

  const tradePlan = buildIntentPlan({ packIds: ['trade-commerce'], audience: 'business' }, catalog);
  const trade = tradePlan.steps.find(step => step.capabilityId === 'trade.operations');
  assert.equal(trade?.executionMode, 'sovereign_human_gate');
});

test('unknown requested capabilities remain unresolved and are never invented', () => {
  const plan = routeIntent({ packIds: ['personal-starter'], requestedCapabilities: ['imaginary.root.power'] }, catalog);
  assert.ok(plan.unresolvedCapabilityIds.includes('imaginary.root.power'));
  assert.ok(!plan.capabilityIds.includes('imaginary.root.power'));
});

test('intent plans inherit the active sovereign autonomy authority context', () => {
  const plan = buildIntentPlan({ packIds: ['personal-starter'] }, catalog);
  assert.equal(plan.autonomyPolicyVersion, '1.8.1');
  assert.equal(plan.authorityContext, 'Person + Workspace + Role + Capability');
});

test('dedicated site remains an explicit exception rather than default behavior', () => {
  assert.equal(buildIntentPlan({ packIds: ['creator'] }, catalog).dedicatedSiteRecommended, false);
  assert.equal(buildIntentPlan({ packIds: ['creator'], dedicatedSite: true }, catalog).dedicatedSiteRecommended, true);
});
