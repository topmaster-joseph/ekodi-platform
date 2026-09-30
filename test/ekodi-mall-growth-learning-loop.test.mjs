import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scorePromotionLearning } from '../mall-promotion-automation.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('proven funnel value can scale while revenue attribution stays estimated', () => {
  const result=scorePromotionLearning({opportunityScore:85,recommendedAction:'scale',selectionScore:90,visits30d:100,outboundClicks30d:40,productClicks30d:100,orders30d:10,cancels30d:1,commission30d:50000,posts30d:2,recentPosts7d:1});
  assert.equal(result.action,'scale');
  assert.equal(result.funnelRate,0.4);
  assert.equal(result.earningsPerClick,500);
  assert.equal(result.expectedCommissionPerVisit,200);
  assert.ok(result.confidenceScore >= 90);
});

test('cold-start exploration is bounded and high cancellation fails closed', () => {
  const cold=scorePromotionLearning({opportunityScore:35,recommendedAction:'hold',selectionScore:85});
  assert.equal(cold.action,'test');
  assert.equal(cold.reason,'cold_start_exploration');
  const risky=scorePromotionLearning({opportunityScore:95,recommendedAction:'scale',selectionScore:95,visits30d:80,outboundClicks30d:30,productClicks30d:60,orders30d:4,cancels30d:3,commission30d:30000,posts30d:2});
  assert.equal(risky.action,'hold');
  assert.equal(risky.reason,'high_cancel_rate');
});
test('Mall campaign survives landing to outbound click without storing customer PII', async () => {
  const [mall,promotion,migration,entry]=await Promise.all([
    read('mall.js'),read('mall-promotion-automation.js'),read('migrations/0072_ekodi_mall_growth_learning_loop.sql'),read('marketing-growth-entry.js'),
  ]);
  assert.match(mall,/recordPromotionOutbound/);
  assert.match(mall,/\/r\/mall\/outbound\//);
  assert.match(promotion,/affiliate_promotion_outbound_clicks/);
  assert.match(promotion,/campaign_key=\? AND product_row_id=\?/);
  assert.match(migration,/affiliate_growth_policy_snapshots/);
  assert.match(migration,/expected_commission_per_visit_krw/);
  assert.doesNotMatch(migration,/(email|phone|address)\s+TEXT/i);
  assert.match(entry,/runMallAutonomousProfitLoop/);
});
