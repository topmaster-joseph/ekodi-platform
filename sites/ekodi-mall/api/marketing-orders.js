// EKODI AI Social Growth Phase 8 — 마케팅 수익 리포트용 내부 주문 조회(읽기 전용).
// GET /api/internal/marketing/orders?from=YYYY-MM-DD&to=YYYY-MM-DD
// - x-ekodi-mall-internal-token == INTERNAL_ATTRIBUTION_TOKEN 일 때만 응답한다(기존 내부 귀속 토큰 패턴).
// - 결제된 주문(paid·partially_refunded·refunded)만, 구매자 개인정보 없이(주문 ID·상태·금액·시각·귀속 유형) 돌려준다.
// - Control API 리포트는 marketing_traffic_attributions(order, external_ref=mall_order:<id>)와 주문 ID로 조인해
//   확정 매출(confirmed)을 계산한다. 이 엔드포인트는 쓰기를 하지 않는다.

export const MARKETING_ORDERS_PATH = '/api/internal/marketing/orders';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 120;
const MAX_ROWS = 2000;

function validRange(from, to) {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return null;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  if ((end - start) / 86400000 > MAX_RANGE_DAYS) return null;
  // KST 날짜 경계를 UTC ISO로 바꾼다(from 00:00 KST ~ to 24:00 KST).
  return { startIso: new Date(start - 9 * 3600000).toISOString(), endIso: new Date(end + 15 * 3600000).toISOString() };
}

export async function handleMarketingOrdersRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== MARKETING_ORDERS_PATH) return null;
  if (request.method !== 'GET') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  const supplied = request.headers.get('x-ekodi-mall-internal-token') || '';
  if (!env.INTERNAL_ATTRIBUTION_TOKEN || supplied !== env.INTERNAL_ATTRIBUTION_TOKEN) {
    return { status: 401, body: { error: 'Internal attribution authorization required.' } };
  }
  if (!env.DB) return { status: 503, body: { error: 'Mall 전용 데이터베이스 연결이 없습니다.' } };
  const from = String(url.searchParams.get('from') || '');
  const to = String(url.searchParams.get('to') || '');
  const range = validRange(from, to);
  if (!range) return { status: 400, body: { error: 'INVALID_RANGE', maxRangeDays: MAX_RANGE_DAYS } };
  const rows = await env.DB.prepare(`SELECT id,status,gross_amount,currency,attribution_type,paid_at,cancelled_at,updated_at
    FROM orders WHERE paid_at IS NOT NULL AND paid_at>=? AND paid_at<? AND status IN ('paid','partially_refunded','refunded')
    ORDER BY paid_at ASC LIMIT ?`).bind(range.startIso, range.endIso, MAX_ROWS).all();
  const orders = (rows.results || []).map(row => ({
    id: String(row.id),
    status: String(row.status),
    grossAmount: Math.max(0, Math.trunc(Number(row.gross_amount) || 0)),
    currency: String(row.currency || 'KRW'),
    attributionType: String(row.attribution_type || ''),
    paidAt: row.paid_at,
    cancelledAt: row.cancelled_at || null,
    updatedAt: row.updated_at,
  }));
  return { status: 200, body: { from, to, orders, truncated: orders.length >= MAX_ROWS, piiIncluded: false } };
}
