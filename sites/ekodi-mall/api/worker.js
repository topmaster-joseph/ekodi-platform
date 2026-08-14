const DEFAULT_ALLOWED_ORIGINS = [
  'https://mall.ekodi.kr',
  'https://ekodi-mall.pages.dev'
];
const FEE_RATES = Object.freeze({ direct: 7, marketplace: 8, ai: 9 });
const VALID_SELLER_TYPES = new Set(['individual', 'business']);
const VALID_SALE_TYPES = new Set(['direct', 'affiliate', 'inquiry']);
const VALID_CATEGORIES = new Set(['local', 'living', 'book', 'gift']);
const VALID_CHANNELS = new Set(['copy', 'share', 'sms', 'kakao', 'qr', 'social', 'unknown']);

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanList(value, maxItems = 5, maxLength = 180) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\n,]/);
  return source.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function cleanPrice(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000_000 ? number : null;
}

function cleanHttpsUrl(value) {
  const text = cleanText(value, 1000);
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function slugOrBlank(value) {
  const slug = cleanText(value, 80).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : '';
}

function allowedOrigins(env) {
  const configured = cleanText(env?.ALLOWED_ORIGINS, 1000)
    .split(',').map((item) => item.trim()).filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function corsHeaders(origin, env) {
  const headers = new Headers({
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin'
  });
  if (origin && allowedOrigins(env).has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}

function json(data, status = 200, origin = '', env = null) {
  const headers = corsHeaders(origin, env);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers });
}

function randomCode(length = 12) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function productId() {
  return `prd_${crypto.randomUUID().replaceAll('-', '')}`;
}

function storeId() {
  return `sto_${crypto.randomUUID().replaceAll('-', '')}`;
}

function isoNow() {
  return new Date().toISOString();
}

function addDaysIso(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

export function resolveFeeRate({ sellerType = 'individual', attributionType = '', businessStoreVerified = false } = {}) {
  if (sellerType === 'business' && businessStoreVerified) return 10;
  return Object.prototype.hasOwnProperty.call(FEE_RATES, attributionType) ? FEE_RATES[attributionType] : null;
}

export function normalizeProductInput(body = {}) {
  const seller = body.seller || {};
  const product = body.product || {};
  const store = body.store || null;
  const content = body.content || {};
  const sellerType = VALID_SELLER_TYPES.has(seller.type) ? seller.type : 'individual';
  const saleType = VALID_SALE_TYPES.has(product.saleType) ? product.saleType : 'direct';
  const category = VALID_CATEGORIES.has(product.category) ? product.category : 'local';
  const affiliateUrl = cleanHttpsUrl(product.action?.url || product.affiliateUrl || '');
  const normalized = {
    sellerType,
    sellerDisplayName: cleanText(seller.displayName, 100),
    contact: cleanText(product.contact || store?.contact || '', 240),
    store: store?.name ? {
      id: cleanText(store.id, 80),
      name: cleanText(store.name, 120),
      slug: slugOrBlank(store.slug),
      contact: cleanText(store.contact || product.contact || '', 240)
    } : null,
    product: {
      saleType,
      category,
      name: cleanText(product.name, 160),
      audience: cleanText(product.audience, 500),
      oneLine: cleanText(product.oneLine, 300),
      price: cleanPrice(product.price),
      benefits: cleanList(product.benefits),
      specs: cleanList(product.specs),
      story: cleanText(product.story, 3000),
      fulfillment: cleanText(product.fulfillment, 1000),
      affiliateUrl
    },
    content: {
      headline: cleanText(content.headline, 300),
      detailIntro: cleanText(content.detailIntro, 1000),
      socialCaption: cleanText(content.socialCaption, 2000),
      shortsOutline: cleanList(content.shortsOutline, 8, 300)
    }
  };
  const errors = [];
  if (!normalized.sellerDisplayName) errors.push('판매자 표시명을 입력해 주세요.');
  if (!normalized.product.name) errors.push('상품명을 입력해 주세요.');
  if (!normalized.contact) errors.push('연락·문의 채널을 입력해 주세요.');
  if (saleType === 'affiliate' && !affiliateUrl) errors.push('제휴판매는 유효한 HTTPS 제휴링크가 필요합니다.');
  if (normalized.store?.name && !normalized.store.slug) errors.push('스토어를 연결하려면 영문 소문자·숫자·하이픈 slug가 필요합니다.');
  return { value: normalized, errors };
}

export function makePublicUrl(baseUrl, shareCode) {
  return `${String(baseUrl || 'https://mall.ekodi.kr').replace(/\/$/, '')}/p/${encodeURIComponent(shareCode)}`;
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function authenticate(request, env) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization }
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}

function displayNameFromUser(user) {
  const metadata = user?.user_metadata || {};
  return cleanText(metadata.full_name || metadata.name || String(user?.email || '').split('@')[0], 100);
}

async function ensureSeller(env, user, input) {
  const now = isoNow();
  const displayName = input.sellerDisplayName || displayNameFromUser(user) || '판매자';
  await env.DB.prepare(`INSERT INTO seller_profiles
    (user_id,email,display_name,seller_type,verification_status,direct_sale_status,created_at,updated_at)
    VALUES (?,?,?,?, 'google_verified','pending',?,?)
    ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,seller_type=excluded.seller_type,updated_at=excluded.updated_at`)
    .bind(user.id, cleanText(user.email, 240), displayName, input.sellerType, now, now).run();
  await env.DB.prepare(`INSERT INTO memberships
    (seller_id,plan_id,status,source,valid_from,created_at,updated_at)
    VALUES (?,'free','active','google-signup',?,?,?) ON CONFLICT(seller_id) DO NOTHING`)
    .bind(user.id, now, now, now).run();
  return { displayName };
}

async function ensureStore(env, sellerId, inputStore) {
  if (!inputStore) return null;
  const now = isoNow();
  let existing = null;
  if (inputStore.id) existing = await env.DB.prepare('SELECT id FROM stores WHERE id=? AND seller_id=?').bind(inputStore.id, sellerId).first();
  if (!existing && inputStore.slug) existing = await env.DB.prepare('SELECT id FROM stores WHERE slug=? AND seller_id=?').bind(inputStore.slug, sellerId).first();
  const id = existing?.id || storeId();
  try {
    await env.DB.prepare(`INSERT INTO stores
      (id,seller_id,slug,name,contact,status,verification_status,created_at,updated_at)
      VALUES (?,?,?,?,?,'draft','unverified',?,?)
      ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,name=excluded.name,contact=excluded.contact,updated_at=excluded.updated_at`)
      .bind(id, sellerId, inputStore.slug, inputStore.name, inputStore.contact, now, now).run();
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) throw new Error('STORE_SLUG_TAKEN');
    throw error;
  }
  return id;
}

function rowToOwnerProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    shareCode: row.share_code,
    publicUrl: row.public_url,
    publicShareLinkActive: row.status === 'published',
    checkoutReady: Boolean(row.checkout_ready),
    seller: { type: row.seller_type, displayName: row.seller_display_name },
    store: row.store_id ? { id: row.store_id, name: row.store_name || '', slug: row.store_slug || '', contact: row.store_contact || '' } : null,
    product: {
      saleType: row.sale_type,
      category: row.category,
      name: row.name,
      audience: row.audience || '',
      oneLine: row.one_line || '',
      price: row.price,
      benefits: JSON.parse(row.benefits_json || '[]'),
      specs: JSON.parse(row.specs_json || '[]'),
      story: row.story || '',
      fulfillment: row.fulfillment || '',
      contact: row.contact || '',
      affiliateUrl: row.affiliate_url || ''
    },
    content: JSON.parse(row.content_json || '{}'),
    updatedAt: row.updated_at,
    publishedAt: row.published_at || null
  };
}

const OWNER_SELECT = `SELECT p.*,s.name AS store_name,s.slug AS store_slug,s.contact AS store_contact,s.verification_status AS store_verification_status
  FROM products p LEFT JOIN stores s ON s.id=p.store_id`;

async function getOwnerProduct(env, sellerId, id) {
  return env.DB.prepare(`${OWNER_SELECT} WHERE p.id=? AND p.seller_id=?`).bind(id, sellerId).first();
}

