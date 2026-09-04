import authWorker from './auth-worker.js';
import { getAffiliateAutomationStatus, ingestAffiliateProductsOnDemand, runAffiliateAutomation } from './coupang-partners-automation.js';
import { archiveMarketplaceOffer, listMarketplaceProducts, MULTI_AFFILIATE_DISCLOSURE, publicMarketplaceClick, registerMarketplaceProduct } from './affiliate-marketplace.js';

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
    db.prepare('CREATE INDEX IF NOT EXISTS idx_affiliate_links_account_time ON affiliate_links(account_id, created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_affiliate_metrics_account_date ON affiliate_daily_metrics(account_id, metric_date DESC)'),
  ]);
  const now = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO affiliate_providers (provider_key, display_name, provider_kind, connection_mode, enabled, created_at, updated_at) VALUES ('coupang_partners', 'Coupang Partners', 'affiliate', 'manual', 1, ?, ?)`).bind(now, now).run();
  await db.prepare(`INSERT OR IGNORE INTO affiliate_accounts (id, provider_key, owner_type, owner_key, display_name, account_label, status, connection_mode, default_channel, disclosure_text, enabled, created_at, updated_at) VALUES (?, 'coupang_partners', 'internal', 'ekodibiz', '에코디비즈 쿠팡파트너스', 'EKODIBIZ', 'manual_ready', 'manual', '', '', 1, ?, ?)`).bind(DEFAULT_ACCOUNT_ID, now, now).run();
  await db.prepare(`UPDATE affiliate_accounts SET disclosure_text = ?, updated_at = ? WHERE id = ? AND TRIM(disclosure_text) = ''`).bind(DEFAULT_DISCLOSURE, now, DEFAULT_ACCOUNT_ID).run();
}

function accountView(row) {
  return { id: row.id, providerKey: row.provider_key, ownerType: row.owner_type, ownerKey: row.owner_key, displayName: row.display_name, accountLabel: row.account_label, status: row.status, connectionMode: row.connection_mode, defaultChannel: row.default_channel, disclosureText: row.disclosure_text, enabled: Boolean(row.enabled), lastSyncedAt: row.last_synced_at || null, lastError: row.last_error || '', updatedAt: row.updated_at };
}
function linkView(row) {
  return { id: row.id, accountId: row.account_id, tenantSlug: row.tenant_slug || '', productName: row.product_name, destinationUrl: row.destination_url || '', affiliateUrl: row.affiliate_url, channel: row.channel || '', campaignName: row.campaign_name || '', status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
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
    await runAffiliateAutomation(env, { reason: automation.activeProducts > 0 ? 'public-stale' : 'public-empty' });
    automation = await getAffiliateAutomationStatus(env);
  }
  const rows = await readPublicRows(env, limit);
  const coupangProducts = rows.map(row => publicProductView(request, row));
  const marketplaceProducts = await listMarketplaceProducts(request, env, limit).catch(() => []);
  const products = [...coupangProducts, ...marketplaceProducts].slice(0, limit);
  const automationStatus = products.length ? 'ready' : (automation.status || 'warming');
  const providers = [...new Map(products.map(item => [item.providerKey || 'unknown', item.providerName || item.providerKey || '제휴 판매처'])).entries()]
    .map(([providerKey, providerName]) => ({ providerKey, providerName }));
  const combinedDisclosure = marketplaceProducts.length ? `${disclosureText} ${MULTI_AFFILIATE_DISCLOSURE}` : disclosureText;
  return json({ storefront: PUBLIC_STOREFRONT_SLUG, providerKey: marketplaceProducts.length ? 'multi_affiliate' : 'coupang_partners', providers, automationStatus, disclosureText: combinedDisclosure, products }, 200, publicHeaders(request));
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
    env.DB.prepare(`SELECT COUNT(*) AS count FROM ekodi_offers WHERE offer_type = 'product' AND visibility = 'public' AND status = 'active' AND source_provider <> 'coupang_partners'`).first().catch(() => ({ count: 0 })),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    accounts: accounts.results.map(accountView),
    automation,
    summary: {
      providers: new Set(accounts.results.map(row => row.provider_key)).size,
      accounts: accounts.results.length,
      activeLinks: Number(links?.active_links || 0),
      totalLinks: Number(links?.total_links || 0),
      activeProducts: Number(automation.activeProducts || 0) + Number(marketplaceProducts?.count || 0),
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
      manualMarketplaceProductRegistration: true,
      automaticDeepLink: true,
      automaticClickTracking: true,
      automaticPerformanceSync: false,
      apiStatus: automation.configured ? 'configured' : 'credentials_required',
    },
  };
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
    const createdBy = await adminId(env, auth.session);
    const result = await registerMarketplaceProduct(env, body, { createdBy });
    if (!result.ok) return json({ error: result.error || '제휴상품을 등록하지 못했습니다.' }, 400, auth.response.headers);
    await audit(env, auth.session, 'affiliate.marketplace.product.create', `${result.providerKey}:${result.linkId}`, body.productName || '');
    return json(result, 201, auth.response.headers);
  }
  if (request.method === 'GET' && path === `${PREFIX}/providers`) {
    const rows = await env.DB.prepare('SELECT * FROM affiliate_providers ORDER BY provider_key').all();
    return json({ providers: rows.results.map(row => ({ providerKey: row.provider_key, displayName: row.display_name, providerKind: row.provider_kind, connectionMode: row.connection_mode, enabled: Boolean(row.enabled) })) }, 200, auth.response.headers);
  }
  const accountResponse = await handleAccounts(request, env, auth, path);
  if (accountResponse) return accountResponse;
  const linkResponse = await handleLinks(request, env, auth, path, url);
  if (linkResponse) return linkResponse;
  const metricsResponse = await handleMetrics(request, env, auth, path);
  if (metricsResponse) return metricsResponse;
  return json({ error: 'Affiliate API endpoint not found' }, 404, auth.response.headers);
}
