import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { handleAffiliateRequest } from '../affiliate-control.js';

const apiSource = await readFile(new URL('../affiliate-control.js', import.meta.url), 'utf8');
const entrySource = await readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8');
const adminSource = await readFile(new URL('../marketing-funnel-admin.js', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../migrations/0011_affiliate_connector.sql', import.meta.url), 'utf8');

test('affiliate modules compile', () => {
  assert.equal(typeof handleAffiliateRequest, 'function');
  assert.doesNotThrow(() => new Function(adminSource));
});

test('affiliate schema and account are present', () => {
  for (const name of ['affiliate_providers', 'affiliate_accounts', 'affiliate_links', 'affiliate_daily_metrics']) assert.match(migrationSource, new RegExp(name));
  assert.match(migrationSource, /coupang_partners/);
  assert.match(migrationSource, /coupang-ekodibiz/);
});

test('affiliate routes are connected', () => {
  assert.match(entrySource, /handleAffiliateRequest/);
  assert.match(entrySource, /\/api\/affiliate/);
  assert.match(apiSource, /sessionCheck/);
  assert.match(adminSource, /\/api\/affiliate\/overview/);
  assert.match(adminSource, /\/api\/affiliate\/accounts\/\$\{ACCOUNT\}/);
  assert.match(adminSource, /\/api\/affiliate\/links/);
  assert.match(adminSource, /\/api\/affiliate\/metrics/);
});

test('Integrations UI exposes Coupang account connection settings', () => {
  assert.match(adminSource, /Integrations/);
  assert.match(adminSource, /Coupang Partners/);
  assert.match(adminSource, /affiliateAccountForm/);
  assert.match(adminSource, /displayName/);
  assert.match(adminSource, /defaultChannel/);
  assert.match(adminSource, /disclosureText/);
  assert.match(adminSource, /계정 연결 설정 저장/);
  assert.match(adminSource, /Access Key, Secret Key/);
});

test('V1 reports manual and automatic capability states', () => {
  assert.match(apiSource, /manualLinkRegistry: true/);
  assert.match(apiSource, /manualPerformanceLedger: true/);
  assert.match(apiSource, /automaticProductSearch: false/);
  assert.match(apiSource, /automaticDeepLink: false/);
  assert.match(apiSource, /automaticPerformanceSync: false/);
});