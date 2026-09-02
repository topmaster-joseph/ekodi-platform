import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  analyzePlatformHealth,
  analyzeServiceFleet,
  approvalGate,
  buildRecommendation,
  computeTechnologyMaturityIndex,
  evaluateTechnologyCandidate,
  gradeEvidence,
} from '../evolution-intelligence-runtime.js';

const VERIFIED_AT = '2026-09-03T00:00:00.000Z';
const SOURCES = [
  {
    title: 'Official specification',
    publisher: 'Standards Foundation',
    type: 'official_spec',
    url: 'https://example.org/spec',
    verifiedAt: VERIFIED_AT,
  },
  {
    title: 'Independent benchmark',
    publisher: 'Independent Lab',
    type: 'independent_benchmark',
    url: 'https://benchmark.example.net/report',
    verifiedAt: VERIFIED_AT,
  },
];
test('cross-verified evidence receives grade A and remains linkable', () => {
  const result = gradeEvidence(SOURCES);
  assert.equal(result.grade, 'A');
  assert.equal(result.publishable, true);
  assert.equal(result.sourceCount, 2);
  assert.ok(result.sources.every(source => source.url.startsWith('https://')));
});

test('recommendation without a valid source link cannot be published', () => {
  const recommendation = buildRecommendation({
    title: 'No evidence proposal',
    verifiedAt: VERIFIED_AT,
    sources: [{ title: 'bad', publisher: 'x', type: 'official_doc', url: 'javascript:alert(1)' }],
  });
  assert.equal(recommendation.publishable, false);
  assert.equal(recommendation.status, 'evidence_required');
});

test('high-impact platform changes are always routed to the super administrator gate', () => {
  const gate = approvalGate({
    productionChange: true,
    createsSharedCore: true,
    reversible: true,
  });
  assert.equal(gate.required, true);
  assert.equal(gate.authority, 'ekodi_platform_super_administrator');
  assert.ok(gate.reasons.includes('production_change'));
  assert.ok(gate.reasons.includes('shared_core_creation'));
});
test('technology radar scores current candidates but does not bypass approval', () => {
  const recommendation = evaluateTechnologyCandidate({
    name: 'Interoperable Agent Gateway',
    verifiedAt: VERIFIED_AT,
    sources: SOURCES,
    capabilityGap: 94,
    commonality: 96,
    reusability: 95,
    securityReadiness: 92,
    operationalImpact: 93,
    urgency: 88,
    maturity: 90,
    independence: 97,
    costEfficiency: 86,
    createsSharedCore: true,
  });
  assert.equal(recommendation.publishable, true);
  assert.equal(recommendation.evidenceGrade, 'A');
  assert.ok(recommendation.score >= 85);
  assert.equal(recommendation.approval.required, true);
});

test('platform health analysis turns threshold breaches into evidence-bound proposals', () => {
  const result = analyzePlatformHealth({
    id: 'marketing',
    observedAt: VERIFIED_AT,
    sourceUrl: 'https://admin.ekodi.kr/#ai-ops',
    metrics: { latencyP95Ms: 2600, aiCostGrowthPct: 44, criticalSecurityEvents: 0 },
  });
  assert.equal(result.recommendations.length, 2);
  assert.ok(result.recommendations.every(item => item.publishable));
  assert.ok(result.recommendations.every(item => item.approval.required));
});
test('service fleet adapter creates ranked recommendations from existing Control API metrics', () => {
  const result = analyzeServiceFleet({
    generatedAt: VERIFIED_AT,
    services: [{
      id: 'mall', name: '에코디몰', state: 'active', monitorEnabled: true,
      latest: { status: 'degraded' },
      stats24h: {
        availabilityPercent: 98.4,
        averageResponseTime: 1900,
        maxResponseTime: 3100,
        degraded: 3,
        offline: 0,
      },
    }],
  }, { sourceUrl: 'https://admin.ekodi.kr/#ai-ops' });
  assert.equal(result.recommendationCount, 2);
  assert.equal(result.publishableCount, 2);
  assert.ok(result.recommendations[0].score >= result.recommendations[1].score);
});

test('technology maturity index exposes weakest areas first', () => {
  const result = computeTechnologyMaturityIndex({
    security: 94,
    observability: 82,
    scalability: 76,
  });
  assert.equal(result.score, 84);
  assert.deepEqual([...result.gaps].sort(), ['observability', 'scalability']);
  assert.equal(result.areas[0].area, 'scalability');
});

test('schema changes use the governed additive migration lane', () => {
  const store = fs.readFileSync(new URL('../evolution-intelligence-store.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../migrations/0054_evolution_intelligence.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(store, /CREATE\s+TABLE/i);
  assert.match(store, /sqlite_master/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS evolution_recommendations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS evolution_evidence/);
});
