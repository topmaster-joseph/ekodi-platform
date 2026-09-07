import authWorker from './auth-worker.js';
import { getAffiliateAutomationStatus, ingestAffiliateProductsOnDemand, runAffiliateAutomation } from './coupang-partners-automation.js';
import { archiveMarketplaceOffer, listMarketplaceProducts, MULTI_AFFILIATE_DISCLOSURE, publicMarketplaceClick, registerMarketplaceProduct } from './affiliate-marketplace.js';
import { applyProductIdentityAliases, groupProductOffers } from './product-identity.js';
import { listProviderFeedDescriptors, mixProductsByProvider, syncProviderFeed } from './affiliate-provider-feed.js';

const PREFIX = '/api/affiliate';
const DEFAULT_ACCOUNT_ID = 'coupang-ekodibiz';
const PUBLIC_STOREFRONT_SLUG = 'ekodi-mall';
const DEFAULT_DISCLOSURE = '쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
const AUTO_RETRY_MS = 15 * 60 * 1000;

function json(data, status = 200, sourceHeaders = new Headers()) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  for (const name of ['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-max-age', 'vary']) {
    const value = sourceHeaders.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function cleanText(value, max = 200) { return String(value ?? '').trim().slice(0, max); }
function safeKey(value, max = 80) { return cleanText(value, max).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max); }
const AFFILIATE_ROUTE_MODES = new Set(['direct', 'network']);
const AFFILIATE_ROUTE_STATUSES = new Set(['candidate', 'pending', 'approved', 'active', 'suspended']);
const AFFILIATE_TRACKING_STATUSES = new Set(['not_ready', 'pending', 'ready', 'failed']);
const AFFILIATE_CATALOG_STATUSES = new Set(['not_ready', 'manual_verified', 'feed_ready', 'stale', 'failed']);
const RECOMMENDABLE_CATALOG_STATUSES = new Set(['manual_verified', 'feed_ready']);
function marketCountry(value) { const code = cleanText(value || 'KR', 2).toUpperCase(); return /^[A-Z]{2}$/.test(code) ? code : ''; }
function settlementCurrency(value) { const code = cleanText(value || 'KRW', 3).toUpperCase(); return /^[A-Z]{3}$/.test(code) ? code : ''; }
function nonNegativeInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.trunc(number);
}
function httpsUrl(value, { optional = false } = {}) {
  const text = cleanText(value, 2000);
  if (!text && optional) return '';
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch { return null; }
}

function publicHeaders(request) {
  const headers = new Headers();
  const origin = request.headers.get('origin') || '';
  const allowed = new Set(['https://ekodi.kr', 'https://www.ekodi.kr', 'https://shop.ekodi.kr']);
  if (allowed.has(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return headers;
}

async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}

async function adminId(env, session) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(session.email).first();
  return row?.id || null;
}

