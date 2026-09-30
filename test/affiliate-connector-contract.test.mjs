import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { handleAffiliateRequest } from '../affiliate-control.js';
import { getAffiliateAutomationStatus, runAffiliateAutomation } from '../coupang-partners-automation.js';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const [apiSource, automationSource, entrySource, adminSource, baseMigration, autoMigration] = await Promise.all([
  read('affiliate-control.js'),
  read('coupang-partners-automation.js'),
  read('customer-entry-worker.js'),
  read('marketing-funnel-admin.js'),
  read('migrations/0011_affiliate_connector.sql'),
  read('migrations/0047_ekodi_mall_auto_products.sql'),
]);

test('affiliate automation modules compile and connect', () => {
  assert.equal(typeof handleAffiliateRequest, 'function');
  assert.equal(typeof getAffiliateAutomationStatus, 'function');
  assert.equal(typeof runAffiliateAutomation, 'function');
  assert.doesNotThrow(() => new Function(adminSource));
  assert.match(entrySource, /handleAffiliateRequest/);
  assert.match(apiSource, /path === `\$\{PREFIX\}\/automation\/run`/);
});

test('base and automatic storefront schemas are additive', () => {
  for (const name of ['affiliate_providers', 'affiliate_accounts', 'affiliate_links', 'affiliate_daily_metrics']) assert.match(baseMigration, new RegExp(name));
  for (const name of ['affiliate_storefront_products', 'affiliate_storefront_clicks', 'affiliate_recommendation_runs', 'affiliate_automation_locks']) assert.match(autoMigration, new RegExp(name));
  assert.match(baseMigration, /coupang_partners/);
  assert.match(baseMigration, /coupang-ekodibiz/);
});

test('Coupang credentials stay server-side and HMAC signed API paths are present', () => {
  assert.match(automationSource, /COUPANG_PARTNERS_ACCESS_KEY/);
  assert.match(automationSource, /COUPANG_PARTNERS_SECRET_KEY/);
  assert.match(automationSource, /HmacSHA256/);
  assert.match(automationSource, /HMAC/);
  assert.match(automationSource, /\/products\/search/);
  assert.match(automationSource, /\/deeplink/);
  assert.doesNotMatch(apiSource, /COUPANG_PARTNERS_SECRET_KEY\s*[:=]\s*['"][^'"]+['"]/);
});

test('automatic selection works without a required AI provider', () => {
  assert.match(automationSource, /if \(!provider\.available\) return \{ mode: 'rules'/);
  assert.match(automationSource, /const mode = ai\?\.mode \|\| 'rules'/);
  assert.match(automationSource, /balancedRules/);
  assert.match(automationSource, /selectionSource/);
});

test('normal Coupang product URLs require partner-link issuance', () => {
  assert.match(automationSource, /host === 'link\.coupang\.com' \|\| host === 'coupa\.ng'/);
  assert.doesNotMatch(automationSource, /host\.endsWith\('\.coupang\.com'\).*return true/);
  assert.match(automationSource, /pending = ready\.filter\(item => !item\.affiliateUrl\)/);
  assert.match(automationSource, /issuePartnerLinks/);
});

test('automatic capabilities are exposed while manual operations remain compatibility-only', () => {
  assert.match(apiSource, /manualLinkRegistry\s*:\s*true/);
  assert.match(apiSource, /manualPerformanceLedger\s*:\s*true/);
  assert.match(apiSource, /automaticProductSearch\s*:\s*true/);
  assert.match(apiSource, /automaticDeepLink\s*:\s*true/);
  assert.match(apiSource, /automaticClickTracking\s*:\s*true/);
  assert.match(apiSource, /automaticPerformanceSync\s*:\s*false/);
});

test('public catalog has no generic affiliate fallback', () => {
  assert.doesNotMatch(apiSource, /cwWXWm/);
  assert.doesNotMatch(apiSource, /DEFAULT_AFFILIATE_URL/);
  assert.doesNotMatch(apiSource, /추천링크 클릭 후 검색하세요/);
  assert.match(apiSource, /automationStatus/);
  assert.match(apiSource, /products \}/);
});

test('public product click and image routes run before administrator authentication', () => {
  const authIndex = apiSource.indexOf('const auth = await sessionCheck');
  assert.ok(authIndex > 0);
  assert.ok(apiSource.indexOf('publicImage(request, env, url)') < authIndex);
  assert.ok(apiSource.indexOf('publicClick(request, env, url)') < authIndex);
  assert.match(apiSource, /상품을 찾을 수 없습니다/);
  assert.match(apiSource, /affiliate_storefront_clicks/);
});

test('affiliate performance ingestion closes product-level sales feedback safely', async () => {
  const control = await readFile(new URL('../affiliate-control.js', import.meta.url), 'utf8');
  assert.match(control,/\/performance/);
  assert.match(control,/affiliate_product_performance_daily/);
  assert.match(control,/coupang_partner_report/);
  assert.match(control,/coupang_partner_api/);
  assert.match(control,/manual_import/);
  assert.match(control,/affiliate\.performance\.upsert/);
  assert.doesNotMatch(control,/allowedSources.*ekodi_first_party/);
});
