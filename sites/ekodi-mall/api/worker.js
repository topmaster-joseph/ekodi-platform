import { importDomeggookProduct, notifySupplyOrder } from './domeggook-import.js';
import { maskPublicProductFields } from './supplier-mask.js';
import { runCuration } from './domeggook-curation.js';
import { publicImages, uploadProductImage, deleteProductImage, reorderProductImages, servePublicMedia } from './product-media.js';
import { validateBuyer, checkoutConfig } from './checkout-buyer.js';
import { commerceEventStatement } from './commerce-events.js';
import { paymentExecutionBlockers, paymentProviderPublicView, selectedPaymentProvider } from './payment-capabilities.js';
import { routeCommerceModel } from './commerce-os.js';
import { confirmPayment as ekodipayConfirm } from '../../../ekodipay-core.js';
import { handleTossWebhook } from './payment-reconciliation.js';
import { cleanExpiryDate, isInExpiryWindow, expiryWindowMessage, EXPIRY_BLOCKER } from './shelf-life.js';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://ekodi.kr',
  'https://ekodi-mall.pages.dev'
];
const FEE_RATES = Object.freeze({ direct: 7, marketplace: 8, ai: 9 });
const VALID_SELLER_TYPES = new Set(['individual', 'business']);
const VALID_SALE_TYPES = new Set(['direct', 'affiliate', 'inquiry']);
const VALID_CATEGORIES = new Set(['general', 'living', 'book', 'gift']);
const VALID_LOCAL_RELATIONSHIPS = new Set(['seller-declared', 'community', 'producer', 'store', 'experience', 'service', 'origin']);
const VALID_CHANNELS = new Set(['copy', 'share', 'sms', 'kakao', 'qr', 'social', 'mall', 'unknown']);
const VALID_ATTRIBUTION_TYPES = new Set(['direct', 'marketplace', 'ai']);

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanList(value, maxItems = 5, maxLength = 180) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\n,]/);
  return source.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