async function audit(env, session, action, resource, detail = '') {
  const id = await adminId(env, session);
  await env.DB.prepare(`INSERT INTO audit_logs (admin_id, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS affiliate_providers (provider_key TEXT PRIMARY KEY, display_name TEXT NOT NULL, provider_kind TEXT NOT NULL DEFAULT 'affiliate', connection_mode TEXT NOT NULL DEFAULT 'manual', enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS affiliate_accounts (id TEXT PRIMARY KEY, provider_key TEXT NOT NULL, owner_type TEXT NOT NULL DEFAULT 'internal', owner_key TEXT NOT NULL, display_name TEXT NOT NULL, account_label TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'manual_ready', connection_mode TEXT NOT NULL DEFAULT 'manual', default_channel TEXT NOT NULL DEFAULT '', disclosure_text TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, last_synced_at TEXT, last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS affiliate_links (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, tenant_slug TEXT, product_name TEXT NOT NULL, destination_url TEXT NOT NULL DEFAULT '', affiliate_url TEXT NOT NULL, channel TEXT NOT NULL DEFAULT '', campaign_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS affiliate_daily_metrics (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, metric_date TEXT NOT NULL, clicks INTEGER NOT NULL DEFAULT 0, orders INTEGER NOT NULL DEFAULT 0, revenue_krw INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual', recorded_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(account_id, metric_date, source))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS affiliate_merchant_routes (route_key TEXT PRIMARY KEY, merchant_key TEXT NOT NULL, merchant_name TEXT NOT NULL, market_country TEXT NOT NULL DEFAULT 'KR', settlement_currency TEXT NOT NULL DEFAULT 'KRW', affiliate_mode TEXT NOT NULL DEFAULT 'direct', network_key TEXT NOT NULL DEFAULT '', network_name TEXT NOT NULL DEFAULT '', affiliate_status TEXT NOT NULL DEFAULT 'candidate', tracking_status TEXT NOT NULL DEFAULT 'not_ready', catalog_status TEXT NOT NULL DEFAULT 'not_ready', recommendation_enabled INTEGER NOT NULL DEFAULT 0, recommendation_verified_at TEXT, program_url TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(merchant_key, affiliate_mode, network_key))`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_affiliate_merchant_routes_recommend ON affiliate_merchant_routes(affiliate_status, recommendation_enabled, merchant_key)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_affiliate_links_account_time ON affiliate_links(account_id, created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_affiliate_metrics_account_date ON affiliate_daily_metrics(account_id, metric_date DESC)'),
  ]);
  for (const statement of [
    "ALTER TABLE affiliate_merchant_routes ADD COLUMN tracking_status TEXT NOT NULL DEFAULT 'not_ready'",
    "ALTER TABLE affiliate_merchant_routes ADD COLUMN catalog_status TEXT NOT NULL DEFAULT 'not_ready'",
    'ALTER TABLE affiliate_merchant_routes ADD COLUMN recommendation_verified_at TEXT',
  ]) await db.prepare(statement).run().catch(() => {});
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_affiliate_merchant_routes_readiness ON affiliate_merchant_routes(affiliate_status, tracking_status, catalog_status, recommendation_enabled, merchant_key)").run().catch(() => {});
  const now = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO affiliate_providers (provider_key, display_name, provider_kind, connection_mode, enabled, created_at, updated_at) VALUES ('coupang_partners', 'Coupang Partners', 'affiliate', 'manual', 1, ?, ?)`).bind(now, now).run();
  await db.prepare(`INSERT OR IGNORE INTO affiliate_accounts (id, provider_key, owner_type, owner_key, display_name, account_label, status, connection_mode, default_channel, disclosure_text, enabled, created_at, updated_at) VALUES (?, 'coupang_partners', 'internal', 'ekodibiz', '에코디비즈 쿠팡파트너스', 'EKODIBIZ', 'manual_ready', 'manual', '', '', 1, ?, ?)`).bind(DEFAULT_ACCOUNT_ID, now, now).run();
  await db.prepare(`INSERT OR IGNORE INTO affiliate_merchant_routes (route_key, merchant_key, merchant_name, market_country, settlement_currency, affiliate_mode, network_key, network_name, affiliate_status, tracking_status, catalog_status, recommendation_enabled, recommendation_verified_at, created_at, updated_at) VALUES ('coupang-partners-direct', 'coupang_partners', '쿠팡', 'KR', 'KRW', 'direct', '', '', 'active', 'ready', 'feed_ready', 1, ?, ?, ?)`).bind(now, now, now).run();
  await db.prepare(`INSERT OR IGNORE INTO affiliate_merchant_routes (route_key, merchant_key, merchant_name, market_country, settlement_currency, affiliate_mode, network_key, network_name, affiliate_status, recommendation_enabled, notes, created_at, updated_at) VALUES ('elevenst-network-linkprice', 'elevenst', '11번가', 'KR', 'KRW', 'network', 'linkprice', 'LinkPrice', 'pending', 0, 'LinkPrice 회원 계정 보유. 11번가 머천트 승인 및 딥링크/API 활성 확인 후 active 전환.', ?, ?)`).bind(now, now).run();
  const chinaRouteSeeds = [
    ['taobao-network-taobao-alliance', 'taobao', '淘宝 타오바오', 'CNY', 'taobao_alliance', '淘宝联盟 / Alimama', 'https://pub.alimama.com/'],
    ['tmall-network-taobao-alliance', 'tmall', '天猫 티몰', 'CNY', 'taobao_alliance', '淘宝联盟 / Alimama', 'https://pub.alimama.com/'],
    ['jd-network-jd-union', 'jd', '京东 징둥', 'CNY', 'jd_union', '京东联盟', 'https://jos.jd.com/jdunion'],
    ['aliexpress-network-affiliate', 'aliexpress', 'AliExpress', 'USD', 'aliexpress_affiliate', 'AliExpress Affiliate', 'https://portals.aliexpress.com/'],
    ['pinduoduo-network-duoduo-jinbao', 'pinduoduo', '拼多多 핀둬둬', 'CNY', 'duoduo_jinbao', '多多进宝', ''],
  ];
  for (const [routeKey, merchantKey, merchantName, currency, networkKey, networkName, programUrl] of chinaRouteSeeds) {
    await db.prepare(`INSERT OR IGNORE INTO affiliate_merchant_routes (route_key, merchant_key, merchant_name, market_country, settlement_currency, affiliate_mode, network_key, network_name, affiliate_status, tracking_status, catalog_status, recommendation_enabled, program_url, notes, created_at, updated_at) VALUES (?, ?, ?, 'CN', ?, 'network', ?, ?, 'candidate', 'not_ready', 'not_ready', 0, ?, '중국 쇼핑몰 제휴 후보. 공식 승인·추적링크·상품/가격 공급 확인 전 추천 금지. 직접 계약 시 direct 경로를 별도 등록.', ?, ?)`).bind(routeKey, merchantKey, merchantName, currency, networkKey, networkName, programUrl, now, now).run();
  }
  await db.prepare(`UPDATE affiliate_accounts SET disclosure_text = ?, updated_at = ? WHERE id = ? AND TRIM(disclosure_text) = ''`).bind(DEFAULT_DISCLOSURE, now, DEFAULT_ACCOUNT_ID).run();
}

function accountView(row) {
  return { id: row.id, providerKey: row.provider_key, ownerType: row.owner_type, ownerKey: row.owner_key, displayName: row.display_name, accountLabel: row.account_label, status: row.status, connectionMode: row.connection_mode, defaultChannel: row.default_channel, disclosureText: row.disclosure_text, enabled: Boolean(row.enabled), lastSyncedAt: row.last_synced_at || null, lastError: row.last_error || '', updatedAt: row.updated_at };
}
function linkView(row) {
  return { id: row.id, accountId: row.account_id, tenantSlug: row.tenant_slug || '', productName: row.product_name, destinationUrl: row.destination_url || '', affiliateUrl: row.affiliate_url, channel: row.channel || '', campaignName: row.campaign_name || '', status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

function routeRecommendationReady(row = {}) {
  return row.affiliate_status === 'active'
    && row.tracking_status === 'ready'
    && RECOMMENDABLE_CATALOG_STATUSES.has(row.catalog_status)
    && Boolean(row.recommendation_enabled);
}

function routeView(row) {
  return { routeKey: row.route_key, merchantKey: row.merchant_key, merchantName: row.merchant_name, marketCountry: row.market_country, settlementCurrency: row.settlement_currency, affiliateMode: row.affiliate_mode, networkKey: row.network_key || '', networkName: row.network_name || '', affiliateStatus: row.affiliate_status, trackingStatus: row.tracking_status || 'not_ready', catalogStatus: row.catalog_status || 'not_ready', recommendationEnabled: Boolean(row.recommendation_enabled), recommendationReady: routeRecommendationReady(row), recommendationVerifiedAt: row.recommendation_verified_at || null, programUrl: row.program_url || '', notes: row.notes || '', updatedAt: row.updated_at };
}

async function recommendedMerchantKeys(db) {
  const rows = await db.prepare(`SELECT merchant_key FROM affiliate_merchant_routes WHERE affiliate_status = 'active' AND tracking_status = 'ready' AND catalog_status IN ('manual_verified','feed_ready') AND recommendation_enabled = 1`).all().catch(() => ({ results: [] }));
  return new Set((rows.results || []).map(row => row.merchant_key));
}

async function recommendationRouteForMerchant(db, merchantKey) {
  const row = await db.prepare(`SELECT * FROM affiliate_merchant_routes WHERE merchant_key = ? AND affiliate_status = 'active' AND tracking_status = 'ready' AND catalog_status IN ('manual_verified','feed_ready') AND recommendation_enabled = 1 ORDER BY updated_at DESC LIMIT 1`).bind(merchantKey).first().catch(() => null);
  return row && routeRecommendationReady(row) ? row : null;
}

function recentFailedRun(automation) {
  if (automation?.status !== 'failed' || !automation?.lastRunAt) return false;
  const timestamp = Date.parse(automation.lastRunAt);
  return Number.isFinite(timestamp) && (Date.now() - timestamp) < AUTO_RETRY_MS;
}

async function readPublicRows(env, limit) {
  try {
    const rows = await env.DB.prepare(`SELECT id, product_id, product_name, price_krw, image_url, category, is_rocket, is_free_shipping, selected_at
      FROM affiliate_storefront_products
      WHERE account_id = ? AND storefront_slug = ? AND status = 'active'
      ORDER BY selection_score DESC, id DESC LIMIT ?`).bind(DEFAULT_ACCOUNT_ID, PUBLIC_STOREFRONT_SLUG, limit).all();
    return rows.results || [];
  } catch { return []; }
}

function publicProductView(request, row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    priceKrw: Number(row.price_krw || 0),
    imageUrl: new URL(`${PREFIX}/public/image/${row.id}?storefront=${PUBLIC_STOREFRONT_SLUG}`, request.url).toString(),
    clickUrl: new URL(`${PREFIX}/public/click/${row.id}?storefront=${PUBLIC_STOREFRONT_SLUG}`, request.url).toString(),
    category: row.category || '추천',
    isRocket: Boolean(row.is_rocket),
    isFreeShipping: Boolean(row.is_free_shipping),
    selectedAt: row.selected_at || null,
    providerKey: 'coupang_partners',
    providerName: 'Coupang',
    buyLabel: '쿠팡에서 구매',
    disclosureText: DEFAULT_DISCLOSURE,
  };
}

async function publicProducts(request, env, url) {
  const storefront = cleanText(url.searchParams.get('storefront') || PUBLIC_STOREFRONT_SLUG, 80);
  if (storefront !== PUBLIC_STOREFRONT_SLUG) return json({ error: '지원하지 않는 공개 쇼핑몰입니다.' }, 404, publicHeaders(request));
  const requested = Math.trunc(Number(url.searchParams.get('limit')) || 100);
  const limit = Math.max(1, Math.min(100, requested));
  let disclosureText = DEFAULT_DISCLOSURE;
  try {
    const account = await env.DB.prepare('SELECT disclosure_text FROM affiliate_accounts WHERE id = ? AND enabled = 1').bind(DEFAULT_ACCOUNT_ID).first();
    disclosureText = cleanText(account?.disclosure_text, 1000) || DEFAULT_DISCLOSURE;
  } catch {}

  let automation = await getAffiliateAutomationStatus(env);
  if (automation.configured && automation.needsRefresh && !recentFailedRun(automation)) {
    try {
      await runAffiliateAutomation(env, { reason: automation.activeProducts > 0 ? 'public-stale' : 'public-empty' });
      automation = await getAffiliateAutomationStatus(env);
    } catch (error) {
      automation = { ...automation, status: 'degraded', refreshError: cleanText(error?.message || 'AUTOMATION_REFRESH_FAILED', 160) };
    }
  }
  const rows = await readPublicRows(env, limit);
  const recommendedMerchants = await recommendedMerchantKeys(env.DB);
  const coupangProducts = automation.configured && recommendedMerchants.has('coupang_partners') ? rows.map(row => ({ ...publicProductView(request, row), recommendationEligible: true, affiliateMode: 'direct', marketCountry: 'KR', settlementCurrency: 'KRW' })) : [];
  const marketplaceProducts = await listMarketplaceProducts(request, env, limit).catch(() => []);
  const products = applyProductIdentityAliases(mixProductsByProvider([...coupangProducts, ...marketplaceProducts], limit), env);
  const automationStatus = products.length ? 'ready' : (automation.status || 'warming');
  const providers = [...new Map(products.map(item => [item.providerKey || 'unknown', item.providerName || item.providerKey || '제휴 판매처'])).entries()]
    .map(([providerKey, providerName]) => ({ providerKey, providerName }));
  const combinedDisclosure = marketplaceProducts.length ? `${disclosureText} ${MULTI_AFFILIATE_DISCLOSURE}` : disclosureText;
  const productIdentities = groupProductOffers(products);
  return json({ storefront: PUBLIC_STOREFRONT_SLUG, providerKey: marketplaceProducts.length ? 'multi_affiliate' : 'coupang_partners', providers, automationStatus, disclosureText: combinedDisclosure, catalogMode: 'product_identity_v1', productIdentities, products }, 200, publicHeaders(request));
}

function coupangImageUrl(value) {
  const url = httpsUrl(value);
  if (!url) return '';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'coupang.com' || host.endsWith('.coupang.com') || host === 'coupangcdn.com' || host.endsWith('.coupangcdn.com')) return url;
  } catch {}
  return '';
}

async function publicImage(request, env, url) {
  const match = url.pathname.match(/^\/api\/affiliate\/public\/image\/(\d+)$/);
  if (!match || request.method !== 'GET') return null;
  const storefront = cleanText(url.searchParams.get('storefront') || PUBLIC_STOREFRONT_SLUG, 80);
  if (storefront !== PUBLIC_STOREFRONT_SLUG) return json({ error: '지원하지 않는 공개 쇼핑몰입니다.' }, 404, publicHeaders(request));
  let row = null;
  try {
    row = await env.DB.prepare('SELECT image_url FROM affiliate_storefront_products WHERE id = ? AND account_id = ? AND storefront_slug = ? LIMIT 1')
      .bind(Number(match[1]), DEFAULT_ACCOUNT_ID, PUBLIC_STOREFRONT_SLUG).first();
  } catch {}
  const source = coupangImageUrl(row?.image_url);
  if (!source) return json({ error: '상품 이미지를 찾을 수 없습니다.' }, 404, publicHeaders(request));
  let upstream;
  try { upstream = await fetch(source, { headers: { accept: 'image/avif,image/webp,image/*,*/*;q=0.8' } }); } catch { return json({ error: '상품 이미지를 불러오지 못했습니다.' }, 502, publicHeaders(request)); }
  const contentType = cleanText(upstream.headers.get('content-type'), 120).toLowerCase();
  if (!upstream.ok || !contentType.startsWith('image/')) return json({ error: '상품 이미지를 불러오지 못했습니다.' }, 502, publicHeaders(request));
  const headers = publicHeaders(request);
  headers.set('content-type', contentType);
  headers.set('cache-control', 'public, max-age=21600');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(upstream.body, { status: 200, headers });
}

async function publicClick(request, env, url) {
  const match = url.pathname.match(/^\/api\/affiliate\/public\/click\/(\d+)$/);
  if (!match || request.method !== 'GET') return null;
  const storefront = cleanText(url.searchParams.get('storefront') || PUBLIC_STOREFRONT_SLUG, 80);
  if (storefront !== PUBLIC_STOREFRONT_SLUG) return json({ error: '지원하지 않는 공개 쇼핑몰입니다.' }, 404, publicHeaders(request));
  let row = null;
  try {
    row = await env.DB.prepare('SELECT id, affiliate_url FROM affiliate_storefront_products WHERE id = ? AND account_id = ? AND storefront_slug = ? LIMIT 1')
      .bind(Number(match[1]), DEFAULT_ACCOUNT_ID, PUBLIC_STOREFRONT_SLUG).first();
  } catch {}
  const target = httpsUrl(row?.affiliate_url);
  if (!row || !target) return json({ error: '상품을 찾을 수 없습니다.' }, 404, publicHeaders(request));

  const purpose = `${request.headers.get('purpose') || ''} ${request.headers.get('sec-purpose') || ''}`.toLowerCase();
  if (purpose.includes('prefetch')) {
    const headers = publicHeaders(request);
    headers.set('cache-control', 'no-store');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(null, { status: 204, headers });
  }

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO affiliate_storefront_clicks (product_row_id, click_date, clicks, updated_at) VALUES (?, ?, 1, ?)
    ON CONFLICT(product_row_id, click_date) DO UPDATE SET clicks = affiliate_storefront_clicks.clicks + 1, updated_at = excluded.updated_at`)
    .bind(row.id, today, now).run().catch(() => {});
  const headers = publicHeaders(request);
  headers.set('location', target);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(null, { status: 302, headers });
}

