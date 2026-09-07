const VALID_SELLER_TYPES = new Set(['individual', 'business']);
const OPEN_STATUSES = new Set(['submitted', 'under_review']);
const QUEUE_STATUSES = new Set(['submitted', 'under_review', 'verified', 'rejected', 'cancelled']);

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const flag = (value) => String(value || '').toLowerCase() === 'true';
const requestId = () => `vr_${crypto.randomUUID().replaceAll('-', '')}`;

async function readJson(request) { try { return await request.json(); } catch { return null; } }

async function authenticate(request, env) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ') || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? user : null;
}

function displayNameFromUser(user) {
  const metadata = user?.user_metadata || {};
  return clean(metadata.full_name || metadata.name || String(user?.email || '').split('@')[0], 100) || '판매자';
}

function allowedOpsEmails(env) {
  return new Set(clean(env.MALL_OPERATIONS_EMAILS, 2000).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
}

export async function authorizeVerificationOperations(request, env) {
  const supplied = request.headers.get('x-ekodi-mall-ops-token') || '';
  if (env.MALL_OPERATIONS_TOKEN && supplied && supplied === env.MALL_OPERATIONS_TOKEN) return { ok: true, actor: 'mall-ops:service-token' };
  const user = await authenticate(request, env);
  if (!user) return { ok: false, status: 401, error: 'Mall 운영자 Google 로그인이 필요합니다.' };
  const email = clean(user.email, 240).toLowerCase();
  const allow = allowedOpsEmails(env);
  if (!allow.size) return { ok: false, status: 503, error: 'Mall 운영자 이메일 allowlist가 구성되지 않았습니다.' };
  if (!allow.has(email)) return { ok: false, status: 403, error: '이 Google 계정은 Mall 검증 운영 권한이 없습니다.' };
  return { ok: true, actor: `mall-ops:${email}`, user };
}

async function ensureSellerProfile(env, user, sellerType) {
  const now = nowIso();
  const safeType = VALID_SELLER_TYPES.has(sellerType) ? sellerType : 'individual';
  await env.DB.prepare(`INSERT INTO seller_profiles
    (user_id,email,display_name,seller_type,verification_status,direct_sale_status,created_at,updated_at)
    VALUES (?,?,?,?, 'google_verified','pending',?,?)
    ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,seller_type=excluded.seller_type,updated_at=excluded.updated_at`)
    .bind(user.id, clean(user.email, 240), displayNameFromUser(user), safeType, now, now).run();
  await env.DB.prepare(`INSERT INTO memberships
    (seller_id,plan_id,status,source,valid_from,created_at,updated_at)
    VALUES (?,'free','active','google-signup',?,?,?) ON CONFLICT(seller_id) DO NOTHING`)
    .bind(user.id, now, now, now).run();
  return env.DB.prepare(`SELECT user_id AS userId,email,display_name AS displayName,seller_type AS sellerType,
    verification_status AS verificationStatus,direct_sale_status AS directSaleStatus FROM seller_profiles WHERE user_id=?`).bind(user.id).first();
}

async function activeRequest(env, entityType, entityId) {
  return env.DB.prepare(`SELECT id,entity_type AS entityType,entity_id AS entityId,status,request_note AS requestNote,
    review_note AS reviewNote,submitted_at AS submittedAt,reviewed_at AS reviewedAt,created_at AS createdAt,updated_at AS updatedAt
    FROM verification_requests WHERE entity_type=? AND entity_id=? AND status IN ('submitted','under_review') ORDER BY created_at DESC LIMIT 1`)
    .bind(entityType, entityId).first();
}

async function submitRequest(env, sellerId, entityType, entityId, note) {
  const existing = await activeRequest(env, entityType, entityId);
  if (existing) return { request: existing, idempotent: true };
  const now = nowIso();
  const id = requestId();
  try {
    await env.DB.prepare(`INSERT INTO verification_requests
      (id,seller_id,entity_type,entity_id,status,request_note,review_note,submitted_at,reviewed_at,created_at,updated_at)
      VALUES (?,?,?,?,'submitted',?,'',?,NULL,?,?)`)
      .bind(id, sellerId, entityType, entityId, clean(note, 1200), now, now, now).run();
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) {
      const raced = await activeRequest(env, entityType, entityId);
      if (raced) return { request: raced, idempotent: true };
    }
    throw error;
  }
  return { request: { id, entityType, entityId, status: 'submitted', requestNote: clean(note, 1200), reviewNote: '', submittedAt: now, reviewedAt: null, createdAt: now, updatedAt: now }, idempotent: false };
}

