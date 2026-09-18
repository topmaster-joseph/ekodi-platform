import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  buildTechnologyRadarReport,
  compareTechnologyVersions,
  evaluateTechnologyObservation,
  scoreTechnologyCandidate,
  validateTechnologyEvolutionPolicy,
} from '../ekodi-technology-radar.js';

const policy = JSON.parse(await fs.readFile(new URL('../config/autonomous-technology-evolution-policy.json', import.meta.url), 'utf8'));

test('technology evolution policy preserves S0 authority boundaries', () => {
  const validation = validateTechnologyEvolutionPolicy(policy);
  assert.equal(validation.ok, true, validation.errors.join(', '));
  assert.equal(policy.authority.automaticPaidActivation, false);
  assert.equal(policy.authority.automaticProductionMutation, false);
  assert.equal(policy.authority.automaticPermissionExpansion, false);
});

test('version comparison classifies major minor and patch changes deterministically', () => {
  assert.equal(compareTechnologyVersions('1.2.3', '2.0.0').level, 'major');
  assert.equal(compareTechnologyVersions('1.2.3', '1.3.0').level, 'minor');
  assert.equal(compareTechnologyVersions('1.2.3', '1.2.4').level, 'patch');
  assert.equal(compareTechnologyVersions('1.2.3', '1.2.3').level, 'none');
});

test('weighted score follows the 30/20/20/15/10/5 evidence model', () => {
  const technology = {
    metrics: {
      userValue: 100,
      compatibility: 100,
      costEfficiency: 100,
      security: 100,
      reversibility: 100,
      simplicity: 100,
    },
  };
  assert.equal(scoreTechnologyCandidate(technology, policy), 100);
});

test('high-value free reversible standard change becomes a sandbox candidate', () => {
  const technology = policy.technologies.find(item => item.id === 'mcp-typescript-sdk');
  const result = evaluateTechnologyObservation(technology, {
    id: technology.id,
    fetchOk: true,
    latestVersion: '1.31.0',
    latestTag: '1.31.0',
    publishedAt: '2026-09-18T00:00:00Z',
    evidenceUrl: 'https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/1.31.0',
  }, policy);
  assert.equal(result.material, true);
  assert.equal(result.action, 'sandbox_candidate');
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.automaticPaidActivationAllowed, false);
});

test('provider SDK change requiring credentials remains assessment-only', () => {
  const technology = policy.technologies.find(item => item.id === 'openai-node-sdk');
  const result = evaluateTechnologyObservation(technology, {
    id: technology.id,
    fetchOk: true,
    latestVersion: '7.19.0',
    latestTag: 'v7.19.0',
    publishedAt: '2026-09-18T00:00:00Z',
    evidenceUrl: 'https://github.com/openai/openai-node/releases/tag/v7.19.0',
  }, policy);
  assert.equal(result.material, true);
  assert.equal(result.action, 'assess');
  assert.match(result.reason, /credential/);
});

test('non-material patch releases are watched without noisy automatic trials', () => {
  const technology = policy.technologies.find(item => item.id === 'opentelemetry-js');
  const result = evaluateTechnologyObservation(technology, {
    id: technology.id,
    fetchOk: true,
    latestVersion: '2.11.1',
    latestTag: 'v2.11.1',
    publishedAt: '2026-09-18T00:00:00Z',
    evidenceUrl: 'https://github.com/open-telemetry/opentelemetry-js/releases/tag/v2.11.1',
  }, policy);
  assert.equal(result.material, false);
  assert.equal(result.action, 'watch');
});

test('radar material changes feed existing autonomous discovery without widening authority', () => {
  const observations = policy.technologies.map(technology => ({
    id: technology.id,
    fetchOk: true,
    latestVersion: technology.id === 'mcp-typescript-sdk' ? '1.31.0' : technology.baselineVersion,
    latestTag: technology.id === 'mcp-typescript-sdk' ? '1.31.0' : technology.baselineVersion,
    publishedAt: '2026-09-18T00:00:00Z',
    evidenceUrl: `https://example.invalid/${technology.id}`,
  }));
  const report = buildTechnologyRadarReport(policy, observations);
  assert.equal(report.signals.length, 1);
  assert.equal(report.discoveryCycle.discovered, 1);
  assert.equal(report.discoveryCycle.researchPrograms[0].signal.type, 'provider_or_standard_change');
  assert.equal(report.productionMutationPerformed, false);
  assert.equal(report.automaticPaidCommitmentPerformed, false);
  assert.equal(report.authorityExpanded, false);
  assert.equal(report.automaticPromotionPerformed, false);
});
