const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const PUBLIC_ORIGIN = 'https://mall.ekodi.kr';
const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const ATTRIBUTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const FEE_POLICY = Object.freeze({
  individual: Object.freeze({ direct: 7, marketplace: 8, ai: 9 }),
  businessStore: 10,
  vatIncluded: true,
  pgIncluded: true,
  proAiSubscriptionSeparate: true,
});

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function allowedOrigin(request) {
  const origin = request.headers.get('origin') || '';
  if (origin === PUBLIC_ORIGIN || origin === 'https://ekodi-mall.pages.dev') return origin;
  if (/^https:\/\/[a-z0-9-]+\.ekodi-mall\.pages\.dev$/i.test(origin)) return origin;
  return '';
}

function corsHeaders(request) {
  const origin = allowedOrigin(request);
  return origin ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', vary: 'Origin' } : {};
}

function cleanText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanList(value, maxItems = 8, maxLen = 500) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, maxLen)).filter(Boolean).slice(0, maxItems);
}

function safeJson(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function randomHex(bytes = 16) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function nowIso() { return new Date().toISOString(); }

export function feeFor(sellerType, sourceType, hasStore = false) {
  if (sellerType === 'business' && hasStore) return FEE_POLICY.businessStore;
  const source = ['direct', 'marketplace', 'ai'].includes(sourceType) ? sourceType : 'marketplace';
  return FEE_POLICY.individual[source];
}

async function verifySupabaseUser(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY },
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  if (!user?.id) return null;
  return { id: String(user.id), email: cleanText(user.email, 320), metadata: user.user_metadata || {} };
}

function sanitizePayload(input = {}) {
  const sellerType = input?.seller?.type === 'business' ? 'business' : 'individual';
  const storeInput = input?.store && typeof input.store === 'object' ? input.store : null;
  const store = storeInput?.name ? {
    name: cleanText(storeInput.name, 120),
    slug: cleanText(storeInput.slug, 100).toLowerCase().replace(/[^a-z0-9-]/g, ''),
    contact: cleanText(storeInput.contact, 500),
  } : null;
  const p = input?.product || {};
  const saleType = ['direct', 'affiliate', 'inquiry'].includes(p.saleType) ? p.saleType : 'direct';
  const price = p.price === null || p.price === '' || p.price === undefined ? null : Math.max(0, Math.round(Number(p.price) || 0));
  const product = {
    saleType,
    category: cleanText(p.category, 80) || 'local',
    name: cleanText(p.name, 160),
    audience: cleanText(p.audience, 1000),
    oneLine: cleanText(p.oneLine, 1000),
    price,
    benefits: cleanList(p.benefits),
    specs: cleanList(p.specs),
    story: cleanText(p.story, 6000),
    fulfillment: cleanText(p.fulfillment, 2000),
    contact: cleanText(p.contact, 500),
    affiliateUrl: saleType === 'affiliate' ? cleanText(p.affiliateUrl || p?.action?.url, 2000) : '',
  };
  const c = input?.content || {};
  const content = {
    headline: cleanText(c.headline, 1000),
    detailIntro: cleanText(c.detailIntro, 3000),
    socialCaption: cleanText(c.socialCaption, 5000),
    shortsOutline: cleanList(c.shortsOutline, 10, 1000),
  };
  return {
    seller: { type: sellerType, displayName: cleanText(input?.seller?.displayName, 120) },
    store,
    product,
    content,
  };
}

