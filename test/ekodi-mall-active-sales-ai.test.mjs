import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scoreOpportunity, seasonalDemandScore, MALL_SALES_INTELLIGENCE_DEFAULTS } from '../mall-sales-intelligence.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('high demand and proven conversion outrank passive inventory', () => {
  const strong = scoreOpportunity({
    clicks7d:18,clicksPrev7d:6,trendMomentum:0.6,orders30d:5,cancels30d:0,
    commission30d:24000,reportedClicks30d:80,selectionScore:88,isRocket:true,isFreeShipping:true,seasonScore:7,
  });
  const weak = scoreOpportunity({
    clicks7d:1,clicksPrev7d:2,trendMomentum:-0.2,orders30d:0,cancels30d:0,
    commission30d:0,reportedClicks30d:10,selectionScore:55,isRocket:false,isFreeShipping:false,seasonScore:0,
  });
  assert.ok(strong.opportunityScore > weak.opportunityScore);
  assert.equal(strong.action,'scale');
  assert.ok(['observe','hold'].includes(weak.action));
});

test('high-quality zero-click products retain controlled exploration budget', () => {
  const result = scoreOpportunity({clicks7d:0,clicksPrev7d:0,selectionScore:82,seasonScore:0});
  assert.equal(result.explorationScore,5);
  assert.ok(result.opportunityScore > 0);
});

test('September season logic recognizes Chuseok and semester demand', () => {
  assert.ok(seasonalDemandScore({product_name:'추석 부모님 선물세트',category:'선물'},9) > 0);
  assert.ok(seasonalDemandScore({product_name:'개강 자취 멀티탭',category:'생활'},9) > 0);
  assert.equal(seasonalDemandScore({product_name:'일반 테스트',category:'기타'},9),0);
});

test('sales intelligence is product-first, revenue-ready and Naver API HUB aware', async () => {
  const worker = await read('mall-sales-intelligence.js');
  const migration = await read('migrations/0049_ekodi_mall_active_sales_ai.sql');
  assert.equal(MALL_SALES_INTELLIGENCE_DEFAULTS.storefront,'ekodi-mall');
  assert.match(worker,/naverapihub\.apigw\.ntruss\.com\/search-trend\/v1\/search/);
  assert.match(worker,/X-NCP-APIGW-API-KEY-ID/);
  assert.match(worker,/affiliate_growth_opportunities/);
  assert.match(worker,/affiliate_product_performance_daily/);
  assert.match(migration,/commission_krw/);
  assert.match(migration,/recommended_action/);
  assert.doesNotMatch(migration,/(email|phone|name|address)\s+TEXT/i);
});

test('only bounded actions can be emitted', () => {
  const actions = [
    scoreOpportunity({selectionScore:95,trendMomentum:1,clicks7d:30,orders30d:8,reportedClicks30d:80,commission30d:40000,seasonScore:10}).action,
    scoreOpportunity({selectionScore:70,clicks7d:3,clicksPrev7d:1,seasonScore:4}).action,
    scoreOpportunity({selectionScore:40}).action,
  ];
  for (const action of actions) assert.ok(['scale','test','observe','hold'].includes(action));
});

test('sales intelligence reports real product performance freshness', async () => {
  const worker = await read('mall-sales-intelligence.js');
  assert.match(worker,/productPerformanceStatus/);
  assert.match(worker,/latestMetricDate/);
  assert.match(worker,/'empty'/);
  assert.match(worker,/'stale'/);
  assert.match(worker,/productPerformance:performanceStatus\.status/);
  assert.match(worker,/syncFirstPartyProductPerformance/);
  assert.match(worker,/ekodi_first_party/);
  assert.match(worker,/engagement_only/);
  assert.match(worker,/firstPartyClicks30d/);
});