async function overview(env) {
  const automation = await getAffiliateAutomationStatus(env);
  const [accounts, links, metrics, tracked, marketplaceTracked, marketplaceProducts] = await Promise.all([
    env.DB.prepare('SELECT * FROM affiliate_accounts ORDER BY provider_key, id').all(),
    env.DB.prepare(`SELECT COUNT(*) AS total_links, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_links FROM affiliate_links`).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(orders), 0) AS orders, COALESCE(SUM(revenue_krw), 0) AS revenue_krw FROM affiliate_daily_metrics WHERE metric_date >= date('now', '-29 day')`).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(clicks), 0) AS clicks FROM affiliate_storefront_clicks WHERE click_date >= date('now', '-29 day')`).first().catch(() => ({ clicks: 0 })),
    env.DB.prepare(`SELECT COALESCE(SUM(clicks), 0) AS clicks FROM affiliate_link_clicks WHERE click_date >= date('now', '-29 day')`).first().catch(() => ({ clicks: 0 })),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM ekodi_offers o WHERE o.offer_type = 'product' AND o.visibility = 'public' AND o.status = 'active' AND o.source_provider <> 'coupang_partners' AND EXISTS (SELECT 1 FROM affiliate_merchant_routes r WHERE r.merchant_key = o.source_provider AND r.affiliate_status = 'active' AND r.recommendation_enabled = 1)`).first().catch(() => ({ count: 0 })),
  ]);
  const recommendedMerchants = await recommendedMerchantKeys(env.DB);
  return {
    generatedAt: new Date().toISOString(),
    accounts: accounts.results.map(accountView),
    providerFeeds: listProviderFeedDescriptors(env),
    automation,
    summary: {
      providers: new Set(accounts.results.map(row => row.provider_key)).size,
      accounts: accounts.results.length,
      activeLinks: Number(links?.active_links || 0),
      totalLinks: Number(links?.total_links || 0),
      activeProducts: (recommendedMerchants.has('coupang_partners') && automation.configured ? Number(automation.activeProducts || 0) : 0) + Number(marketplaceProducts?.count || 0),
      clicks30d: Number(tracked?.clicks || 0) + Number(marketplaceTracked?.clicks || 0),
      orders30d: Number(metrics?.orders || 0),
      revenue30dKrw: Number(metrics?.revenue_krw || 0),
    },
    capabilities: {
      manualLinkRegistry: true,
      manualPerformanceLedger: true,
      automaticProductSearch: true,
      onDemandProductIngest: true,
      offerRegistryAdapter: true,
      multiProviderCatalog: true,
      productIdentityCatalog: true,
      merchantAffiliateRouting: true,
      directAndNetworkAffiliate: true,
      internationalAffiliateMarkets: true,
      chinaAffiliateMarkets: true,
      chinaAffiliatePresets: true,
      recommendationRequiresActiveAffiliate: true,
      recommendationRequiresVerifiedTrackingAndCatalog: true,
      freshPriceRequiredForRecommendation: true,
      providerFeedSync: true,
      manualMarketplaceProductRegistration: true,
      automaticDeepLink: true,
      automaticClickTracking: true,
      automaticPerformanceSync: false,
      apiStatus: automation.configured ? 'configured' : 'credentials_required',
    },
  };
}

async function handleMerchantRoutes(request, env, auth, path) {
  if (request.method === 'GET' && path === `${PREFIX}/routes`) {
    const rows = await env.DB.prepare('SELECT * FROM affiliate_merchant_routes ORDER BY recommendation_enabled DESC, affiliate_status, merchant_name').all();
    return json({ routes: (rows.results || []).map(routeView) }, 200, auth.response.headers);
  }
  if (request.method !== 'POST' || path !== `${PREFIX}/routes`) return null;
  const body = await readJson(request);
  if (!body) return json({ error: '올바른 JSON 요청이 필요합니다.' }, 400, auth.response.headers);
  const merchantKey = safeKey(body.merchantKey);
  const merchantName = cleanText(body.merchantName, 120);
  const affiliateMode = cleanText(body.affiliateMode || 'direct', 20).toLowerCase();
  const networkKey = affiliateMode === 'network' ? safeKey(body.networkKey) : '';
  const networkName = affiliateMode === 'network' ? cleanText(body.networkName, 120) : '';
  const affiliateStatus = cleanText(body.affiliateStatus || 'candidate', 20).toLowerCase();
  const trackingStatus = cleanText(body.trackingStatus || 'not_ready', 20).toLowerCase();
  const catalogStatus = cleanText(body.catalogStatus || 'not_ready', 24).toLowerCase();
  const country = marketCountry(body.marketCountry);
  const currency = settlementCurrency(body.settlementCurrency);
  const programUrl = httpsUrl(body.programUrl, { optional: true });
  const notes = cleanText(body.notes, 500);
  const requestedRecommendation = Boolean(body.recommendationEnabled);
  if (!merchantKey || !merchantName) return json({ error: '판매처 코드와 판매처 이름이 필요합니다.' }, 400, auth.response.headers);
  if (!AFFILIATE_ROUTE_MODES.has(affiliateMode)) return json({ error: '제휴 방식은 direct 또는 network여야 합니다.' }, 400, auth.response.headers);
  if (affiliateMode === 'network' && (!networkKey || !networkName)) return json({ error: '간접 제휴에는 제휴망 코드와 이름이 필요합니다.' }, 400, auth.response.headers);
  if (!AFFILIATE_ROUTE_STATUSES.has(affiliateStatus)) return json({ error: '지원하지 않는 제휴 상태입니다.' }, 400, auth.response.headers);
  if (!AFFILIATE_TRACKING_STATUSES.has(trackingStatus)) return json({ error: '지원하지 않는 추적링크 상태입니다.' }, 400, auth.response.headers);
  if (!AFFILIATE_CATALOG_STATUSES.has(catalogStatus)) return json({ error: '지원하지 않는 상품/가격 공급 상태입니다.' }, 400, auth.response.headers);
  if (!country || !currency) return json({ error: '국가는 ISO 2자리, 통화는 ISO 3자리 코드가 필요합니다.' }, 400, auth.response.headers);
  if (programUrl === null) return json({ error: '제휴 프로그램 URL은 HTTPS 형식이어야 합니다.' }, 400, auth.response.headers);
  const recommendationReady = affiliateStatus === 'active' && trackingStatus === 'ready' && RECOMMENDABLE_CATALOG_STATUSES.has(catalogStatus);
  if (requestedRecommendation && !recommendationReady) return json({ error: '추천 허용은 제휴 active + 추적링크 ready + 상품/가격 공급 ready를 모두 충족해야 합니다.' }, 409, auth.response.headers);
  const routeKey = `${merchantKey}-${affiliateMode}-${networkKey || 'direct'}`.slice(0, 180);
  const now = new Date().toISOString();
  const recommendationVerifiedAt = requestedRecommendation && recommendationReady ? now : null;
  await env.DB.prepare(`INSERT INTO affiliate_merchant_routes (route_key, merchant_key, merchant_name, market_country, settlement_currency, affiliate_mode, network_key, network_name, affiliate_status, tracking_status, catalog_status, recommendation_enabled, recommendation_verified_at, program_url, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(merchant_key, affiliate_mode, network_key) DO UPDATE SET merchant_name = excluded.merchant_name, market_country = excluded.market_country, settlement_currency = excluded.settlement_currency, network_name = excluded.network_name, affiliate_status = excluded.affiliate_status, tracking_status = excluded.tracking_status, catalog_status = excluded.catalog_status, recommendation_enabled = excluded.recommendation_enabled, recommendation_verified_at = excluded.recommendation_verified_at, program_url = excluded.program_url, notes = excluded.notes, updated_at = excluded.updated_at`)
    .bind(routeKey, merchantKey, merchantName, country, currency, affiliateMode, networkKey, networkName, affiliateStatus, trackingStatus, catalogStatus, requestedRecommendation ? 1 : 0, recommendationVerifiedAt, programUrl || '', notes, now, now).run();
  const row = await env.DB.prepare('SELECT * FROM affiliate_merchant_routes WHERE merchant_key = ? AND affiliate_mode = ? AND network_key = ? LIMIT 1').bind(merchantKey, affiliateMode, networkKey).first();
  await audit(env, auth.session, 'affiliate.route.upsert', row?.route_key || routeKey, JSON.stringify({ merchantKey, affiliateMode, networkKey, affiliateStatus, recommendationEnabled: requestedRecommendation, country, currency }));
  return json({ route: routeView(row) }, 200, auth.response.headers);
}

async function handleAccounts(request, env, auth, path) {
  if (request.method === 'GET' && path === `${PREFIX}/accounts`) {
    const rows = await env.DB.prepare('SELECT * FROM affiliate_accounts ORDER BY provider_key, id').all();
    return json({ accounts: rows.results.map(accountView) }, 200, auth.response.headers);
  }
  const match = path.match(/^\/api\/affiliate\/accounts\/([a-z0-9-]+)$/);
  if (!match || request.method !== 'PUT') return null;
  const current = await env.DB.prepare('SELECT * FROM affiliate_accounts WHERE id = ?').bind(match[1]).first();
  if (!current) return json({ error: '제휴 계정을 찾을 수 없습니다.' }, 404, auth.response.headers);
  const body = await readJson(request);
  if (!body) return json({ error: '올바른 JSON 요청이 필요합니다.' }, 400, auth.response.headers);
  const displayName = cleanText(body.displayName ?? current.display_name, 120);
  const defaultChannel = cleanText(body.defaultChannel ?? current.default_channel, 120);
  const disclosureText = cleanText(body.disclosureText ?? current.disclosure_text, 1000);
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : Boolean(current.enabled);
  if (!displayName) return json({ error: '계정 표시 이름이 필요합니다.' }, 400, auth.response.headers);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE affiliate_accounts SET display_name = ?, default_channel = ?, disclosure_text = ?, enabled = ?, updated_at = ? WHERE id = ?`).bind(displayName, defaultChannel, disclosureText, enabled ? 1 : 0, now, match[1]).run();
  await audit(env, auth.session, 'affiliate.account.update', match[1], JSON.stringify({ defaultChannel, enabled }));
  const updated = await env.DB.prepare('SELECT * FROM affiliate_accounts WHERE id = ?').bind(match[1]).first();
  return json({ account: accountView(updated) }, 200, auth.response.headers);
}

