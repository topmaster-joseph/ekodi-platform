import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyReleaseEvidence, readReleaseEvidence } from '../scripts/verify-reliability-release-evidence.mjs';

const config = JSON.parse(readFileSync(new URL('../config/reliability-validation.json', import.meta.url), 'utf8'));

function validReport(profile) {
  const policy = config.profiles[profile];
  return {
    ok: true, passed: true, engine: 'EKODI Reliability & Validation Engine',
    policyVersion: config.version,
    targetClass: 'staging', targetHost: 'ekodi-shared-site-staging.ekodi-development.workers.dev',
    profile, startedAt: '2026-10-09T11:00:00.000Z', durationMs: 11000,
    effectiveTargetRps: policy.targetRps, thresholds: { ...policy.thresholds },
    violations: [],
    metrics: {
      total: policy.requests, passed: policy.requests, failed: 0, errorRate: 0,
      p50Ms: 10, p95Ms: 25, p99Ms: 35, maxMs: 50,
      statusCounts: { '200': policy.requests },
    },
  };
}
function allReports() {
  return { baseline: validReport('baseline'), spike: validReport('spike') };
}
function assertRejected(mutator, message) {
  const reports = allReports();
  mutator(reports);
  assert.throws(() => verifyReleaseEvidence(reports, config), message);
}

test('accepts only both real baseline and spike evidence on the canonical staging host', () => {
  const result = verifyReleaseEvidence(allReports(), config);
  assert.deepEqual(result.profiles, ['baseline', 'spike']);
  assert.equal(result.ok, true);
});

test('fails closed on missing, mislabeled or forged engine evidence', () => {
  assertRejected(x => delete x.spike, /spike: missing artifact/);
  assertRejected(x => x.spike.profile = 'baseline', /spike: wrong profile/);
  assertRejected(x => x.spike.engine = 'mock-engine', /wrong engine/);
  assertRejected(x => x.spike.policyVersion = 0, /policy version drift/);
});

test('refuses production, alternate staging domain, or mismatched traffic policy', () => {
  assertRejected(x => x.baseline.targetClass = 'production', /not approved staging host/);
  assertRejected(x => x.baseline.targetHost = 'example.workers.dev', /not approved staging host/);
  assertRejected(x => x.spike.effectiveTargetRps = config.guardrails.maxTargetRps + 1, /traffic guardrail mismatch/);
  assertRejected(x => x.baseline.thresholds.p95Ms += 50000, /SLO threshold mismatch/);
});

test('measured errors and p95 over SLO never become a pass from a success flag', () => {
  assertRejected(x => x.baseline.metrics.p95Ms = x.baseline.thresholds.p95Ms + 1, /measured SLO exceeded|latency percentile order/);
  assertRejected(x => { x.spike.metrics.failed = 6; x.spike.metrics.passed -= 6; x.spike.metrics.errorRate = 6 / x.spike.metrics.total; }, /measured SLO exceeded/);
  assertRejected(x => x.baseline.violations.push('SLO breach'), /recorded SLO violations/);
  assertRejected(x => x.spike.passed = false, /failed summary/);
});

test('rejects inconsistent report metrics and incomplete total requests', () => {
  assertRejected(x => x.baseline.metrics.total -= 1, /invalid request counts/);
  assertRejected(x => x.baseline.metrics.errorRate = 0.4, /inconsistent error rate/);
  assertRejected(x => x.spike.metrics.statusCounts['200'] = 2, /inconsistent response status counts/);
  assertRejected(x => x.baseline.metrics.p95Ms = -1, /invalid p95Ms/);
  assertRejected(x => x.baseline.metrics.p99Ms = 3, /latency percentile order/);
});

test('CLI input handling fails closed if missing or corrupt artifact', async () => {
  await assert.rejects(
    () => readReleaseEvidence('ignored', { readText: async path => {
      if (String(path).includes('reliability-baseline')) return JSON.stringify(validReport('baseline'));
      if (String(path).includes('reliability-spike')) throw new Error('artifact-not-found');
      return JSON.stringify(config);
    } }),
    /artifact-not-found/,
  );
});
