import { d1SchemaReady } from './d1-schema-readiness.js';
const ACCOUNT_ID = 'coupang-ekodibiz';
const STOREFRONT = 'ekodi-mall';
const NAVER_TREND_URL = 'https://naverapihub.apigw.ntruss.com/search-trend/v1/search';
const MAX_PRODUCTS = 60;
const MAX_TREND_CATEGORIES = 15;

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round1 = value => Math.round((Number(value) || 0) * 10) / 10;
function safeJson(value, fallback = {}) { try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); } }
function kstParts(date = new Date()) {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {date:shifted.toISOString().slice(0,10),month:shifted.getUTCMonth()+1,hour:shifted.getUTCHours()};
}
function addDays(dateText, delta) {
  const value = new Date(`${dateText}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0,10);
}
function ratioMomentum(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev <= 0) return cur > 0 ? 1 : 0;
  return clamp((cur - prev) / prev, -1, 3);
}

const SEASON_KEYWORDS = Object.freeze({
  1:['겨울','보온','난방','가습','설날','선물'],
  2:['겨울','졸업','입학','신학기','선물'],
  3:['신학기','개강','봄','자취','정리','청소'],
  4:['봄','미세먼지','청소','캠핑','나들이'],
  5:['가정의달','선물','어버이','어린이','캠핑'],
  6:['여름','장마','제습','선풍기','냉방'],
  7:['여름','장마','휴가','캠핑','선풍기','제습'],
  8:['여름','휴가','개학','선풍기','냉방'],
  9:['추석','선물','가을','개강','자취','학습'],
  10:['가을','캠핑','환절기','보온','선물'],
  11:['겨울','난방','보온','수능','선물'],
  12:['겨울','크리스마스','연말','선물','난방','보온'],
});

export function seasonalDemandScore(product, month = kstParts().month) {
  const haystack = `${clean(product?.category,120)} ${clean(product?.product_name,200)}`.toLowerCase();
  const keywords = SEASON_KEYWORDS[Number(month)] || [];
  const matches = keywords.filter(keyword => haystack.includes(keyword.toLowerCase())).length;
  return clamp(matches * 3.5, 0, 10);
}

export function scoreOpportunity(input = {}) {
  const clicks7d = Number(input.clicks7d || 0);
  const clicksPrev7d = Number(input.clicksPrev7d || 0);
  const trendMomentum = clamp(input.trendMomentum, -1, 3);
  const internalMomentum = ratioMomentum(clicks7d, clicksPrev7d);
  const orders30d = Math.max(0, Number(input.orders30d || 0));
  const cancels30d = Math.max(0, Number(input.cancels30d || 0));
  const commission30d = Math.max(0, Number(input.commission30d || 0));
  const reportedClicks30d = Math.max(0, Number(input.reportedClicks30d || 0));
  const netOrders = Math.max(0, orders30d - cancels30d);
  const conversion = reportedClicks30d > 0 ? netOrders / reportedClicks30d : 0;
  const selectionScore = clamp(input.selectionScore,0,100);

  const demandScore = clamp(12 + Math.max(0, trendMomentum) * 12 + Math.min(clicks7d,20) * 0.6,0,30);
  const momentumScore = clamp(8 + internalMomentum * 8,0,20);
  const performanceScore = clamp(
    Math.min(netOrders,5) * 2.4 + Math.min(commission30d / 1000,8) * 1.1 + Math.min(conversion * 100,8) * 0.8,
    0,25,
  );
  const productScore = clamp(selectionScore * 0.1 + (input.isRocket ? 2.5 : 0) + (input.isFreeShipping ? 2.5 : 0),0,15);
  const seasonScore = clamp(input.seasonScore,0,10);
  const explorationScore = clicks7d === 0 && selectionScore >= 70 ? 5 : clicks7d <= 2 && selectionScore >= 60 ? 3 : 1;
  const total = clamp(demandScore + momentumScore + performanceScore + productScore + seasonScore + explorationScore,0,100);

  let action = 'hold';
  if (total >= 78) action = 'scale';
  else if (total >= 62) action = 'test';
  else if (total >= 45) action = 'observe';

  return {
    opportunityScore:round1(total),
    demandScore:round1(demandScore),
    momentumScore:round1(momentumScore),
    performanceScore:round1(performanceScore),
    productScore:round1(productScore),
    seasonScore:round1(seasonScore),
    explorationScore:round1(explorationScore),
    action,
    metrics:{clicks7d,clicksPrev7d,trendMomentum:round1(trendMomentum),internalMomentum:round1(internalMomentum),orders30d,cancels30d,netOrders,commission30d,reportedClicks30d,conversion:round1(conversion * 100)},
  };
}

function naverConfigured(env) {
  return Boolean(env.NAVER_API_HUB_CLIENT_ID && env.NAVER_API_HUB_CLIENT_SECRET);
}
function keywordForCategory(category) {
  return clean(category || '생활용품',40).replace(/[>|/]/g,' ').replace(/\s+/g,' ').trim() || '생활용품';
}
function chunks(values, size) {
  const result = [];
  for (let index=0; index<values.length; index += size) result.push(values.slice(index,index+size));
  return result;
}
function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum,value) => sum + (Number(value)||0),0) / values.length;
}

async function fetchNaverCategoryTrends(env, categories, runDate) {
  if (!naverConfigured(env) || !categories.length) return {status:'credentials_required',signals:new Map()};
  const signals = new Map();
  const startDate = addDays(runDate,-13);
  for (const group of chunks(categories.slice(0,MAX_TREND_CATEGORIES),5)) {
    const keywordGroups = group.map(category => ({groupName:category,keywords:[keywordForCategory(category)]}));
    const response = await fetch(NAVER_TREND_URL,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'X-NCP-APIGW-API-KEY-ID':String(env.NAVER_API_HUB_CLIENT_ID),
        'X-NCP-APIGW-API-KEY':String(env.NAVER_API_HUB_CLIENT_SECRET),
      },
      body:JSON.stringify({startDate,endDate:runDate,timeUnit:'date',keywordGroups}),
    });
    if (!response.ok) throw new Error(`NAVER_TREND_HTTP_${response.status}`);
    const payload = await response.json().catch(() => ({}));
    for (const result of payload.results || []) {
      const rows = Array.isArray(result.data) ? result.data : [];
      const previous = average(rows.slice(0,7).map(row => row.ratio));
      const current = average(rows.slice(-7).map(row => row.ratio));
      signals.set(clean(result.title,80),{current,previous,momentum:ratioMomentum(current,previous),raw:rows.slice(-14)});
    }
  }
  return {status:'ok',signals};
}

async function schemaReady(env) { return d1SchemaReady(env?.DB,['affiliate_storefront_products','affiliate_storefront_clicks','affiliate_demand_signals','affiliate_product_performance_daily','affiliate_growth_opportunities','affiliate_growth_strategy_runs']); }

async function loadProducts(env) {
  const result = await env.DB.prepare(`SELECT p.id,p.product_id,p.product_name,p.price_krw,p.category,p.selection_score,p.is_rocket,p.is_free_shipping,
      COALESCE(c.clicks_7d,0) AS clicks_7d,COALESCE(c.clicks_prev_7d,0) AS clicks_prev_7d,
      COALESCE(m.reported_clicks_30d,0) AS reported_clicks_30d,COALESCE(m.orders_30d,0) AS orders_30d,
      COALESCE(m.cancels_30d,0) AS cancels_30d,COALESCE(m.commission_30d,0) AS commission_30d
    FROM affiliate_storefront_products p
    LEFT JOIN (
      SELECT product_row_id,
        SUM(CASE WHEN click_date >= date('now','-6 day') THEN clicks ELSE 0 END) AS clicks_7d,
        SUM(CASE WHEN click_date BETWEEN date('now','-13 day') AND date('now','-7 day') THEN clicks ELSE 0 END) AS clicks_prev_7d
      FROM affiliate_storefront_clicks WHERE click_date >= date('now','-13 day') GROUP BY product_row_id
    ) c ON c.product_row_id=p.id
    LEFT JOIN (
      SELECT product_row_id,SUM(clicks) AS reported_clicks_30d,SUM(orders) AS orders_30d,SUM(cancels) AS cancels_30d,SUM(commission_krw) AS commission_30d
      FROM affiliate_product_performance_daily WHERE metric_date >= date('now','-29 day') GROUP BY product_row_id
    ) m ON m.product_row_id=p.id
    WHERE p.account_id=? AND p.storefront_slug=? AND p.status='active'
    ORDER BY COALESCE(c.clicks_7d,0) DESC,p.selection_score DESC,p.id DESC
    LIMIT ?`).bind(ACCOUNT_ID,STOREFRONT,MAX_PRODUCTS).all();
  return result.results || [];
}

function campaignAngle(product, scored, trend) {
  const category = clean(product.category || '생활',40);
  if (scored.performanceScore >= 12) return `${category} 실제 전환 검증형 비교·추천`;
  if ((trend?.momentum || 0) >= 0.25) return `${category} 검색수요 상승 대응형 구매가이드`;
  if (scored.momentumScore >= 13) return `${category} 최근 관심상승 문제해결형 콘텐츠`;
  if (scored.seasonScore >= 3.5) return `${category} 시즌 수요 선점형 큐레이션`;
  if (scored.explorationScore >= 5) return `${category} 신규 수요 탐색형 테스트`;
  return `${category} 실용 비교형 추천`;
}

async function recordDemandSignal(env, runDate, source, key, category, values, score, evidence={}) {
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO affiliate_demand_signals(observed_date,source,signal_key,category,current_value,previous_value,momentum,signal_score,evidence_json,observed_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(observed_date,source,signal_key) DO UPDATE SET category=excluded.category,current_value=excluded.current_value,previous_value=excluded.previous_value,momentum=excluded.momentum,signal_score=excluded.signal_score,evidence_json=excluded.evidence_json,observed_at=excluded.observed_at,expires_at=excluded.expires_at`)
    .bind(runDate,source,clean(key,160),clean(category,120),Number(values.current||0),Number(values.previous||0),Number(values.momentum||0),Number(score||0),safeJson(evidence),now,`${addDays(runDate,2)}T14:59:59Z`).run();
}