export function checkoutGateBlockers(row = {}) {
  const blockers = [];
  if (row.sale_type !== 'direct') blockers.push('not-direct-sale');
  if (row.status !== 'published') blockers.push('product-not-published');
  if (!Number.isInteger(row.price) || row.price <= 0) blockers.push('price-not-confirmed');
  if (row.direct_sale_status !== 'verified') blockers.push('seller-verification');
  const businessStoreVerified = row.seller_type === 'business' && Boolean(row.store_id) && row.store_verification_status === 'verified';
  if (row.seller_type === 'business' && !businessStoreVerified) blockers.push('business-store-verification');
  return blockers;
}

export function livePaymentBlockers(row = {}, env = {}) {
  const blockers = checkoutGateBlockers(row);
  if (!row.checkout_ready) blockers.push('product-checkout-gate');
  if (!flag(env.PAYMENTS_ENABLED)) blockers.push('payments-disabled');
  if (!env.TOSS_SECRET_KEY) blockers.push('toss-secret-missing');
  return blockers;
}

function productReadiness(row, env) {
  const gateBlockers = checkoutGateBlockers(row);
  const liveBlockers = livePaymentBlockers(row, env);
  return {
    id: row.id, name: row.name, status: row.status, saleType: row.sale_type, price: row.price, sellerType: row.seller_type,
    storeId: row.store_id || null, storeVerificationStatus: row.store_verification_status || null,
    checkoutGateEnabled: Boolean(row.checkout_ready), eligibleForCheckoutGate: gateBlockers.length === 0, gateBlockers,
    livePaymentReady: liveBlockers.length === 0, liveBlockers
  };
}

async function sellerReadiness(env, sellerId) {
  const profile = await env.DB.prepare(`SELECT user_id AS userId,email,display_name AS displayName,seller_type AS sellerType,
    verification_status AS verificationStatus,direct_sale_status AS directSaleStatus FROM seller_profiles WHERE user_id=?`).bind(sellerId).first();
  const storesResult = await env.DB.prepare(`SELECT id,slug,name,status,verification_status AS verificationStatus,updated_at AS updatedAt FROM stores WHERE seller_id=? ORDER BY updated_at DESC LIMIT 50`).bind(sellerId).all();
  const productsResult = await env.DB.prepare(`SELECT p.id,p.name,p.status,p.sale_type,p.price,p.seller_type,p.store_id,p.checkout_ready,
    sp.direct_sale_status,s.verification_status AS store_verification_status
    FROM products p JOIN seller_profiles sp ON sp.user_id=p.seller_id LEFT JOIN stores s ON s.id=p.store_id
    WHERE p.seller_id=? ORDER BY p.updated_at DESC LIMIT 100`).bind(sellerId).all();
  const requestsResult = await env.DB.prepare(`SELECT id,entity_type AS entityType,entity_id AS entityId,status,request_note AS requestNote,
    review_note AS reviewNote,submitted_at AS submittedAt,reviewed_at AS reviewedAt,created_at AS createdAt,updated_at AS updatedAt
    FROM verification_requests WHERE seller_id=? ORDER BY created_at DESC LIMIT 50`).bind(sellerId).all();
  const products = (productsResult.results || []).map((row) => productReadiness(row, env));
  return {
    profile, stores: storesResult.results || [], products, requests: requestsResult.results || [],
    global: {
      paymentsEnabled: flag(env.PAYMENTS_ENABLED), tossSecretConfigured: Boolean(env.TOSS_SECRET_KEY),
      operationsReviewConfigured: Boolean(env.MALL_OPERATIONS_TOKEN) || allowedOpsEmails(env).size > 0, operationsEmailAllowlistConfigured: allowedOpsEmails(env).size > 0, buyerPiiReleaseEnabled: flag(env.BUYER_PII_RELEASE_ENABLED),
      supplierForwardEnabled: flag(env.SUPPLIER_FORWARD_ENABLED), payoutExecutionEnabled: false, refundExecutionEnabled: false
    },
    summary: {
      storeCount: storesResult.results?.length || 0, productCount: products.length,
      checkoutGateEligibleCount: products.filter((item) => item.eligibleForCheckoutGate).length,
      checkoutGateEnabledCount: products.filter((item) => item.checkoutGateEnabled).length,
      livePaymentReadyCount: products.filter((item) => item.livePaymentReady).length
    }
  };
}

