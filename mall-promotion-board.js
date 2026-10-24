// EKODI-MALL-PROMOTION-BOARD-001: 에코디몰 자동 홍보 통합 상황판 데이터.
// 제휴(쿠팡 파트너스)·직접판매 게시, 오늘의 비규칙 일정, 14일 추이, 채널 연결 상태, 30일 퍼널을 한 번에 돌려준다.
import { d1SchemaReady } from './d1-schema-readiness.js';
import * as automation from './mall-promotion-automation.js';

const PROVIDERS = ['facebook', 'instagram', 'threads'];
const DAYS = 14;
const clean = (v, n = 240) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const parse = (t, f = {}) => { try { return JSON.parse(t); } catch { return f; } };

export function boardDates(today, days = DAYS) {
  const base = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(base - (days - 1 - i) * 864e5).toISOString().slice(0, 10));
}

export async function mallPromotionBoard(env, now = new Date()) {
  const kst = automation.kstParts(now);
  const dates = boardDates(kst.date);
  const since = dates[0];
  const directReady = await d1SchemaReady(env.DB, ['mall_direct_promotion_runs']).catch(() => false);
  const directUnion = directReady
    ? `UNION ALL SELECT run_date,provider,status,'direct' AS lane,product_name,external_post_url,published_at,updated_at,last_error,id FROM mall_direct_promotion_runs WHERE run_date>=?`
    : '';

  const [policy, connections, rows, funnel, products] = await Promise.all([
    env.DB.prepare("SELECT mode,max_daily_posts,allowed_providers_json FROM marketing_publish_policies WHERE subject_type='tenant' AND subject_key='ekodimall'").first().catch(() => null),
    env.DB.prepare("SELECT provider,display_name,status,token_expires_at,last_check_at,last_error FROM marketing_oauth_connections WHERE subject_type='tenant' AND subject_key='ekodimall' ORDER BY provider").all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT * FROM (
        SELECT r.run_date,r.provider,r.status,'affiliate' AS lane,COALESCE(p.product_name,'') AS product_name,r.external_post_url,r.published_at,r.updated_at,r.last_error,r.id
        FROM affiliate_promotion_runs r LEFT JOIN affiliate_storefront_products p ON p.id=r.product_row_id WHERE r.run_date>=?
        ${directUnion}) ORDER BY updated_at DESC`).bind(...(directReady ? [since, since] : [since])).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT
        (SELECT COALESCE(SUM(visits),0) FROM affiliate_promotion_visits WHERE visit_date>=date('now','-29 day')) AS visits,
        (SELECT COALESCE(SUM(clicks),0) FROM affiliate_promotion_outbound_clicks WHERE click_date>=date('now','-29 day')) AS outbound,
        (SELECT COALESCE(SUM(orders),0) FROM affiliate_product_performance_daily WHERE metric_date>=date('now','-29 day')) AS orders,
        (SELECT COALESCE(SUM(commission_krw),0) FROM affiliate_product_performance_daily WHERE metric_date>=date('now','-29 day')) AS commission`).first().catch(() => ({})),
    env.DB.prepare("SELECT COUNT(*) AS active FROM affiliate_storefront_products WHERE status='active'").first().catch(() => ({ active: 0 })),
  ]);

  const runs = rows.results || [];
  const series = dates.map(date => {
    const day = runs.filter(r => r.run_date === date && r.status === 'published');
    return { date, affiliate: day.filter(r => r.lane === 'affiliate').length, direct: day.filter(r => r.lane === 'direct').length,
      failed: runs.filter(r => r.run_date === date && r.status === 'failed').length };
  });
  const today = PROVIDERS.map(provider => {
    const slot = automation.irregularSlotMinute ? automation.irregularSlotMinute(kst.date, provider) : null;
    const lane = automation.promotionLane ? automation.promotionLane(kst.date, provider) : 'affiliate';
    const run = runs.find(r => r.run_date === kst.date && r.provider === provider);
    const state = run ? run.status : slot !== null && kst.minute < slot ? 'scheduled' : 'pending';
    return { provider, slotKst: slot === null ? '' : hhmm(slot), slotMinute: slot, lane: run?.lane || lane, state, url: clean(run?.external_post_url, 500), productName: clean(run?.product_name, 120) };
  });
  const channels = (connections.results || []).map(c => ({ provider: c.provider, name: clean(c.display_name, 80), status: c.status,
    expiresAt: c.token_expires_at || '', lastError: clean(c.last_error, 160),
    published14d: runs.filter(r => r.provider === c.provider && r.status === 'published').length }));
  const totals = series.reduce((a, d) => ({ affiliate: a.affiliate + d.affiliate, direct: a.direct + d.direct, failed: a.failed + d.failed }), { affiliate: 0, direct: 0, failed: 0 });

  return {
    ok: true, generatedAt: now.toISOString(), today: kst.date, nowMinute: kst.minute,
    policy: { mode: policy?.mode || 'missing', maxDailyPosts: num(policy?.max_daily_posts), providers: parse(policy?.allowed_providers_json, []) },
    totals, series, schedule: today, channels,
    funnel30d: { visits: num(funnel?.visits), outboundClicks: num(funnel?.outbound), orders: num(funnel?.orders), commissionKrw: num(funnel?.commission) },
    catalog: { affiliateActive: num(products?.active), directLaneReady: directReady },
    recent: runs.slice(0, 15).map(r => ({ date: r.run_date, provider: r.provider, lane: r.lane, status: r.status, productName: clean(r.product_name, 120), url: clean(r.external_post_url, 500), error: clean(r.last_error, 160) })),
  };
}