async function handleLinks(request, env, auth, path, url) {
  if (request.method === 'GET' && path === `${PREFIX}/links`) {
    const requested = Math.trunc(Number(url.searchParams.get('limit')) || 50);
    const limit = Math.max(1, Math.min(200, requested));
    const rows = await env.DB.prepare(`SELECT * FROM affiliate_links ORDER BY id DESC LIMIT ?`).bind(limit).all();
    return json({ links: rows.results.map(linkView) }, 200, auth.response.headers);
  }
  if (request.method === 'POST' && path === `${PREFIX}/links`) {
    const body = await readJson(request);
    if (!body) return json({ error: '올바른 JSON 요청이 필요합니다.' }, 400, auth.response.headers);
    const accountId = cleanText(body.accountId || DEFAULT_ACCOUNT_ID, 80);
    const account = await env.DB.prepare('SELECT * FROM affiliate_accounts WHERE id = ? AND enabled = 1').bind(accountId).first();
    if (!account) return json({ error: '사용 가능한 제휴 계정을 찾을 수 없습니다.' }, 404, auth.response.headers);
    const productName = cleanText(body.productName, 200);
    const affiliateUrl = httpsUrl(body.affiliateUrl);
    const destinationUrl = httpsUrl(body.destinationUrl, { optional: true });
    const channel = cleanText(body.channel || account.default_channel, 120);
    const campaignName = cleanText(body.campaignName, 160);
    const tenantSlug = cleanText(body.tenantSlug, 80) || null;
    if (!productName) return json({ error: '상품 또는 콘텐츠 이름이 필요합니다.' }, 400, auth.response.headers);
    if (!affiliateUrl) return json({ error: 'HTTPS 형식의 제휴 링크가 필요합니다.' }, 400, auth.response.headers);
    if (destinationUrl === null) return json({ error: '원본 상품 URL은 HTTPS 형식이어야 합니다.' }, 400, auth.response.headers);
    const now = new Date().toISOString();
    const createdBy = await adminId(env, auth.session);
    const result = await env.DB.prepare(`INSERT INTO affiliate_links (account_id, tenant_slug, product_name, destination_url, affiliate_url, channel, campaign_name, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`).bind(accountId, tenantSlug, productName, destinationUrl || '', affiliateUrl, channel, campaignName, createdBy, now, now).run();
    const row = await env.DB.prepare('SELECT * FROM affiliate_links WHERE id = ?').bind(result.meta.last_row_id).first();
    await audit(env, auth.session, 'affiliate.link.create', `${accountId}:${row.id}`, JSON.stringify({ productName, channel, campaignName, tenantSlug }));
    return json({ link: linkView(row) }, 201, auth.response.headers);
  }
  const archive = path.match(/^\/api\/affiliate\/links\/(\d+)\/archive$/);
  if (archive && request.method === 'POST') {
    const existing = await env.DB.prepare('SELECT * FROM affiliate_links WHERE id = ?').bind(Number(archive[1])).first();
    if (!existing) return json({ error: '제휴 링크를 찾을 수 없습니다.' }, 404, auth.response.headers);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE affiliate_links SET status = 'archived', updated_at = ? WHERE id = ?").bind(now, Number(archive[1])).run();
    await archiveMarketplaceOffer(env.DB, Number(archive[1]));
    await audit(env, auth.session, 'affiliate.link.archive', String(archive[1]), existing.product_name);
    const row = await env.DB.prepare('SELECT * FROM affiliate_links WHERE id = ?').bind(Number(archive[1])).first();
    return json({ link: linkView(row) }, 200, auth.response.headers);
  }
  return null;
}