async function saveProduct(env, user, body, existingId = '') {
  const { value, errors } = normalizeProductInput(body);
  if (errors.length) return { errors };
  const seller = await ensureSeller(env, user, value);
  const linkedStoreId = await ensureStore(env, user.id, value.store);
  const now = isoNow();
  if (existingId) {
    const current = await getOwnerProduct(env, user.id, existingId);
    if (!current) return { notFound: true };
    await env.DB.prepare(`UPDATE products SET
      store_id=?,seller_display_name=?,seller_type=?,sale_type=?,category=?,name=?,audience=?,one_line=?,price=?,benefits_json=?,specs_json=?,story=?,fulfillment=?,contact=?,affiliate_url=?,content_json=?,version=version+1,updated_at=?
      WHERE id=? AND seller_id=?`)
      .bind(linkedStoreId, seller.displayName, value.sellerType, value.product.saleType, value.product.category, value.product.name,
        value.product.audience, value.product.oneLine, value.product.price, JSON.stringify(value.product.benefits), JSON.stringify(value.product.specs),
        value.product.story, value.product.fulfillment, value.contact, value.product.affiliateUrl, JSON.stringify(value.content), now, existingId, user.id).run();
    return { product: rowToOwnerProduct(await getOwnerProduct(env, user.id, existingId)) };
  }
  const id = productId();
  const shareCode = randomCode(12);
  const publicUrl = makePublicUrl(env.MALL_BASE_URL, shareCode);
  await env.DB.prepare(`INSERT INTO products
    (id,seller_id,store_id,share_code,public_url,seller_display_name,seller_type,sale_type,category,name,audience,one_line,price,benefits_json,specs_json,story,fulfillment,contact,affiliate_url,content_json,status,checkout_ready,version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',0,1,?,?)`)
    .bind(id, user.id, linkedStoreId, shareCode, publicUrl, seller.displayName, value.sellerType, value.product.saleType, value.product.category,
      value.product.name, value.product.audience, value.product.oneLine, value.product.price, JSON.stringify(value.product.benefits),
      JSON.stringify(value.product.specs), value.product.story, value.product.fulfillment, value.contact, value.product.affiliateUrl,
      JSON.stringify(value.content), now, now).run();
  return { product: rowToOwnerProduct(await getOwnerProduct(env, user.id, id)) };
}

async function listOwnerProducts(env, sellerId) {
  const rows = await env.DB.prepare(`${OWNER_SELECT} WHERE p.seller_id=? ORDER BY p.updated_at DESC LIMIT 100`).bind(sellerId).all();
  return rows.results.map(rowToOwnerProduct);
}

function publicationErrors(row) {
  const errors = [];
  if (!row.name) errors.push('상품명');
  if (!row.seller_display_name) errors.push('판매자명');
  if (!row.contact) errors.push('연락·문의 채널');
  if (!row.one_line) errors.push('한 줄 소개');
  if (!row.fulfillment) errors.push('배송·제공 방식');
  if (row.sale_type === 'affiliate' && !row.affiliate_url) errors.push('제휴링크');
  return errors;
}