async function audit(env, { actor, action, sellerId = null, storeId = null, productId = null, requestIdValue = null, metadata = {} }) {
  await env.DB.prepare(`INSERT INTO mall_ops_audit (actor,action,seller_id,store_id,product_id,request_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(clean(actor, 120), clean(action, 120), sellerId, storeId, productId, requestIdValue, JSON.stringify(metadata).slice(0, 5000), nowIso()).run();
}

async function reviewRequest(env, id, body, actor) {
  const decision = body?.decision === 'verified' ? 'verified' : body?.decision === 'rejected' ? 'rejected' : '';
  if (!decision) return { status: 400, body: { error: 'decision은 verified 또는 rejected여야 합니다.' } };
  const request = await env.DB.prepare('SELECT * FROM verification_requests WHERE id=?').bind(id).first();
  if (!request) return { status: 404, body: { error: '검증 요청을 찾을 수 없습니다.' } };
  if (!OPEN_STATUSES.has(request.status)) return { status: 409, body: { error: '이미 처리된 검증 요청입니다.' } };
  const now = nowIso();
  const reviewNote = clean(body?.reviewNote, 1200);
  const statements = [env.DB.prepare(`UPDATE verification_requests SET status=?,review_note=?,reviewed_at=?,updated_at=? WHERE id=?`).bind(decision, reviewNote, now, now, id)];
  let storeId = null;
  if (request.entity_type === 'seller') {
    statements.push(env.DB.prepare('UPDATE seller_profiles SET direct_sale_status=?,updated_at=? WHERE user_id=?').bind(decision, now, request.seller_id));
  } else if (request.entity_type === 'store') {
    storeId = request.entity_id;
    if (decision === 'verified') statements.push(env.DB.prepare("UPDATE stores SET verification_status='verified',status='active',updated_at=? WHERE id=? AND seller_id=?").bind(now, request.entity_id, request.seller_id));
    else statements.push(env.DB.prepare("UPDATE stores SET verification_status='rejected',updated_at=? WHERE id=? AND seller_id=?").bind(now, request.entity_id, request.seller_id));
  }
  await env.DB.batch(statements);
  await audit(env, { actor, action: `verification.${decision}`, sellerId: request.seller_id, storeId, requestIdValue: id, metadata: { entityType: request.entity_type, reviewNotePresent: Boolean(reviewNote) } });
  return { status: 200, body: { request: { id, status: decision, reviewedAt: now } } };
}

async function setCheckoutGate(env, productId, body, actor) {
  if (typeof body?.ready !== 'boolean') return { status: 400, body: { error: 'ready boolean 값이 필요합니다.' } };
  const row = await env.DB.prepare(`SELECT p.id,p.name,p.status,p.sale_type,p.price,p.seller_type,p.store_id,p.checkout_ready,p.seller_id,
    sp.direct_sale_status,s.verification_status AS store_verification_status
    FROM products p JOIN seller_profiles sp ON sp.user_id=p.seller_id LEFT JOIN stores s ON s.id=p.store_id WHERE p.id=?`).bind(productId).first();
  if (!row) return { status: 404, body: { error: '상품을 찾을 수 없습니다.' } };
  const blockers = checkoutGateBlockers(row);
  if (body.ready && blockers.length) return { status: 409, body: { error: '상품 checkout gate를 활성화할 준비가 되지 않았습니다.', blockers } };
  const now = nowIso();
  await env.DB.prepare('UPDATE products SET checkout_ready=?,updated_at=? WHERE id=?').bind(body.ready ? 1 : 0, now, productId).run();
  await audit(env, {
    actor, action: body.ready ? 'product.checkout_gate.enabled' : 'product.checkout_gate.disabled',
    sellerId: row.seller_id, storeId: row.store_id || null, productId,
    metadata: { note: clean(body?.note, 800), blockersAtDecision: blockers }
  });
  return { status: 200, body: { product: productReadiness({ ...row, checkout_ready: body.ready ? 1 : 0 }, env) } };
}

export async function verificationSchemaReady(env) {
  if (!env.DB) return false;
  try {
    const rows = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('verification_requests','mall_ops_audit')`).all();
    const names = new Set((rows.results || []).map((row) => row.name));
    return names.has('verification_requests') && names.has('mall_ops_audit');
  } catch { return false; }
}

