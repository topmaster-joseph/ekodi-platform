/**
 * Read-only verification of same-run staged reliability artifacts.
 * No HTTP requests; no GitHub dispatch; no Cloudflare traffic or mutation.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STAGING_HOST = 'ekodi-shared-site-staging.ekodi-development.workers.dev';
const PROFILES = ['baseline', 'spike'];

function assertProof(condition, message) {
  if (!condition) throw new Error('[EKODI reliability evidence] ' + message);
}
function nonnegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function count(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function verifyReleaseEvidence(reports, config) {
  assertProof(config?.version === 1 && config.guardrails?.maxTargetRps > 0, 'unknown reliability policy');
  assertProof(reports && typeof reports === 'object' && !Array.isArray(reports), 'missing artifacts');
  for (const profile of PROFILES) {
    const report = reports[profile];
    const allowed = config.profiles?.[profile];
    assertProof(allowed && allowed.manualOnly === false, profile + ': release profile is not allowed');
    assertProof(report && typeof report === 'object', profile + ': missing artifact');
    assertProof(report.ok === true && report.passed === true, profile + ': failed summary');
    assertProof(report.policyVersion === config.version, profile + ': policy version drift');
    assertProof(report.engine === 'EKODI Reliability & Validation Engine', profile + ': wrong engine');
    assertProof(report.profile === profile, profile + ': wrong profile');
    assertProof(report.targetClass === 'staging' && report.targetHost === STAGING_HOST, profile + ': not approved staging host');
    assertProof(nonnegative(report.durationMs) && Number.isFinite(Date.parse(report.startedAt)), profile + ': missing timing');
    assertProof(nonnegative(report.effectiveTargetRps) &&
      report.effectiveTargetRps >= allowed.targetRps &&
      report.effectiveTargetRps <= config.guardrails.maxTargetRps, profile + ': traffic guardrail mismatch');

    const t = report.thresholds, expected = allowed.thresholds;
    assertProof(t && t.p95Ms === expected.p95Ms && t.errorRate === expected.errorRate, profile + ': SLO threshold mismatch');
    assertProof(Array.isArray(report.violations) && report.violations.length === 0, profile + ': recorded SLO violations');

    const m = report.metrics;
    assertProof(m && count(m.total) && m.total === allowed.requests &&
      count(m.passed) && count(m.failed) && m.passed + m.failed === m.total,
      profile + ': invalid request counts');
    assertProof(nonnegative(m.errorRate) && m.errorRate <= 1 &&
      Math.abs(m.errorRate - m.failed / m.total) <= 1e-9, profile + ': inconsistent error rate');
    for (const metric of ['p50Ms','p95Ms','p99Ms','maxMs']) {
      assertProof(nonnegative(m[metric]), profile + ': invalid ' + metric);
    }
    assertProof(m.p50Ms <= m.p95Ms && m.p95Ms <= m.p99Ms && m.p99Ms <= m.maxMs,
      profile + ': invalid latency percentile order');
    assertProof(m.p95Ms <= expected.p95Ms && m.errorRate <= expected.errorRate,
      profile + ': measured SLO exceeded');
    const statusCounts = m.statusCounts;
    assertProof(statusCounts && typeof statusCounts === 'object' && !Array.isArray(statusCounts) &&
      Object.values(statusCounts).every(count) &&
      Object.values(statusCounts).reduce((a,b) => a+b,0) === m.total,
      profile + ': inconsistent response status counts');
  }
  return { ok: true, profiles: [...PROFILES], stagingHost: STAGING_HOST };
}

export async function readReleaseEvidence(directory, { readText = readFile } = {}) {
  const reports = {};
  for (const profile of PROFILES) {
    const file = resolve(directory, 'reliability-' + profile + '.json');
    reports[profile] = JSON.parse(await readText(file, 'utf8'));
  }
  const policyPath = new URL('../config/reliability-validation.json', import.meta.url);
  const config = JSON.parse(await readText(policyPath, 'utf8'));
  return verifyReleaseEvidence(reports, config);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = process.argv.find(x => x.startsWith('--directory='));
  if (!arg?.slice('--directory='.length)) {
    process.stderr.write('Use --directory=<same-run-artifacts-folder>\n');
    process.exitCode = 2;
  } else {
    try {
      const result = await readReleaseEvidence(arg.slice('--directory='.length));
      process.stdout.write(JSON.stringify(result) + '\n');
    } catch (error) {
      process.stderr.write(String(error.message || error) + '\n');
      process.exitCode = 1;
    }
  }
}
