import { d1SchemaReady } from './d1-schema-readiness.js';
import { ensureWeeklyPromotionBoard } from './mall-official-promotion-board.js';
import { mallPromotionAutomationEnabled, runMallPromotionAutomation } from './mall-promotion-automation.js';
import { runMallSalesIntelligence } from './mall-sales-intelligence.js';

const MALL_SUBJECT_TYPE = 'tenant';
const MALL_SUBJECT_KEY = 'ekodimall';

const TABLES = Object.freeze([
  'affiliate_storefront_products',
  'affiliate_recommendation_runs',
  'affiliate_partner_report_runs',
  'affiliate_product_performance_daily',
  'affiliate_growth_strategy_runs',
  'affiliate_growth_opportunities',
  'affiliate_promotion_runs',
  'marketing_oauth_connections',
  'marketing_publish_policies',
  'service_subscriptions',
]);

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const n = value => Number(value || 0);
const ageHours = value => {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 3600000) : Infinity;
};
const kstDate = (date = new Date()) => new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);

export const MALL_AUTONOMOUS_PROFIT_LOOP = Object.freeze({
  version: '1.0',
  mode: 'distributed-closed-loop',
  stages: ['source','feedback','intelligence','curate','publish','learn'],
  sourcingFreshHours: 6,
  feedbackFreshHours: 54,
  paidAdsAutonomous: false,
  customerPiiLearning: false,
  subject: `${MALL_SUBJECT_TYPE}:${MALL_SUBJECT_KEY}`,
});
export function classifyMallAutonomousProfitLoop(input = {}) {
  const stages = input.stages || {};
  const source = stages.source || {};
  const feedback = stages.feedback || {};
  const intelligence = stages.intelligence || {};
  const publish = stages.publish || {};
  const economics = input.economics || {};
  const blockers = [];

  if (source.status === 'setup_required' || source.status === 'failed') blockers.push('sourcing');
  if (['connection_required','approval_required','disabled'].includes(publish.status)) blockers.push('publishing');
  if (publish.failed > 0 && publish.published === 0) blockers.push('publication_failure');

  const stale = [];
  if (!source.fresh) stale.push('sourcing');
  if (!feedback.fresh) stale.push('feedback');
  if (!intelligence.fresh) stale.push('intelligence');

  let state = 'operating';
  if (blockers.length) state = 'blocked';
  else if (stale.length || intelligence.status === 'degraded') state = 'degraded';
  else if (n(economics.orders30d) === 0 && n(economics.commission30dKrw) === 0) state = 'learning';
  else if (['scale','test'].includes(clean(input.topAction,20))) state = 'compounding';

  const nextAction = blockers.length
    ? `repair:${blockers[0]}`
    : stale.length ? `refresh:${stale[0]}`
    : state === 'learning' ? 'explore-and-learn'
    : state === 'compounding' ? `execute:${clean(input.topAction,20) || 'scale'}`
    : 'continue-observe-learn';

  return { state, blockers, stale, nextAction };
}
export async function getMallAutonomousProfitLoopStatus(env) {
  if (!(await d1SchemaReady(env?.DB, TABLES))) {
    return { ok:false, schemaReady:false, state:'schema_required', policy:MALL_AUTONOMOUS_PROFIT_LOOP };
  }
  const today = kstDate();
  const [source, report, performance, intelligence, promotion, top, connections, policy, subscription] = await Promise.all([
    env.DB.prepare(`SELECT status,finished_at,selected_count,candidate_count,error_text FROM affiliate_recommendation_runs WHERE storefront_slug='ekodi-mall' ORDER BY id DESC LIMIT 1`).first().catch(() => null),
    env.DB.prepare(`SELECT status,sync_date,finished_at,matched_product_rows,unmatched_product_rows,error_text FROM affiliate_partner_report_runs WHERE account_id='coupang-ekodibiz' ORDER BY sync_date DESC,id DESC LIMIT 1`).first().catch(() => null),
    env.DB.prepare(`SELECT MAX(metric_date) AS latest_metric_date,COALESCE(SUM(orders),0) AS orders_30d,COALESCE(SUM(cancels),0) AS cancels_30d,COALESCE(SUM(commission_krw),0) AS commission_30d FROM affiliate_product_performance_daily WHERE metric_date>=date('now','-29 day')`).first().catch(() => null),
    env.DB.prepare(`SELECT run_date,status,candidates,scale_count,test_count,observe_count,hold_count,completed_at,last_error FROM affiliate_growth_strategy_runs ORDER BY run_date DESC LIMIT 1`).first().catch(() => null),
    env.DB.prepare(`SELECT COUNT(*) AS attempts,SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,SUM(CASE WHEN status='approval_required' THEN 1 ELSE 0 END) AS approval_required,MAX(updated_at) AS updated_at FROM affiliate_promotion_runs WHERE run_date=?`).bind(today).first().catch(() => null),
    env.DB.prepare(`SELECT recommended_action,opportunity_score,product_row_id FROM affiliate_growth_opportunities WHERE run_date=? ORDER BY opportunity_score DESC,id DESC LIMIT 1`).bind(today).first().catch(() => null),
    env.DB.prepare(`SELECT COUNT(*) AS active_social FROM marketing_oauth_connections WHERE subject_type=? AND subject_key=? AND status='active' AND provider IN ('facebook','instagram','threads')`).bind(MALL_SUBJECT_TYPE,MALL_SUBJECT_KEY).first().catch(() => null),
    env.DB.prepare(`SELECT mode,max_daily_posts FROM marketing_publish_policies WHERE subject_type=? AND subject_key=?`).bind(MALL_SUBJECT_TYPE,MALL_SUBJECT_KEY).first().catch(() => null),
    env.DB.prepare(`SELECT plan_id,status FROM service_subscriptions WHERE subject_type=? AND subject_key=? AND site='marketing'`).bind(MALL_SUBJECT_TYPE,MALL_SUBJECT_KEY).first().catch(() => null),
  ]);

  const sourceAge = ageHours(source?.finished_at);
  const reportAge = ageHours(report?.finished_at);
  const metricAge = ageHours(performance?.latest_metric_date ? `${performance.latest_metric_date}T14:59:59Z` : '');
  const intelligenceAge = ageHours(intelligence?.completed_at);
  const socialReady = n(connections?.active_social) > 0;
  const autonomousReady = policy?.mode === 'autonomous' && subscription?.status === 'active' && ['auto','enterprise'].includes(subscription?.plan_id);
  const stages = {
    source: {
      status: clean(source?.status || 'not_run',40),
      fresh: sourceAge <= MALL_AUTONOMOUS_PROFIT_LOOP.sourcingFreshHours,
      ageHours: Number.isFinite(sourceAge) ? Math.round(sourceAge * 10) / 10 : null,
      selected: n(source?.selected_count), candidates: n(source?.candidate_count), error: clean(source?.error_text,300),
    },
    feedback: {
      status: clean(report?.status || (performance?.latest_metric_date ? 'observed' : 'not_run'),40),
      fresh: reportAge <= MALL_AUTONOMOUS_PROFIT_LOOP.feedbackFreshHours || metricAge <= MALL_AUTONOMOUS_PROFIT_LOOP.feedbackFreshHours,
      ageHours: Number.isFinite(reportAge) ? Math.round(reportAge * 10) / 10 : null,
      syncDate: report?.sync_date || null, matchedProducts: n(report?.matched_product_rows), unmatchedProducts: n(report?.unmatched_product_rows), error: clean(report?.error_text,300),
    },
    intelligence: {
      status: clean(intelligence?.status || 'not_run',40),
      fresh: intelligence?.run_date === today && intelligenceAge <= 30,
      ageHours: Number.isFinite(intelligenceAge) ? Math.round(intelligenceAge * 10) / 10 : null,
      candidates: n(intelligence?.candidates), scale: n(intelligence?.scale_count), test: n(intelligence?.test_count), observe: n(intelligence?.observe_count), hold: n(intelligence?.hold_count), error: clean(intelligence?.last_error,300),
    },
    publish: {
      status: !mallPromotionAutomationEnabled(env) ? 'disabled' : !socialReady ? 'connection_required' : !autonomousReady || n(promotion?.approval_required) > 0 ? 'approval_required' : n(promotion?.failed) > 0 && n(promotion?.published) === 0 ? 'failed' : n(promotion?.published) > 0 ? 'published' : 'idle',
      fresh: Boolean(promotion?.updated_at) || n(promotion?.attempts) === 0,
      attempts: n(promotion?.attempts), published: n(promotion?.published), failed: n(promotion?.failed), updatedAt: promotion?.updated_at || null, socialReady, autonomousReady, maxDailyPosts:n(policy?.max_daily_posts), plan:clean(subscription?.plan_id,30),
    },
  };
  stages.curate = { status: top ? 'ranked' : 'waiting', fresh: intelligence?.run_date === today, topScore:n(top?.opportunity_score), topAction:clean(top?.recommended_action,20), productRowId:n(top?.product_row_id) };
  stages.learn = { status: performance?.latest_metric_date ? 'observing' : 'cold_start', fresh:Boolean(performance?.latest_metric_date), latestMetricDate:performance?.latest_metric_date || null };
  const economics = {
    orders30d:n(performance?.orders_30d),
    cancels30d:n(performance?.cancels_30d),
    commission30dKrw:n(performance?.commission_30d),
  };
  const classification = classifyMallAutonomousProfitLoop({ stages, economics, topAction:stages.curate.topAction });
  return {
    ok:true, schemaReady:true, generatedAt:new Date().toISOString(), date:today,
    ...classification,
    policy:MALL_AUTONOMOUS_PROFIT_LOOP,
    stages,
    economics,
    topAction:stages.curate.topAction || 'hold',
    autonomy:{ organicPublishing:true, paidAdsAutonomous:false, supplierRightsGate:true, piiTransferGate:true },
  };
}

export async function runMallAutonomousProfitLoop(env,{reason='shared-publishing-cron',force=false}={}) {
  const before = await getMallAutonomousProfitLoopStatus(env);
  const intelligence = await runMallSalesIntelligence(env,{reason,force});
  const weeklyBoard = await ensureWeeklyPromotionBoard(env,{reason,force:false});
  const promotion = mallPromotionAutomationEnabled(env)
    ? await runMallPromotionAutomation(env,{reason,force})
    : {ok:true,status:'disabled',reason:'promotion_safety_gate'};
  const after = await getMallAutonomousProfitLoopStatus(env);
  const boardReady = Boolean(weeklyBoard?.ok || weeklyBoard?.status === 'schema_required');
  const ok = Boolean(intelligence?.ok || intelligence?.status === 'schema_required') && boardReady && Boolean(promotion?.ok || promotion?.status === 'schema_required');
  return { ok, reason:clean(reason,80), before, intelligence, weeklyBoard, promotion, after };
}
