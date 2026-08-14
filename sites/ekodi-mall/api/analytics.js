const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const ALLOWED_SOURCES = new Set(['direct', 'marketplace', 'ai']);

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

export function normalizeAnalyticsDays(value) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, parsed);
}

export function sourceLabel(source) {
  if (source === 'direct') return 'Direct 7%';
  if (source === 'ai') return 'AI 9%';
  return 'Mall 8%';
}

function sinceIso(days, now = new Date()) {
  return new Date(now.getTime() - days * 86400000).toISOString();
}

async function authenticate(request, env) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? user : null;
}

function number(value) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

function sourceCounts(rows = []) {
  const counts = { direct: 0, marketplace: 0, ai: 0 };
  for (const row of rows) {
    if (ALLOWED_SOURCES.has(row.sourceType)) counts[row.sourceType] += number(row.count);
  }
  return counts;
}

async function sellerAnalytics(env, sellerId, days) {
  const since = sinceIso(days);
  const [productSummary, eventSummary, visitorSummary, visitorSources, orderSummary, settlementSummary, productsResult, productEvents, productVisits, productOrders] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS productCount,
      SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS publishedCount,
      SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS draftCount
      FROM products WHERE seller_id=?`).bind(sellerId).first(),
    env.DB.prepare(`SELECT COUNT(*) AS entryEvents,
      SUM(CASE WHEN e.attribution_type='direct' THEN 1 ELSE 0 END) AS directEvents,
      SUM(CASE WHEN e.attribution_type='marketplace' THEN 1 ELSE 0 END) AS marketplaceEvents,
      SUM(CASE WHEN e.attribution_type='ai' THEN 1 ELSE 0 END) AS aiEvents
      FROM product_events e JOIN products p ON p.id=e.product_id
      WHERE p.seller_id=? AND e.event_type='view' AND e.occurred_at>=?`).bind(sellerId, since).first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT av.visitor_id) AS uniqueVisitors, COUNT(*) AS attributedProductVisits
      FROM attribution_visits av JOIN products p ON p.id=av.product_id
      WHERE p.seller_id=? AND av.first_seen_at>=?`).bind(sellerId, since).first(),
    env.DB.prepare(`SELECT av.source_type AS sourceType, COUNT(*) AS count
      FROM attribution_visits av JOIN products p ON p.id=av.product_id
      WHERE p.seller_id=? AND av.first_seen_at>=?
      GROUP BY av.source_type`).bind(sellerId, since).all(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status='payment_pending' THEN 1 ELSE 0 END) AS pendingOrders,
      SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paidOrders,
      COALESCE(SUM(CASE WHEN status='paid' THEN gross_amount ELSE 0 END),0) AS paidGrossAmount
      FROM orders WHERE seller_id=? AND created_at>=?`).bind(sellerId, since).first(),
    env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN status IN ('payable','paid') THEN seller_amount ELSE 0 END),0) AS recognizedSellerAmount,
      SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paidSettlementEntries
      FROM settlement_ledger WHERE seller_id=? AND effective_at>=?`).bind(sellerId, since).first(),
    env.DB.prepare(`SELECT id,name,status,sale_type AS saleType,category,price,public_url AS publicUrl,updated_at AS updatedAt,published_at AS publishedAt
      FROM products WHERE seller_id=? ORDER BY updated_at DESC LIMIT 100`).bind(sellerId).all(),
    env.DB.prepare(`SELECT e.product_id AS productId, COUNT(*) AS entryEvents
      FROM product_events e JOIN products p ON p.id=e.product_id
      WHERE p.seller_id=? AND e.event_type='view' AND e.occurred_at>=?
      GROUP BY e.product_id`).bind(sellerId, since).all(),
    env.DB.prepare(`SELECT av.product_id AS productId,av.source_type AS sourceType,COUNT(*) AS count
      FROM attribution_visits av JOIN products p ON p.id=av.product_id
      WHERE p.seller_id=? AND av.first_seen_at>=?
      GROUP BY av.product_id,av.source_type`).bind(sellerId, since).all(),
    env.DB.prepare(`SELECT product_id AS productId,
      SUM(CASE WHEN status='payment_pending' THEN 1 ELSE 0 END) AS pendingOrders,
      SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paidOrders,
      COALESCE(SUM(CASE WHEN status='paid' THEN gross_amount ELSE 0 END),0) AS paidGrossAmount
      FROM orders WHERE seller_id=? AND created_at>=? GROUP BY product_id`).bind(sellerId, since).all()
  ]);

  const eventByProduct = new Map((productEvents.results || []).map((row) => [row.productId, number(row.entryEvents)]));
  const visitByProduct = new Map();
  for (const row of productVisits.results || []) {
    if (!visitByProduct.has(row.productId)) visitByProduct.set(row.productId, { direct: 0, marketplace: 0, ai: 0 });
    const bucket = visitByProduct.get(row.productId);
    if (ALLOWED_SOURCES.has(row.sourceType)) bucket[row.sourceType] += number(row.count);
  }
  const orderByProduct = new Map((productOrders.results || []).map((row) => [row.productId, {
    pendingOrders: number(row.pendingOrders),
    paidOrders: number(row.paidOrders),
    paidGrossAmount: number(row.paidGrossAmount)
  }]));

  const products = (productsResult.results || []).map((product) => {
    const sources = visitByProduct.get(product.id) || { direct: 0, marketplace: 0, ai: 0 };
    const orders = orderByProduct.get(product.id) || { pendingOrders: 0, paidOrders: 0, paidGrossAmount: 0 };
    return {
      id: product.id,
      name: product.name,
      status: product.status,
      saleType: product.saleType,
      category: product.category,
      price: product.price === null || product.price === undefined ? null : number(product.price),
      publicUrl: clean(product.publicUrl, 500),
      publishedAt: product.publishedAt || null,
      entryEvents: eventByProduct.get(product.id) || 0,
      attributedProductVisits: sources.direct + sources.marketplace + sources.ai,
      sourceCounts: sources,
      pendingOrders: orders.pendingOrders,
      paidOrders: orders.paidOrders,
      paidGrossAmount: orders.paidGrossAmount
    };
  });

  return {
    period: { days, since, generatedAt: new Date().toISOString() },
    definitions: {
      entryEvents: '7일 first-touch 창에서 새 attribution이 기록될 때 생성되는 유입 기록입니다. 일반 페이지뷰 총합이 아닙니다.',
      uniqueVisitors: '선택 기간에 first-touch가 시작된 익명 visitor의 중복 제거 수입니다. 원본 visitor ID는 반환하지 않습니다.',
      paidGrossAmount: '상태가 paid인 주문의 gross_amount만 합산합니다. payment_pending은 매출에 포함하지 않습니다.',
      sourceRates: { direct: 7, marketplace: 8, ai: 9 }
    },
    summary: {
      productCount: number(productSummary?.productCount),
      publishedCount: number(productSummary?.publishedCount),
      draftCount: number(productSummary?.draftCount),
      entryEvents: number(eventSummary?.entryEvents),
      uniqueVisitors: number(visitorSummary?.uniqueVisitors),
      attributedProductVisits: number(visitorSummary?.attributedProductVisits),
      sourceCounts: sourceCounts(visitorSources.results || []),
      pendingOrders: number(orderSummary?.pendingOrders),
      paidOrders: number(orderSummary?.paidOrders),
      paidGrossAmount: number(orderSummary?.paidGrossAmount),
      recognizedSellerAmount: number(settlementSummary?.recognizedSellerAmount),
      paidSettlementEntries: number(settlementSummary?.paidSettlementEntries)
    },
    products
  };
}

export async function handleAnalyticsRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/analytics/summary') return null;
  if (request.method !== 'GET') return { status: 405, body: { error: 'Method not allowed' } };
  if (!env.DB) return { status: 503, body: { error: 'Mall 전용 데이터베이스 연결이 없습니다.' } };
  const user = await authenticate(request, env);
  if (!user) return { status: 401, body: { error: 'Google 판매자 로그인이 필요합니다.' } };
  const days = normalizeAnalyticsDays(url.searchParams.get('days'));
  return { status: 200, body: { analytics: await sellerAnalytics(env, user.id, days) } };
}