async function setPublished(env, sellerId, id, published) {
  const row = await getOwnerProduct(env, sellerId, id);
  if (!row) return { notFound: true };
  if (published) {
    const missing = publicationErrors(row);
    if (missing.length) return { errors: [`게시 필수항목: ${missing.join(', ')}`] };
  }
  const now = isoNow();
  await env.DB.prepare('UPDATE products SET status=?,published_at=?,updated_at=? WHERE id=? AND seller_id=?')
    .bind(published ? 'published' : 'draft', published ? now : null, now, id, sellerId).run();
  return { product: rowToOwnerProduct(await getOwnerProduct(env, sellerId, id)) };
}

async function getPublicProduct(env, shareCode) {
  const row = await env.DB.prepare(`${OWNER_SELECT} WHERE p.share_code=? AND p.status='published'`).bind(shareCode).first();
  if (!row) return null;
  const feePreview = row.seller_type === 'individual'
    ? { direct: 7, marketplace: 8, ai: 9, pgIncluded: true, vatIncluded: true }
    : { businessStore: 10, pgIncluded: true, vatIncluded: true, verificationRequiredForCheckout: true };
  return {
    shareCode: row.share_code,
    publicUrl: row.public_url,
    seller: { type: row.seller_type, displayName: row.seller_display_name },
    store: row.store_id ? { name: row.store_name || '', slug: row.store_slug || '' } : null,
    product: {
      saleType: row.sale_type, category: row.category, name: row.name, audience: row.audience || '', oneLine: row.one_line || '', price: row.price,
      benefits: JSON.parse(row.benefits_json || '[]'), specs: JSON.parse(row.specs_json || '[]'), story: row.story || '', fulfillment: row.fulfillment || '',
      contact: row.contact || '', affiliateUrl: row.sale_type === 'affiliate' ? row.affiliate_url || '' : ''
    },
    feePolicy: feePreview,
    checkoutReady: Boolean(row.checkout_ready),
    publishedAt: row.published_at
  };
}

async function createDirectAttribution(env, shareCode, channel) {
  const row = await env.DB.prepare("SELECT id FROM products WHERE share_code=? AND status='published'").bind(shareCode).first();
  if (!row) return null;
  const token = `att_${randomCode(24)}`;
  const now = isoNow();
  const expiresAt = addDaysIso(7);
  const safeChannel = VALID_CHANNELS.has(channel) ? channel : 'unknown';
  await env.DB.prepare("INSERT INTO attribution_tokens (token,product_id,source_type,channel,created_at,expires_at) VALUES (?,?,'direct',?,?,?)")
    .bind(token, row.id, safeChannel, now, expiresAt).run();
  await env.DB.prepare("INSERT INTO product_events (product_id,event_type,attribution_type,channel,session_token,occurred_at) VALUES (?,'view','direct',?,?,?)")
    .bind(row.id, safeChannel, token, now).run();
  return { token, sourceType: 'direct', channel: safeChannel, expiresAt };
}

