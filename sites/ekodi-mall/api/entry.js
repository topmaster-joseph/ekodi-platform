import core from './worker.js';
import { handleSourcingRequest, sourcingSchemaReady } from './sourcing.js';
import { handleSourcingPlanRequest } from './sourcing-plan.js';
import { handleVerificationRequest, verificationSchemaReady } from './verification.js';

const FEE_RATES = Object.freeze({ direct: 7, marketplace: 8, ai: 9 });
const ATTRIBUTION_WINDOW_DAYS = 7;
const DEFAULT_ALLOWED_ORIGINS = ['https://mall.ekodi.kr','https://mall.biz.ekodi.kr','https://ekodi-mall.pages.dev'];

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const addDaysIso = (days) => new Date(Date.now() + days * 86400000).toISOString();
const randomCode = (length = 24) => {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
};
const visitId = () => `av_${crypto.randomUUID().replaceAll('-', '')}`;

function origins(env) {
  const configured = clean(env?.ALLOWED_ORIGINS, 1200).split(',').map((item) => item.trim()).filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}
function headers(origin, env) {
  const h = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-headers': 'authorization, content-type, x-ekodi-mall-internal-token, x-ekodi-mall-ops-token',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin'
  });
  if (origin && origins(env).has(origin)) h.set('access-control-allow-origin', origin);
  return h;
}
function reply(data, status, origin, env) { return new Response(JSON.stringify(data), { status, headers: headers(origin, env) }); }
function parseJson(value, fallback = []) { try { return JSON.parse(value || '') || fallback; } catch { return fallback; } }

export function feeForFirstTouch({ sellerType = 'individual', businessStoreVerified = false, sourceType = 'marketplace' } = {}) {
  if (sellerType === 'business' && businessStoreVerified) return 10;
  return FEE_RATES[sourceType] || FEE_RATES.marketplace;
}
export function trustedSource(sourceType = '') {
  return sourceType === 'direct' || sourceType === 'ai' ? sourceType : 'marketplace';
}

const PUBLIC_SELECT = `SELECT p.id,p.share_code,p.public_url,p.seller_type,p.seller_display_name,p.sale_type,p.category,p.name,p.audience,p.one_line,p.price,
  p.benefits_json,p.specs_json,p.story,p.fulfillment,p.contact,p.affiliate_url,p.checkout_ready,p.published_at,p.store_id,
  s.name AS store_name,s.slug AS store_slug,s.verification_status AS store_verification_status
  FROM products p LEFT JOIN stores s ON s.id=p.store_id`;

function publicProduct(row) {
  if (!row) return null;
  const verifiedBusinessStore = row.seller_type === 'business' && Boolean(row.store_id) && row.store_verification_status === 'verified';
  return {
    shareCode: row.share_code,
    publicUrl: row.public_url,
    seller: { type: row.seller_type, displayName: row.seller_display_name },
    store: row.store_id ? { name: row.store_name || '', slug: row.store_slug || '', verificationStatus: row.store_verification_status || 'unverified' } : null,
    product: {
      saleType: row.sale_type,
      category: row.category,
      name: row.name,
      audience: row.audience || '',
      oneLine: row.one_line || '',
      price: row.price,
      benefits: parseJson(row.benefits_json),
      specs: parseJson(row.specs_json),
      story: row.story || '',
      fulfillment: row.fulfillment || '',
      contact: row.contact || '',
      affiliateUrl: row.sale_type === 'affiliate' ? row.affiliate_url || '' : ''
    },
    businessStoreVerified: verifiedBusinessStore,
    checkoutReady: Boolean(row.checkout_ready) && (row.seller_type !== 'business' || verifiedBusinessStore),
    paymentsEnabled: false,
    publishedAt: row.published_at
  };
}

async function listPublicProducts(env, limitValue) {
  const limit = Math.max(1, Math.min(48, Math.trunc(Number(limitValue) || 24)));
  const result = await env.DB.prepare(`${PUBLIC_SELECT} WHERE p.status='published' ORDER BY p.published_at DESC LIMIT ?`).bind(limit).all();
  return (result.results || []).map(publicProduct);
}

