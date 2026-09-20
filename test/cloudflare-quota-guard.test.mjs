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
  const manual = await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(manual, /post-deploy-canary\\.mjs --scope=full/);
  assert.match(manual, /cloudflare-production-budget\\.mjs/);
  assert.doesNotMatch(manual, /for attempt in/);
  assert.doesNotMatch(manual, /admin\\.ekodi\\.kr|api\\.ekodi\\.kr|finance-api\\.ekodi\\.kr|community\\.ekodi\\.kr|social\\.ekodi\\.kr/);
});

test('production probe loops fail fast on quota circuit and deep E2E stays explicit-only', async () => {
  const [shellVerify, churchOwnership, adminRetry, adminAuthenticated, adminUi, adminAuthenticatedUi, productionGate] = await Promise.all([
    readFile(new URL('../scripts/verify-ekodi-shell-live.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/ensure-church-route-ownership.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/admin-authenticated-e2e-retry.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/admin-authenticated-e2e.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/verify-admin-production-ui-e2e.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/verify-admin-authenticated-production-e2e.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/production-gate.yml', import.meta.url), 'utf8'),
  ]);

  assert.match(shellVerify, /One essential probe owns the quota decision/);
  assert.match(shellVerify, /isQuotaCircuitBreak/);
  assert.match(shellVerify, /stopping live verification without retries or fan-out/);
  assert.match(churchOwnership, /CF-QUOTA-001 circuit open/);
  assert.match(churchOwnership, /no retry/);
  assert.match(adminRetry, /throwIfQuotaCircuit/);
  assert.match(adminRetry, /CF-QUOTA-001 circuit open/);

  for (const workflow of [adminAuthenticated, adminUi, adminAuthenticatedUi]) {
    assert.match(workflow, /on:\n  workflow_dispatch:/);
    assert.doesNotMatch(workflow, /\n  push:/);
  }
  for (const workflow of [adminAuthenticated, adminAuthenticatedUi]) {
    assert.match(workflow, /https:\/\/ekodi\.kr\/api\/session/);
    assert.doesNotMatch(workflow, /curl[^\n]*--retry[^\n]*api\/session/);
  }

  assert.match(productionGate, /workflow_run:/);
  assert.match(productionGate, /Run one quota-aware post-deploy canary/);
});

test('Shared Site release and Mission E2E obey the same production quota budget without duplicate full-menu probes', async () => {
  const [shared,mission] = await Promise.all([
    readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/verify-ekodimission-admin-production-e2e.yml', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(shared, /\n\s*admin-authenticated-e2e:\s*\n/);
  assert.match(shared, /Read Production Cloudflare quota Source of Truth/);
  assert.match(shared, /cloudflare-production-budget\.mjs/);
  assert.match(shared, /steps\.quota\.outputs\.state == 'exhausted'/);
  assert.match(shared, /steps\.quota\.outputs\.skip_nonessential != 'true'/);
  assert.doesNotMatch(mission, /schedule:/);
  assert.match(mission, /workflow_run:/);
  assert.match(mission, /cloudflare-production-budget\.mjs/);
  assert.match(mission, /skip_nonessential != 'true'/);
});

test('Admin static shell bypasses Worker while auth and deep Admin routes keep Worker boundaries', async () => {
  const [wrangler, build, headers] = await Promise.all([
    readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../_headers', import.meta.url), 'utf8')
  ]);
  for (const securityCritical of ['/auth-bootstrap.js','/auth-router.js']) {
    assert.equal(wrangler.includes(`"${securityCritical}"`), true, `${securityCritical} must remain Worker-first`);
  }
  assert.match(wrangler, /"\/admin\/\*"/);
  for (const assetFirst of ['!/admin','!/admin/','!/admin/*.js','!/admin/*.css']) {
    assert.equal(wrangler.includes(`"${assetFirst}"`), true, `${assetFirst} must bypass Worker invocation`);
  }
  const routeLine = wrangler.split('\n').find(line => line.trim().startsWith('run_worker_first =')) || '';
  assert.ok((routeLine.match(/"/g) || []).length / 2 <= 100, 'Cloudflare run_worker_first entries must stay within the 100-entry limit');
  assert.match(build, /adminStaticMirrorDir/);
  assert.match(build, /admin-shell\.html/);
  assert.match(headers, /\/admin\/\*[\s\S]*Content-Security-Policy:[\s\S]*Cache-Control: no-store/);
  for (const ordinaryStatic of ['/styles.css', '/homepage-ambient.css', '/mall.css']) {
    assert.equal(wrangler.includes(`"${ordinaryStatic}"`), false, `${ordinaryStatic} should use Static Assets asset-first delivery`);
  }
});