async function schemaReady(env) {
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").first();
    return row?.name === 'products';
  } catch { return false; }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    if (origin && !allowedOrigins(env).has(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403, origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      const ready = await schemaReady(env);
      return json({ ok: true, service: 'ekodi-mall-api', version: 1, dbBound: Boolean(env.DB), schemaReady: ready, paymentsEnabled: false }, ready ? 200 : 503, origin, env);
    }
    if (!env.DB) return json({ error: 'Mall 전용 데이터베이스 연결이 없습니다.' }, 503, origin, env);

    const publicProductMatch = url.pathname.match(/^\/api\/public\/products\/([^/]+)$/);
    if (request.method === 'GET' && publicProductMatch) {
      const product = await getPublicProduct(env, decodeURIComponent(publicProductMatch[1]));
      return product ? json({ product }, 200, origin, env) : json({ error: '공개 상품을 찾을 수 없습니다.' }, 404, origin, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/public/attribution') {
      const body = await readJson(request);
      if (!body?.shareCode) return json({ error: 'shareCode가 필요합니다.' }, 400, origin, env);
      const attribution = await createDirectAttribution(env, cleanText(body.shareCode, 80), cleanText(body.channel, 30));
      return attribution ? json({ attribution }, 201, origin, env) : json({ error: '공개 상품을 찾을 수 없습니다.' }, 404, origin, env);
    }
    if (request.method === 'GET' && url.pathname === '/api/public/fees') {
      return json({ individual: FEE_RATES, businessStore: 10, pgIncluded: true, vatIncluded: true, proAiSubscriptionSeparate: true }, 200, origin, env);
    }

    const user = await authenticate(request, env);
    if (!user) return json({ error: 'Google 판매자 로그인이 필요합니다.' }, 401, origin, env);

    if (request.method === 'GET' && url.pathname === '/api/me') {
      const profile = await env.DB.prepare(`SELECT user_id AS userId,email,display_name AS displayName,seller_type AS sellerType,verification_status AS verificationStatus,direct_sale_status AS directSaleStatus FROM seller_profiles WHERE user_id=?`).bind(user.id).first();
      const membership = await env.DB.prepare('SELECT plan_id AS planId,status,valid_from AS validFrom,valid_to AS validTo FROM memberships WHERE seller_id=?').bind(user.id).first();
      return json({ user: { id: user.id, email: user.email, displayName: displayNameFromUser(user) }, profile, membership }, 200, origin, env);
    }
    if (request.method === 'GET' && url.pathname === '/api/products') return json({ products: await listOwnerProducts(env, user.id) }, 200, origin, env);
    if (request.method === 'POST' && url.pathname === '/api/products') {
      const body = await readJson(request);
      if (!body) return json({ error: 'Invalid JSON' }, 400, origin, env);
      try {
        const result = await saveProduct(env, user, body);
        if (result.errors) return json({ error: result.errors.join(' '), fields: result.errors }, 400, origin, env);
        return json(result, 201, origin, env);
      } catch (error) {
        if (error.message === 'STORE_SLUG_TAKEN') return json({ error: '이미 사용 중인 스토어 slug입니다.' }, 409, origin, env);
        console.error('mall product create', error);
        return json({ error: '상품 서버 저장에 실패했습니다.' }, 500, origin, env);
      }
    }

    const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
    if (request.method === 'GET' && productMatch) {
      const row = await getOwnerProduct(env, user.id, decodeURIComponent(productMatch[1]));
      return row ? json({ product: rowToOwnerProduct(row) }, 200, origin, env) : json({ error: '상품을 찾을 수 없습니다.' }, 404, origin, env);
    }
    if (request.method === 'PUT' && productMatch) {
      const body = await readJson(request);
      if (!body) return json({ error: 'Invalid JSON' }, 400, origin, env);
      try {
        const result = await saveProduct(env, user, body, decodeURIComponent(productMatch[1]));
        if (result.notFound) return json({ error: '상품을 찾을 수 없습니다.' }, 404, origin, env);
        if (result.errors) return json({ error: result.errors.join(' '), fields: result.errors }, 400, origin, env);
        return json(result, 200, origin, env);
      } catch (error) {
        if (error.message === 'STORE_SLUG_TAKEN') return json({ error: '이미 사용 중인 스토어 slug입니다.' }, 409, origin, env);
        console.error('mall product update', error);
        return json({ error: '상품 서버 저장에 실패했습니다.' }, 500, origin, env);
      }
    }

    const publishMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/(publish|unpublish)$/);
    if (request.method === 'POST' && publishMatch) {
      const result = await setPublished(env, user.id, decodeURIComponent(publishMatch[1]), publishMatch[2] === 'publish');
      if (result.notFound) return json({ error: '상품을 찾을 수 없습니다.' }, 404, origin, env);
      if (result.errors) return json({ error: result.errors.join(' '), fields: result.errors }, 400, origin, env);
      return json(result, 200, origin, env);
    }

    return json({ error: 'Not found' }, 404, origin, env);
  }
};