async function firstTouch(env, input = {}) {
  const shareCode = clean(input.shareCode, 80);
  const visitorId = clean(input.visitorId, 96);
  const refCode = clean(input.refCode || input.ref, 80);
  if (!shareCode || !visitorId) return { status: 400, body: { error: 'shareCode와 anonymous visitorId가 필요합니다.' } };

  const row = await env.DB.prepare(`${PUBLIC_SELECT} WHERE p.share_code=? AND p.status='published'`).bind(shareCode).first();
  if (!row) return { status: 404, body: { error: '공개 상품을 찾을 수 없습니다.' } };

  const now = nowIso();
  const existing = await env.DB.prepare(`SELECT id,attribution_token AS token,source_type AS sourceType,channel,fee_rate_percent AS feeRatePercent,
    first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt,expires_at AS expiresAt
    FROM attribution_visits WHERE product_id=? AND visitor_id=?`).bind(row.id, visitorId).first();

  if (existing && existing.expiresAt > now) {
    await env.DB.prepare('UPDATE attribution_visits SET last_seen_at=? WHERE id=?').bind(now, existing.id).run();
    return { status: 200, body: { attribution: { ...existing, lastSeenAt: now, windowDays: ATTRIBUTION_WINDOW_DAYS, firstTouchPreserved: true } } };
  }

  let sourceType = 'marketplace';
  let channel = 'mall';
  let shareLinkCode = null;
  if (refCode) {
    const link = await env.DB.prepare(`SELECT code,source_type AS sourceType,channel FROM share_links
      WHERE code=? AND product_id=? AND active=1 AND (expires_at IS NULL OR expires_at>?)`).bind(refCode, row.id, now).first();
    if (link) {
      sourceType = trustedSource(link.sourceType);
      channel = clean(link.channel, 30) || 'unknown';
      shareLinkCode = link.code;
    }
  }

  const verifiedBusinessStore = row.seller_type === 'business' && Boolean(row.store_id) && row.store_verification_status === 'verified';
  const feeRatePercent = feeForFirstTouch({ sellerType: row.seller_type, businessStoreVerified: verifiedBusinessStore, sourceType });
  const token = `att_${randomCode(24)}`;
  const expiresAt = addDaysIso(ATTRIBUTION_WINDOW_DAYS);
  const id = existing?.id || visitId();

  await env.DB.batch([
    env.DB.prepare('INSERT INTO attribution_tokens (token,product_id,source_type,channel,created_at,expires_at) VALUES (?,?,?,?,?,?)')
      .bind(token, row.id, sourceType, channel, now, expiresAt),
    env.DB.prepare(`INSERT INTO attribution_visits
      (id,product_id,visitor_id,attribution_token,share_link_code,source_type,channel,fee_rate_percent,first_seen_at,last_seen_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(product_id,visitor_id) DO UPDATE SET attribution_token=excluded.attribution_token,share_link_code=excluded.share_link_code,
      source_type=excluded.source_type,channel=excluded.channel,fee_rate_percent=excluded.fee_rate_percent,first_seen_at=excluded.first_seen_at,
      last_seen_at=excluded.last_seen_at,expires_at=excluded.expires_at`)
      .bind(id, row.id, visitorId, token, shareLinkCode, sourceType, channel, feeRatePercent, now, now, expiresAt),
    env.DB.prepare("INSERT INTO product_events (product_id,event_type,attribution_type,channel,session_token,occurred_at) VALUES (?,'view',?,?,?,?)")
      .bind(row.id, sourceType, channel, token, now)
  ]);

  return { status: existing ? 200 : 201, body: { attribution: { id, token, sourceType, channel, feeRatePercent, firstSeenAt: now, lastSeenAt: now, expiresAt, windowDays: ATTRIBUTION_WINDOW_DAYS, firstTouchPreserved: false } } };
}

async function attributionSchemaReady(env) {
  try {
    const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='attribution_visits'").first();
    return row?.name === 'attribution_visits';
  } catch { return false; }
}

// Compatibility bridge for the short-lived Durable Object based Mall API deployment.
// Cloudflare will not allow a Worker version to drop an existing Durable Object class
// without an explicit destructive migration. Keep the class export so any legacy
// namespace/data remains intact, while all current Mall traffic uses the D1 API below.
export class MallCatalog {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch() {
    return new Response(JSON.stringify({
      error: 'LEGACY_MALL_CATALOG_RETIRED',
      message: 'Legacy MallCatalog storage is preserved but no longer serves EKODI Mall traffic.'
    }), {
      status: 410,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      }
    });
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    if (origin && !origins(env).has(origin)) return reply({ error: '허용되지 않은 요청입니다.' }, 403, origin, env);
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      const coreResponse = await core.fetch(request, env);
      const coreBody = await coreResponse.clone().json().catch(() => ({}));
      const firstTouchReady = Boolean(env.DB) && await attributionSchemaReady(env);
      const sourcingReady = Boolean(env.DB) && await sourcingSchemaReady(env);
      const verificationReady = Boolean(env.DB) && await verificationSchemaReady(env);
      const ok = coreResponse.ok && firstTouchReady && sourcingReady && verificationReady;
      return reply({
        ...coreBody,
        ok,
        version: 4,
        environment: env.ENVIRONMENT || 'unknown',
        firstTouchSchemaReady: firstTouchReady,
        sourcingSchemaReady: sourcingReady,
        verificationSchemaReady: verificationReady,
        attributionWindowDays: ATTRIBUTION_WINDOW_DAYS,
        operationsReviewConfigured: Boolean(env.MALL_OPERATIONS_TOKEN)
      }, ok ? 200 : 503, origin, env);
    }

    if (request.method === 'GET' && url.pathname === '/api/public/products') {
      if (!env.DB) return reply({ error: 'Mall 전용 데이터베이스 연결이 없습니다.' }, 503, origin, env);
      return reply({ products: await listPublicProducts(env, url.searchParams.get('limit')) }, 200, origin, env);
    }

    if (request.method === 'GET' && url.pathname === '/api/public/fees') {
      return reply({ individual: FEE_RATES, businessStore: 10, pgIncluded: true, vatIncluded: true, proAiSubscriptionSeparate: true, attributionWindowDays: ATTRIBUTION_WINDOW_DAYS, serverAuthoritative: true }, 200, origin, env);
    }

    if (request.method === 'POST' && url.pathname === '/api/public/attribution/visit') {
      if (!env.DB) return reply({ error: 'Mall 전용 데이터베이스 연결이 없습니다.' }, 503, origin, env);
      let body = null;
      try { body = await request.json(); } catch {}
      if (!body) return reply({ error: 'Invalid JSON' }, 400, origin, env);
      const result = await firstTouch(env, body);
      return reply(result.body, result.status, origin, env);
    }

    const verification = await handleVerificationRequest(request, env);
    if (verification) return reply(verification.body, verification.status, origin, env);

    if (url.pathname.startsWith('/api/sourcing/')) {
      const plan = await handleSourcingPlanRequest(request, env);
      if (plan) return reply(plan.body, plan.status, origin, env);
    }
    if (url.pathname.startsWith('/api/sourcing/') || url.pathname.startsWith('/api/internal/sourcing/')) {
      const result = await handleSourcingRequest(request, env);
      if (result) return reply(result.body, result.status, origin, env);
    }

    return core.fetch(request, env);
  }
};