function validateProduct(payload) {
  const errors = [];
  if (!payload.seller.displayName) errors.push('상품에 표시할 판매자 이름이 필요합니다.');
  if (!payload.product.name) errors.push('상품명이 필요합니다.');
  if (!payload.product.contact && !payload.store?.contact) errors.push('연락·문의 채널이 필요합니다.');
  if (payload.product.saleType === 'affiliate' && !/^https:\/\//i.test(payload.product.affiliateUrl)) errors.push('제휴상품에는 유효한 https 제휴링크가 필요합니다.');
  return errors;
}

export class MallCatalog {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    state.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          email TEXT NOT NULL DEFAULT '',
          seller_type TEXT NOT NULL,
          seller_display_name TEXT NOT NULL,
          store_json TEXT,
          product_json TEXT NOT NULL,
          content_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          share_code TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          published_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_products_user_updated ON products(user_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_products_public ON products(status, published_at DESC);
        CREATE TABLE IF NOT EXISTS share_links (
          code TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          source_type TEXT NOT NULL,
          channel TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_share_links_product ON share_links(product_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS attributions (
          token TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          source_type TEXT NOT NULL,
          visitor_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_attributions_visitor ON attributions(visitor_id, product_id, expires_at DESC);
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          source_type TEXT NOT NULL,
          fee_rate REAL NOT NULL,
          gross_amount INTEGER NOT NULL,
          platform_fee_amount INTEGER NOT NULL,
          seller_settlement_amount INTEGER NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    });
  }

  rowProduct(row) {
    if (!row) return null;
    const store = safeJson(row.store_json, null);
    const product = safeJson(row.product_json, {});
    const content = safeJson(row.content_json, {});
    return {
      id: row.id,
      shareCode: row.share_code,
      publicUrl: `${PUBLIC_ORIGIN}/p/${encodeURIComponent(row.share_code)}`,
      publicShareLinkActive: row.status === 'published',
      status: row.status,
      seller: { type: row.seller_type, displayName: row.seller_display_name, email: row.email },
      store,
      product,
      content,
      feePolicy: FEE_POLICY,
      checkoutReady: false,
      paymentReady: false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
    };
  }

  first(query, ...bindings) {
    const rows = this.sql.exec(query, ...bindings).toArray();
    return rows[0] || null;
  }

  list(query, ...bindings) { return this.sql.exec(query, ...bindings).toArray(); }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const userId = request.headers.get('x-ekodi-user-id') || '';
    const email = request.headers.get('x-ekodi-user-email') || '';

    if (request.method === 'GET' && path === '/internal/products') {
      const rows = this.list('SELECT * FROM products WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100', userId);
      return json({ products: rows.map((row) => this.rowProduct(row)) });
    }

    if (request.method === 'POST' && path === '/internal/products') {
      const payload = sanitizePayload(await request.json().catch(() => ({})));
      const errors = validateProduct(payload);
      if (errors.length) return json({ error: errors[0], errors }, 400);
      const id = `prd_${randomHex(16)}`;
      const shareCode = `p_${randomHex(10)}`;
      const now = nowIso();
      this.sql.exec('INSERT INTO products (id,user_id,email,seller_type,seller_display_name,store_json,product_json,content_json,status,share_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        id, userId, email, payload.seller.type, payload.seller.displayName, JSON.stringify(payload.store), JSON.stringify(payload.product), JSON.stringify(payload.content), 'draft', shareCode, now, now);
      return json({ product: this.rowProduct(this.first('SELECT * FROM products WHERE id = ?', id)) }, 201);
    }

    const updateMatch = path.match(/^\/internal\/products\/(prd_[a-f0-9]{32})$/i);
    if (updateMatch && request.method === 'PUT') {
      const existing = this.first('SELECT * FROM products WHERE id = ? AND user_id = ?', updateMatch[1], userId);
      if (!existing) return json({ error: '상품을 찾을 수 없습니다.' }, 404);
      const payload = sanitizePayload(await request.json().catch(() => ({})));
      const errors = validateProduct(payload);
      if (errors.length) return json({ error: errors[0], errors }, 400);
      const now = nowIso();
      this.sql.exec('UPDATE products SET email=?,seller_type=?,seller_display_name=?,store_json=?,product_json=?,content_json=?,updated_at=? WHERE id=? AND user_id=?',
        email, payload.seller.type, payload.seller.displayName, JSON.stringify(payload.store), JSON.stringify(payload.product), JSON.stringify(payload.content), now, updateMatch[1], userId);
      return json({ product: this.rowProduct(this.first('SELECT * FROM products WHERE id = ?', updateMatch[1])) });
    }

    const publishMatch = path.match(/^\/internal\/products\/(prd_[a-f0-9]{32})\/publish$/i);
    if (publishMatch && request.method === 'POST') {
      const existing = this.first('SELECT * FROM products WHERE id = ? AND user_id = ?', publishMatch[1], userId);
      if (!existing) return json({ error: '상품을 찾을 수 없습니다.' }, 404);
      const product = safeJson(existing.product_json, {});
      if (!existing.seller_display_name || !product.name) return json({ error: '판매자 이름과 상품명을 먼저 입력해 주세요.' }, 400);
      if (product.saleType === 'affiliate' && !/^https:\/\//i.test(product.affiliateUrl || '')) return json({ error: '제휴상품은 유효한 제휴링크가 있어야 게시할 수 있습니다.' }, 400);
      const now = nowIso();
      this.sql.exec("UPDATE products SET status='published',published_at=COALESCE(published_at,?),updated_at=? WHERE id=? AND user_id=?", now, now, publishMatch[1], userId);
      return json({ product: this.rowProduct(this.first('SELECT * FROM products WHERE id = ?', publishMatch[1])) });
    }

    const shareMatch = path.match(/^\/internal\/products\/(prd_[a-f0-9]{32})\/share-links$/i);
    if (shareMatch && request.method === 'POST') {
      const existing = this.first("SELECT * FROM products WHERE id = ? AND user_id = ? AND status='published'", shareMatch[1], userId);
      if (!existing) return json({ error: '게시된 본인 상품만 공유링크를 만들 수 있습니다.' }, 404);
      const body = await request.json().catch(() => ({}));
      const channel = cleanText(body.channel, 40) || 'copy';
      const code = `ref_${randomHex(12)}`;
      this.sql.exec('INSERT INTO share_links (code,product_id,user_id,source_type,channel,created_at) VALUES (?,?,?,?,?,?)', code, existing.id, userId, 'direct', channel, nowIso());
      return json({ shareLink: { code, sourceType: 'direct', channel, url: `${PUBLIC_ORIGIN}/p/${encodeURIComponent(existing.share_code)}?ref=${encodeURIComponent(code)}`, feeRatePercent: 7 } }, 201);
    }

    if (request.method === 'GET' && path === '/internal/orders') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
      const rows = this.list('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', userId, limit);
      return json({ orders: rows.map((row) => ({ id: row.id, productId: row.product_id, sourceType: row.source_type, feeRatePercent: row.fee_rate, grossAmount: row.gross_amount, platformFeeAmount: row.platform_fee_amount, sellerSettlementAmount: row.seller_settlement_amount, status: row.status, createdAt: row.created_at })) });
    }

    if (request.method === 'GET' && path === '/internal/settlements') {
      const row = this.first("SELECT COALESCE(SUM(seller_settlement_amount),0) pending FROM orders WHERE user_id = ? AND status='paid'", userId) || { pending: 0 };
      return json({ settlement: { pendingAmount: Number(row.pending || 0), payoutEnabled: false, payoutStatus: 'disabled-until-kyc-and-payout-contract' } });
    }

    const publicProductMatch = path.match(/^\/public\/products\/([^/]+)$/);
    if (publicProductMatch && request.method === 'GET') {
      const row = this.first("SELECT * FROM products WHERE share_code = ? AND status='published'", decodeURIComponent(publicProductMatch[1]));
      if (!row) return json({ error: '공개 상품을 찾을 수 없습니다.' }, 404);
      const result = this.rowProduct(row);
      result.seller.email = '';
      return json({ product: result });
    }

    if (request.method === 'GET' && path === '/public/products') {
      const limit = Math.min(48, Math.max(1, Number(url.searchParams.get('limit')) || 24));
      const rows = this.list("SELECT * FROM products WHERE status='published' ORDER BY published_at DESC LIMIT ?", limit);
      return json({ products: rows.map((row) => { const p = this.rowProduct(row); p.seller.email = ''; return p; }) });
    }

    if (request.method === 'POST' && path === '/public/attribution/visit') {
      const body = await request.json().catch(() => ({}));
      const shareCode = cleanText(body.shareCode, 100);
      const refCode = cleanText(body.refCode, 100);
      const visitorId = cleanText(body.visitorId, 96) || `anon_${randomHex(12)}`;
      const productRow = this.first("SELECT * FROM products WHERE share_code = ? AND status='published'", shareCode);
      if (!productRow) return json({ error: '공개 상품을 찾을 수 없습니다.' }, 404);
      const activeExisting = this.first('SELECT * FROM attributions WHERE visitor_id = ? AND product_id = ? AND expires_at > ? ORDER BY created_at ASC LIMIT 1', visitorId, productRow.id, nowIso());
      if (activeExisting) return json({ attribution: { token: activeExisting.token, sourceType: activeExisting.source_type, expiresAt: activeExisting.expires_at, firstTouch: true } });
      let sourceType = 'marketplace';
      if (refCode) {
        const ref = this.first('SELECT * FROM share_links WHERE code = ? AND product_id = ? AND active = 1', refCode, productRow.id);
        if (ref?.source_type === 'direct') sourceType = 'direct';
        if (ref?.source_type === 'ai') sourceType = 'ai';
      }
      const token = `att_${randomHex(16)}`;
      const createdAt = nowIso();
      const expiresAt = new Date(Date.now() + ATTRIBUTION_TTL_MS).toISOString();
      this.sql.exec('INSERT INTO attributions (token,product_id,source_type,visitor_id,created_at,expires_at) VALUES (?,?,?,?,?,?)', token, productRow.id, sourceType, visitorId, createdAt, expiresAt);
      return json({ attribution: { token, sourceType, expiresAt, firstTouch: true } }, 201);
    }

    if (request.method === 'POST' && path === '/public/checkout/quote') {
      const body = await request.json().catch(() => ({}));
      const shareCode = cleanText(body.shareCode, 100);
      const quantity = Math.min(99, Math.max(1, Math.floor(Number(body.quantity) || 1)));
      const productRow = this.first("SELECT * FROM products WHERE share_code = ? AND status='published'", shareCode);
      if (!productRow) return json({ error: '공개 상품을 찾을 수 없습니다.' }, 404);
      const product = safeJson(productRow.product_json, {});
      if (product.saleType !== 'direct' || !Number.isFinite(product.price)) return json({ error: '직접판매 가격이 확정된 상품만 수수료 견적을 계산할 수 있습니다.' }, 409);
      let sourceType = 'marketplace';
      const token = cleanText(body.attributionToken, 100);
      if (token) {
        const attribution = this.first('SELECT * FROM attributions WHERE token = ? AND product_id = ? AND expires_at > ?', token, productRow.id, nowIso());
        if (attribution) sourceType = attribution.source_type;
      }
      const hasStore = Boolean(safeJson(productRow.store_json, null)?.name);
      const feeRatePercent = feeFor(productRow.seller_type, sourceType, hasStore);
      const grossAmount = product.price * quantity;
      const platformFeeAmount = Math.round(grossAmount * feeRatePercent / 100);
      const sellerSettlementAmount = Math.max(0, grossAmount - platformFeeAmount);
      return json({ quote: { productId: productRow.id, quantity, grossAmount, attributionType: sourceType, feeRatePercent, platformFeeAmount, sellerSettlementAmount, pgIncluded: true, vatIncluded: true, paymentEnabled: false, serverAuthoritative: true } });
    }

    return json({ error: 'Mall catalog route not found.' }, 404);
  }
}

async function catalogFetch(env, request, internalPath, user = null) {
  const id = env.MALL_CATALOG.idFromName('catalog-v1');
  const stub = env.MALL_CATALOG.get(id);
  const url = new URL(request.url);
  url.pathname = internalPath;
  const headers = new Headers(request.headers);
  if (user) {
    headers.set('x-ekodi-user-id', user.id);
    headers.set('x-ekodi-user-email', user.email || '');
  }
  headers.delete('authorization');
  return stub.fetch(new Request(url.toString(), { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/health') return json({ ok: true, service: 'ekodi-mall-api', storage: 'sqlite-durable-object', paymentsEnabled: false, feePolicy: FEE_POLICY }, 200, cors);

    if (url.pathname.startsWith('/api/public/')) {
      const internal = url.pathname.replace('/api/public', '/public');
      const response = await catalogFetch(env, request, internal);
      const body = await response.text();
      return new Response(body, { status: response.status, headers: { ...JSON_HEADERS, ...cors } });
    }

    if (!url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404, cors);
    const user = await verifySupabaseUser(request);
    if (!user) return json({ error: 'Google 판매자 로그인이 필요합니다.', code: 'SELLER_AUTH_REQUIRED' }, 401, cors);

    let internal = '';
    if (url.pathname === '/api/products') internal = '/internal/products';
    else if (/^\/api\/products\/prd_[a-f0-9]{32}$/i.test(url.pathname)) internal = url.pathname.replace('/api/products/', '/internal/products/');
    else if (/^\/api\/products\/prd_[a-f0-9]{32}\/publish$/i.test(url.pathname)) internal = url.pathname.replace('/api/products/', '/internal/products/');
    else if (/^\/api\/products\/prd_[a-f0-9]{32}\/share-links$/i.test(url.pathname)) internal = url.pathname.replace('/api/products/', '/internal/products/');
    else if (url.pathname === '/api/orders') internal = '/internal/orders';
    else if (url.pathname === '/api/settlements') internal = '/internal/settlements';
    else return json({ error: 'Mall seller route not found.' }, 404, cors);

    const response = await catalogFetch(env, request, internal, user);
    const body = await response.text();
    return new Response(body, { status: response.status, headers: { ...JSON_HEADERS, ...cors } });
  },
};
