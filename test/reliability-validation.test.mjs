import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertScenarioAllowed,
  classifyTarget,
  percentile,
  runScenario,
  summarizeResults,
  validateReliabilityConfig
} from '../scripts/reliability-validation-lib.mjs';

const configPath = fileURLToPath(new URL('../config/reliability-validation.json', import.meta.url));
const config = JSON.parse(await readFile(configPath, 'utf8'));

test('reliability policy is internally valid', () => {
  assert.deepEqual(validateReliabilityConfig(config), []);
});

test('target classification separates staging, production and local', () => {
  assert.equal(classifyTarget('https://ekodi-shared-site-staging.ekodi-development.workers.dev', config), 'staging');
  assert.equal(classifyTarget('https://ekodi.kr', config), 'production');
  assert.equal(classifyTarget('https://admin.ekodi.kr', config), 'production');
  assert.equal(classifyTarget('http://127.0.0.1:8787', config), 'local');
  assert.equal(classifyTarget('https://example.com', config), 'unknown');
});

test('production refuses load profiles even with approval', () => {
  assert.throws(() => assertScenarioAllowed({
    targetUrl: 'https://ekodi.kr',
    profileName: 'baseline',
    config,
    env: { EKODI_PRODUCTION_RELIABILITY_APPROVED: 'true' }
  }), /Production load profile is forbidden/);
});

test('production synthetic checks require explicit approval', () => {
  assert.throws(() => assertScenarioAllowed({
    targetUrl: 'https://ekodi.kr',
    profileName: 'synthetic',
    config,
    env: {}
  }), /requires EKODI_PRODUCTION_RELIABILITY_APPROVED=true/);
  assert.equal(assertScenarioAllowed({
    targetUrl: 'https://ekodi.kr',
    profileName: 'synthetic',
    config,
    env: { EKODI_PRODUCTION_RELIABILITY_APPROVED: 'true' }
  }).targetClass, 'production');
});

test('manual-only stress and soak profiles cannot run accidentally', () => {
  for (const profileName of ['stress', 'soak']) {
    assert.throws(() => assertScenarioAllowed({
      targetUrl: 'https://ekodi-shared-site-staging.ekodi-development.workers.dev',
      profileName,
      config
    }), /manual-only/);
  }
});

test('percentile and SLO evaluation fail closed', () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 0.95), 50);
  const profile = { thresholds: { p95Ms: 100, errorRate: 0.1 } };
  const result = summarizeResults([
    { ok: true, status: 200, durationMs: 50 },
    { ok: true, status: 200, durationMs: 70 },
    { ok: false, status: 500, durationMs: 150 }
  ], profile);
  assert.equal(result.passed, false);
  assert.equal(result.metrics.failed, 1);
  assert.match(result.violations.join(' '), /p95/);
  assert.match(result.violations.join(' '), /errorRate/);
});

test('local scenario runner measures a real HTTP target without external traffic', async t => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  const profile = {
    requests: 6,
    concurrency: 2,
    targetRps: 100,
    thresholds: { p95Ms: 1000, errorRate: 0 }
  };
  const results = await runScenario({
    targetUrl: `http://127.0.0.1:${address.port}`,
    path: '/health',
    profile,
    expectedStatuses: [200],
    timeoutMs: 1000,
    maxDurationSeconds: 5
  });
  assert.equal(results.length, 6);
  assert.equal(results.every(result => result.ok), true);
  assert.equal(summarizeResults(results, profile).passed, true);
});
