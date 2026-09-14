import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAutonomousEvolutionReport,
  buildSubserviceEvolutionCoverage,
  renderAutonomousEvolutionSummary,
  serviceIdForLifecycleRecord,
} from '../scripts/run-autonomous-evolution-loop.mjs';

const discoveryReport = {
  sampledRuns: 8,
  failedRuns: 3,
  cycle: {
    researchPrograms: [{
      id: 'adr_church_deploy',
      signal: {
        serviceId: 'church',
        target: 'service:church:github-workflow:Deploy EKODI Church',
        evidenceRefs: ['https://github.com/example/repo/actions/runs/10'],
      },
      question: 'What is causing repeated Church deployment failures?',
    }],
  },
  subservices: [
    { id: 'church', name: 'EKODI Church', url: 'https://ekodi.kr/ekodichurch', status: 'live', productionVerified: true, monitoringMode: 'active_read_only' },
    { id: 'biz', name: 'EKODI Biz', url: 'https://ekodi.kr/ekodibiz', status: 'live', productionVerified: true, monitoringMode: 'active_read_only' },
    { id: 'trade', name: 'EKODI Trading', url: 'https://ekodi.kr/ekodibiz/trade', status: 'preparing', productionVerified: false, monitoringMode: 'registry_only' },
  ],
};

const researchEvidence = {
  generatedAt: '2026-09-14T00:00:00Z',
  evidenceByResearchId: {
    adr_church_deploy: {
      serviceId: 'church',
      target: 'service:church:github-workflow:Deploy EKODI Church',
      failedRuns: 3,
      recoveredRuns: 0,
      failedJobs: ['deploy'],
      failedSteps: ['verify'],
      reproducible: true,
      evidenceRefs: [
        'https://github.com/example/repo/actions/runs/10',
        'https://github.com/example/repo/actions/runs/11',
        'https://github.com/example/repo/actions/runs/12',
      ],
    },
  },
};

test('subservice target survives discovery, research and evolution lifecycle without cross-service leakage', () => {
  const report = buildAutonomousEvolutionReport(discoveryReport, researchEvidence, { generatedAt: '2026-09-14T01:00:00Z' });
  assert.equal(report.records.length, 1);
  assert.equal(report.records[0].serviceId, 'church');
  assert.equal(serviceIdForLifecycleRecord(report.records[0]), 'church');
  assert.equal(report.records[0].research.verified, true);
  assert.equal(report.records[0].experiment.executableAutonomously, true);
  assert.equal(report.evolutionScope.registeredServices, 3);
  assert.equal(report.evolutionScope.monitoredServices, 2);
  assert.equal(report.evolutionScope.lifecycleActiveServices, 1);
  assert.equal(report.evolutionScope.platformScopedRecords, 0);

  const church = report.subservices.find(service => service.id === 'church');
  const biz = report.subservices.find(service => service.id === 'biz');
  const trade = report.subservices.find(service => service.id === 'trade');
  assert.equal(church.lifecycle.total, 1);
  assert.equal(church.lifecycle.researchVerified, 1);
  assert.equal(church.lifecycle.experimentsReady, 1);
  assert.equal(biz.lifecycle.total, 0);
  assert.equal(trade.evolutionMode, 'registry_only');
  assert.equal(report.productionMutationPerformed, false);
  assert.equal(report.authorityExpanded, false);
  assert.equal(report.automaticPromotionPerformed, false);
});

test('subservice coverage keeps all registered services while only activating evidence-backed lifecycle records', () => {
  const report = buildAutonomousEvolutionReport(discoveryReport, researchEvidence);
  const coverage = buildSubserviceEvolutionCoverage(discoveryReport, report);
  assert.deepEqual(coverage.map(service => service.id), ['church', 'biz', 'trade']);
  assert.equal(coverage.filter(service => service.lifecycle.total > 0).length, 1);
  assert.equal(coverage.every(service => service.productionMutationPerformed === false), true);
  assert.equal(coverage.every(service => service.authorityExpanded === false), true);
});

test('summary exposes service-level lifecycle state without implying automatic deployment', () => {
  const report = buildAutonomousEvolutionReport(discoveryReport, researchEvidence);
  const summary = renderAutonomousEvolutionSummary(report);
  assert.match(summary, /Registered subservices: \*\*3\*\*/);
  assert.match(summary, /Subservices with lifecycle records: \*\*1\*\*/);
  assert.match(summary, /`church`/);
  assert.match(summary, /Production mutation by autonomous research loop: \*\*NO\*\*/);
  assert.match(summary, /Automatic generation promotion: \*\*NO\*\*/);
});
