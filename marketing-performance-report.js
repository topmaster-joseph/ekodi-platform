// EKODI AI Social Growth Phase 8 — 성과·수익 리포트(관리자 전용, 읽기 전용).
// GET /api/marketing/admin/performance?from=YYYY-MM-DD&to=YYYY-MM-DD (KST 날짜, 최대 120일)
//
// 수익은 절대 섞지 않는다.
// - estimatedKrw: tracking_code로 귀속되는 "추정" 제휴 수수료.
//     = 귀속 원장의 revenue_status='estimated' 금액 + (해당 콘텐츠의 제휴 클릭 × 기간 쿠팡 EPC)
//       EPC = 기간 쿠팡 보고 수수료 ÷ 기간 쿠팡 보고 클릭(둘 다 있을 때만). 계산 방식은 estimatedMethod로 함께 내려준다.
// - confirmedKrw: "확정" 금액.
//     = 귀속 원장의 revenue_status='confirmed' 금액 + 에코디몰 직접판매 결제 금액(환불 차감, Mall API 내부 조회와 주문 ID 조인).
//       쿠팡이 보고한 수수료는 게시물 단위로 귀속할 수 없으므로 채널·합계 수준의 unattributed(미귀속)로만 보여준다.
// - 성과 지표는 공급자 누적(lifetime) 값이므로 기간 안 가장 최근 수집값을 쓴다(provider_api > metricool > manual).
// - 콘텐츠 비용(content_cost_krw, 기본 0)과 ROI(비용이 있을 때만).
// - AI 추천 힌트: (확정+추정 매출) ÷ 조회수 → 참여율 순. 조회수만으로는 순위를 매기지 않는다.

export const PERFORMANCE_PATH = '/api/marketing/admin/performance';
export const COUPANG_METRICS_SOURCE = 'coupang_partner_api';
export const MALL_ORDERS_INTERNAL_PATH = '/api/internal/marketing/orders';
const MAX_RANGE_DAYS = 120;
const DEFAULT_RANGE_DAYS = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_PRIORITY = { provider_api:3, metricool:2, manual:1 };

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const int = value => { const n = Math.trunc(Number(value)); return Number.isFinite(n) ? n : 0; };
const kstDate = ms => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

export function resolveRange(fromValue, toValue, nowMs = Date.now()) {
  const to = DATE_RE.test(String(toValue || '')) ? String(toValue) : kstDate(nowMs);
  const from = DATE_RE.test(String(fromValue || '')) ? String(fromValue) : kstDate(Date.parse(`${to}T00:00:00Z`) - (DEFAULT_RANGE_DAYS - 1) * 86400_000);
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  if ((end - start) / 86400_000 > MAX_RANGE_DAYS) return null;
  return { from, to, startIso:new Date(start - 9 * 3600_000).toISOString(), endIso:new Date(end + 15 * 3600_000).toISOString() };
}

// ---------------------------------------------------------------- Mall 직접판매(읽기 전용 조인)

