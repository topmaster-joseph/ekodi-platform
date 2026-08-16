import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildWorkspaceBlueprint, recommendWorkspacePacks } from '../ai-capability-orchestrator.js';
import { validateCapabilityLibrary } from '../scripts/validate-ai-capabilities.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const capabilities = await readJson('config/ai-capabilities.json');
const packs = await readJson('config/workspace-packs.json');
const governance = await readJson('config/ai-mission-governance.json');
const ecosystem = await readJson('config/ecosystem-services.json');
const catalog = { capabilities, packs };

test('capability catalog respects governance, showroom and pack contracts', () => {
  const result = validateCapabilityLibrary({ capabilities, packs, governance, ecosystem });
  assert.deepEqual(result.errors, []);
  assert.equal(result.capabilityCount, 27);
  assert.equal(result.packCount, 10);
  assert.equal(result.humanGateCount, 5);
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

test('small business blueprint composes reusable business capabilities', () => {
  const blueprint = buildWorkspaceBlueprint({ text: '가게 고객 홍보와 매출 관리를 하고 싶어요', audience: 'business' }, catalog);
  assert.equal(blueprint.packIds[0], 'small-business');
  assert.ok(blueprint.capabilityIds.includes('business.marketing'));
  assert.ok(blueprint.capabilityIds.includes('business.crm'));
  assert.ok(blueprint.capabilityIds.includes('finance.stewardship'));
  assert.ok(blueprint.showroomEntries.includes('marketing'));
  assert.equal(blueprint.home, 'https://my.ekodi.kr');
});

test('regulated or binding capabilities remain human gated', () => {
  const blueprint = buildWorkspaceBlueprint({ packIds: ['trade-commerce'], audience: 'business' }, catalog);
  assert.ok(blueprint.humanGateCapabilities.includes('trade.operations'));
  assert.ok(blueprint.humanGateCapabilities.includes('commerce.market'));
});

test('dedicated site is opt-in rather than the default', () => {
  const defaultBlueprint = buildWorkspaceBlueprint({ packIds: ['creator'] }, catalog);
  const dedicatedBlueprint = buildWorkspaceBlueprint({ packIds: ['creator'], dedicatedSite: true }, catalog);
  assert.equal(defaultBlueprint.dedicatedSiteRecommended, false);
  assert.equal(dedicatedBlueprint.dedicatedSiteRecommended, true);
});
