import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { campaignKey, fallbackContent, kstParts, MALL_PROMOTION_DEFAULTS } from '../mall-promotion-automation.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('mall promotion stays first-party, organic and bounded', () => {
  assert.equal(MALL_PROMOTION_DEFAULTS.subjectKey, 'ekodibiz');
  assert.equal(MALL_PROMOTION_DEFAULTS.storefront, 'ekodi-mall');
  assert.deepEqual(MALL_PROMOTION_DEFAULTS.providers, ['facebook','instagram','threads']);
  assert.equal(MALL_PROMOTION_DEFAULTS.maxDailyChannels, 3);
  assert.equal(MALL_PROMOTION_DEFAULTS.strategy, 'opportunity_first');
  assert.match(MALL_PROMOTION_DEFAULTS.disclosure, /쿠팡 파트너스/);
});

test('campaign attribution is deterministic by KST date provider and product', () => {
  assert.equal(campaignKey('2026-09-01','instagram',42),'mall-20260901-instagram-42');
  assert.deepEqual(kstParts(new Date('2026-08-31T23:15:00Z')), {date:'2026-09-01',hour:8});
});

test('fallback content is useful, opportunity-aware and discloses first', () => {
  const content = fallbackContent({product_name:'테스트 상품',category:'생활',campaign_angle:'생활 검색수요 상승 대응형 구매가이드'},'facebook');
  assert.equal(content.mode,'rules');
  assert.match(content.caption,/^쿠팡 파트너스/);
  assert.match(content.caption,/테스트 상품/);
  assert.match(content.caption,/검색수요 상승/);
  assert.doesNotMatch(content.caption,/최저가|무조건|100%/);
});

test('runtime enforces autonomous entitlement and reuses encrypted OAuth vault', async () => {
  const worker = await read('mall-promotion-automation.js');
  assert.match(worker,/mode === 'autonomous'/);
  assert.match(worker,/\['auto'\s*,\s*'enterprise'\]/);
  assert.match(worker,/marketing_oauth_connections/);
  assert.match(worker,/token_ciphertext/);
  assert.match(worker,/AES-GCM/);
  assert.match(worker,/facebook/);
  assert.match(worker,/instagram/);
  assert.match(worker,/threads/);
  assert.match(worker,/affiliate_promotion_visits/);
  assert.match(worker,/affiliate_growth_opportunities/);
  assert.match(worker,/opportunity_score/);
  assert.doesNotMatch(worker,/ads_management|dailyBudget|spendKrw/);
});

test('migration scopes autonomous policy to internal EKODIBIZ and adds no plaintext provider token', async () => {
  const migration = await read('migrations/0048_ekodi_mall_promotion_automation.sql');
  assert.match(migration,/affiliate_promotion_runs/);
  assert.match(migration,/affiliate_promotion_visits/);
  assert.match(migration,/'tenant','ekodibiz','marketing','auto','active',0,'internal'/);
  assert.match(migration,/'tenant','ekodibiz','autonomous',3/);
  assert.doesNotMatch(migration,/(access_token|refresh_token|bearer_token)\s+TEXT/i);
});

test('growth entry preserves recovery logic while publishing scheduler owns the shared cron', async () => {
  const [entry, wrangler, publisher, publishConfig] = await Promise.all([read('marketing-growth-entry.js'), read('wrangler.marketing-growth.toml'), read('marketing-publishing-worker.js'), read('wrangler.marketing-publishing.toml')]);
  const intelligenceIndex = entry.indexOf('runMallSalesIntelligence');
  const promotionIndex = entry.lastIndexOf('runMallPromotionAutomation');
  assert.ok(intelligenceIndex >= 0);
  assert.ok(promotionIndex > intelligenceIndex);
  assert.match(entry,/mallSalesIntelligence/);
  assert.match(entry,/mallPromotionAutomation/);
  assert.match(entry,/scheduled\(_event, env, ctx\)/);
  assert.match(entry,/new Headers\(sourceHeaders \|\| \{\}\)/);
  assert.match(entry,/baseResponse\.status, baseResponse\.headers/);
  assert.match(wrangler,/main = "marketing-growth-entry.js"/);
  assert.doesNotMatch(wrangler,/crons\s*=/);
  assert.match(publishConfig,/crons = \["\* \* \* \* \*"\]/);
  assert.match(publisher,/runGrowthCycle/);
  assert.match(publisher,/getUTCMinutes\(\) === 5/);
});
