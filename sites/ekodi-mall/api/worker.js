const DEFAULT_ALLOWED_ORIGINS = [
  'https://mall.ekodi.kr',
  'https://ekodi-mall.pages.dev'
];
const FEE_RATES = Object.freeze({ direct: 7, marketplace: 8, ai: 9 });
const VALID_SELLER_TYPES = new Set(['individual', 'business']);
const VALID_SALE_TYPES = new Set(['direct', 'affiliate', 'inquiry']);
const VALID_CATEGORIES = new Set(['local', 'living', 'book', 'gift']);
const VALID_CHANNELS = new Set(['copy', 'share', 'sms', 'kakao', 'qr', 'social', 'mall', 'unknown']);
const VALID_ATTRIBUTION_TYPES = new Set(['direct', 'marketplace', 'ai']);

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

function cleanQuantity(value) {
  const number = Math.trunc(Number(value || 1));
  return Number.isFinite(number) && number >= 1 && number <= 99 ? number : 1;
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

function flag(value) {
  return String(value || '').toLowerCase() === 'true';
}

function allowedOrigins(env) {
  const configured = cleanText(env?.ALLOWED_ORIGINS, 1000)
    .split(',').map((item) => item.trim()).filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function corsHeaders(origin, env) {
  const headers = new Headers({
    'access-control-allow-headers': 'authorization, content-type, x-ekodi-mall-internal-token',
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

function orderId() {
  return `mall_${Date.now().toString(36)}_${randomCode(14)}`;
}

function isoNow() {
  return new Date().toISOString();
}

function addDaysIso(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function addMinutesIso(minutes) {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

export function resolveFeeRate({ sellerType = 'individual', attributionType = '', businessStoreVerified = false } = {}) {
  if (sellerType === 'business' && businessStoreVerified) return 10;
  return Object.prototype.hasOwnProperty.call(FEE_RATES, attributionType) ? FEE_RATES[attributionType] : null;
}

export function calculateOrderAmounts(grossAmount, feeRatePercent) {
  const gross = Math.max(0, Math.trunc(Number(grossAmount) || 0));
  const rate = Math.max(0, Math.trunc(Number(feeRatePercent) || 0));
  const platformFeeAmount = Math.floor((gross * rate) / 100);
  return {
    grossAmount: gross,
    feeRatePercent: rate,
    platformFeeAmount,
    sellerSettlementAmount: gross - platformFeeAmount
  };
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

export function makeAttributedUrl(baseUrl, shareCode, refCode) {
  const url = new URL(makePublicUrl(baseUrl, shareCode));
  if (refCode) url.searchParams.set('ref', refCode);
  return url.toString();
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

async function createShareLink(env, sellerId, productIdValue, sourceType, channel, expiresAt = null) {
  if (!VALID_ATTRIBUTION_TYPES.has(sourceType) || sourceType === 'marketplace') throw new Error('INVALID_SHARE_SOURCE');
  const row = await getOwnerProduct(env, sellerId, productIdValue);
  if (!row || row.status !== 'published') return { notFound: true };
  const safeChannel = VALID_CHANNELS.has(channel) ? channel : 'unknown';
  if (sourceType === 'direct') {
    const existing = await env.DB.prepare(`SELECT code,source_type,channel,expires_at FROM share_links
      WHERE product_id=? AND source_type='direct' AND channel=? AND created_by_seller_id=? AND active=1
      AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 1`)
      .bind(row.id, safeChannel, sellerId, isoNow()).first();
    if (existing) return {
      shareLink: {
        code: existing.code,
        sourceType: existing.source_type,
        channel: existing.channel,
        url: makeAttributedUrl(env.MALL_BASE_URL, row.share_code, existing.code),
        expiresAt: existing.expires_at || null
      }
    };
  }
  const code = `sl_${randomCode(24)}`;
  const now = isoNow();
  await env.DB.prepare(`INSERT INTO share_links
    (code,product_id,source_type,channel,created_by_seller_id,active,created_at,expires_at)
    VALUES (?,?,?,?,?,1,?,?)`)
    .bind(code, row.id, sourceType, safeChannel, sellerId || null, now, expiresAt).run();
  return {
    shareLink: {
      code,
      sourceType,
      channel: safeChannel,
      url: makeAttributedUrl(env.MALL_BASE_URL, row.share_code, code),
      expiresAt
    }
  };
}

async function createAttribution(env, shareCode, refCode = '') {
  const row = await env.DB.prepare("SELECT id FROM products WHERE share_code=? AND status='published'").bind(shareCode).first();
  if (!row) return null;
  let sourceType = 'marketplace';
  let channel = 'mall';
  if (refCode) {
    const link = await env.DB.prepare(`SELECT source_type,channel FROM share_links
      WHERE code=? AND product_id=? AND active=1 AND (expires_at IS NULL OR expires_at>?)`)
      .bind(cleanText(refCode, 80), row.id, isoNow()).first();
    if (link && VALID_ATTRIBUTION_TYPES.has(link.source_type)) {
      sourceType = link.source_type;
      channel = VALID_CHANNELS.has(link.channel) ? link.channel : 'unknown';
    }
  }
  const token = `att_${randomCode(24)}`;
  const now = isoNow();
  const expiresAt = addDaysIso(7);
  await env.DB.prepare("INSERT INTO attribution_tokens (token,product_id,source_type,channel,created_at,expires_at) VALUES (?,?,?,?,?,?)")
    .bind(token, row.id, sourceType, channel, now, expiresAt).run();
  await env.DB.prepare("INSERT INTO product_events (product_id,event_type,attribution_type,channel,session_token,occurred_at) VALUES (?,'view',?,?,?,?)")
    .bind(row.id, sourceType, channel, token, now).run();
  return { token, sourceType, channel, expiresAt };
}

async function checkoutProductRow(env, shareCode) {
  return env.DB.prepare(`SELECT p.*,s.verification_status AS store_verification_status,sp.direct_sale_status
    FROM products p
    LEFT JOIN stores s ON s.id=p.store_id
    JOIN seller_profiles sp ON sp.user_id=p.seller_id
    WHERE p.share_code=? AND p.status='published'`).bind(shareCode).first();
}

async function resolveAttributionType(env, productIdValue, token) {
  if (!token) return 'marketplace';
  const row = await env.DB.prepare(`SELECT source_type FROM attribution_tokens
    WHERE token=? AND product_id=? AND expires_at>?`).bind(cleanText(token, 100), productIdValue, isoNow()).first();
  return row && VALID_ATTRIBUTION_TYPES.has(row.source_type) ? row.source_type : 'marketplace';
}

export async function buildOrderQuote(env, { shareCode, attributionToken = '', quantity = 1 } = {}) {
  const row = await checkoutProductRow(env, cleanText(shareCode, 80));
  if (!row) return { error: '공개 상품을 찾을 수 없습니다.', status: 404 };
  if (row.sale_type !== 'direct') return { error: '이 상품은 에코디몰 직접결제 대상이 아닙니다.', status: 409 };
  if (!Number.isInteger(row.price) || row.price <= 0) return { error: '확정된 판매가격이 필요합니다.', status: 409 };
  const qty = cleanQuantity(quantity);
  const attributionType = await resolveAttributionType(env, row.id, attributionToken);
  const businessStoreVerified = row.seller_type === 'business' && Boolean(row.store_id) && row.store_verification_status === 'verified';
  const feeRatePercent = row.seller_type === 'business'
    ? 10
    : resolveFeeRate({ sellerType: row.seller_type, attributionType, businessStoreVerified });
  const amounts = calculateOrderAmounts(row.price * qty, feeRatePercent);
  const blockers = [];
  if (row.direct_sale_status !== 'verified') blockers.push('seller-verification');
  if (row.seller_type === 'business' && !businessStoreVerified) blockers.push('business-store-verification');
  if (!row.checkout_ready) blockers.push('product-checkout-gate');
  if (!flag(env.PAYMENTS_ENABLED)) blockers.push('payments-disabled');
  if (!env.TOSS_SECRET_KEY) blockers.push('toss-secret-missing');
  return {
    status: 200,
    quote: {
      productId: row.id,
      shareCode: row.share_code,
      sellerId: row.seller_id,
      storeId: row.store_id || null,
      productName: row.name,
      sellerType: row.seller_type,
      quantity: qty,
      unitAmount: row.price,
      currency: 'KRW',
      attributionType,
      pgIncluded: true,
      vatIncluded: true,
      ...amounts,
      checkoutReady: blockers.length === 0,
      blockers
    }
  };
}

async function createOrder(env, input) {
  const result = await buildOrderQuote(env, input);
  if (!result.quote) return result;
  if (!result.quote.checkoutReady) return { error: '직접결제 활성화 조건이 아직 완료되지 않았습니다.', status: 409, quote: result.quote };
  const quote = result.quote;
  const id = orderId();
  const now = isoNow();
  const expiresAt = addMinutesIso(30);
  await env.DB.prepare(`INSERT INTO orders
    (id,product_id,seller_id,store_id,status,quantity,unit_amount,gross_amount,currency,attribution_type,attribution_token,
     fee_rate_percent,platform_fee_amount,seller_settlement_amount,expires_at,created_at,updated_at)
    VALUES (?,?,?,?,'payment_pending',?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, quote.productId, quote.sellerId, quote.storeId, quote.quantity, quote.unitAmount, quote.grossAmount, quote.currency,
      quote.attributionType, cleanText(input.attributionToken, 100) || null, quote.feeRatePercent, quote.platformFeeAmount,
      quote.sellerSettlementAmount, expiresAt, now, now).run();
  return {
    status: 201,
    order: {
      id,
      status: 'payment_pending',
      orderName: quote.productName.slice(0, 100),
      amount: quote.grossAmount,
      currency: quote.currency,
      expiresAt,
      quote
    }
  };
}

function basicAuth(secret) {
  return `Basic ${btoa(`${secret}:`)}`;
}

async function confirmTossPayment(env, order, paymentKey, amount) {
  if (!env.TOSS_SECRET_KEY) throw new Error('TOSS_SECRET_KEY_NOT_CONFIGURED');
  const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      authorization: basicAuth(env.TOSS_SECRET_KEY),
      'content-type': 'application/json'
    },
    body: JSON.stringify({ paymentKey, orderId: order.id, amount })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(cleanText(body.code || body.message || `TOSS_${response.status}`, 200));
    error.status = response.status;
    throw error;
  }
  if (body.orderId !== order.id || Math.trunc(Number(body.totalAmount)) !== order.gross_amount) throw new Error('TOSS_PAYMENT_MISMATCH');
  return body;
}

async function recordConfirmedPayment(env, order, payment) {
  const now = isoNow();
  const paymentStatus = cleanText(payment.status, 80) || 'UNKNOWN';
  const paid = paymentStatus === 'DONE';
  const approvedAt = payment.approvedAt || null;
  const paymentKey = cleanText(payment.paymentKey, 220);
  const metadata = JSON.stringify({
    type: payment.type || '',
    method: payment.method || '',
    mId: payment.mId || '',
    requestedAt: payment.requestedAt || null,
    approvedAt,
    cancelCount: Array.isArray(payment.cancels) ? payment.cancels.length : 0
  }).slice(0, 6000);
  const statements = [
    env.DB.prepare(`INSERT INTO order_payments
      (payment_key,order_id,provider,status,method,total_amount,approved_at,metadata_json,created_at,updated_at)
      VALUES (?,?,'TOSS',?,?,?,?,?,?,?)
      ON CONFLICT(payment_key) DO UPDATE SET status=excluded.status,method=excluded.method,total_amount=excluded.total_amount,
      approved_at=excluded.approved_at,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
      .bind(paymentKey, order.id, paymentStatus, cleanText(payment.method, 80), Math.trunc(Number(payment.totalAmount) || 0), approvedAt, metadata, now, now),
    env.DB.prepare('UPDATE orders SET status=?,paid_at=?,updated_at=? WHERE id=?')
      .bind(paid ? 'paid' : 'payment_pending', paid ? approvedAt || now : null, now, order.id)
  ];
  await env.DB.batch(statements);
  if (paid) {
    await env.DB.prepare(`INSERT INTO settlement_ledger
      (order_id,seller_id,entry_type,gross_amount,platform_fee_amount,seller_amount,status,effective_at,created_at)
      SELECT ?,?,'sale',?,?,?,'pending',?,?
      WHERE NOT EXISTS (SELECT 1 FROM settlement_ledger WHERE order_id=? AND entry_type='sale')`)
      .bind(order.id, order.seller_id, order.gross_amount, order.platform_fee_amount, order.seller_settlement_amount,
        approvedAt || now, now, order.id).run();
  }
}

async function confirmOrderPayment(env, body) {
  if (!flag(env.PAYMENTS_ENABLED)) return { error: '온라인 결제는 아직 비활성 상태입니다.', status: 503 };
  const id = cleanText(body?.orderId, 80);
  const paymentKey = cleanText(body?.paymentKey, 220);
  const amount = Math.trunc(Number(body?.amount));
  if (!id || !paymentKey || !Number.isFinite(amount)) return { error: 'paymentKey, orderId, amount가 필요합니다.', status: 400 };
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if (!order) return { error: '주문을 찾을 수 없습니다.', status: 404 };
  if (amount !== order.gross_amount) return { error: '서버 주문금액과 결제금액이 일치하지 않습니다.', status: 409 };
  const existing = await env.DB.prepare("SELECT * FROM order_payments WHERE order_id=? AND status='DONE' LIMIT 1").bind(id).first();
  if (existing) return { status: 200, payment: { paymentKey: existing.payment_key, orderId: id, status: existing.status, totalAmount: existing.total_amount }, idempotent: true };
  const payment = await confirmTossPayment(env, order, paymentKey, amount);
  await recordConfirmedPayment(env, order, payment);
  return { status: 200, payment: { paymentKey: payment.paymentKey, orderId: payment.orderId, status: payment.status, totalAmount: payment.totalAmount, approvedAt: payment.approvedAt || null } };
}

async function listSellerOrders(env, sellerId, limit) {
  const rows = await env.DB.prepare(`SELECT id,product_id AS productId,status,quantity,unit_amount AS unitAmount,gross_amount AS grossAmount,
    attribution_type AS attributionType,fee_rate_percent AS feeRatePercent,platform_fee_amount AS platformFeeAmount,
    seller_settlement_amount AS sellerSettlementAmount,currency,paid_at AS paidAt,created_at AS createdAt
    FROM orders WHERE seller_id=? ORDER BY created_at DESC LIMIT ?`).bind(sellerId, limit).all();
  return rows.results;
}

async function sellerSettlementSummary(env, sellerId) {
  const summary = await env.DB.prepare(`SELECT
    COUNT(*) AS entries,
    COALESCE(SUM(CASE WHEN status='pending' THEN seller_amount ELSE 0 END),0) AS pending_amount,
    COALESCE(SUM(CASE WHEN status='paid' THEN seller_amount ELSE 0 END),0) AS paid_amount
    FROM settlement_ledger WHERE seller_id=?`).bind(sellerId).first();
  return {
    entries: Number(summary?.entries || 0),
    pendingAmount: Number(summary?.pending_amount || 0),
    paidAmount: Number(summary?.paid_amount || 0),
    payoutExecutionEnabled: false
  };
}

async function schemaReady(env) {
  if (!env.DB) return { base: false, order: false };
  try {
    const rows = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table'
      AND name IN ('products','share_links','orders','order_payments','settlement_ledger')`).all();
    const names = new Set(rows.results.map((row) => row.name));
    return {
      base: names.has('products'),
      order: ['share_links','orders','order_payments','settlement_ledger'].every((name) => names.has(name))
    };
  } catch {
    return { base: false, order: false };
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    if (origin && !allowedOrigins(env).has(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403, origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      const ready = await schemaReady(env);
      const ok = ready.base && ready.order;
      return json({
        ok,
        service: 'ekodi-mall-api',
        version: 2,
        dbBound: Boolean(env.DB),
        schemaReady: ready.base,
        orderSchemaReady: ready.order,
        paymentsEnabled: flag(env.PAYMENTS_ENABLED),
        tossSecretConfigured: Boolean(env.TOSS_SECRET_KEY),
        payoutExecutionEnabled: false
      }, ok ? 200 : 503, origin, env);
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
      const attribution = await createAttribution(env, cleanText(body.shareCode, 80), cleanText(body.refCode, 80));
      return attribution ? json({ attribution }, 201, origin, env) : json({ error: '공개 상품을 찾을 수 없습니다.' }, 404, origin, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/public/checkout/quote') {
      const body = await readJson(request);
      if (!body?.shareCode) return json({ error: 'shareCode가 필요합니다.' }, 400, origin, env);
      const result = await buildOrderQuote(env, body);
      return json(result.quote ? { quote: result.quote } : { error: result.error }, result.status, origin, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/public/orders') {
      const body = await readJson(request);
      if (!body?.shareCode) return json({ error: 'shareCode가 필요합니다.' }, 400, origin, env);
      const result = await createOrder(env, body);
      return json(result.order ? { order: result.order } : { error: result.error, quote: result.quote || null }, result.status, origin, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/public/payments/confirm') {
      const body = await readJson(request);
      try {
        const result = await confirmOrderPayment(env, body);
        return json(result.payment ? { payment: result.payment, idempotent: Boolean(result.idempotent) } : { error: result.error }, result.status, origin, env);
      } catch (error) {
        console.error('mall toss confirm', error);
        return json({ error: '결제 승인 검증에 실패했습니다.' }, Number(error.status) || 502, origin, env);
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/public/fees') {
      return json({ individual: FEE_RATES, businessStore: 10, pgIncluded: true, vatIncluded: true, proAiSubscriptionSeparate: true }, 200, origin, env);
    }

    if (request.method === 'POST' && url.pathname === '/api/internal/share-links') {
      if (!env.INTERNAL_ATTRIBUTION_TOKEN || request.headers.get('x-ekodi-mall-internal-token') !== env.INTERNAL_ATTRIBUTION_TOKEN) {
        return json({ error: 'Internal attribution authorization required.' }, 401, origin, env);
      }
      const body = await readJson(request);
      const product = await env.DB.prepare(`${OWNER_SELECT} WHERE p.id=? AND p.status='published'`).bind(cleanText(body?.productId, 80)).first();
      if (!product) return json({ error: '상품을 찾을 수 없습니다.' }, 404, origin, env);
      const result = await createShareLink(env, product.seller_id, product.id, 'ai', cleanText(body?.channel, 30), addDaysIso(30));
      return json(result, 201, origin, env);
    }

    const user = await authenticate(request, env);
    if (!user) return json({ error: 'Google 판매자 로그인이 필요합니다.' }, 401, origin, env);

    if (request.method === 'GET' && url.pathname === '/api/me') {
      const profile = await env.DB.prepare(`SELECT user_id AS userId,email,display_name AS displayName,seller_type AS sellerType,verification_status AS verificationStatus,direct_sale_status AS directSaleStatus FROM seller_profiles WHERE user_id=?`).bind(user.id).first();
      const membership = await env.DB.prepare('SELECT plan_id AS planId,status,valid_from AS validFrom,valid_to AS validTo FROM memberships WHERE seller_id=?').bind(user.id).first();
      return json({ user: { id: user.id, email: user.email, displayName: displayNameFromUser(user) }, profile, membership }, 200, origin, env);
    }
    if (request.method === 'GET' && url.pathname === '/api/products') return json({ products: await listOwnerProducts(env, user.id) }, 200, origin, env);
    if (request.method === 'GET' && url.pathname === '/api/orders') {
      const limit = Math.min(100, Math.max(1, Math.trunc(Number(url.searchParams.get('limit')) || 30)));
      return json({ orders: await listSellerOrders(env, user.id, limit) }, 200, origin, env);
    }
    if (request.method === 'GET' && url.pathname === '/api/settlements') {
      return json({ settlement: await sellerSettlementSummary(env, user.id) }, 200, origin, env);
    }
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

    const shareLinkMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/share-links$/);
    if (request.method === 'POST' && shareLinkMatch) {
      const body = await readJson(request);
      try {
        const result = await createShareLink(env, user.id, decodeURIComponent(shareLinkMatch[1]), 'direct', cleanText(body?.channel, 30));
        if (result.notFound) return json({ error: '게시된 상품을 찾을 수 없습니다.' }, 404, origin, env);
        return json(result, 201, origin, env);
      } catch (error) {
        console.error('mall direct share link', error);
        return json({ error: '직접 공유링크 생성에 실패했습니다.' }, 500, origin, env);
      }
    }

    return json({ error: 'Not found' }, 404, origin, env);
  }
};
