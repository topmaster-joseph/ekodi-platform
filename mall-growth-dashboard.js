import { d1SchemaReady } from './d1-schema-readiness.js';
import { getMallAutonomousProfitLoopStatus } from './mall-autonomous-profit-loop.js';

const TABLES = [
  'affiliate_storefront_products',
  'affiliate_product_performance_daily',
  'affiliate_growth_policy_snapshots',
  'affiliate_growth_strategy_runs',
  'affiliate_promotion_runs',
  'affiliate_promotion_visits',
  'affiliate_promotion_outbound_clicks',
];

const n = value => Number(value || 0);
const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const safeParse = (value, fallback = {}) => {
  try { return JSON.parse(value || ''); } catch { return fallback; }
};

export async function mallGrowthDashboardSnapshot(env) {
  if (!(await d1SchemaReady(env?.DB, TABLES))) {
    return { ok:false, schemaReady:false, status:'schema_required' };
  }
  const [inventory, performance, today, visits, outbound, strategy, autonomousProfitLoop] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS active_products FROM affiliate_storefront_products WHERE status='active'").first(),
    env.DB.prepare(`SELECT COALESCE(SUM(clicks),0) AS clicks,COALESCE(SUM(orders),0) AS orders,
      COALESCE(SUM(cancels),0) AS cancels,COALESCE(SUM(gmv_krw),0) AS gmv_krw,
      COALESCE(SUM(commission_krw),0) AS commission_krw,MAX(metric_date) AS latest_metric_date
      FROM affiliate_product_performance_daily WHERE metric_date>=date('now','-29 day')`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS attempts,
      SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
      FROM affiliate_promotion_runs WHERE run_date=date('now','+9 hours')`).first(),
    env.DB.prepare("SELECT COALESCE(SUM(visits),0) AS total FROM affiliate_promotion_visits WHERE visit_date>=date('now','-29 day')").first(),
    env.DB.prepare("SELECT COALESCE(SUM(clicks),0) AS total FROM affiliate_promotion_outbound_clicks WHERE click_date>=date('now','-29 day')").first(),
    env.DB.prepare(`SELECT run_date,status,candidates,scale_count,test_count,observe_count,hold_count,
      top_opportunity_score,source_status_json,completed_at,last_error
      FROM affiliate_growth_strategy_runs ORDER BY run_date DESC LIMIT 1`).first(),
    getMallAutonomousProfitLoopStatus(env),
  ]);

  const latestPolicyDate = await env.DB.prepare('SELECT MAX(run_date) AS run_date FROM affiliate_growth_policy_snapshots').first();
  const policyDate = clean(latestPolicyDate?.run_date, 20);
  const decisionsResult = policyDate ? await env.DB.prepare(`SELECT s.provider,s.policy_score,s.recommended_action,
      s.visits_30d,s.outbound_clicks_30d,s.funnel_rate,s.orders_30d,s.cancels_30d,s.commission_30d_krw,
      s.earnings_per_click_krw,s.expected_commission_per_visit_krw,s.confidence_score,s.reason_json,
      p.id AS product_row_id,p.product_id,p.product_name,p.category
      FROM affiliate_growth_policy_snapshots s
      JOIN affiliate_storefront_products p ON p.id=s.product_row_id
      WHERE s.run_date=?
      ORDER BY CASE s.recommended_action WHEN 'scale' THEN 1 WHEN 'test' THEN 2 WHEN 'observe' THEN 3 ELSE 4 END,
      s.policy_score DESC LIMIT 16`).bind(policyDate).all() : { results:[] };

  const activityResult = await env.DB.prepare(`SELECT r.run_date,r.provider,r.status,r.published_at,r.updated_at,
      r.external_post_url,r.last_error,r.content_json,p.product_name,p.category
      FROM affiliate_promotion_runs r
      LEFT JOIN affiliate_storefront_products p ON p.id=r.product_row_id
      ORDER BY r.id DESC LIMIT 12`).all().catch(() => ({ results:[] }));

  const channelResult = await env.DB.prepare(`SELECT provider,
      SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
      MAX(published_at) AS last_published_at
      FROM affiliate_promotion_runs WHERE run_date>=date('now','-29 day') GROUP BY provider`).all().catch(() => ({ results:[] }));
  const decisions = (decisionsResult.results || []).map(row => {
    const reason = safeParse(row.reason_json, {});
    return {
      productRowId:n(row.product_row_id), productId:clean(row.product_id,100), productName:clean(row.product_name,240),
      category:clean(row.category,120), provider:clean(row.provider,40), action:clean(row.recommended_action,20),
      policyScore:n(row.policy_score), confidence:n(row.confidence_score), visits30d:n(row.visits_30d),
      outboundClicks30d:n(row.outbound_clicks_30d), funnelRate:n(row.funnel_rate), orders30d:n(row.orders_30d),
      cancels30d:n(row.cancels_30d), observedProductCommission30dKrw:n(row.commission_30d_krw),
      earningsPerClickKrw:n(row.earnings_per_click_krw), expectedCommissionPerVisitKrw:n(row.expected_commission_per_visit_krw),
      reason:clean(reason.reason || '',80), evidenceClass:'observed_funnel_plus_estimated_channel_value',
    };
  });

  const activity = (activityResult.results || []).map(row => {
    const content = safeParse(row.content_json, {});
    return { date:row.run_date, provider:row.provider, status:row.status, productName:row.product_name || '',
      category:row.category || '', action:content.recommendedAction || '', policyScore:n(content.policyScore),
      publishedAt:row.published_at || null, updatedAt:row.updated_at || null, postUrl:row.external_post_url || '',
      error:clean(row.last_error,300) };
  });
  const sources = safeParse(strategy?.source_status_json, {});
  const reportReady = Boolean(performance?.latest_metric_date);
  const topDecision = decisions.find(row => row.action === 'scale') || decisions.find(row => row.action === 'test') || decisions[0] || null;
  return {
    ok:true, schemaReady:true, status:'ready', generatedAt:new Date().toISOString(),
    evidence:{ revenue:'provider_product_report', channelRevenueAttribution:'estimated_not_causal', customerPiiStored:false },
    inventory:{ activeProducts:n(inventory?.active_products) },
    performance30d:{ reportReady, latestMetricDate:performance?.latest_metric_date || null, productClicks:n(performance?.clicks),
      orders:n(performance?.orders), cancels:n(performance?.cancels), gmvKrw:n(performance?.gmv_krw),
      observedCommissionKrw:n(performance?.commission_krw), campaignVisits:n(visits?.total), outboundAffiliateClicks:n(outbound?.total) },
    today:{ promotionAttempts:n(today?.attempts), published:n(today?.published), failed:n(today?.failed) },
    intelligence:{ date:strategy?.run_date || null, status:strategy?.status || 'not_run', candidates:n(strategy?.candidates),
      scale:n(strategy?.scale_count), test:n(strategy?.test_count), observe:n(strategy?.observe_count), hold:n(strategy?.hold_count),
      topScore:n(strategy?.top_opportunity_score), sources, completedAt:strategy?.completed_at || null, error:clean(strategy?.last_error,300) },
    policyDate:policyDate || null, decisions, topDecision, autonomousProfitLoop,
    channels:(channelResult.results || []).map(row => ({ provider:row.provider, published30d:n(row.published), failed30d:n(row.failed), lastPublishedAt:row.last_published_at || null })),
    activity,
  };
}