async function upsertOpportunity(env, runDate, product, scored, trend) {
  const now = nowIso();
  const angle = campaignAngle(product,scored,trend);
  await env.DB.prepare(`INSERT INTO affiliate_growth_opportunities(run_date,product_row_id,product_id,opportunity_score,demand_score,momentum_score,performance_score,product_score,season_score,exploration_score,recommended_action,campaign_angle,signal_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(run_date,product_row_id) DO UPDATE SET product_id=excluded.product_id,opportunity_score=excluded.opportunity_score,demand_score=excluded.demand_score,momentum_score=excluded.momentum_score,performance_score=excluded.performance_score,product_score=excluded.product_score,season_score=excluded.season_score,exploration_score=excluded.exploration_score,recommended_action=excluded.recommended_action,campaign_angle=excluded.campaign_angle,signal_json=excluded.signal_json,updated_at=excluded.updated_at`)
    .bind(runDate,Number(product.id),clean(product.product_id,100),scored.opportunityScore,scored.demandScore,scored.momentumScore,scored.performanceScore,scored.productScore,scored.seasonScore,scored.explorationScore,scored.action,angle,safeJson({metrics:scored.metrics,naverTrend:trend||null,priceKrw:Number(product.price_krw||0),category:clean(product.category,120)}),now,now).run();
  return {...scored,angle,productRowId:Number(product.id),productId:clean(product.product_id,100),productName:clean(product.product_name,160),category:clean(product.category,120)};
}

