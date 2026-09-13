import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import supportWorker, { BENEFIT_RADAR_CAPABILITY } from '../support-worker.js';
import { buildCapabilityGraph, findReusableComposition, getCapabilityNode, getCapabilityGaps } from '../ekodi-capability-ecosystem.js';
import { buildIntentPlan } from '../capability-intent-runtime.js';
import { officialSourceStatus } from '../support/sources.js';

const registry = JSON.parse(fs.readFileSync(new URL('../config/capability-registry.json', import.meta.url), 'utf8'));
const packs = JSON.parse(fs.readFileSync(new URL('../config/workspace-packs.json', import.meta.url), 'utf8'));
const catalog = { registry, packs };
const capabilityId = 'support.benefit-radar';

test('Benefit Radar is a registered Generation 10 service-backed capability', () => {
  const capability = getCapabilityNode(capabilityId);
  assert.ok(capability);
  assert.equal(capability.domain, 'support');
  assert.equal(capability.actionTier, 'assist');
  assert.equal(capability.maturity, 'service-backed');
  assert.equal(BENEFIT_RADAR_CAPABILITY.id, capabilityId);
  assert.equal(BENEFIT_RADAR_CAPABILITY.generation, 10);
  assert.equal(BENEFIT_RADAR_CAPABILITY.contract, 'ekodi.benefit-radar.v1');
  assert.deepEqual(getCapabilityGaps([capabilityId]), []);
});

test('Generation 10 reuses Benefit Radar for support intents without guessing a new capability', () => {
  const matches = findReusableComposition('정부 지원 혜택 복지 보조금 장학금');
  assert.equal(matches.some(item => item.capability.id === capabilityId), true);
  const graph = buildCapabilityGraph();
  assert.equal(graph.capabilities.some(item => item.id === capabilityId), true);
});

test('workspace packs compose Benefit Radar into person, business, organization, learning and career contexts', () => {
  for (const id of ['personal-starter','small-business','organization','learning-research','work-career']) {
    const pack = packs.packs.find(item => item.id === id);
    assert.ok(pack, id);
    assert.equal(pack.capabilities.includes(capabilityId), true, id);
  }
  const plan = buildIntentPlan({ text: '소상공인 정부지원사업 보조금이 필요해요', audience: 'business' }, catalog);
  assert.equal(plan.packIds.includes('small-business'), true);
  assert.equal(plan.capabilityIds.includes(capabilityId), true);
  assert.equal(plan.assistCapabilities.includes(capabilityId), true);
  assert.equal(plan.showroomEntries.includes('support'), true);
});

test('official source readiness never presents pending connectors as live ingestion', () => {
  const sources = officialSourceStatus({});
  const byId = id => sources.find(item => item.id === id);
  assert.equal(byId('bizinfo').ingestion, true);
  assert.equal(byId('bizinfo').mode, 'ready_public');
  for (const id of ['gov24','kstartup','work24']) {
    assert.equal(byId(id).official, true);
    assert.equal(byId(id).ingestion, false);
    assert.equal(byId(id).mode, 'approval_required');
  }
  const configured = officialSourceStatus({ GOV24_API_URL: 'https://example.invalid/api', GOV24_SERVICE_KEY: 'configured' });
  const gov24 = configured.find(item => item.id === 'gov24');
  assert.equal(gov24.mode, 'adapter_pending');
  assert.equal(gov24.ingestion, false);
});

test('Support health exposes the Generation 10 capability while keeping sovereign execution gates', async () => {
  const response = await supportWorker.fetch(new Request('https://ekodi.kr/support/health'), {});
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.capability.id, capabilityId);
  assert.equal(health.capability.generation, 10);
  assert.equal(health.capability.actionTier, 'assist');
  assert.equal(health.submissionExecution, false);
  assert.equal(health.humanGateRequired, true);
  assert.equal(health.needSensing, 'consent-first');
});

test('Need assessment returns capability identity and remains consent-gated', async () => {
  const request = consent => new Request('https://ekodi.kr/support/api/need-assessment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profile: { profileType: 'business', region: 'Jeonnam', need: 'AI marketing support', interests: ['AI'] },
      needContext: { consent: { proactiveBenefits: consent, activityContext: false, externalData: false, sensitiveBenefits: false }, signals: [] },
    }),
  });
  const blocked = await (await supportWorker.fetch(request(false), {})).json();
  const enabled = await (await supportWorker.fetch(request(true), {})).json();
  assert.equal(blocked.capability.id, capabilityId);
  assert.equal(blocked.assessment.proactiveEligible, false);
  assert.equal(enabled.assessment.proactiveEligible, true);
});
