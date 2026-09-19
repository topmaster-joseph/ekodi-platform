import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertProductionAccountBoundary,
  classifyQuotaState,
  isQuotaCircuitBreak
} from '../scripts/cloudflare-quota-guard-lib.mjs';

test('quota states enforce 70 percent warning and 90 percent protection', () => {
  assert.equal(classifyQuotaState({ requests: 69999, limit: 100000, warningRatio: 0.7, protectRatio: 0.9 }).state, 'normal');
  assert.equal(classifyQuotaState({ requests: 70000, limit: 100000, warningRatio: 0.7, protectRatio: 0.9 }).state, 'warning');
  assert.equal(classifyQuotaState({ requests: 90000, limit: 100000, warningRatio: 0.7, protectRatio: 0.9 }).state, 'protect');
  const exhausted = classifyQuotaState({ requests: 100000, limit: 100000, warningRatio: 0.7, protectRatio: 0.9 });
  assert.equal(exhausted.state, 'exhausted');
  assert.equal(exhausted.skipNonessential, true);
});

test('production account cannot resolve to development account', () => {
  assert.throws(() => assertProductionAccountBoundary({
    productionAccountId: 'dev-account',
    developmentAccountId: 'dev-account',
    knownDevelopmentAccountIds: []
  }), /must differ/);
  assert.throws(() => assertProductionAccountBoundary({
    productionAccountId: 'known-dev',
    developmentAccountId: '',
    knownDevelopmentAccountIds: ['known-dev']
  }), /known Development/);
  assert.equal(assertProductionAccountBoundary({
    productionAccountId: 'prod',
    developmentAccountId: 'dev',
    knownDevelopmentAccountIds: ['known-dev']
  }), 'prod');
});

test('429 and Cloudflare Error 1027 open the circuit breaker', () => {
  const config = {
    statuses: [429],
    bodyMarkers: ['Error 1027', 'temporarily rate limited']
  };
  assert.equal(isQuotaCircuitBreak({ status: 429, body: '', config }), true);
  assert.equal(isQuotaCircuitBreak({ status: 200, body: 'Error 1027', config }), true);
  assert.equal(isQuotaCircuitBreak({ status: 503, body: 'temporarily rate limited', config }), true);
  assert.equal(isQuotaCircuitBreak({ status: 500, body: 'ordinary failure', config }), false);
});

test('production verification is consolidated into one post-deploy canary', async () => {
  const productionGate = await readFile(new URL('../.github/workflows/production-gate.yml', import.meta.url), 'utf8');
  const reliability = await readFile(new URL('../.github/workflows/reliability-validation.yml', import.meta.url), 'utf8');
  assert.match(productionGate, /workflow_run:/);
  assert.match(productionGate, /Run one quota-aware post-deploy canary/);
  assert.doesNotMatch(productionGate, /cron:/);
  assert.doesNotMatch(reliability, /production-synthetic:/);
  assert.doesNotMatch(reliability, /workflow_run:/);
});

test('ordinary static assets stay asset-first while security-critical Admin and auth assets remain Worker-first', async () => {
  const wrangler = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');
  for (const securityCritical of [
    '/auth-bootstrap.js',
    '/auth-router.js',
    '/admin-authenticated-shell.js',
    '/admin-shell.css',
    '/admin-compact.css',
    '/system-health-admin.css',
    '/device-browser-diagnostics.css',
    '/tapo-device-admin.css',
    '/workspace-trade-portal.css'
  ]) {
    assert.equal(wrangler.includes(`"${securityCritical}"`), true, `${securityCritical} must remain Worker-first`);
  }
  for (const ordinaryStatic of ['/styles.css', '/homepage-ambient.css', '/mall.css', '/device-browser-diagnostics.js']) {
    assert.equal(wrangler.includes(`"${ordinaryStatic}"`), false, `${ordinaryStatic} should use Static Assets asset-first delivery`);
  }
});