// Control API에 MALL_API 서비스 바인딩이 있을 때만 호출한다. 없으면 추측하지 않고 connected:false로 0원 처리.
export async function fetchMallOrdersViaBinding(env, range) {
  if (!env?.MALL_API?.fetch) return { connected:false, reason:'MALL_API_BINDING_MISSING', orders:[] };
  const token = String(env.MALL_INTERNAL_ATTRIBUTION_TOKEN || '');
  if (!token) return { connected:false, reason:'MALL_INTERNAL_TOKEN_MISSING', orders:[] };
  try {
    const url = `https://mall-api.internal${MALL_ORDERS_INTERNAL_PATH}?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
    const response = await env.MALL_API.fetch(new Request(url, { headers:{ 'x-ekodi-mall-internal-token':token } }));
    if (!response.ok) return { connected:false, reason:`MALL_API_HTTP_${response.status}`, orders:[] };
    const body = await response.json();
    return { connected:true, reason:'', orders:Array.isArray(body?.orders) ? body.orders : [], truncated:Boolean(body?.truncated) };
  } catch {
    return { connected:false, reason:'MALL_API_UNREACHABLE', orders:[] };
  }
}

// 결제 금액(환불 차감). 부분환불은 환불액을 주문 원장에서 알 수 없으므로 확정에서 제외하고 따로 센다.
export function orderNetKrw(order) {
  const status = String(order?.status || '');
  if (status === 'paid') return { net:Math.max(0, int(order.grossAmount)), unresolved:false };
  if (status === 'refunded' || status === 'cancelled') return { net:0, unresolved:false };
  if (status === 'partially_refunded') return { net:0, unresolved:true };
  return { net:0, unresolved:false };
}

// ---------------------------------------------------------------- 집계

async function all(env, sql, params = []) {
  try { return (await env.DB.prepare(sql).bind(...params).all()).results || []; } catch { return []; }
}

function emptyItem(base) {
  return {
    ...base,
    views:0, reach:0, likes:0, comments:0, shares:0, saves:0, clicks:0, videoViews:0, metricsSource:null, metricsDate:null,
    visits:0, productViews:0, affiliateClicks:0, orders:0,
    estimatedKrw:0, estimatedFromEventsKrw:0, estimatedFromEpcKrw:0,
    confirmedKrw:0, confirmedFromEventsKrw:0, confirmedDirectSaleKrw:0,
    partialRefundOrders:0, costKrw:0, roi:null, engagement:0, engagementRate:0, revenuePerView:0,
  };
}

export async function buildPerformanceReport(env, { from, to, now = Date.now(), fetchMallOrders = fetchMallOrdersViaBinding } = {}) {
  const range = resolveRange(from, to, now);
  if (!range) { const error = new Error('INVALID_RANGE'); error.code = 'INVALID_RANGE'; error.status = 400; throw error; }

  const variants = await all(env, `SELECT v.id, v.channel, v.format, v.title, v.tracking_code, v.status, v.campaign_id, v.content_cost_krw,
      v.external_post_url AS variant_post_url, v.published_at AS variant_published_at,
      j.id AS job_id, j.status AS job_status, j.external_post_url AS job_post_url, j.published_at AS job_published_at
    FROM marketing_content_variants v LEFT JOIN marketing_publication_jobs j ON j.variant_id=v.id
    WHERE v.status IN ('scheduled','published') OR j.id IS NOT NULL`);
  const items = new Map();
  const byCode = new Map();
  const byJob = new Map();
  for (const row of variants) {
    const item = emptyItem({
      key:`variant:${row.id}`, variantId:Number(row.id), jobId:row.job_id == null ? null : Number(row.job_id), channel:row.channel, format:row.format,
      title:clean(row.title, 160), trackingCode:row.tracking_code, status:row.status, jobStatus:row.job_status || null,
      postUrl:row.job_post_url || row.variant_post_url || '', publishedAt:row.job_published_at || row.variant_published_at || null,
    });
    item.costKrw = Math.max(0, int(row.content_cost_krw));
    items.set(item.key, item);
    byCode.set(row.tracking_code, item);
    if (item.jobId) byJob.set(item.jobId, item);
  }

  // 성과(누적 스냅샷): 작업·출처별 기간 내 최신 행 → 우선순위 높은 출처 1개.
  const metricRows = await all(env, `SELECT m.* FROM marketing_post_metrics m
    JOIN (SELECT job_id, source, MAX(metric_date) AS d FROM marketing_post_metrics WHERE metric_date BETWEEN ? AND ? GROUP BY job_id, source) last
      ON last.job_id=m.job_id AND last.source=m.source AND last.d=m.metric_date`, [range.from, range.to]);
  const chosen = new Map();
  for (const row of metricRows) {
    const current = chosen.get(row.job_id);
    if (!current || (SOURCE_PRIORITY[row.source] || 0) > (SOURCE_PRIORITY[current.source] || 0)) chosen.set(row.job_id, row);
  }
  for (const row of chosen.values()) {
    let item = byJob.get(Number(row.job_id));
    if (!item) {
      item = emptyItem({ key:`job:${row.job_id}`, variantId:row.variant_id == null ? null : Number(row.variant_id), jobId:Number(row.job_id), channel:row.channel || 'other', format:'', title:'', trackingCode:'', status:'published', jobStatus:'published', postUrl:'', publishedAt:null });
      items.set(item.key, item);
      byJob.set(item.jobId, item);
    }
    Object.assign(item, { views:int(row.views), reach:int(row.reach), likes:int(row.likes), comments:int(row.comments), shares:int(row.shares), saves:int(row.saves), clicks:int(row.clicks), videoViews:int(row.video_views), metricsSource:row.source, metricsDate:row.metric_date });
  }

  // 귀속 원장.
  const attributionRows = await all(env, `SELECT tracking_code, event_type, revenue_status, COUNT(*) AS n, COALESCE(SUM(value_krw),0) AS krw
    FROM marketing_traffic_attributions WHERE occurred_at>=? AND occurred_at<? GROUP BY tracking_code, event_type, revenue_status`, [range.startIso, range.endIso]);
  let unknownCodeEvents = 0;
  for (const row of attributionRows) {
    const item = byCode.get(row.tracking_code);
    if (!item) { unknownCodeEvents += int(row.n); continue; }
    const n = int(row.n);
    if (row.event_type === 'visit') item.visits += n;
    else if (row.event_type === 'product_view') item.productViews += n;
    else if (row.event_type === 'affiliate_click') item.affiliateClicks += n;
    else if (row.event_type === 'order' || row.event_type === 'affiliate_conversion') item.orders += n;
    if (row.revenue_status === 'estimated') item.estimatedFromEventsKrw += int(row.krw);
    if (row.revenue_status === 'confirmed') item.confirmedFromEventsKrw += int(row.krw);
  }

  // 쿠팡 보고(확정 · 게시물 미귀속).
  const coupang = (await all(env, `SELECT COALESCE(SUM(clicks),0) AS clicks, COALESCE(SUM(orders),0) AS orders, COALESCE(SUM(revenue_krw),0) AS revenue, COUNT(*) AS days
    FROM affiliate_daily_metrics WHERE source=? AND metric_date BETWEEN ? AND ?`, [COUPANG_METRICS_SOURCE, range.from, range.to]))[0] || {};
  const coupangClicks = int(coupang.clicks);
  const coupangCommission = int(coupang.revenue);
  const epc = coupangClicks > 0 ? coupangCommission / coupangClicks : 0;

  // 에코디몰 직접판매(확정): order 귀속 이벤트(external_ref=mall_order:<id>) ↔ Mall API 결제 주문.
  const mall = await fetchMallOrders(env, range);
  const orderCodes = new Map();
  for (const row of await all(env, `SELECT tracking_code, external_ref FROM marketing_traffic_attributions WHERE event_type='order' AND external_ref LIKE 'mall_order:%'`)) {
    const id = String(row.external_ref).slice('mall_order:'.length);
    if (!orderCodes.has(id)) orderCodes.set(id, row.tracking_code);
  }
  let unattributedDirect = 0;
  let unattributedPartial = 0;
  for (const order of mall.orders || []) {
    const { net, unresolved } = orderNetKrw(order);
    const item = byCode.get(orderCodes.get(String(order.id)));
    if (item) { item.confirmedDirectSaleKrw += net; if (unresolved) item.partialRefundOrders += 1; }
    else { unattributedDirect += net; if (unresolved) unattributedPartial += 1; }
  }

  // 항목별 파생값.
  const list = [...items.values()];
  for (const item of list) {
    item.estimatedFromEpcKrw = epc > 0 ? Math.round(item.affiliateClicks * epc) : 0;
    item.estimatedKrw = item.estimatedFromEventsKrw + item.estimatedFromEpcKrw;
    item.confirmedKrw = item.confirmedFromEventsKrw + item.confirmedDirectSaleKrw;
    item.engagement = item.likes + item.comments + item.shares + item.saves;
    item.engagementRate = item.views > 0 ? Number((item.engagement / item.views).toFixed(4)) : 0;
    const revenue = item.estimatedKrw + item.confirmedKrw;
    item.revenuePerView = item.views > 0 ? Number((revenue / item.views).toFixed(4)) : (revenue > 0 ? revenue : 0);
    item.roi = item.costKrw > 0 ? Number(((revenue - item.costKrw) / item.costKrw).toFixed(4)) : null;
  }

  const ranked = rankForRecommendation(list);
  const channels = {};
  for (const item of list) {
    const bucket = channels[item.channel] ||= { channel:item.channel, items:0, views:0, reach:0, engagement:0, visits:0, affiliateClicks:0, orders:0, estimatedKrw:0, confirmedKrw:0, costKrw:0 };
    bucket.items += 1;
    for (const key of ['views','reach','engagement','visits','affiliateClicks','orders','estimatedKrw','confirmedKrw','costKrw']) bucket[key] += item[key];
  }
  const sum = key => list.reduce((total, item) => total + item[key], 0);
  const attributedEstimated = sum('estimatedKrw');
  const attributedConfirmed = sum('confirmedKrw');
  const unattributedConfirmed = coupangCommission + unattributedDirect;

  return {
    range:{ from:range.from, to:range.to, timezone:'Asia/Seoul' },
    totals:{
      items:list.length, views:sum('views'), reach:sum('reach'), engagement:sum('engagement'), visits:sum('visits'),
      productViews:sum('productViews'), affiliateClicks:sum('affiliateClicks'), orders:sum('orders'), costKrw:sum('costKrw'),
      attributed:{ estimatedKrw:attributedEstimated, confirmedKrw:attributedConfirmed },
      unattributed:{
        confirmedKrw:unattributedConfirmed,
        coupangReportedKrw:coupangCommission, coupangReportedClicks:coupangClicks, coupangReportedOrders:int(coupang.orders), coupangReportDays:int(coupang.days),
        directSaleKrw:unattributedDirect, directSalePartialRefundOrders:unattributedPartial, unknownTrackingCodeEvents:unknownCodeEvents,
      },
      // 추정과 확정은 합치지 않는다. 확정 합계 = 귀속 확정 + 미귀속 확정.
      confirmedTotalKrw:attributedConfirmed + unattributedConfirmed,
      estimatedTotalKrw:attributedEstimated,
    },
    estimatedMethod:{ epcKrw:Number(epc.toFixed(2)), basis:epc > 0 ? 'coupang_reported_commission_per_click' : 'none', includesEstimatedEvents:true },
    directSale:{ connected:Boolean(mall.connected), reason:mall.reason || '', orders:(mall.orders || []).length, truncated:Boolean(mall.truncated) },
    channels:Object.values(channels).sort((a, b) => (b.confirmedKrw + b.estimatedKrw) - (a.confirmedKrw + a.estimatedKrw) || b.engagement - a.engagement),
    items:ranked,
    recommendation:recommendationHint(ranked),
    safety:{ readOnly:true, customerPiiIncluded:false, estimatedAndConfirmedMixed:false },
  };
}

// 매출/조회 → 참여율 → 매출 → 참여 수. 조회수 단독 순위 없음.
export function rankForRecommendation(items) {
  return [...items].sort((a, b) =>
    (b.revenuePerView - a.revenuePerView)
    || (b.engagementRate - a.engagementRate)
    || ((b.confirmedKrw + b.estimatedKrw) - (a.confirmedKrw + a.estimatedKrw))
    || (b.engagement - a.engagement)
    || String(a.key).localeCompare(String(b.key)));
}

function recommendationHint(ranked) {
  const top = ranked.filter(item => item.confirmedKrw + item.estimatedKrw > 0 || item.engagement > 0).slice(0, 3);
  return {
    basis:'(확정+추정 매출) ÷ 조회수 → 참여율 순. 조회수만으로는 순위를 매기지 않습니다.',
    top:top.map(item => ({ key:item.key, variantId:item.variantId, channel:item.channel, title:item.title, revenuePerView:item.revenuePerView, engagementRate:item.engagementRate,
      reason:item.confirmedKrw + item.estimatedKrw > 0 ? '조회당 매출이 높습니다. 같은 형식·채널로 후속 콘텐츠를 만드세요.' : '매출 신호는 아직 없지만 참여율이 높습니다. 상품 링크·CTA를 보강하세요.' })),
  };
}

// ---------------------------------------------------------------- HTTP

export async function handlePerformanceReport(request, env, { resolveAdmin, respond, fetchMallOrders } = {}) {
  const url = new URL(request.url);
  if (url.pathname.replace(/\/+$/, '') !== PERFORMANCE_PATH) return null;
  const reply = respond || ((data, status = 200) => new Response(JSON.stringify(data), { status, headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' } }));
  if (typeof resolveAdmin !== 'function') return reply({ error:'ADMIN_AUTH_NOT_CONFIGURED' }, 500);
  const session = await resolveAdmin(request, env);
  if (!session || session.authenticated === false) return reply({ error:'EKODI 관리자 인증이 필요합니다.', code:'ADMIN_AUTH_REQUIRED' }, 401);
  if (request.method !== 'GET') return reply({ error:'METHOD_NOT_ALLOWED' }, 405);
  try {
    return reply(await buildPerformanceReport(env, { from:url.searchParams.get('from'), to:url.searchParams.get('to'), ...(fetchMallOrders ? { fetchMallOrders } : {}) }));
  } catch (error) {
    if (error?.code) return reply({ error:error.code, maxRangeDays:MAX_RANGE_DAYS }, error.status || 400);
    throw error;
  }
}