export async function handleVerificationRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const sellerVerificationSubmit = path === '/api/verification/seller/submit';
  const storeVerificationMatch = path.match(/^\/api\/stores\/([^/]+)\/verification\/submit$/);
  const internalReviewMatch = path.match(/^\/api\/internal\/verification\/([^/]+)\/review$/);
  const internalGateMatch = path.match(/^\/api\/internal\/products\/([^/]+)\/checkout-gate$/);
  const internalSellerReadinessMatch = path.match(/^\/api\/internal\/verification\/sellers\/([^/]+)\/readiness$/);
  const isRoute = path === '/api/readiness' || path === '/api/verification/requests' || sellerVerificationSubmit || Boolean(storeVerificationMatch)
    || path === '/api/internal/verification/queue' || Boolean(internalReviewMatch) || Boolean(internalGateMatch) || Boolean(internalSellerReadinessMatch);
  if (!isRoute) return null;
  if (!env.DB) return { status: 503, body: { error: 'Mall 전용 데이터베이스 연결이 없습니다.' } };

  if (path.startsWith('/api/internal/')) {
    const auth = await authorizeVerificationOperations(request, env);
    if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
    if (request.method === 'GET' && path === '/api/internal/verification/queue') {
      const requested = clean(url.searchParams.get('status'), 30) || 'submitted';
      const status = QUEUE_STATUSES.has(requested) ? requested : 'submitted';
      const rows = await env.DB.prepare(`SELECT vr.id,vr.seller_id AS sellerId,vr.entity_type AS entityType,vr.entity_id AS entityId,vr.status,
        vr.request_note AS requestNote,vr.review_note AS reviewNote,vr.submitted_at AS submittedAt,vr.reviewed_at AS reviewedAt,
        sp.email,sp.display_name AS displayName,sp.seller_type AS sellerType,sp.direct_sale_status AS directSaleStatus
        FROM verification_requests vr JOIN seller_profiles sp ON sp.user_id=vr.seller_id WHERE vr.status=? ORDER BY vr.created_at ASC LIMIT 100`).bind(status).all();
      return { status: 200, body: { requests: rows.results || [], status, actor: auth.actor } };
    }
    if (request.method === 'GET' && internalSellerReadinessMatch) {
      return { status: 200, body: { readiness: await sellerReadiness(env, decodeURIComponent(internalSellerReadinessMatch[1])), actor: auth.actor } };
    }
    if (request.method === 'POST' && internalReviewMatch) {
      const body = await readJson(request);
      if (!body) return { status: 400, body: { error: 'Invalid JSON' } };
      return reviewRequest(env, decodeURIComponent(internalReviewMatch[1]), body, auth.actor);
    }
    if (request.method === 'POST' && internalGateMatch) {
      const body = await readJson(request);
      if (!body) return { status: 400, body: { error: 'Invalid JSON' } };
      return setCheckoutGate(env, decodeURIComponent(internalGateMatch[1]), body, auth.actor);
    }
    return { status: 405, body: { error: 'Method not allowed' } };
  }

  const user = await authenticate(request, env);
  if (!user) return { status: 401, body: { error: 'Google 판매자 로그인이 필요합니다.' } };
  if (request.method === 'GET' && path === '/api/readiness') return { status: 200, body: { readiness: await sellerReadiness(env, user.id) } };
  if (request.method === 'GET' && path === '/api/verification/requests') {
    const rows = await env.DB.prepare(`SELECT id,entity_type AS entityType,entity_id AS entityId,status,request_note AS requestNote,
      review_note AS reviewNote,submitted_at AS submittedAt,reviewed_at AS reviewedAt,created_at AS createdAt,updated_at AS updatedAt
      FROM verification_requests WHERE seller_id=? ORDER BY created_at DESC LIMIT 100`).bind(user.id).all();
    return { status: 200, body: { requests: rows.results || [] } };
  }
  if (request.method === 'POST' && sellerVerificationSubmit) {
    const body = await readJson(request);
    if (!body) return { status: 400, body: { error: 'Invalid JSON' } };
    const profile = await ensureSellerProfile(env, user, body.sellerType);
    if (profile.directSaleStatus === 'verified') return { status: 409, body: { error: '이미 직접판매 판매자 검증이 완료되었습니다.' } };
    const result = await submitRequest(env, user.id, 'seller', user.id, body.note);
    return { status: result.idempotent ? 200 : 201, body: result };
  }
  if (request.method === 'POST' && storeVerificationMatch) {
    const body = await readJson(request);
    if (!body) return { status: 400, body: { error: 'Invalid JSON' } };
    const profile = await env.DB.prepare('SELECT seller_type AS sellerType FROM seller_profiles WHERE user_id=?').bind(user.id).first();
    if (!profile) return { status: 409, body: { error: '판매자 프로필을 먼저 생성해 주세요.' } };
    if (profile.sellerType !== 'business') return { status: 409, body: { error: 'Store 검증은 사업자 판매자에게 적용됩니다.' } };
    const storeId = decodeURIComponent(storeVerificationMatch[1]);
    const store = await env.DB.prepare('SELECT id,verification_status AS verificationStatus FROM stores WHERE id=? AND seller_id=?').bind(storeId, user.id).first();
    if (!store) return { status: 404, body: { error: '스토어를 찾을 수 없습니다.' } };
    if (store.verificationStatus === 'verified') return { status: 409, body: { error: '이미 검증된 스토어입니다.' } };
    const result = await submitRequest(env, user.id, 'store', storeId, body.note);
    return { status: result.idempotent ? 200 : 201, body: result };
  }
  return { status: 405, body: { error: 'Method not allowed' } };
}