// EKODI-MALL-PAY-RECON-001: 재고. 비우면 null(재고 관리 안 함), 0~100000 정수면 판매 가능 수량.
export function cleanStock(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 && number <= 100_000 ? number : null;
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

function normalizeCategory(value) {
  const category = cleanText(value, 40).toLowerCase();
  return VALID_CATEGORIES.has(category) ? category : 'general';
}

function cleanRegionId(value) {
  const id = cleanText(value, 100).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ? id : '';
}

function normalizeRegion(value) {
  if (!value || typeof value !== 'object') return null;
  const primaryRegionId = cleanRegionId(value.primaryRegionId);
  if (!primaryRegionId) return null;
  const ids = Array.isArray(value.regionIds) ? value.regionIds : [];
  const regionIds = [...new Set(ids.map(cleanRegionId).filter(Boolean).concat(primaryRegionId))].slice(0, 8);
  const label = cleanText(value.label, 160);
  const requestedRelationship = cleanText(value.relationship, 40).toLowerCase();
  const relationship = VALID_LOCAL_RELATIONSHIPS.has(requestedRelationship) ? requestedRelationship : 'seller-declared';
  return { primaryRegionId, regionIds, label, relationship, verified: false };
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

// EKODI-MALL-SOURCING-BOUNDARY-001: 제휴(쿠팡 파트너스 등) 상품은 직접판매 상품으로 소싱할 수 없다.
// 직접판매는 판매자 수동 등록 또는 도매꾹·도매매 등 공급처 연동으로만 들어온다.
const AFFILIATE_SOURCE_PATTERN = /(link\.coupang\.com|coupa\.ng|ads-partners\.coupang\.com|partners\.coupang\.com|[?&]lptag=AF|s\.click\.aliexpress\.com|amzn\.to\/|link\.11st\.co\.kr|affiliate)/i;
// 필드 이름(affiliateUrl 등)이 아니라 사람이 입력한 값만 검사한다. 키까지 문자열화하면
// 'affiliate' 패턴이 빈 affiliateUrl 키에 걸려 도매꾹 자동 등록 같은 정상 직접판매가 막힌다.
function stringValues(value, out = [], depth = 0) {
  if (depth > 8 || value === null || value === undefined) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => stringValues(item, out, depth + 1));
  else if (typeof value === 'object') Object.values(value).forEach((item) => stringValues(item, out, depth + 1));
  return out;
}
export function containsAffiliateSource(value) {
  try { return stringValues(value).some((text) => AFFILIATE_SOURCE_PATTERN.test(text)); } catch { return true; }
}

export function normalizeProductInput(body = {}) {
  const seller = body.seller || {};
  const product = body.product || {};
  const store = body.store || null;
  const content = body.content || {};
  const sellerType = VALID_SELLER_TYPES.has(seller.type) ? seller.type : 'individual';
  const saleType = VALID_SALE_TYPES.has(product.saleType) ? product.saleType : 'direct';
  const category = normalizeCategory(product.category);
  const region = normalizeRegion(product.region);
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
      region,
      name: cleanText(product.name, 160),
      audience: cleanText(product.audience, 500),
      oneLine: cleanText(product.oneLine, 300),
      price: cleanPrice(product.price),
      stockProvided: Object.prototype.hasOwnProperty.call(product, 'stockQuantity'),
      stockQuantity: cleanStock(product.stockQuantity),
      expiryProvided: Object.prototype.hasOwnProperty.call(product, 'expiryDate'),
      expiryDate: saleType === 'direct' ? cleanExpiryDate(product.expiryDate) : null,
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
  if (normalized.product.region && !normalized.product.region.label) errors.push('지역 연결에는 표시할 행정지역명이 필요합니다.');
  if (saleType === 'affiliate' && !affiliateUrl) errors.push('제휴판매는 유효한 HTTPS 제휴링크가 필요합니다.');
  if (saleType === 'direct' && (affiliateUrl || containsAffiliateSource(product))) errors.push('제휴(쿠팡 파트너스 등) 상품은 직접판매로 등록할 수 없습니다. 직접판매는 수동 등록 또는 도매꾹·도매매 공급처 연동으로만 가능합니다.');
  // EKODI-MALL-STOCK-REQUIRED-001: 직접판매(실결제) 상품은 재고 수량이 필수 — 초과판매 방지.
  if (saleType === 'direct' && normalized.product.stockQuantity === null) errors.push('직접판매 상품은 재고 수량(0 이상 정수)을 입력해 주세요.');
  // EKODI-MALL-SHELF-LIFE-001: 소비기한은 선택 입력이지만, 입력했다면 실제 날짜(YYYY-MM-DD)여야 한다.
  if (saleType === 'direct' && normalized.product.expiryProvided && String(product.expiryDate ?? '').trim() && !normalized.product.expiryDate) errors.push('소비기한은 YYYY-MM-DD 형식의 날짜로 입력해 주세요.');
  if (normalized.store?.name && !normalized.store.slug) errors.push('스토어를 연결하려면 영문 소문자·숫자·하이픈 slug가 필요합니다.');
  return { value: normalized, errors };
}

export function makePublicUrl(baseUrl, shareCode) {
  return `${String(baseUrl || 'https://ekodi.kr/ekodimall').replace(/\/$/, '')}/p/${encodeURIComponent(shareCode)}`;
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

// EKODI-MALL-EKODIAN-001: EKODI operator ("에코디언") accounts run the autonomous
// direct-sale lane: seller verification and the product checkout gate open
// automatically (always audited). Only Google-verified emails on the allowlist count.
export function ekodianEmails(env) {
  return new Set(cleanText(env?.MALL_EKODIAN_EMAILS || '', 1000).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
}
export function isEkodian(user, env) {
  const email = cleanText(user?.email, 240).toLowerCase();
  const verified = Boolean(user?.email_confirmed_at || user?.confirmed_at);
  return Boolean(email) && verified && ekodianEmails(env).has(email);
}
async function opsAudit(env, actor, action, sellerId, productId, metadata) {
  try {
    await env.DB.prepare('INSERT INTO mall_ops_audit (actor,action,seller_id,store_id,product_id,request_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(actor, action, sellerId, null, productId || null, null, JSON.stringify(metadata || {}).slice(0, 4000), isoNow()).run();
  } catch (error) { console.error('mall ops audit', error); }
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
    images: publicImages(row.images_json, null),
    checkoutReady: Boolean(row.checkout_ready),
    seller: { type: row.seller_type, displayName: row.seller_display_name },
    store: row.store_id ? { id: row.store_id, name: row.store_name || '', slug: row.store_slug || '', contact: row.store_contact || '' } : null,
    product: {
      saleType: row.sale_type,
      category: normalizeCategory(row.category),
      region: row.primary_region_id ? {
        primaryRegionId: row.primary_region_id,
        regionIds: JSON.parse(row.region_ids_json || '[]'),
        label: row.region_label || '',
        relationship: row.local_relationship || 'seller-declared',
        verified: Boolean(row.region_verified)
      } : null,
      name: row.name,
      audience: row.audience || '',
      oneLine: row.one_line || '',
      price: row.price,
      stockQuantity: row.stock_quantity ?? null,
      expiryDate: row.expiry_date || null,
      expirySoldOutAt: row.expiry_sold_out_at || null,
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
  // Simple listing: seller name and contact default to the signed-in account
  // so sellers only type product name, price and stock.
  const input = body && typeof body === 'object' ? body : {};
  input.seller = { ...(input.seller || {}) };
  input.product = { ...(input.product || {}) };
  const official = isEkodian(user, env);
  const typedName = cleanText(input.seller.displayName, 100);
  if (!typedName || typedName === '판매자') input.seller.displayName = official ? '에코디몰' : (displayNameFromUser(user) || '판매자');
  if (!cleanText(input.product.contact || input.store?.contact, 240)) input.product.contact = cleanText(user?.email, 240);
  const { value, errors } = normalizeProductInput(input);
  if (errors.length) return { errors };
  const seller = await ensureSeller(env, user, value);
  if (official) {
    const profile = await env.DB.prepare('SELECT direct_sale_status FROM seller_profiles WHERE user_id=?').bind(user.id).first();
    if (profile && profile.direct_sale_status !== 'verified') {
      await env.DB.prepare("UPDATE seller_profiles SET direct_sale_status='verified',updated_at=? WHERE user_id=?").bind(isoNow(), user.id).run();
      await opsAudit(env, 'mall-auto:ekodian', 'seller.direct_sale.auto_verified', user.id, null, { email: cleanText(user.email, 240) });
    }
  }
  const linkedStoreId = await ensureStore(env, user.id, value.store);
  const now = isoNow();
  if (existingId) {
    const current = await getOwnerProduct(env, user.id, existingId);
    if (!current) return { notFound: true };
    // EKODI-MALL-SHELF-LIFE-001: 새로 입력·변경한 소비기한만 3개월 기준으로 거부한다(기존 값 그대로면 cron이 품절 처리).
    const expiryChanged = value.product.expiryProvided && (value.product.expiryDate || null) !== (current.expiry_date || null);
    if (expiryChanged && value.product.saleType === 'direct' && isInExpiryWindow(value.product.expiryDate)) return { errors: [expiryWindowMessage()] };
    await env.DB.prepare(`UPDATE products SET
      store_id=?,seller_display_name=?,seller_type=?,sale_type=?,category=?,primary_region_id=?,region_ids_json=?,region_label=?,local_relationship=?,region_verified=0,name=?,audience=?,one_line=?,price=?,stock_quantity=CASE WHEN ?=1 THEN ? ELSE stock_quantity END,
      expiry_date=CASE WHEN ?=1 THEN ? ELSE expiry_date END,expiry_sold_out_at=CASE WHEN ?=1 THEN NULL ELSE expiry_sold_out_at END,expiry_held_stock=CASE WHEN ?=1 THEN NULL ELSE expiry_held_stock END,
      benefits_json=?,specs_json=?,story=?,fulfillment=?,contact=?,affiliate_url=?,content_json=?,version=version+1,updated_at=?
      WHERE id=? AND seller_id=?`)
      .bind(linkedStoreId, seller.displayName, value.sellerType, value.product.saleType, value.product.category, value.product.region?.primaryRegionId || '', JSON.stringify(value.product.region?.regionIds || []),
        value.product.region?.label || '', value.product.region?.relationship || '', value.product.name,
        value.product.audience, value.product.oneLine, value.product.price, value.product.stockProvided ? 1 : 0, value.product.stockQuantity,
        expiryChanged ? 1 : 0, value.product.expiryDate, expiryChanged ? 1 : 0, expiryChanged ? 1 : 0,
        JSON.stringify(value.product.benefits), JSON.stringify(value.product.specs),
        value.product.story, value.product.fulfillment, value.contact, value.product.affiliateUrl, JSON.stringify(value.content), now, existingId, user.id).run();
    return { product: rowToOwnerProduct(await getOwnerProduct(env, user.id, existingId)) };
  }
  if (value.product.saleType === 'direct' && isInExpiryWindow(value.product.expiryDate)) return { errors: [expiryWindowMessage()] };
  const id = productId();
  const shareCode = randomCode(12);
  const publicUrl = makePublicUrl(env.MALL_BASE_URL, shareCode);
  await env.DB.prepare(`INSERT INTO products
    (id,seller_id,store_id,share_code,public_url,seller_display_name,seller_type,sale_type,category,primary_region_id,region_ids_json,region_label,local_relationship,region_verified,name,audience,one_line,price,stock_quantity,expiry_date,benefits_json,specs_json,story,fulfillment,contact,affiliate_url,content_json,status,checkout_ready,version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',0,1,?,?)`)
    .bind(id, user.id, linkedStoreId, shareCode, publicUrl, seller.displayName, value.sellerType, value.product.saleType, value.product.category,
      value.product.region?.primaryRegionId || '', JSON.stringify(value.product.region?.regionIds || []), value.product.region?.label || '', value.product.region?.relationship || '',
      value.product.name, value.product.audience, value.product.oneLine, value.product.price, value.product.stockQuantity, value.product.expiryDate, JSON.stringify(value.product.benefits),
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
  if (row.sale_type === 'direct' && (row.stock_quantity === null || row.stock_quantity === undefined)) errors.push('재고 수량');
  return errors;
}

async function setPublished(env, sellerId, id, published, official = false) {
  const row = await getOwnerProduct(env, sellerId, id);
  if (!row) return { notFound: true };
  if (published) {
    const missing = publicationErrors(row);
    if (missing.length) return { errors: [`게시 필수항목: ${missing.join(', ')}`] };
  }
  const now = isoNow();
  await env.DB.prepare('UPDATE products SET status=?,published_at=?,updated_at=? WHERE id=? AND seller_id=?')
    .bind(published ? 'published' : 'draft', published ? now : null, now, id, sellerId).run();
  if (published && official && row.sale_type === 'direct' && Number.isInteger(row.price) && row.price > 0
      && row.stock_quantity !== null && row.stock_quantity !== undefined && !row.checkout_ready) {
    await env.DB.prepare('UPDATE products SET checkout_ready=1,updated_at=? WHERE id=? AND seller_id=?').bind(now, id, sellerId).run();
    await opsAudit(env, 'mall-auto:ekodian', 'product.checkout_gate.auto_enabled', sellerId, id, { price: row.price, stock: row.stock_quantity });
  }
  return { product: rowToOwnerProduct(await getOwnerProduct(env, sellerId, id)) };
}

async function getPublicProduct(env, shareCode) {
  const row = await env.DB.prepare(`${OWNER_SELECT} WHERE p.share_code=? AND p.status='published'`).bind(shareCode).first();
  if (!row) return null;
  const sellerProfile = await env.DB.prepare('SELECT email,direct_sale_status FROM seller_profiles WHERE user_id=?').bind(row.seller_id).first().catch(() => null);
  const sellerVerified = sellerProfile?.direct_sale_status === 'verified';
  const sellerOfficial = Boolean(sellerProfile?.email) && ekodianEmails(env).has(String(sellerProfile.email).toLowerCase());
  const feePreview = row.seller_type === 'individual'
    ? { direct: 7, marketplace: 8, ai: 9, pgIncluded: true, vatIncluded: true }
    : { businessStore: 10, pgIncluded: true, vatIncluded: true, verificationRequiredForCheckout: true };
  return {
    shareCode: row.share_code,
    publicUrl: row.public_url,
    seller: { type: row.seller_type, displayName: row.seller_display_name, verified: sellerVerified, official: sellerOfficial },
    store: row.store_id ? { name: row.store_name || '', slug: row.store_slug || '' } : null,
    product: maskPublicProductFields({
      saleType: row.sale_type, category: normalizeCategory(row.category), region: row.primary_region_id ? { primaryRegionId: row.primary_region_id, regionIds: JSON.parse(row.region_ids_json || '[]'), label: row.region_label || '', relationship: row.local_relationship || 'seller-declared', verified: Boolean(row.region_verified) } : null, name: row.name, audience: row.audience || '', oneLine: row.one_line || '', price: row.price,
      benefits: JSON.parse(row.benefits_json || '[]'), specs: JSON.parse(row.specs_json || '[]'), story: row.story || '', fulfillment: row.fulfillment || '',
      contact: row.contact || '', affiliateUrl: row.sale_type === 'affiliate' ? row.affiliate_url || '' : '',
      images: publicImages(row.images_json, env.MALL_BASE_URL)
    }),
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

// EKODI-MALL-DOMEGGOOK-CURATION-001: cron 이 호출하는 자동 선별 진입점(판매자 저장·게시 로직 재사용).
export function runSupplyCuration(env, options = {}) {
  return runCuration(env, {
    saveProduct, setPublished,
    getProduct: async (e, sellerId, id) => rowToOwnerProduct(await getOwnerProduct(e, sellerId, id))
  }, options);
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
  const stockManaged = row.stock_quantity !== null && row.stock_quantity !== undefined;
  if (!stockManaged) blockers.push('stock-required');
  if (stockManaged && Number(row.stock_quantity) < qty) blockers.push('out-of-stock');
  // EKODI-MALL-SHELF-LIFE-001: 소비기한 3개월 미만 구간은 cron 실행 여부와 무관하게 주문 시점에 품절로 막는다.
  if (row.expiry_date && isInExpiryWindow(row.expiry_date)) blockers.push(EXPIRY_BLOCKER);
  for (const blocker of paymentExecutionBlockers(env)) blockers.push(blocker);
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
      commerceRoute: routeCommerceModel({ saleType: row.sale_type, env }),
      pgIncluded: true,
      vatIncluded: true,
      ...amounts,
      stockManaged,
      stockAvailable: stockManaged ? Number(row.stock_quantity) : null,
      checkoutReady: blockers.length === 0,
      blockers
    }
  };
}

export async function createOrder(env, input) {
  const result = await buildOrderQuote(env, input);
  if (!result.quote) return result;
  if (!result.quote.checkoutReady) return { error: '직접결제 활성화 조건이 아직 완료되지 않았습니다.', status: 409, quote: result.quote };
  // EKODI-MALL-TOSS-WIDGET-007: a direct-sale order needs the recipient before payment starts.
  const buyerResult = validateBuyer(input.buyer);
  if (!buyerResult.ok) return { error: buyerResult.errors[0], errors: buyerResult.errors, status: 400 };
  const buyer = buyerResult.buyer;
  const quote = result.quote;
  const id = orderId();
  const now = isoNow();
  const expiresAt = addMinutesIso(30);
  // EKODI-MALL-PAY-RECON-001: 재고 관리 상품은 주문 생성 시 조건부 차감(예약). 동시 주문이 와도 0 아래로 내려가지 않는다.
  let reserved = 0;
  if (quote.stockManaged) {
    const hold = await env.DB.prepare(`UPDATE products SET stock_quantity=stock_quantity-?, updated_at=?
      WHERE id=? AND stock_quantity IS NOT NULL AND stock_quantity>=?`).bind(quote.quantity, now, quote.productId, quote.quantity).run();
    if (Number(hold?.meta?.changes ?? hold?.changes ?? 0) < 1) return { error: '재고가 부족합니다.', code: 'OUT_OF_STOCK', status: 409, quote };
    reserved = quote.quantity;
  }
  const orderInsert = env.DB.prepare(`INSERT INTO orders
    (id,product_id,seller_id,store_id,status,quantity,unit_amount,gross_amount,currency,attribution_type,attribution_token,
     fee_rate_percent,platform_fee_amount,seller_settlement_amount,expires_at,stock_reserved,created_at,updated_at)
    VALUES (?,?,?,?,'payment_pending',?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, quote.productId, quote.sellerId, quote.storeId, quote.quantity, quote.unitAmount, quote.grossAmount, quote.currency,
      quote.attributionType, cleanText(input.attributionToken, 100) || null, quote.feeRatePercent, quote.platformFeeAmount,
      quote.sellerSettlementAmount, expiresAt, reserved, now, now);
  const orderEvent = commerceEventStatement(env, {
    eventType:'order.created', aggregateType:'order', aggregateId:id, actor:'mall-order-engine', action:'order.prepare',
    idempotencyKey:`order.created:${id}`, occurredAt:now,
    payload:{ productId:quote.productId, sellerId:quote.sellerId, amount:quote.grossAmount, currency:quote.currency, attributionType:quote.attributionType, paymentProvider:quote.commerceRoute?.paymentProvider || null },
  });
  if (!orderEvent) throw new Error('COMMERCE_EVENT_STATEMENT_REQUIRED');
  const buyerInsert = env.DB.prepare(`INSERT INTO order_buyers
    (order_id,name,phone,email,postcode,address1,address2,memo,privacy_consent_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, buyer.name, buyer.phone, buyer.email, buyer.postcode, buyer.address1, buyer.address2, buyer.memo, now, now);
  try {
    await env.DB.batch([orderInsert, buyerInsert, orderEvent.statement]);
  } catch (error) {
    if (reserved) {
      await env.DB.prepare('UPDATE products SET stock_quantity=stock_quantity+? WHERE id=? AND stock_quantity IS NOT NULL')
        .bind(reserved, quote.productId).run().catch(restoreError => console.error('mall stock restore failed', restoreError));
    }
    throw error;
  }
  return {
    status: 201,
    order: {
      id,
      status: 'payment_pending',
      orderName: quote.productName.slice(0, 100),
      amount: quote.grossAmount,
      currency: quote.currency,
      expiresAt,
      customerName: buyer.name,
      customerMobilePhone: buyer.phone.replace(/-/g, ''),
      customerEmail: buyer.email || undefined,
      checkout: checkoutConfig(env, { id, shareCode: quote.shareCode }),
      quote
    }
  };
}

async function confirmTossPayment(env, order, paymentKey, amount) {
  // EKODI-MALL-PAY-RECON-001: 토스 직접 호출 대신 공통 결제 모듈(EKODIPAY, 상점 프로필 mall) 경유.
  // 같은 주문의 승인 재시도가 이중 승인되지 않도록 주문별 멱등키를 보낸다.
  const body = await ekodipayConfirm(env, cleanText(env.EKODIPAY_PROFILE, 20) || 'mall', { paymentKey, orderId: order.id, amount }, `mall-confirm-${order.id}`);
  if (body.orderId !== order.id || Math.trunc(Number(body.totalAmount)) !== order.gross_amount) throw new Error('TOSS_PAYMENT_MISMATCH');
  return body;
}

export async function recordConfirmedPayment(env, order, payment, provider = 'TOSS') {
  const now = isoNow();
  const paymentStatus = cleanText(payment.status, 80) || 'UNKNOWN';
  const paid = paymentStatus === 'DONE';
  const approvedAt = payment.approvedAt || null;
  const paymentKey = cleanText(payment.paymentKey, 220);
  const providerName = cleanText(provider || 'TOSS', 40).toUpperCase() || 'TOSS';
  const metadata = JSON.stringify({ type:payment.type || '', method:payment.method || '', mId:payment.mId || '', requestedAt:payment.requestedAt || null, approvedAt, cancelCount:Array.isArray(payment.cancels) ? payment.cancels.length : 0 }).slice(0, 6000);
  const statements = [
    env.DB.prepare(`INSERT INTO order_payments
      (payment_key,order_id,provider,status,method,total_amount,approved_at,metadata_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(payment_key) DO UPDATE SET status=excluded.status,method=excluded.method,total_amount=excluded.total_amount,
      approved_at=excluded.approved_at,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
      .bind(paymentKey, order.id, providerName, paymentStatus, cleanText(payment.method,80), Math.trunc(Number(payment.totalAmount)||0), approvedAt, metadata, now, now),
    env.DB.prepare('UPDATE orders SET status=?,paid_at=?,updated_at=? WHERE id=?').bind(paid ? 'paid' : 'payment_pending', paid ? approvedAt || now : null, now, order.id),
  ];
  const paymentEvent = commerceEventStatement(env, { eventType:'payment.recorded', aggregateType:'order', aggregateId:order.id, actor:`payment-provider:${providerName.toLowerCase()}`, action:'payment.capture', idempotencyKey:`payment.recorded:${providerName}:${paymentKey}`, occurredAt:approvedAt || now, payload:{ provider:providerName, status:paymentStatus, method:cleanText(payment.method,80), totalAmount:Math.trunc(Number(payment.totalAmount)||0) } });
  if (!paymentEvent) throw new Error('COMMERCE_PAYMENT_EVENT_REQUIRED');
  statements.push(paymentEvent.statement);
  if (paid) {
    statements.push(env.DB.prepare(`INSERT INTO settlement_ledger
      (order_id,seller_id,entry_type,gross_amount,platform_fee_amount,seller_amount,status,effective_at,created_at)
      SELECT ?,?,'sale',?,?,?,'pending',?,?
      WHERE NOT EXISTS (SELECT 1 FROM settlement_ledger WHERE order_id=? AND entry_type='sale')`)
      .bind(order.id, order.seller_id, order.gross_amount, order.platform_fee_amount, order.seller_settlement_amount, approvedAt || now, now, order.id));
    const settlementEvent = commerceEventStatement(env, { eventType:'settlement.prepared', aggregateType:'order', aggregateId:order.id, actor:'mall-settlement-engine', action:'settlement.prepare', idempotencyKey:`settlement.sale:${order.id}`, occurredAt:approvedAt || now, payload:{ sellerId:order.seller_id, grossAmount:order.gross_amount, platformFeeAmount:order.platform_fee_amount, sellerAmount:order.seller_settlement_amount } });
    if (!settlementEvent) throw new Error('COMMERCE_SETTLEMENT_EVENT_REQUIRED');
    statements.push(settlementEvent.statement);
  }
  await env.DB.batch(statements);
  if (paid) await notifySupplyOrder(env, order).catch((error) => console.error('mall supply order notice', error));
}
// P0: 결제 승인 전 서버 기준 주문 상태·만료·금액 검증 (Toss 승인 API 호출 이전에 차단)
export function assessOrderForConfirmation(order, amount, now = new Date()) {
  if (!order) return { ok:false, status:404, code:'ORDER_NOT_FOUND', error:'주문을 찾을 수 없습니다.' };
  if (order.status !== 'payment_pending') return { ok:false, status:409, code:'ORDER_NOT_PAYABLE', error:'결제 대기 상태의 주문만 승인할 수 있습니다.' };
  const grossAmount = Math.trunc(Number(order.gross_amount));
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) return { ok:false, status:409, code:'ORDER_AMOUNT_INVALID', error:'서버 주문금액이 올바르지 않습니다.' };
  if (!Number.isFinite(amount) || amount !== grossAmount) return { ok:false, status:409, code:'AMOUNT_MISMATCH', error:'서버 주문금액과 결제금액이 일치하지 않습니다.' };
  const expiresAt = order.expires_at ? Date.parse(order.expires_at) : NaN;
  if (!Number.isFinite(expiresAt)) return { ok:false, status:409, code:'ORDER_EXPIRY_MISSING', error:'주문 만료시각이 없어 승인할 수 없습니다.' };
  if (expiresAt <= now.getTime()) return { ok:false, status:410, code:'ORDER_EXPIRED', error:'주문 유효시간이 지났습니다. 다시 주문해 주세요.' };
  return { ok:true };
}

async function confirmOrderPayment(env, body) {
  if (!flag(env.PAYMENTS_ENABLED)) return { error:'온라인 결제는 아직 비활성 상태입니다.', status:503 };
  const provider = selectedPaymentProvider(env);
  if (provider !== 'toss') return { error:'선택한 결제 공급자의 온라인 승인 어댑터가 아직 활성화되지 않았습니다.', status:503 };
  const id = cleanText(body?.orderId, 80);
  const paymentKey = cleanText(body?.paymentKey, 220);
  const amount = Math.trunc(Number(body?.amount));
  if (!id || !paymentKey || !Number.isFinite(amount)) return { error:'paymentKey, orderId, amount가 필요합니다.', status:400 };
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if (!order) return { error:'주문을 찾을 수 없습니다.', status:404 };
  const existing = await env.DB.prepare("SELECT * FROM order_payments WHERE order_id=? AND status='DONE' LIMIT 1").bind(id).first();
  if (existing) {
    if (existing.payment_key !== paymentKey) return { error:'이미 다른 결제로 승인된 주문입니다.', status:409, code:'ORDER_ALREADY_PAID' };
    return { status:200, payment:{ paymentKey:existing.payment_key, orderId:id, status:existing.status, totalAmount:existing.total_amount }, idempotent:true };
  }
  const guard = assessOrderForConfirmation(order, amount);
  if (!guard.ok) return { error:guard.error, status:guard.status, code:guard.code };
  const payment = await confirmTossPayment(env, order, paymentKey, amount);
  try {
    await recordConfirmedPayment(env, order, payment, 'TOSS');
    if (payment.status === 'DONE') await env.DB.prepare('UPDATE orders SET stock_reserved=0 WHERE id=?').bind(order.id).run();
  } catch (error) {
    // 토스 승인은 끝났는데 기록이 실패 — 결제는 유효하다. 주기 대사(cron)·웹훅이 토스 재조회로 기록을 맞춘다.
    console.error('mall payment record failed after toss approval; reconciliation will retry', { orderId: order.id, message: error?.message });
    return { status: 202, payment: { paymentKey: payment.paymentKey, orderId: payment.orderId, status: payment.status, totalAmount: payment.totalAmount, approvedAt: payment.approvedAt || null }, recordPending: true };
  }
  return { status:200, payment:{ paymentKey:payment.paymentKey, orderId:payment.orderId, status:payment.status, totalAmount:payment.totalAmount, approvedAt:payment.approvedAt || null } };
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
        paymentProvider: paymentProviderPublicView(env),
        payoutExecutionEnabled: false
      }, ok ? 200 : 503, origin, env);
    }
    if (!env.DB) return json({ error: 'Mall 전용 데이터베이스 연결이 없습니다.' }, 503, origin, env);

    const publicMediaMatch = url.pathname.match(/^\/api\/public\/media\/(.+)$/);
    if ((request.method === 'GET' || request.method === 'HEAD') && publicMediaMatch) return servePublicMedia(env, decodeURIComponent(publicMediaMatch[1]), request);
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
      return json(result.order ? { order: result.order } : { error: result.error, errors: result.errors || undefined, quote: result.quote || null }, result.status, origin, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/public/payments/confirm') {
      const body = await readJson(request);
      try {
        const result = await confirmOrderPayment(env, body);
        return json(result.payment ? { payment: result.payment, idempotent: Boolean(result.idempotent), recordPending: Boolean(result.recordPending) } : { error: result.error }, result.status, origin, env);
      } catch (error) {
        console.error('mall toss confirm', error);
        return json({ error: '결제 승인 검증에 실패했습니다.' }, Number(error.status) || 502, origin, env);
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/public/payments/webhook') {
      const body = await readJson(request);
      const result = await handleTossWebhook(env, body || {});
      return json(result.body, result.status, origin, env);
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
      return json({ user: { id: user.id, email: user.email, displayName: displayNameFromUser(user), official: isEkodian(user, env) }, profile, membership }, 200, origin, env);
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

    // EKODI-MALL-DOMEGGOOK-IMPORT-001: 에코디언 전용 위탁상품 가져오기(초안 생성, 선발주 없음).
    if (request.method === 'POST' && url.pathname === '/api/products/import/domeggook') {
      if (!isEkodian(user, env)) return json({ error: '도매꾹 상품 가져오기는 에코디언 계정에서만 사용할 수 있습니다.' }, 403, origin, env);
      const body = await readJson(request);
      if (!body) return json({ error: 'Invalid JSON' }, 400, origin, env);
      try {
        const result = await importDomeggookProduct(env, user, body, {
          saveProduct,
          getProduct: async (e, sellerId, id) => rowToOwnerProduct(await getOwnerProduct(e, sellerId, id))
        });
        if (result.status < 300) await opsAudit(env, 'mall-auto:ekodian', 'product.supply.imported', user.id, result.body.product?.id, { provider: 'domeggook', itemNo: result.body.supply?.itemNo, salePrice: result.body.pricing?.salePrice });
        return json(result.body, result.status, origin, env);
      } catch (error) {
        console.error('mall domeggook import', error);
        return json({ error: '도매꾹 상품 가져오기에 실패했습니다.' }, 500, origin, env);
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
      const result = await setPublished(env, user.id, decodeURIComponent(publishMatch[1]), publishMatch[2] === 'publish', isEkodian(user, env));
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

    const imagesMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/images(?:\/([a-f0-9]{16}))?$/);
    if (imagesMatch) {
      const productIdValue = decodeURIComponent(imagesMatch[1]);
      try {
        let result = null;
        if (request.method === 'POST' && !imagesMatch[2]) result = await uploadProductImage(env, user.id, productIdValue, request);
        else if (request.method === 'DELETE' && imagesMatch[2]) result = await deleteProductImage(env, user.id, productIdValue, imagesMatch[2]);
        else if (request.method === 'PUT' && !imagesMatch[2]) result = await reorderProductImages(env, user.id, productIdValue, (await readJson(request))?.order);
        if (result) return json(result.body, result.status, origin, env);
      } catch (error) {
        console.error('mall product image', error);
        return json({ error: '사진 처리에 실패했습니다.' }, 500, origin, env);
      }
    }

    return json({ error: 'Not found' }, 404, origin, env);
  }
};