async function handleProductPerformance(request, env, auth, path) {
  if (request.method === 'GET' && path === `${PREFIX}/performance`) {
    const rows = await env.DB.prepare(`SELECT d.product_row_id,p.product_id,p.product_name,d.metric_date,d.clicks,d.orders,d.cancels,d.gmv_krw,d.commission_krw,d.source,d.updated_at FROM affiliate_product_performance_daily d JOIN affiliate_storefront_products p ON p.id=d.product_row_id WHERE p.account_id=? AND p.storefront_slug=? ORDER BY d.metric_date DESC,d.id DESC LIMIT 180`).bind(DEFAULT_ACCOUNT_ID,PUBLIC_STOREFRONT_SLUG).all();
    return json({ performance:(rows.results||[]).map(row=>({ productRowId:Number(row.product_row_id),productId:row.product_id,productName:row.product_name,metricDate:row.metric_date,clicks:Number(row.clicks||0),orders:Number(row.orders||0),cancels:Number(row.cancels||0),gmvKrw:Number(row.gmv_krw||0),commissionKrw:Number(row.commission_krw||0),source:row.source,updatedAt:row.updated_at })) },200,auth.response.headers);
  }
  if (request.method !== 'POST' || path !== `${PREFIX}/performance`) return null;
  const body=await readJson(request);
  if(!body) return json({error:'Valid JSON is required.'},400,auth.response.headers);
  const metricDate=cleanText(body.metricDate,10); const productId=cleanText(body.productId,100); const productRowId=nonNegativeInt(body.productRowId);
  const clicks=nonNegativeInt(body.clicks); const orders=nonNegativeInt(body.orders); const cancels=nonNegativeInt(body.cancels); const gmvKrw=nonNegativeInt(body.gmvKrw); const commissionKrw=nonNegativeInt(body.commissionKrw);
  const source=cleanText(body.source||'coupang_partner_report',60).toLowerCase();
  const allowedSources=new Set(['coupang_partner_report','coupang_partner_api','manual_import']);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(metricDate)||[clicks,orders,cancels,gmvKrw,commissionKrw].some(v=>v===null)||!allowedSources.has(source)) return json({error:'Invalid performance payload.'},400,auth.response.headers);
  let product=null;
  if(productRowId) product=await env.DB.prepare('SELECT id,product_id,product_name FROM affiliate_storefront_products WHERE id=? AND account_id=? AND storefront_slug=? LIMIT 1').bind(productRowId,DEFAULT_ACCOUNT_ID,PUBLIC_STOREFRONT_SLUG).first();
  if(!product&&productId) product=await env.DB.prepare('SELECT id,product_id,product_name FROM affiliate_storefront_products WHERE product_id=? AND account_id=? AND storefront_slug=? LIMIT 1').bind(productId,DEFAULT_ACCOUNT_ID,PUBLIC_STOREFRONT_SLUG).first();
  if(!product) return json({error:'Mall product not found.'},404,auth.response.headers);
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO affiliate_product_performance_daily(product_row_id,metric_date,clicks,orders,cancels,gmv_krw,commission_krw,source,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(product_row_id,metric_date,source) DO UPDATE SET clicks=excluded.clicks,orders=excluded.orders,cancels=excluded.cancels,gmv_krw=excluded.gmv_krw,commission_krw=excluded.commission_krw,updated_at=excluded.updated_at`).bind(Number(product.id),metricDate,clicks,orders,cancels,gmvKrw,commissionKrw,source,now).run();
  await audit(env,auth.session,'affiliate.performance.upsert',`${product.id}:${metricDate}:${source}`,JSON.stringify({productId:product.product_id,clicks,orders,cancels,gmvKrw,commissionKrw}));
  return json({ok:true,productRowId:Number(product.id),productId:product.product_id,productName:product.product_name,metricDate,clicks,orders,cancels,gmvKrw,commissionKrw,source},200,auth.response.headers);
}
async function handleMetrics(request, env, auth, path) {
  if (request.method === 'GET' && path === `${PREFIX}/metrics`) {
    const rows = await env.DB.prepare(`SELECT account_id, metric_date, clicks, orders, revenue_krw, source, updated_at FROM affiliate_daily_metrics ORDER BY metric_date DESC, id DESC LIMIT 90`).all();
    return json({ metrics: rows.results.map(row => ({ accountId: row.account_id, metricDate: row.metric_date, clicks: Number(row.clicks || 0), orders: Number(row.orders || 0), revenueKrw: Number(row.revenue_krw || 0), source: row.source, updatedAt: row.updated_at })) }, 200, auth.response.headers);
  }
  if (request.method !== 'POST' || path !== `${PREFIX}/metrics`) return null;
  const body = await readJson(request);
  if (!body) return json({ error: '올바른 JSON 요청이 필요합니다.' }, 400, auth.response.headers);
  const accountId = cleanText(body.accountId || DEFAULT_ACCOUNT_ID, 80);
  const metricDate = cleanText(body.metricDate, 10);
  const clicks = nonNegativeInt(body.clicks);
  const orders = nonNegativeInt(body.orders);
  const revenueKrw = nonNegativeInt(body.revenueKrw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metricDate)) return json({ error: '성과 일자는 YYYY-MM-DD 형식이어야 합니다.' }, 400, auth.response.headers);
  if ([clicks, orders, revenueKrw].some(value => value === null)) return json({ error: '클릭·주문·수익은 0 이상의 숫자여야 합니다.' }, 400, auth.response.headers);
  const account = await env.DB.prepare('SELECT id FROM affiliate_accounts WHERE id = ?').bind(accountId).first();
  if (!account) return json({ error: '제휴 계정을 찾을 수 없습니다.' }, 404, auth.response.headers);
  const now = new Date().toISOString();
  const recordedBy = await adminId(env, auth.session);
  await env.DB.prepare(`INSERT INTO affiliate_daily_metrics (account_id, metric_date, clicks, orders, revenue_krw, source, recorded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?) ON CONFLICT(account_id, metric_date, source) DO UPDATE SET clicks = excluded.clicks, orders = excluded.orders, revenue_krw = excluded.revenue_krw, recorded_by = excluded.recorded_by, updated_at = excluded.updated_at`).bind(accountId, metricDate, clicks, orders, revenueKrw, recordedBy, now, now).run();
  await audit(env, auth.session, 'affiliate.metrics.upsert', `${accountId}:${metricDate}`, JSON.stringify({ clicks, orders, revenueKrw }));
  return json({ ok: true, accountId, metricDate, clicks, orders, revenueKrw, source: 'manual' }, 200, auth.response.headers);
}

export async function handleAffiliateRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  if (!env.DB) return json({ error: '제휴마케팅 데이터베이스 연결이 설정되지 않았습니다.' }, 503);
  if (request.method === 'GET' && url.pathname === `${PREFIX}/public/products`) return publicProducts(request, env, url);
  const imageResponse = await publicImage(request, env, url);
  if (imageResponse) return imageResponse;
  const clickResponse = await publicClick(request, env, url);
  if (clickResponse) return clickResponse;
  const marketplaceClickResponse = await publicMarketplaceClick(request, env, url);
  if (marketplaceClickResponse) return marketplaceClickResponse;

  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;
  await ensureSchema(env.DB);
  const path = url.pathname;
  if (request.method === 'GET' && path === `${PREFIX}/overview`) return json(await overview(env), 200, auth.response.headers);
  if (request.method === 'GET' && path === `${PREFIX}/automation`) return json(await getAffiliateAutomationStatus(env), 200, auth.response.headers);
  if (request.method === 'POST' && path === `${PREFIX}/automation/run`) {
    const result = await runAffiliateAutomation(env, { force: true, reason: 'admin' });
    await audit(env, auth.session, 'affiliate.automation.run', PUBLIC_STOREFRONT_SLUG, JSON.stringify({ status: result.status, selectedCount: result.selectedCount || 0 }));
    return json(result, result.ok ? 200 : 409, auth.response.headers);
  }
  if (request.method === 'POST' && path === `${PREFIX}/ingest`) {
    const body = await readJson(request);
    if (!body) return json({ error: '올바른 JSON 요청이 필요합니다.' }, 400, auth.response.headers);
    const query = cleanText(body.query, 120);
    const category = cleanText(body.category, 80) || '추천';
    const limit = Math.max(1, Math.min(5, Math.trunc(Number(body.limit) || 3)));
    const result = await ingestAffiliateProductsOnDemand(env, { query, category, limit, reason: 'admin-on-demand' });
    const cards = [];
    for (const product of result.products || []) {
      const row = await env.DB.prepare(`SELECT id, product_id, product_name, price_krw, image_url, category, is_rocket, is_free_shipping, selected_at
        FROM affiliate_storefront_products WHERE account_id = ? AND storefront_slug = ? AND product_id = ? LIMIT 1`)
        .bind(DEFAULT_ACCOUNT_ID, PUBLIC_STOREFRONT_SLUG, product.productId).first();
      if (row) cards.push(publicProductView(request, row));
    }
    await audit(env, auth.session, 'affiliate.product.ingest', PUBLIC_STOREFRONT_SLUG, JSON.stringify({ query, category, status: result.status, selectedCount: result.selectedCount || 0 }));
    const status = result.status === 'invalid_query' ? 400 : (result.ok ? 200 : 409);
    return json({ ok: result.ok, status: result.status, query, selectedCount: cards.length, cards, offers: result.offers || [], error: result.error || '' }, status, auth.response.headers);
  }
  if (request.method === 'POST' && path === `${PREFIX}/products`) {
    const body = await readJson(request);
    if (!body) return json({ error: '올바른 JSON 요청이 필요합니다.' }, 400, auth.response.headers);
    const merchantKey = safeKey(body.providerKey);
    const recommendationRoute = merchantKey ? await recommendationRouteForMerchant(env.DB, merchantKey) : null;
    if (!recommendationRoute) return json({ error: '제휴·추적링크·상품/가격 공급 검증과 추천 허용을 먼저 완료해 주세요.' }, 409, auth.response.headers);
    const createdBy = await adminId(env, auth.session);
    const result = await registerMarketplaceProduct(env, body, { createdBy });
    if (!result.ok) return json({ error: result.error || '제휴상품을 등록하지 못했습니다.' }, 400, auth.response.headers);
    await audit(env, auth.session, 'affiliate.marketplace.product.create', `${result.providerKey}:${result.linkId}`, body.productName || '');
    return json(result, 201, auth.response.headers);
  }
  const providerSync = path.match(/^\/api\/affiliate\/providers\/([a-z0-9_-]+)\/sync$/);
  if (providerSync && request.method === 'POST') {
    const result = await syncProviderFeed(env, providerSync[1]);
    const catalogStatus = result.ok && Number(result.synced || 0) > 0 ? 'feed_ready' : (result.ok ? 'not_ready' : 'failed');
    await env.DB.prepare(`UPDATE affiliate_merchant_routes SET catalog_status = ?, recommendation_verified_at = CASE WHEN ? = 'feed_ready' AND affiliate_status = 'active' AND tracking_status = 'ready' AND recommendation_enabled = 1 THEN ? ELSE recommendation_verified_at END, updated_at = ? WHERE merchant_key = ?`)
      .bind(catalogStatus, catalogStatus, new Date().toISOString(), new Date().toISOString(), providerSync[1]).run().catch(() => {});
    await audit(env, auth.session, 'affiliate.provider.feed.sync', providerSync[1], JSON.stringify({ status: result.status, received: result.received || 0, valid: result.valid || 0, synced: result.synced || 0, catalogStatus }));
    return json(result, result.ok ? 200 : 409, auth.response.headers);
  }
  if (request.method === 'GET' && path === `${PREFIX}/providers`) {
    const [providerRows, accountRows] = await Promise.all([
      env.DB.prepare('SELECT * FROM affiliate_providers ORDER BY provider_key').all(),
      env.DB.prepare('SELECT * FROM affiliate_accounts ORDER BY provider_key, id').all(),
    ]);
    const feeds = listProviderFeedDescriptors(env);
    const providers = new Map();
    for (const row of providerRows.results || []) providers.set(row.provider_key, { providerKey: row.provider_key, displayName: row.display_name, providerKind: row.provider_kind, connectionMode: row.connection_mode, enabled: Boolean(row.enabled) });
    const accountByProvider = new Map((accountRows.results || []).map(row => [row.provider_key, row]));
    for (const feed of feeds) {
      const current = providers.get(feed.providerKey) || { providerKey: feed.providerKey, displayName: feed.providerName, providerKind: 'affiliate', enabled: feed.enabled };
      providers.set(feed.providerKey, { ...current, displayName: feed.providerName, connectionMode: feed.connectionMode, enabled: feed.enabled });
    }
    return json({ providers: [...providers.values()].map(provider => {
      const account = accountByProvider.get(provider.providerKey);
      const feed = feeds.find(item => item.providerKey === provider.providerKey);
      return { ...provider, status: account?.status || (feed ? (feed.secretConfigured ? 'configured' : 'secret_required') : 'registered'), lastSyncedAt: account?.last_synced_at || null, lastError: account?.last_error || '', feedConfigured: Boolean(feed), endpointHost: feed?.endpointHost || '', secretRequired: Boolean(feed?.secretRequired), secretConfigured: feed ? Boolean(feed.secretConfigured) : null };
    }) }, 200, auth.response.headers);
  }
  const routeResponse = await handleMerchantRoutes(request, env, auth, path);
  if (routeResponse) return routeResponse;
  const accountResponse = await handleAccounts(request, env, auth, path);
  if (accountResponse) return accountResponse;
  const linkResponse = await handleLinks(request, env, auth, path, url);
  if (linkResponse) return linkResponse;
  const performanceResponse = await handleProductPerformance(request, env, auth, path);
  if (performanceResponse) return performanceResponse;
  const metricsResponse = await handleMetrics(request, env, auth, path);
  if (metricsResponse) return metricsResponse;
  return json({ error: 'Affiliate API endpoint not found' }, 404, auth.response.headers);
}
