import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAutonomousDiscoveryServiceRegistry,
  inferAutonomousDiscoveryServiceId,
  scopeAutonomousDiscoveryTarget,
} from '../autonomous-discovery-service-registry.js';
import {
  buildDiscoveryReport,
  deriveSignalsFromWorkflowRuns,
} from '../scripts/run-autonomous-discovery-cycle.mjs';

const serviceConfig = {
  services: [
    {
      id: 'church',
      name: '에코디교회',
      nameEn: 'EKODI Church',
      url: 'https://ekodi.kr/ekodichurch',
      status: 'live',
      productionVerified: true,
    },
    {
      id: 'biz',
      name: '에코디비즈',
      nameEn: 'EKODI Biz',
      url: 'https://ekodi.kr/ekodibiz',
      status: 'live',
      productionVerified: true,
    },
    {
      id: 'trade',
      name: '에코디 트레이딩',
      nameEn: 'EKODI Trading',
      url: 'https://ekodi.kr/ekodibiz/trade',
      status: 'preparing',
      productionVerified: false,
    },
  ],
};

test('ecosystem registry becomes the discovery source of truth without promoting unverified services', () => {
  const registry = buildAutonomousDiscoveryServiceRegistry(serviceConfig);
  assert.equal(registry.length, 3);
  assert.equal(registry.find(service => service.id === 'church')?.monitorable, true);
  assert.equal(registry.find(service => service.id === 'biz')?.monitorable, true);
  assert.equal(registry.find(service => service.id === 'trade')?.monitorable, false);
});

test('workflow evidence is attributed to a unique subservice when explicit or inferable', () => {
  const registry = buildAutonomousDiscoveryServiceRegistry(serviceConfig);
  assert.equal(inferAutonomousDiscoveryServiceId({ serviceId: 'biz', workflowName: 'Generic Guard' }, registry), 'biz');
  assert.equal(inferAutonomousDiscoveryServiceId({ workflowName: 'Deploy EKODI Church' }, registry), 'church');
  assert.equal(scopeAutonomousDiscoveryTarget('church', 'github-workflow:Deploy EKODI Church'), 'service:church:github-workflow:Deploy EKODI Church');
});

test('repeated failures become isolated subservice research evidence without cross-service leakage', () => {
  const registry = buildAutonomousDiscoveryServiceRegistry(serviceConfig);
  const runs = [
    { workflowName: 'Deploy EKODI Church', conclusion: 'failure', createdAt: '2026-09-14T00:00:00Z', url: 'https://example.invalid/church/1' },
    { workflowName: 'Deploy EKODI Church', conclusion: 'timed_out', createdAt: '2026-09-14T01:00:00Z', url: 'https://example.invalid/church/2' },
    { workflowName: 'Deploy EKODI Church', conclusion: 'failure', createdAt: '2026-09-14T02:00:00Z', url: 'https://example.invalid/church/3' },
  ];

  const signals = deriveSignalsFromWorkflowRuns(runs, registry);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].serviceId, 'church');
  assert.match(signals[0].target, /^service:church:/);

  const report = buildDiscoveryReport(runs, serviceConfig);
  const church = report.subservices.find(service => service.id === 'church');
  const biz = report.subservices.find(service => service.id === 'biz');
  const trade = report.subservices.find(service => service.id === 'trade');

  assert.equal(report.registeredServices, 3);
  assert.equal(report.monitoredServices, 2);
  assert.equal(report.affectedSubservices, 1);
  assert.equal(church.qualifyingSignals, 1);
  assert.equal(church.researchCandidates, 1);
  assert.equal(biz.qualifyingSignals, 0);
  assert.equal(biz.researchCandidates, 0);
  assert.equal(trade.monitoringMode, 'registry_only');
  assert.equal(trade.cycle, null);
  assert.equal(report.productionMutationPerformed, false);
  assert.equal(report.authorityExpanded, false);
});

test('ambiguous or unmatched evidence stays platform-scoped instead of being guessed into a service', () => {
  const registry = buildAutonomousDiscoveryServiceRegistry(serviceConfig);
  const runs = Array.from({ length: 3 }, (_, index) => ({
    workflowName: 'Shared Security Baseline',
    conclusion: 'failure',
    createdAt: `2026-09-14T0${index}:00:00Z`,
  }));
  const signals = deriveSignalsFromWorkflowRuns(runs, registry);
  assert.equal(signals[0].serviceId, null);
  assert.equal(signals[0].target, 'github-workflow:Shared Security Baseline');
});
