import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [apiSource, entrySource, adminSource, buildSource, migrationSource] = await Promise.all([
  readFile(new URL('../affiliate-control.js', import.meta.url), 'utf8'),
  readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../affiliate-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0010_affiliate_connector.sql', import.meta.url), 'utf8'),
]);

test('affiliate connector uses a reusable provider/account/link/performance schema', () => {
  assert.match(migrationSource, /affiliate_providers/);
  assert.match(migrationSource, /affiliate_accounts/);
  assert.match(migrationSource, /affiliate_links/);
  assert.match(migrationSource, /affiliate_daily_metrics/);
  assert.match(migrationSource, /coupang_partners/);
  assert.match(migrationSource, /coupang-ekodibiz/);
});

test('shared API entry routes affiliate operations through the authenticated module', () => {
  assert.match(entrySource, /handleAffiliateRequest/);
  assert.match(entrySource, /path\.startsWith\('\/api\/affiliate'\)/);
  assert.match(apiSource, /sessionCheck/);
  assert.match(apiSource, /affiliate\.link\.create/);
  assert.match(apiSource, /affiliate\.metrics\.upsert/);
});

test('affiliate V1 exposes manual link and performance operations without pretending API automation is active', () => {
  assert.match(apiSource, /manualLinkRegistry: true/);
  assert.match(apiSource, /manualPerformanceLedger: true/);
  assert.match(apiSource, /automaticProductSearch: false/);
  assert.match(apiSource, /automaticDeepLink: false/);
  assert.match(apiSource, /automaticPerformanceSync: false/);
});

test('administrator UI never asks for or stores provider credentials', () => {
  assert.match(adminSource, /\/api\/affiliate\/overview/);
  assert.match(adminSource, /\/api\/affiliate\/links/);
  assert.match(adminSource, /\/api\/affiliate\/metrics/);
  assert.doesNotMatch(adminSource, /name=["'](?:access|secret|api)[_-]?(?:key|token)/i);
  assert.doesNotMatch(adminSource, /localStorage\.setItem\([^\n]*(?:secret|access|api.?key)/i);
});

test('production build ships affiliate Control Center assets', () => {
  assert.match(buildSource, /'affiliate-admin\.css'/);
  assert.match(buildSource, /'affiliate-admin\.js'/);
  assert.match(buildSource, /affiliate-admin\.css/);
  assert.match(buildSource, /affiliate-admin\.js/);
});