async function writeStrategyRun(env, values) {
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO affiliate_growth_strategy_runs(run_date,reason,status,source_status_json,candidates,scale_count,test_count,observe_count,hold_count,top_product_row_id,top_opportunity_score,last_error,started_at,completed_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(run_date) DO UPDATE SET reason=excluded.reason,status=excluded.status,source_status_json=excluded.source_status_json,candidates=excluded.candidates,scale_count=excluded.scale_count,test_count=excluded.test_count,observe_count=excluded.observe_count,hold_count=excluded.hold_count,top_product_row_id=excluded.top_product_row_id,top_opportunity_score=excluded.top_opportunity_score,last_error=excluded.last_error,completed_at=excluded.completed_at,updated_at=excluded.updated_at`)
    .bind(values.runDate,clean(values.reason,80),clean(values.status,30),safeJson(values.sources||{}),Number(values.candidates||0),Number(values.scale||0),Number(values.test||0),Number(values.observe||0),Number(values.hold||0),values.topProductRowId?Number(values.topProductRowId):null,Number(values.topScore||0),clean(values.error,1000),values.startedAt||now,values.completedAt||null,now).run();
}

export async function runMallSalesIntelligence(env,{reason='cron',force=false}={}) {
  if (!(await schemaReady(env))) return {ok:false,status:'schema_required'};
  const kst = kstParts();
  const existing = await env.DB.prepare('SELECT status,completed_at FROM affiliate_growth_strategy_runs WHERE run_date=?').bind(kst.date).first().catch(() => null);
  if (!force && existing?.status === 'completed') return {ok:true,status:'already_done',runDate:kst.date};
  const startedAt = nowIso();
  await writeStrategyRun(env,{runDate:kst.date,reason,status:'running',startedAt});
  try {
    const products = await loadProducts(env);
    if (!products.length) {
      await writeStrategyRun(env,{runDate:kst.date,reason,status:'completed',sources:{internal:'empty'},candidates:0,startedAt,completedAt:nowIso()});
      return {ok:true,status:'no_products',runDate:kst.date};
    }
    const categories = [...new Set(products.map(row => clean(row.category,80)).filter(Boolean))];
    let naver = {status:'credentials_required',signals:new Map()};
    try { naver = await fetchNaverCategoryTrends(env,categories,kst.date); }
    catch (error) { naver = {status:'error',error:clean(error?.message||error,300),signals:new Map()}; }

    const ranked = [];
    for (const product of products) {
      const category = clean(product.category,80);
      const trend = naver.signals.get(category) || null;
      const seasonScore = seasonalDemandScore(product,kst.month);
      const scored = scoreOpportunity({
        clicks7d:product.clicks_7d,
        clicksPrev7d:product.clicks_prev_7d,
        trendMomentum:trend?.momentum || 0,
        orders30d:product.orders_30d,
        cancels30d:product.cancels_30d,
        commission30d:product.commission_30d,
        reportedClicks30d:product.reported_clicks_30d,
        selectionScore:product.selection_score,
        isRocket:Number(product.is_rocket||0)===1,
        isFreeShipping:Number(product.is_free_shipping||0)===1,
        seasonScore,
      });
      ranked.push(await upsertOpportunity(env,kst.date,product,scored,trend));
      await recordDemandSignal(env,kst.date,'internal',`product:${product.id}`,category,{current:Number(product.clicks_7d||0),previous:Number(product.clicks_prev_7d||0),momentum:scored.metrics.internalMomentum},scored.momentumScore,{productId:clean(product.product_id,100)});
      if (seasonScore > 0) await recordDemandSignal(env,kst.date,'seasonal',`product:${product.id}`,category,{current:seasonScore,previous:0,momentum:seasonScore/10},seasonScore,{month:kst.month});
    }
    for (const [category,trend] of naver.signals.entries()) {
      await recordDemandSignal(env,kst.date,'naver_search_trend',`category:${category}`,category,trend,clamp(10 + Math.max(0,trend.momentum)*20,0,30),{windowDays:14});
    }
    ranked.sort((a,b) => b.opportunityScore - a.opportunityScore);
    const counts = {scale:0,test:0,observe:0,hold:0};
    ranked.forEach(row => { counts[row.action] = (counts[row.action]||0)+1; });
    const top = ranked[0] || null;
    const degraded = naver.status === 'error';
    await writeStrategyRun(env,{runDate:kst.date,reason,status:degraded?'degraded':'completed',sources:{internal:'ok',naverSearchTrend:naver.status,productPerformance:'ready'},candidates:ranked.length,...counts,topProductRowId:top?.productRowId,topScore:top?.opportunityScore,startedAt,completedAt:nowIso(),error:naver.error||''});
    return {ok:true,status:degraded?'degraded':'completed',runDate:kst.date,sources:{internal:'ok',naverSearchTrend:naver.status},candidates:ranked.length,counts,top:top?{productRowId:top.productRowId,productName:top.productName,score:top.opportunityScore,action:top.action,angle:top.angle}:null};
  } catch (error) {
    const message = clean(error?.message||error,1000);
    await writeStrategyRun(env,{runDate:kst.date,reason,status:'failed',sources:{internal:'error'},startedAt,completedAt:nowIso(),error:message}).catch(() => {});
    return {ok:false,status:'failed',runDate:kst.date,error:message};
  }
}

export async function getMallSalesIntelligenceStatus(env) {
  if (!(await schemaReady(env))) return {enabled:true,schemaReady:false,status:'schema_required'};
  const kst = kstParts();
  const [run,top] = await Promise.all([
    env.DB.prepare('SELECT run_date,status,source_status_json,candidates,scale_count,test_count,observe_count,hold_count,top_opportunity_score,last_error,completed_at FROM affiliate_growth_strategy_runs ORDER BY run_date DESC LIMIT 1').first().catch(() => null),
    env.DB.prepare(`SELECT o.product_row_id,o.product_id,o.opportunity_score,o.recommended_action,o.campaign_angle,p.product_name,p.category
      FROM affiliate_growth_opportunities o JOIN affiliate_storefront_products p ON p.id=o.product_row_id
      WHERE o.run_date=? ORDER BY o.opportunity_score DESC,o.id DESC LIMIT 5`).bind(kst.date).all().catch(() => ({results:[]})),
  ]);
  return {
    enabled:true,
    schemaReady:true,
    mode:'active_sales',
    paidAds:false,
    naverSearchTrend:{configured:naverConfigured(env),provider:'NAVER API HUB'},
    lastRun:run?{date:run.run_date,status:run.status,sources:(()=>{try{return JSON.parse(run.source_status_json||'{}')}catch{return{}}})(),candidates:Number(run.candidates||0),scale:Number(run.scale_count||0),test:Number(run.test_count||0),observe:Number(run.observe_count||0),hold:Number(run.hold_count||0),topScore:Number(run.top_opportunity_score||0),error:run.last_error||'',completedAt:run.completed_at||null}:null,
    topOpportunities:(top.results||[]).map(row => ({productRowId:Number(row.product_row_id),productId:row.product_id,productName:row.product_name,category:row.category,score:Number(row.opportunity_score||0),action:row.recommended_action,angle:row.campaign_angle})),
  };
}

export const MALL_SALES_INTELLIGENCE_DEFAULTS = Object.freeze({accountId:ACCOUNT_ID,storefront:STOREFRONT,maxProducts:MAX_PRODUCTS,maxTrendCategories:MAX_TREND_CATEGORIES,naverTrendUrl:NAVER_TREND_URL});
