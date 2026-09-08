import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chooseWeeklyCandidates, isoWeekInfo, OFFICIAL_PROMOTION_DEFAULTS } from '../mall-official-promotion-board.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const product = (id,category,rank,orders=0,commission=0) => ({
  id,product_id:`p${id}`,product_name:`상품 ${id}`,category,provider_rank:rank,
  orders_30d:orders,cancels_30d:0,commission_30d:commission,
});

test('KST calendar maps Tuesday to A-slot 2 of ISO week', () => {
  const week=isoWeekInfo(new Date('2026-09-08T06:00:00Z'));
  assert.equal(week.weekKey,'2026-W37');
  assert.equal(week.startDate,'2026-09-07');
  assert.equal(week.endDate,'2026-09-13');
  assert.equal(week.daySlot,2);
});

test('official market direction outranks EKODI performance', () => {
  const signals=new Map([
    ['생활',{naver:{momentum:0.4}}],
    ['식품',{}],
  ]);
  const rows=[product(1,'생활',40,0,0),product(2,'식품',1,20,100000)];
  const result=chooseWeeklyCandidates(rows,signals,1,0);
  assert.equal(result.primary[0].id,1);
});
test('provider rank breaks ties before EKODI performance', () => {
  const signals=new Map([['생활',{naver:{momentum:0.2}}]]);
  const rows=[product(1,'생활',8,30,90000),product(2,'생활',2,0,0)];
  const result=chooseWeeklyCandidates(rows,signals,1,0);
  assert.equal(result.primary[0].id,2);
});

test('weekly board stays bounded at A7 and B10 with diverse primary categories', () => {
  const categories=['생활','식품','디지털','주방','건강','계절','패션','가구'];
  const rows=[];
  let id=1;
  for(const category of categories) for(let n=0;n<3;n+=1) rows.push(product(id++,category,n+1));
  const signals=new Map(categories.map(category=>[category,{naver:{momentum:0.2}}]));
  const result=chooseWeeklyCandidates(rows,signals);
  assert.equal(result.primary.length,7);
  assert.equal(result.backup.length,10);
  assert.equal(new Set([...result.primary,...result.backup].map(row=>row.id)).size,17);
  const counts=new Map();
  for(const row of result.primary) counts.set(row.category,(counts.get(row.category)||0)+1);
  assert.ok(Math.max(...counts.values())<=2);
});

test('implementation uses official APIs and keeps paid advertising outside the selector', async () => {
  const [worker,migration]=await Promise.all([read('mall-official-promotion-board.js'),read('migrations/0073_affiliate_official_signal_promotion.sql')]);
  assert.equal(OFFICIAL_PROMOTION_DEFAULTS.primaryLimit,7);
  assert.equal(OFFICIAL_PROMOTION_DEFAULTS.backupLimit,10);
  assert.match(worker,/naverapihub\.apigw\.ntruss\.com\/shopping\/v1\/categories/);
  assert.match(worker,/kosis\.kr\/openapi\/statisticsData\.do/);
  assert.match(worker,/official_signals_then_platform_rank_then_ekodi_tiebreak/);
  assert.match(migration,/affiliate_promotion_weekly_boards/);
  assert.match(migration,/affiliate_promotion_weekly_products/);
  assert.doesNotMatch(worker,/ads_management|dailyBudget|spendKrw/);
});
test('production growth deploy follows the official weekly-board contract', async () => {
  const workflow=await read('.github/workflows/deploy-marketing-growth.yml');
  assert.match(workflow,/mall-official-promotion-board\.js/);
  assert.match(workflow,/0073_affiliate_official_signal_promotion\.sql/);
  assert.match(workflow,/ekodi-mall-official-promotion-board\.test\.mjs/);
  assert.match(workflow,/strategy:'official_weekly_board'/);
  assert.match(workflow,/affiliate_official_market_signals/);
  assert.match(workflow,/affiliate_promotion_weekly_boards/);
  assert.match(workflow,/affiliate_promotion_weekly_products/);
  assert.match(workflow,/\"strategy\":\"official_weekly_board\"/);
  assert.match(workflow,/\"weeklyBoard\"/);
});
test('weekly board prepares independently from the external publishing master gate', async () => {
  const [worker,entry]=await Promise.all([read('marketing-growth-worker.js'),read('marketing-growth-entry.js')]);
  const workerBoard=worker.indexOf('ensureWeeklyPromotionBoard(this.env');
  const workerGate=worker.indexOf('mallPromotionAutomationEnabled(this.env)',workerBoard);
  assert.ok(workerBoard>=0 && workerGate>workerBoard);
  assert.match(worker,/intelligence,weeklyBoard,promotion/);
  const entryBoard=entry.indexOf('ensureWeeklyPromotionBoard(env');
  const entryGate=entry.indexOf('mallPromotionAutomationEnabled(env)',entryBoard);
  assert.ok(entryBoard>=0 && entryGate>entryBoard);
});
