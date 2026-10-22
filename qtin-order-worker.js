// EKODI-QTIN-GROUP-ORDER-001
// 큐티인(QTIN) 월간 공동구매 — 에코디교회·에코디선교회 공용 신청서.
//  • 매월 20일(KST) 다음달호 신청을 열고 25일 23:59에 마감한다.
//  • 신청 도서와 가격·표지는 QTM 쇼핑몰(qtm.or.kr)의 온라인 판매가격 그대로 자동 수집한다.
//  • 토스페이먼츠 결제 승인이 서버에서 확인된 신청만 '완료(paid)'로 기록·집계한다.
//  • 관리자(ekodi.kr/qtin/admin)는 월별·기관별 발주 수량, 결제, 수령 현황을 관리한다.
import {
  ORGS, FULFILLMENT, QTM_ORIGIN, PENDING_TTL_MS,
  clean, escapeHtml, kstParts, campaignId, parseCampaignId, addMonth, defaultWindow, targetIssueFor,
  inPreparationWindow, campaignState, formatKst, formatWon, parseIssueTitle, titleMatchesIssue, isQtinFamily,
  extractItemIds, parseProductDetail, seriesSortOrder, buildOrderDraft, newOrderId, isValidTossOrderId,
  assessConfirmation, maskName, csvEscape, absoluteQtmUrl,
} from './qtin-order-core.js';
import * as ekodipay from './ekodipay-core.js';

const BASE = '/qtin';
const API = '/qtin/api';
const ADMIN_PATH = '/qtin/admin';
const CENTRAL_SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const CENTRAL_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const CHURCH_PASTOR_API = 'https://renzehysxirjilvdxacv.supabase.co/functions/v1/church-pastor-api';
const STAFF_ROLES = new Set(['senior_pastor', 'pastor', 'staff']);
const USER_AGENT = 'EKODI-QTIN-GroupOrder/1.0 (+https://ekodi.kr/qtin; contact joseph@ekodibiz.kr)';
const MAX_SYNC_FETCHES = 40;
const PII_RETENTION_DAYS = 400;

const STAGING_PRODUCTS = Object.freeze([
  { id: 'staging:1', qtm_item_id: '0000000001', name: '큐티인(QTIN)(작은글씨) 샘플호', series: '큐티인(QTIN)(작은글씨)', sale_price: 3600, list_price: 4000, image_url: '', product_url: QTM_ORIGIN, active: 1, sort_order: 10 },
  { id: 'staging:2', qtm_item_id: '0000000002', name: '어린이 큐티인(고학년) 샘플호', series: '어린이 큐티인(고학년)', sale_price: 4500, list_price: 5000, image_url: '', product_url: QTM_ORIGIN, active: 1, sort_order: 60 },
]);

// ---------- env helpers ----------
const flag = value => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
const isStaging = env => !env?.DB || String(env?.DATA_MODE || '') === 'isolated-staging';
const publicBase = env => clean(env?.PUBLIC_BASE_URL, 200) || 'https://ekodi.kr/qtin';
function paymentReadiness(env, profileId) {
  // EKODIPAY-CORE-001: shared readiness; profile defaults to EKODIPAY_PROFILE ('ekodi').
  return ekodipay.readiness(env, { profileId: profileId || ekodipay.activeProfileId(env), staging: isStaging(env) });
}
// Test keys never take real money. While the client key is a test_ key, only signed-in
// operators/staff may create (clearly labelled) test orders; the public page stays closed
// and test orders are kept out of order totals, product counts and the CSV export.
const TEST_ORDER_PREFIX = 'QTINTEST-';
const NOT_TEST_ORDER = `o.id NOT LIKE '${TEST_ORDER_PREFIX}%'`;
const publicPaymentReady = env => paymentReadiness(env).publicReady;
const testPaymentReady = env => paymentReadiness(env).testReady;
const orderProfile = orderId => ekodipay.profileFromOrderId(orderId);
function operatorEmails(env) {
  return new Set(String(env?.OPERATOR_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
}

// ---------- responses ----------
function nonce() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/[^A-Za-z0-9]/g, '');
}
function securityHeaders(extra = {}) {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    ...extra,
  };
}
function html(body, { status = 200, method = 'GET', scriptNonce = '', env } = {}) {
  const csp = [
    "default-src 'self'",
    "img-src 'self' data: https://www.qtm.or.kr https://qtm.or.kr https://*.tosspayments.com",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' ${scriptNonce ? `'nonce-${scriptNonce}'` : ''} https://js.tosspayments.com`,
    `connect-src 'self' https://*.tosspayments.com ${CENTRAL_SUPABASE_URL}`,
    'frame-src https://*.tosspayments.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.tosspayments.com",
  ].join('; ');
  const headers = securityHeaders({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': csp });
  if (isStaging(env)) headers['x-ekodi-data-mode'] = 'isolated-staging';
  return new Response(method === 'HEAD' ? null : body, { status, headers });
}
function json(data, status = 200, env, method = 'GET') {
  const headers = securityHeaders({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  if (isStaging(env)) headers['x-ekodi-data-mode'] = 'isolated-staging';
  return new Response(method === 'HEAD' ? null : JSON.stringify(data), { status, headers });
}
async function readJson(request, limit = 20000) {
  const text = await request.text();
  if (text.length > limit) return null;
  try { return JSON.parse(text); } catch { return null; }
}
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(bytes = 24) {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function audit(env, targetId, actor, action, detail = '') {
  try {
    await env.DB.prepare('INSERT INTO qtin_audit_logs (target_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(clean(targetId, 160), clean(actor, 320), clean(action, 80), clean(typeof detail === 'string' ? detail : JSON.stringify(detail), 2000), new Date().toISOString()).run();
  } catch (error) {
    console.error('qtin audit', error);
  }
}

// ---------- campaigns & products ----------
async function getCampaign(env, id) {
  return env.DB.prepare('SELECT * FROM qtin_campaigns WHERE id=?').bind(id).first();
}
async function ensureCampaign(env, year, month) {
  const id = campaignId(year, month);
  const existing = await getCampaign(env, id);
  if (existing) return existing;
  const { opensAt, closesAt } = defaultWindow(year, month);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO qtin_campaigns (id, target_year, target_month, opens_at, closes_at, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)`).bind(id, year, month, opensAt, closesAt, now, now).run();
  await audit(env, id, 'system:scheduler', 'campaign.create', { opensAt, closesAt });
  return getCampaign(env, id);
}
async function listProducts(env, campaign, includeInactive = false) {
  const rows = await env.DB.prepare(`SELECT * FROM qtin_products WHERE campaign_id=? ${includeInactive ? '' : 'AND active=1'} ORDER BY sort_order ASC, name ASC`).bind(campaign).all();
  return rows.results || [];
}
/** The campaign to show publicly: the open one, else the next scheduled, else the latest. */
async function currentCampaign(env, now = new Date()) {
  const target = targetIssueFor(now);
  const candidates = [target.id, campaignId(kstParts(now).year, kstParts(now).month)];
  for (const id of candidates) {
    const row = await getCampaign(env, id);
    if (row && campaignState(row, now) === 'open') return row;
  }
  const forced = await env.DB.prepare("SELECT * FROM qtin_campaigns WHERE manual_state='force_open' ORDER BY id DESC LIMIT 1").first();
  if (forced) return forced;
  const row = await getCampaign(env, target.id);
  if (row) return row;
  const { opensAt, closesAt } = defaultWindow(target.year, target.month);
  return { id: target.id, target_year: target.year, target_month: target.month, opens_at: opensAt, closes_at: closesAt, status: 'scheduled', manual_state: '', virtual: true };
}

async function fetchQtm(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml', 'accept-language': 'ko-KR,ko;q=0.9' },
    redirect: 'follow',
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!response.ok) throw new Error(`QTM_HTTP_${response.status}`);
  const text = await response.text();
  if (text.length > 3_000_000) throw new Error('QTM_PAGE_TOO_LARGE');
  return text;
}

async function upsertProduct(env, campaign, product, source = 'qtm-sync') {
  const parsed = parseIssueTitle(product.name);
  const id = `${campaign}:${product.qtmItemId}`;
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO qtin_products (id, campaign_id, qtm_item_id, name, series, sale_price, list_price, image_url, product_url, sort_order, active, source, fetched_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, series=excluded.series, sale_price=excluded.sale_price, list_price=excluded.list_price,
      image_url=CASE WHEN excluded.image_url<>'' THEN excluded.image_url ELSE qtin_products.image_url END,
      product_url=excluded.product_url, fetched_at=excluded.fetched_at, updated_at=excluded.updated_at`)
    .bind(id, campaign, product.qtmItemId, product.name, parsed?.series || '', product.salePrice, product.listPrice || 0, product.imageUrl || '', product.productUrl, seriesSortOrder(product.name), source, now, now, now).run();
  return id;
}

/**
 * Discover next month's QTIN-family issues on qtm.or.kr and store their online prices.
 * Search pages first, then known item ids (seed + previous campaigns), then their prev/next links.
 */
export async function syncCampaign(env, campaignRow, { fetchPage = fetchQtm, actor = 'system:scheduler' } = {}) {
  const { year, month } = parseCampaignId(campaignRow.id);
  const startedAt = new Date().toISOString();
  const queue = [];
  const queued = new Set();
  const enqueue = (id, front = false) => {
    if (!/^\d{6,14}$/.test(id) || queued.has(id)) return;
    queued.add(id);
    front ? queue.unshift(id) : queue.push(id);
  };
  const notes = [];
  let fetches = 0;
  for (const q of [`${year}년 ${month}월호`, '큐티인']) {
    if (fetches >= MAX_SYNC_FETCHES) break;
    try {
      fetches += 1;
      const page = await fetchPage(`${QTM_ORIGIN}/shop/search.php?q=${encodeURIComponent(q)}`);
      extractItemIds(page).sort((a, b) => Number(b) - Number(a)).forEach(id => enqueue(id));
    } catch (error) {
      notes.push(`search:${q}:${error.message}`);
    }
  }
  const seeds = String(env.QTM_SEED_ITEM_IDS || '').split(',').map(v => v.trim()).filter(Boolean);
  const known = await env.DB.prepare('SELECT DISTINCT qtm_item_id FROM qtin_products ORDER BY campaign_id DESC LIMIT 40').all();
  for (const id of [...seeds, ...(known.results || []).map(r => r.qtm_item_id)]) enqueue(id);

  const found = new Map();
  while (queue.length && fetches < MAX_SYNC_FETCHES) {
    const id = queue.shift();
    let page;
    try {
      fetches += 1;
      page = await fetchPage(`${QTM_ORIGIN}/shop/${id}`);
    } catch (error) {
      notes.push(`item:${id}:${error.message}`);
      continue;
    }
    const detail = parseProductDetail(page, id);
    if (!detail) continue;
    const family = isQtinFamily(detail.name);
    if (family && titleMatchesIssue(detail.name, year, month)) found.set(id, detail);
    // Follow prev/next links only from QTIN-family pages so the crawl stays on the periodical shelf.
    if (family) extractItemIds(page).sort((a, b) => Number(b) - Number(a)).forEach(next => enqueue(next));
  }

  for (const detail of found.values()) await upsertProduct(env, campaignRow.id, detail);
  // An auto-synced product whose QTM page no longer shows this issue (QTM reused the item for another month) is hidden.
  const autoRows = await env.DB.prepare("SELECT id, qtm_item_id FROM qtin_products WHERE campaign_id=? AND source='qtm-sync' AND active=1").bind(campaignRow.id).all();
  let hidden = 0;
  const exhausted = queue.length === 0;
  // Hide only after a complete crawl, so a capped or partial crawl never removes valid books.
  if (found.size && exhausted) {
    for (const row of autoRows.results || []) {
      if (!found.has(row.qtm_item_id)) {
        await env.DB.prepare('UPDATE qtin_products SET active=0, updated_at=? WHERE id=?').bind(new Date().toISOString(), row.id).run();
        hidden += 1;
      }
    }
  }
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM qtin_products WHERE campaign_id=? AND active=1').bind(campaignRow.id).first();
  const status = found.size ? 'ok' : 'empty';
  const detailText = JSON.stringify({ found: found.size, hidden, fetches, exhausted, notes: notes.slice(0, 8) });
  await env.DB.prepare('UPDATE qtin_campaigns SET last_sync_at=?, last_sync_status=?, last_sync_detail=?, product_count=?, updated_at=? WHERE id=?')
    .bind(startedAt, status, detailText.slice(0, 2000), Number(count?.n || 0), new Date().toISOString(), campaignRow.id).run();
  await audit(env, campaignRow.id, actor, 'campaign.sync', detailText);
  return { status, found: found.size, hidden, fetches, notes, productCount: Number(count?.n || 0) };
}

async function expirePending(env, now = new Date()) {
  const result = await env.DB.prepare("UPDATE qtin_orders SET status='expired', updated_at=? WHERE status='payment_pending' AND expires_at < ?")
    .bind(now.toISOString(), now.toISOString()).run();
  return result?.meta?.changes || 0;
}

async function anonymizeOld(env, now = new Date()) {
  const cutoff = new Date(now.getTime() - PII_RETENTION_DAYS * 86400000).toISOString();
  const result = await env.DB.prepare(`UPDATE qtin_orders SET applicant_name='(보관기간 경과)', phone='', email='', department='', memo='', lookup_token_hash='', anonymized_at=?, updated_at=?
    WHERE anonymized_at='' AND created_at < ?`).bind(now.toISOString(), now.toISOString(), cutoff).run();
  return result?.meta?.changes || 0;
}

export async function runScheduled(env, now = new Date(), options = {}) {
  if (isStaging(env)) return { skipped: 'isolated-staging' };
  const report = { expired: await expirePending(env, now), anonymized: 0, sync: null };
  if (kstParts(now).day === 1) report.anonymized = await anonymizeOld(env, now);
  if (inPreparationWindow(now)) {
    const target = targetIssueFor(now);
    const campaign = await ensureCampaign(env, target.year, target.month);
    if (campaignState(campaign, now) !== 'closed' || Number(campaign.product_count || 0) === 0) {
      report.sync = await syncCampaign(env, campaign, options);
    }
  }
  return report;
}

// ---------- Toss Payments ----------
async function tossRequest(env, path, options = {}, profileId) {
  // EKODIPAY-CORE-001: every Toss call goes through the shared module with the order's merchant profile.
  return ekodipay.tossRequest(env, profileId || ekodipay.activeProfileId(env), path, options);
}
async function markPaid(env, order, payment, actor) {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`UPDATE qtin_orders SET status='paid', payment_key=?, payment_method=?, approved_at=?, receipt_url=?, updated_at=?
    WHERE id=? AND status IN ('payment_pending','expired','payment_failed')`)
    .bind(clean(payment.paymentKey, 220), clean(payment.method, 60), clean(payment.approvedAt, 60) || now, clean(payment.receipt?.url, 500), now, order.id).run();
  await audit(env, order.id, actor, 'order.paid', { method: payment.method, amount: payment.totalAmount, status: payment.status });
  return result?.meta?.changes || 0;
}

export async function confirmPayment(env, { paymentKey, orderId, amount }, now = new Date()) {
  const profileId = orderProfile(orderId);
  const readiness = paymentReadiness(env, profileId);
  if (!readiness.ready) return { ok: false, status: 503, code: 'PAYMENTS_NOT_READY', message: '온라인 결제가 아직 준비되지 않았습니다.' };
  if (!isValidTossOrderId(orderId) || !clean(paymentKey, 220)) return { ok: false, status: 400, code: 'BAD_REQUEST', message: '결제 정보가 올바르지 않습니다.' };
  const order = await env.DB.prepare('SELECT * FROM qtin_orders WHERE id=?').bind(orderId).first();
  if (order?.status === 'paid') {
    if (order.payment_key === paymentKey) return { ok: true, order, idempotent: true };
    return { ok: false, status: 409, code: 'ALREADY_PAID', message: '이미 다른 결제로 완료된 신청입니다.' };
  }
  const guard = assessConfirmation(order, Number(amount), now);
  if (!guard.ok) return { ...guard, ok: false };
  let payment;
  try {
    payment = await tossRequest(env, '/v1/payments/confirm', { method: 'POST', body: { paymentKey, orderId, amount: Math.trunc(Number(amount)) }, idempotencyKey: `qtin-confirm-${orderId}` }, profileId);
  } catch (error) {
    await audit(env, orderId, 'payment-provider:toss', 'payment.confirm_failed', { code: error.code, status: error.status });
    if (error.code === 'ALREADY_PROCESSED_PAYMENT') {
      payment = await tossRequest(env, `/v1/payments/${encodeURIComponent(paymentKey)}`, {}, profileId).catch(() => null);
    }
    if (!payment) return { ok: false, status: 402, code: error.code || 'CONFIRM_FAILED', message: error.message || '결제 승인에 실패했습니다.' };
  }
  if (payment.orderId !== orderId || Math.trunc(Number(payment.totalAmount)) !== Math.trunc(Number(order.total_amount))) {
    await audit(env, orderId, 'payment-provider:toss', 'payment.mismatch', { orderId: payment.orderId, totalAmount: payment.totalAmount });
    return { ok: false, status: 409, code: 'PAYMENT_MISMATCH', message: '결제 정보가 신청 내역과 일치하지 않아 관리자 확인이 필요합니다.' };
  }
  if (payment.status !== 'DONE') {
    await audit(env, orderId, 'payment-provider:toss', 'payment.not_done', { status: payment.status, method: payment.method });
    return { ok: false, status: 202, code: `PAYMENT_${payment.status}`, message: '결제가 아직 완료되지 않았습니다. 입금이 확인되면 자동으로 완료 처리됩니다.' };
  }
  await markPaid(env, order, payment, 'payment-provider:toss');
  return { ok: true, order: await env.DB.prepare('SELECT * FROM qtin_orders WHERE id=?').bind(orderId).first() };
}

/** Toss webhook (no signature for payment events): re-verify through the Payment Query API. */
export async function handleWebhook(env, body) {
  const data = body?.data || {};
  const paymentKey = clean(data.paymentKey, 220);
  const orderId = clean(data.orderId, 80);
  if (!paymentKey || !isValidTossOrderId(orderId)) {
    if (!paymentReadiness(env).ready) return { status: 503, result: 'not-ready' };
    return { status: 200, result: 'ignored' };
  }
  const profileId = orderProfile(orderId);
  if (!paymentReadiness(env, profileId).ready) return { status: 503, result: 'not-ready' };
  const order = await env.DB.prepare('SELECT * FROM qtin_orders WHERE id=?').bind(orderId).first();
  if (!order) return { status: 200, result: 'unknown-order' };
  const payment = await tossRequest(env, `/v1/payments/${encodeURIComponent(paymentKey)}`, {}, profileId);
  if (payment.orderId !== orderId) return { status: 200, result: 'mismatch' };
  if (payment.status === 'DONE') {
    if (Math.trunc(Number(payment.totalAmount)) !== Math.trunc(Number(order.total_amount))) {
      await audit(env, orderId, 'payment-provider:toss-webhook', 'payment.mismatch', { totalAmount: payment.totalAmount });
      return { status: 200, result: 'amount-mismatch' };
    }
    if (order.status !== 'paid') await markPaid(env, order, payment, 'payment-provider:toss-webhook');
    return { status: 200, result: 'paid' };
  }
  if (['CANCELED', 'PARTIAL_CANCELED'].includes(payment.status) && order.status === 'paid') {
    await env.DB.prepare("UPDATE qtin_orders SET status='cancelled', updated_at=? WHERE id=?").bind(new Date().toISOString(), orderId).run();
    await audit(env, orderId, 'payment-provider:toss-webhook', 'order.cancelled', { status: payment.status });
    return { status: 200, result: 'cancelled' };
  }
  return { status: 200, result: `noop:${payment.status}` };
}

// ---------- public API ----------
function publicProduct(p) {
  return { id: p.id, name: p.name, series: p.series, salePrice: Number(p.sale_price), listPrice: Number(p.list_price || 0), imageUrl: p.image_url ? absoluteQtmUrl(p.image_url) : '', productUrl: p.product_url };
}
async function catalog(env, now = new Date()) {
  if (isStaging(env)) {
    const target = targetIssueFor(now);
    const { opensAt, closesAt } = defaultWindow(target.year, target.month);
    return { campaign: { id: target.id, year: target.year, month: target.month, state: 'open', opensAt, closesAt }, products: STAGING_PRODUCTS.map(publicProduct), payment: paymentReadiness(env), dataMode: 'isolated-staging' };
  }
  const campaign = await currentCampaign(env, now);
  const products = campaign.virtual ? [] : await listProducts(env, campaign.id);
  return {
    campaign: { id: campaign.id, year: campaign.target_year, month: campaign.target_month, state: campaignState(campaign, now), opensAt: campaign.opens_at, closesAt: campaign.closes_at },
    products: products.map(publicProduct),
    payment: { ready: publicPaymentReady(env), mode: paymentReadiness(env).mode, testMode: testPaymentReady(env) },
  };
}

async function createOrder(env, body, now = new Date(), request = null) {
  if (isStaging(env)) return { status: 403, data: { error: 'isolated-staging: 운영 신청은 스테이징에서 저장되지 않습니다.', dataMode: 'isolated-staging' } };
  const readiness = paymentReadiness(env);
  if (!readiness.ready) return { status: 503, data: { error: '온라인 결제 준비 중입니다. 결제가 열리면 신청할 수 있습니다.' } };
  let testActor = '';
  if (readiness.mode !== 'live') {
    const session = request ? await adminSession(request, env) : { error: 'no-session' };
    if (session.error || !session.data?.canWrite) return { status: 503, data: { error: '온라인 결제 준비 중입니다. 결제가 열리면 신청할 수 있습니다.' } };
    testActor = session.data.email;
  }
  const campaign = await currentCampaign(env, now);
  if (campaign.virtual || campaignState(campaign, now) !== 'open' || clean(body?.campaignId, 10) !== campaign.id) {
    return { status: 409, data: { error: '지금은 신청 기간이 아닙니다. 매월 20일~25일에 다음달호를 신청할 수 있습니다.' } };
  }
  const products = await listProducts(env, campaign.id);
  const result = buildOrderDraft(body, products);
  if (!result.ok) return { status: 400, data: { error: result.errors[0], errors: result.errors } };
  const draft = result.draft;
  const baseOrderId = testActor ? newOrderId(campaign.id).replace(/^QTIN-/, TEST_ORDER_PREFIX) : newOrderId(campaign.id);
  const orderId = ekodipay.tagOrderId(baseOrderId, readiness.profile);
  const lookupToken = randomToken();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + PENDING_TTL_MS).toISOString();
  const statements = [
    env.DB.prepare(`INSERT INTO qtin_orders (id, campaign_id, org, applicant_name, phone, email, department, memo, total_amount, total_quantity, order_name, status, lookup_token_hash, privacy_consent_at, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'payment_pending', ?, ?, ?, ?, ?)`)
      .bind(orderId, campaign.id, draft.org, draft.applicantName, draft.phone, draft.email, draft.department, draft.memo, draft.totalAmount, draft.totalQuantity, draft.orderName, await sha256(lookupToken), createdAt, expiresAt, createdAt, createdAt),
    ...draft.lines.map(line => env.DB.prepare(`INSERT INTO qtin_order_items (order_id, product_id, qtm_item_id, product_name, unit_price, quantity, line_amount) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(orderId, line.productId, line.qtmItemId, line.productName, line.unitPrice, line.quantity, line.lineAmount)),
  ];
  await env.DB.batch(statements);
  if (testActor) await audit(env, orderId, testActor, 'order.test_created', { mode: readiness.mode });
  const base = publicBase(env);
  return {
    status: 201,
    data: {
      orderId, amount: draft.totalAmount, orderName: draft.orderName, customerName: draft.applicantName, customerEmail: draft.email || undefined,
      customerMobilePhone: draft.phone.replace(/-/g, ''), clientKey: ekodipay.merchantKeys(env, readiness.profile).clientKey, customerKey: `qtin-${crypto.randomUUID()}`,
      successUrl: `${base}/payment/success?t=${encodeURIComponent(lookupToken)}`,
      failUrl: `${base}/payment/fail?orderId=${encodeURIComponent(orderId)}`,
      expiresAt,
    },
  };
}

async function orderForReceipt(env, orderId, token) {
  if (!isValidTossOrderId(orderId) || !token) return null;
  const order = await env.DB.prepare('SELECT * FROM qtin_orders WHERE id=?').bind(orderId).first();
  if (!order || !order.lookup_token_hash || order.lookup_token_hash !== await sha256(token)) return null;
  const items = await env.DB.prepare('SELECT * FROM qtin_order_items WHERE order_id=? ORDER BY product_name').bind(orderId).all();
  return { order, items: items.results || [] };
}

// ---------- pages ----------
const BRAND_CSS = `:root{--ink:#1f2a24;--muted:#66736b;--line:#e3e8e3;--paper:#fbfaf6;--card:#fff;--accent:#2f6b4f;--accent-ink:#fff;--warm:#b5692d;--soft:#eef4ef;--danger:#b4372f}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Pretendard","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}.wrap{width:min(1080px,calc(100% - 32px));margin:0 auto}
header.top{padding:40px 0 18px}.eyebrow{font-size:13px;letter-spacing:.14em;color:var(--warm);font-weight:700}
h1{font-size:clamp(28px,5vw,42px);letter-spacing:-.04em;margin:6px 0 10px;line-height:1.2}.lead{color:var(--muted);margin:0;max-width:640px}
.status{display:inline-flex;gap:8px;align-items:center;margin-top:16px;padding:8px 14px;border-radius:999px;background:var(--soft);font-weight:700;font-size:14px}
.status.closed{background:#f4ece4;color:#7a4a22}.dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}.status.closed .dot{background:var(--warm)}
.orgs{display:flex;gap:10px;margin:22px 0 6px;flex-wrap:wrap}.org{flex:1 1 200px;border:1.5px solid var(--line);background:var(--card);border-radius:14px;padding:14px 16px;cursor:pointer;font:inherit;text-align:left}
.org strong{display:block;font-size:17px}.org span{color:var(--muted);font-size:13px}.org[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 3px rgba(47,107,79,.12)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:18px;margin:22px 0}
@media (max-width:560px){.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.info{padding:10px 10px 12px}.info h3{font-size:14px}.price{font-size:15px}.qty button{width:32px;height:34px}.qty input{width:100%;min-width:0;height:34px}.org{flex-basis:100%}.bar .wrap{gap:8px}.pay{width:100%}.pay .btn{flex:1}}
.book{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
.cover{aspect-ratio:3/4.3;background:#f1efe8;display:flex;align-items:center;justify-content:center;overflow:hidden}.cover img{width:100%;height:100%;object-fit:cover}
.cover .ph{color:var(--muted);font-size:13px;padding:16px;text-align:center}.info{padding:14px 14px 16px;display:flex;flex-direction:column;gap:6px;flex:1}
.info h3{font-size:15.5px;margin:0;line-height:1.4;letter-spacing:-.02em}.price{font-weight:800;font-size:17px}.price s{color:var(--muted);font-weight:400;font-size:13px;margin-left:6px}
.qty{display:flex;align-items:center;gap:6px;margin-top:auto}.qty button{width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:#fff;font-size:18px;cursor:pointer}
.qty input{width:52px;height:36px;text-align:center;border:1px solid var(--line);border-radius:10px;font:inherit;font-weight:700}
.panel{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px;margin:26px 0}.panel h2{margin:0 0 14px;font-size:20px}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}label.f{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600}
label.f input,label.f textarea{border:1px solid var(--line);border-radius:10px;padding:11px 12px;font:inherit;font-weight:400;background:#fff}
.consent{display:flex;gap:10px;align-items:flex-start;margin-top:16px;font-size:14px;color:var(--muted)}.consent input{margin-top:4px;width:18px;height:18px}
.bar{position:sticky;bottom:0;background:rgba(251,250,246,.96);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:12px 0;z-index:5}
.bar .wrap{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.total{font-size:15px}.total b{font-size:22px;letter-spacing:-.02em}
.pay{display:flex;gap:8px}.btn{border:0;border-radius:12px;padding:13px 18px;font:inherit;font-weight:800;cursor:pointer;background:var(--accent);color:var(--accent-ink)}
.btn.alt{background:#fff;color:var(--accent);border:1.5px solid var(--accent)}.btn[disabled]{opacity:.45;cursor:not-allowed}
.msg{margin:12px 0 0;color:var(--danger);font-weight:600;min-height:1em}.note{font-size:13px;color:var(--muted)}footer{padding:28px 0 90px;color:var(--muted);font-size:13px}
table.r{width:100%;border-collapse:collapse;margin:12px 0}table.r td,table.r th{border-bottom:1px solid var(--line);padding:9px 6px;text-align:left;font-size:14px}
.empty{padding:40px 20px;text-align:center;background:var(--card);border:1px dashed var(--line);border-radius:16px;color:var(--muted)}
.staging{background:#173e2e;color:#fff;padding:10px 14px;border-radius:12px;margin-top:12px;font-size:14px}`;

function shell(title, body, scriptNonce = '', extraHead = '') {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="robots" content="noindex"><style>${BRAND_CSS}</style>${extraHead}</head><body>${body}</body></html>`;
}

export function renderOrderPage(data, { org = '', scriptNonce = '' } = {}) {
  const { campaign, products, payment } = data;
  const state = campaign.state;
  const open = state === 'open';
  const issue = `${campaign.year}년 ${campaign.month}월호`;
  const statusLine = open
    ? `신청 중 · ${escapeHtml(formatKst(campaign.closesAt))} 마감`
    : state === 'scheduled' ? `${escapeHtml(formatKst(campaign.opensAt))} 신청 시작` : `신청 마감 · 다음 신청은 매월 20일에 열립니다`;
  const cards = products.map(p => `<article class="book" data-id="${escapeHtml(p.id)}" data-price="${p.salePrice}">
    <div class="cover">${p.imageUrl ? `<img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)} 표지" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph">표지 준비 중</div>`}</div>
    <div class="info"><h3>${escapeHtml(p.name)}</h3>
      <div class="price">${formatWon(p.salePrice)}${p.listPrice > p.salePrice ? `<s>${formatWon(p.listPrice)}</s>` : ''}</div>
      <div class="qty"><button type="button" data-step="-1" aria-label="${escapeHtml(p.name)} 수량 줄이기"${open ? '' : ' disabled'}>−</button>
      <input type="number" min="0" max="50" value="0" inputmode="numeric" aria-label="${escapeHtml(p.name)} 수량"${open ? '' : ' disabled'}>
      <button type="button" data-step="1" aria-label="${escapeHtml(p.name)} 수량 늘리기"${open ? '' : ' disabled'}>+</button></div>
    </div></article>`).join('');
  const orgButtons = Object.values(ORGS).map(o => `<button type="button" class="org" data-org="${o.id}" aria-pressed="${org === o.id}"><strong>${o.label}</strong><span>${o.id === 'church' ? '교회 성도·부서 신청' : '선교회 회원·사역자 신청'}</span></button>`).join('');
  const paymentNote = payment.ready ? '' : `<p class="note">온라인 결제 연결을 준비하고 있습니다. 결제가 열리면 바로 신청하실 수 있습니다.</p>${payment.testMode ? '<p class="note" id="testNote" hidden><strong>테스트 결제 모드(관리자 전용)</strong> · 실제 금액이 청구되지 않으며, 이 신청은 집계·발주에 포함되지 않습니다.</p>' : ''}`;
  const body = `<header class="top"><div class="wrap">
  <div class="eyebrow">EKODI · 큐티인 함께 구입</div>
  <h1>${escapeHtml(issue)} 큐티인 신청</h1>
  <p class="lead">날마다 같은 말씀 앞에 서는 기쁨을 함께 나눕니다. 에코디교회와 에코디선교회가 매월 다음달 큐티인을 한 번에 모아 구입합니다. 가격은 QTM 온라인 판매가격 그대로이며, 결제가 확인된 신청만 완료됩니다.</p>
  <div class="status${open ? '' : ' closed'}"><span class="dot"></span>${statusLine}</div>
  ${data.dataMode === 'isolated-staging' ? '<div class="staging">ISOLATED STAGING · 샘플 데이터이며 신청·결제가 저장되지 않습니다.</div>' : ''}
</div></header>
<main class="wrap">
  <div class="orgs" role="group" aria-label="신청 기관">${orgButtons}</div>
  ${products.length ? `<section class="grid" aria-label="${escapeHtml(issue)} 도서">${cards}</section>` : `<div class="empty">${open || state === 'scheduled' ? `${escapeHtml(issue)} 도서 정보를 QTM에서 확인하고 있습니다. 잠시 후 다시 열어 주세요.` : '이번 달 신청이 마감되었습니다. 다음달 20일에 새 큐티인 신청이 열립니다.'}</div>`}
  <section class="panel" aria-labelledby="who"><h2 id="who">신청자 정보</h2>
    <div class="fields">
      <label class="f">이름<input id="name" autocomplete="name" maxlength="40" required></label>
      <label class="f">휴대전화<input id="phone" autocomplete="tel" inputmode="tel" placeholder="010-0000-0000" maxlength="13" required></label>
      <label class="f">이메일(선택 · 영수증 수신)<input id="email" type="email" autocomplete="email" maxlength="160"></label>
      <label class="f">소속·부서(선택)<input id="department" maxlength="80" placeholder="예: 청년부, 3교구"></label>
    </div>
    <label class="f" style="margin-top:14px">요청사항(선택)<textarea id="memo" rows="2" maxlength="300"></textarea></label>
    <label class="consent"><input type="checkbox" id="consent"><span>[필수] 신청·결제·수령 안내를 위해 이름, 휴대전화, 이메일, 소속을 수집·이용하는 데 동의합니다. 보관기간: 신청일로부터 약 1년(이후 자동 비식별 처리). 결제·구매대행: EKODIBIZ.</span></label>
    ${paymentNote}
    <p class="msg" id="msg" role="alert"></p>
  </section>
</main>
<div class="bar"><div class="wrap"><div class="total">합계 <b id="total">0원</b> · <span id="count">0권</span></div>
  <div class="pay"><button class="btn" id="payCard" type="button" disabled>카드로 결제</button><button class="btn alt" id="payTransfer" type="button" disabled>계좌이체</button></div></div></div>
<footer class="wrap">책은 교회에서 일괄 수령 후 나누어 드립니다(개별 배송 없음). 표지 이미지·가격 출처: <a href="${QTM_ORIGIN}/" rel="noopener" target="_blank">QTM 큐티선교회</a> 온라인 스토어. 결제·구매대행: EKODIBIZ(사업자 213-13-01959, 통신판매업 2023-전남무안-0153). 문의 010-3501-8542</footer>
<script nonce="${scriptNonce}">window.__QTIN__=${JSON.stringify({ campaignId: campaign.id, open, paymentReady: Boolean(payment.ready), testMode: Boolean(payment.testMode), org }).replace(/</g, '\\u003c')};</script>
<script src="https://js.tosspayments.com/v2/standard"></script>
<script nonce="${scriptNonce}">(${orderClient.toString()})()</script>`;
  return shell(`${issue} 큐티인 신청 · EKODI`, body, scriptNonce);
}

/* Browser code (serialised into the page). */
function orderClient() {
  const cfg = window.__QTIN__ || {};
  const $ = id => document.getElementById(id);
  let org = cfg.org || '';
  let busy = false;
  let testToken = '';
  if (!cfg.paymentReady && cfg.testMode) {
    try { const s = JSON.parse(sessionStorage.getItem('ekodi-qtin-admin-session') || 'null'); if (s?.accessToken && (!s.expiresAt || s.expiresAt > Date.now() / 1000 + 60)) testToken = s.accessToken; } catch { testToken = ''; }
    if (testToken) { cfg.paymentReady = true; const n = $('testNote'); if (n) n.hidden = false; }
  }
  const books = [...document.querySelectorAll('.book')];
  const won = v => `${Math.trunc(v).toLocaleString('ko-KR')}원`;
  function items() { return books.map(b => ({ productId: b.dataset.id, quantity: Math.max(0, Math.min(50, Math.trunc(Number(b.querySelector('input').value) || 0))), price: Number(b.dataset.price) })).filter(i => i.quantity > 0); }
  function refresh() {
    const list = items();
    $('total').textContent = won(list.reduce((s, i) => s + i.price * i.quantity, 0));
    $('count').textContent = `${list.reduce((s, i) => s + i.quantity, 0)}권`;
    const ok = cfg.open && cfg.paymentReady && list.length > 0 && !busy;
    $('payCard').disabled = !ok; $('payTransfer').disabled = !ok;
  }
  books.forEach(b => {
    const input = b.querySelector('input');
    b.querySelectorAll('button[data-step]').forEach(btn => btn.addEventListener('click', () => { input.value = Math.max(0, Math.min(50, (Number(input.value) || 0) + Number(btn.dataset.step))); refresh(); }));
    input.addEventListener('input', refresh);
  });
  document.querySelectorAll('.org').forEach(btn => btn.addEventListener('click', () => {
    org = btn.dataset.org;
    document.querySelectorAll('.org').forEach(o => o.setAttribute('aria-pressed', String(o === btn)));
  }));
  async function pay(method) {
    $('msg').textContent = '';
    if (!org) { $('msg').textContent = '신청 기관(에코디교회/에코디선교회)을 선택해 주세요.'; return; }
    if (!$('consent').checked) { $('msg').textContent = '개인정보 수집·이용에 동의해 주세요.'; return; }
    busy = true; refresh();
    try {
      const response = await fetch('/qtin/api/orders', { method: 'POST', headers: { 'content-type': 'application/json', ...(testToken ? { authorization: 'Bearer ' + testToken } : {}) }, body: JSON.stringify({
        campaignId: cfg.campaignId, org, name: $('name').value, phone: $('phone').value, email: $('email').value,
        department: $('department').value, memo: $('memo').value, privacyConsent: true,
        items: items().map(i => ({ productId: i.productId, quantity: i.quantity })) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '신청을 저장하지 못했습니다.');
      if (typeof window.TossPayments !== 'function') throw new Error('결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
      const payment = window.TossPayments(data.clientKey).payment({ customerKey: data.customerKey });
      const request = { method, amount: { currency: 'KRW', value: data.amount }, orderId: data.orderId, orderName: data.orderName,
        successUrl: data.successUrl, failUrl: data.failUrl, customerName: data.customerName, customerMobilePhone: data.customerMobilePhone };
      if (data.customerEmail) request.customerEmail = data.customerEmail;
      await payment.requestPayment(request);
    } catch (error) {
      $('msg').textContent = error?.message || '결제를 시작하지 못했습니다.';
    } finally { busy = false; refresh(); }
  }
  $('payCard').addEventListener('click', () => pay('CARD'));
  $('payTransfer').addEventListener('click', () => pay('TRANSFER'));
  refresh();
}

export function renderReceipt({ order, items }, { title, message, ok = true } = {}) {
  const org = ORGS[order.org]?.label || order.org;
  const statusLabel = { paid: '결제 완료 · 신청 완료', payment_pending: '결제 대기', expired: '결제 시간 만료', cancelled: '취소됨', payment_failed: '결제 실패' }[order.status] || order.status;
  const fulfillLabel = { waiting: '발주 대기', ordered: 'QTM 발주 완료', received: '교회 도착', distributed: '전달 완료' }[order.fulfillment_status] || order.fulfillment_status;
  const rows = items.map(i => `<tr><td>${escapeHtml(i.product_name)}</td><td>${i.quantity}권</td><td>${formatWon(i.line_amount)}</td></tr>`).join('');
  const body = `<header class="top"><div class="wrap"><div class="eyebrow">EKODI · 큐티인 함께 구입</div>
  <h1>${escapeHtml(title || statusLabel)}</h1><p class="lead">${escapeHtml(message || '')}</p>
  <div class="status${ok ? '' : ' closed'}"><span class="dot"></span>${escapeHtml(statusLabel)}${order.status === 'paid' ? ` · ${escapeHtml(fulfillLabel)}` : ''}</div></div></header>
  <main class="wrap"><section class="panel"><h2>신청 내역</h2>
  <p class="note">신청번호 ${escapeHtml(order.id)} · ${escapeHtml(org)} · ${escapeHtml(maskName(order.applicant_name))}</p>
  <table class="r"><thead><tr><th>도서</th><th>수량</th><th>금액</th></tr></thead><tbody>${rows}</tbody>
  <tfoot><tr><th>합계</th><th>${order.total_quantity}권</th><th>${formatWon(order.total_amount)}</th></tr></tfoot></table>
  ${order.receipt_url ? `<p><a href="${escapeHtml(order.receipt_url)}" target="_blank" rel="noopener">결제 영수증 보기</a></p>` : ''}
  <p class="note">이 화면의 주소를 저장해 두시면 진행 상황(발주·도착·전달)을 다시 확인하실 수 있습니다.</p>
  <p><a href="${BASE}">큐티인 신청 첫 화면으로</a></p></section></main>`;
  return shell(`${title || statusLabel} · 큐티인 신청`, body);
}

function simplePage(title, message, link = BASE) {
  return shell(title, `<header class="top"><div class="wrap"><div class="eyebrow">EKODI · 큐티인 함께 구입</div><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(message)}</p><p><a href="${link}">큐티인 신청 화면으로 돌아가기</a></p></div></header>`);
}

// ---------- admin ----------
function bearer(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}
async function adminSession(request, env) {
  const token = bearer(request);
  if (!token || token.length > 8192) return { error: '관리자 로그인이 필요합니다.', status: 401 };
  const identityResponse = await fetch(`${CENTRAL_SUPABASE_URL}/auth/v1/user`, { headers: { apikey: CENTRAL_PUBLISHABLE_KEY, authorization: `Bearer ${token}` }, cache: 'no-store' });
  const identity = identityResponse.ok ? await identityResponse.json().catch(() => null) : null;
  if (!identity?.id || !identity?.email || !identity?.email_confirmed_at) return { error: '로그인을 확인할 수 없습니다.', status: 401 };
  const email = String(identity.email).toLowerCase();
  if (operatorEmails(env).has(email)) return { data: { userId: identity.id, email, role: 'operator', canWrite: true, canRefund: true } };
  const staffUrl = new URL(CHURCH_PASTOR_API);
  staffUrl.searchParams.set('table', 'church_staff');
  staffUrl.searchParams.set('user_id', `eq.${identity.id}`);
  staffUrl.searchParams.set('limit', '1');
  const staffResponse = await fetch(staffUrl.toString(), { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, cache: 'no-store' });
  const rows = staffResponse.ok ? await staffResponse.json().catch(() => []) : [];
  const staff = rows?.[0];
  if (!staff) return { error: '큐티인 신청 관리 권한이 없습니다.', status: 403 };
  const role = clean(staff.role, 60);
  return { data: { userId: identity.id, email, role, canWrite: STAFF_ROLES.has(role), canRefund: role === 'senior_pastor' } };
}

async function campaignSummary(env, id) {
  const campaign = await getCampaign(env, id);
  if (!campaign) return null;
  const products = await listProducts(env, id, true);
  const byProduct = await env.DB.prepare(`SELECT i.product_id, i.product_name, o.org, SUM(i.quantity) AS qty, SUM(i.line_amount) AS amount
    FROM qtin_order_items i JOIN qtin_orders o ON o.id=i.order_id WHERE o.campaign_id=? AND o.status='paid' AND ${NOT_TEST_ORDER} GROUP BY i.product_id, o.org`).bind(id).all();
  const totals = await env.DB.prepare(`SELECT org, status, COUNT(*) AS orders, SUM(total_amount) AS amount, SUM(total_quantity) AS qty FROM qtin_orders o WHERE campaign_id=? AND ${NOT_TEST_ORDER} GROUP BY org, status`).bind(id).all();
  const orders = await env.DB.prepare(`SELECT id, org, applicant_name, phone, email, department, memo, total_amount, total_quantity, order_name, status, payment_method, approved_at, receipt_url, fulfillment_status, created_at
    FROM qtin_orders WHERE campaign_id=? AND status IN ('paid','cancelled','payment_pending') ORDER BY created_at DESC LIMIT 1000`).bind(id).all();
  return { campaign: { ...campaign, state: campaignState(campaign) }, products, byProduct: byProduct.results || [], totals: totals.results || [], orders: orders.results || [] };
}

async function exportCsv(env, id) {
  const rows = await env.DB.prepare(`SELECT o.id, o.org, o.applicant_name, o.phone, o.email, o.department, o.status, o.fulfillment_status, o.approved_at, o.payment_method, i.product_name, i.unit_price, i.quantity, i.line_amount, o.memo
    FROM qtin_orders o JOIN qtin_order_items i ON i.order_id=o.id WHERE o.campaign_id=? AND o.status IN ('paid','cancelled') AND ${NOT_TEST_ORDER} ORDER BY o.org, o.created_at`).bind(id).all();
  const header = ['신청번호', '기관', '이름', '휴대전화', '이메일', '소속', '결제상태', '수령상태', '결제시각(KST)', '결제수단', '도서', '단가', '수량', '금액', '요청사항'];
  const lines = [header.map(csvEscape).join(',')];
  for (const r of rows.results || []) {
    lines.push([r.id, ORGS[r.org]?.label || r.org, r.applicant_name, r.phone, r.email, r.department, r.status, r.fulfillment_status, formatKst(r.approved_at), r.payment_method, r.product_name, r.unit_price, r.quantity, r.line_amount, r.memo].map(csvEscape).join(','));
  }
  return '\ufeff' + lines.join('\r\n');
}

async function handleAdminApi(request, env, url) {
  if (isStaging(env)) return json({ error: 'staging_auth_required', dataMode: 'isolated-staging' }, 401, env, request.method);
  const auth = await adminSession(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status, env);
  const me = auth.data;
  const path = url.pathname.slice(`${API}/admin`.length) || '/';
  const write = () => me.canWrite ? null : json({ error: '조회 권한만 있습니다.' }, 403, env);

  if (request.method === 'GET' && path === '/me') return json({ me, payment: paymentReadiness(env) }, 200, env);
  if (request.method === 'GET' && path === '/campaigns') {
    const target = targetIssueFor();
    await ensureCampaign(env, target.year, target.month);
    const rows = await env.DB.prepare('SELECT * FROM qtin_campaigns ORDER BY id DESC LIMIT 36').all();
    return json({ campaigns: (rows.results || []).map(c => ({ ...c, state: campaignState(c) })), payment: paymentReadiness(env), me }, 200, env);
  }
  let match = /^\/campaigns\/(\d{4}-\d{2})(\/.*)?$/.exec(path);
  if (match) {
    const id = match[1];
    const sub = match[2] || '';
    const parsed = parseCampaignId(id);
    if (!parsed) return json({ error: '잘못된 신청 월입니다.' }, 400, env);
    if (request.method === 'GET' && sub === '') {
      const summary = await campaignSummary(env, id);
      return summary ? json(summary, 200, env) : json({ error: '신청 월을 찾을 수 없습니다.' }, 404, env);
    }
    if (request.method === 'GET' && sub === '/export.csv') {
      const csv = await exportCsv(env, id);
      await audit(env, id, me.email, 'campaign.export', '');
      return new Response(csv, { headers: securityHeaders({ 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': `attachment; filename="qtin-${id}.csv"` }) });
    }
    if (request.method === 'POST' && sub === '/create') {
      const denied = write(); if (denied) return denied;
      return json({ campaign: await ensureCampaign(env, parsed.year, parsed.month) }, 201, env);
    }
    if (request.method === 'POST' && sub === '/sync') {
      const denied = write(); if (denied) return denied;
      const campaign = await ensureCampaign(env, parsed.year, parsed.month);
      return json({ sync: await syncCampaign(env, campaign, { actor: me.email }) }, 200, env);
    }
    if (request.method === 'POST' && sub === '/state') {
      const denied = write(); if (denied) return denied;
      const body = await readJson(request);
      const manual = ['', 'force_open', 'force_closed'].includes(body?.manualState) ? body.manualState : null;
      if (manual === null) return json({ error: 'manualState 값이 올바르지 않습니다.' }, 400, env);
      await ensureCampaign(env, parsed.year, parsed.month);
      await env.DB.prepare('UPDATE qtin_campaigns SET manual_state=?, updated_at=? WHERE id=?').bind(manual, new Date().toISOString(), id).run();
      await audit(env, id, me.email, 'campaign.state', manual || 'auto');
      return json({ ok: true }, 200, env);
    }
    if (request.method === 'POST' && sub === '/products') {
      const denied = write(); if (denied) return denied;
      const body = await readJson(request);
      const ref = clean(body?.url || body?.itemId, 300);
      const itemId = (/(\d{6,14})/.exec(ref) || [])[1];
      if (!itemId) return json({ error: 'QTM 상품 주소 또는 상품번호를 입력해 주세요.' }, 400, env);
      await ensureCampaign(env, parsed.year, parsed.month);
      let detail;
      try { detail = parseProductDetail(await fetchQtm(`${QTM_ORIGIN}/shop/${itemId}`), itemId); } catch (error) { return json({ error: `QTM 페이지를 읽지 못했습니다: ${error.message}` }, 502, env); }
      if (!detail) return json({ error: '상품명·판매가격을 확인할 수 없는 페이지입니다.' }, 422, env);
      const productId = await upsertProduct(env, id, detail, 'manual');
      await env.DB.prepare("UPDATE qtin_products SET source='manual', active=1 WHERE id=?").bind(productId).run();
      await audit(env, productId, me.email, 'product.add_manual', detail.name);
      return json({ product: detail, issueMatches: titleMatchesIssue(detail.name, parsed.year, parsed.month) }, 201, env);
    }
  }
  match = /^\/products\/([^/]+)$/.exec(path);
  if (match && request.method === 'PATCH') {
    const denied = write(); if (denied) return denied;
    const id = decodeURIComponent(match[1]);
    const body = await readJson(request);
    const product = await env.DB.prepare('SELECT * FROM qtin_products WHERE id=?').bind(id).first();
    if (!product) return json({ error: '도서를 찾을 수 없습니다.' }, 404, env);
    const active = body?.active === undefined ? Number(product.active) : (body.active ? 1 : 0);
    const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : Number(product.sort_order);
    await env.DB.prepare('UPDATE qtin_products SET active=?, sort_order=?, updated_at=? WHERE id=?').bind(active, sortOrder, new Date().toISOString(), id).run();
    await audit(env, id, me.email, 'product.update', { active, sortOrder });
    return json({ ok: true }, 200, env);
  }
  match = /^\/orders\/([A-Za-z0-9_-]{6,64})(\/cancel)?$/.exec(path);
  if (match) {
    const id = match[1];
    const order = await env.DB.prepare('SELECT * FROM qtin_orders WHERE id=?').bind(id).first();
    if (!order) return json({ error: '신청을 찾을 수 없습니다.' }, 404, env);
    if (request.method === 'PATCH' && !match[2]) {
      const denied = write(); if (denied) return denied;
      const body = await readJson(request);
      if (!FULFILLMENT.includes(body?.fulfillmentStatus)) return json({ error: '수령 상태 값이 올바르지 않습니다.' }, 400, env);
      if (order.status !== 'paid') return json({ error: '결제 완료된 신청만 수령 상태를 바꿀 수 있습니다.' }, 409, env);
      await env.DB.prepare('UPDATE qtin_orders SET fulfillment_status=?, updated_at=? WHERE id=?').bind(body.fulfillmentStatus, new Date().toISOString(), id).run();
      await audit(env, id, me.email, 'order.fulfillment', body.fulfillmentStatus);
      return json({ ok: true }, 200, env);
    }
    if (request.method === 'POST' && match[2]) {
      if (!me.canRefund) return json({ error: '결제 취소는 운영 책임자만 할 수 있습니다.' }, 403, env);
      if (order.status !== 'paid' || !order.payment_key) return json({ error: '결제 완료된 신청만 취소할 수 있습니다.' }, 409, env);
      const body = await readJson(request);
      const reason = clean(body?.reason, 200);
      if (reason.length < 2) return json({ error: '취소 사유를 입력해 주세요.' }, 400, env);
      if (!paymentReadiness(env, orderProfile(id)).ready) return json({ error: '결제 연결이 준비되지 않아 취소할 수 없습니다.' }, 503, env);
      try {
        await tossRequest(env, `/v1/payments/${encodeURIComponent(order.payment_key)}/cancel`, { method: 'POST', body: { cancelReason: reason }, idempotencyKey: `qtin-cancel-${id}` }, orderProfile(id));
      } catch (error) {
        await audit(env, id, me.email, 'order.cancel_failed', { code: error.code });
        return json({ error: `토스 결제 취소 실패: ${error.message}` }, 502, env);
      }
      await env.DB.prepare("UPDATE qtin_orders SET status='cancelled', updated_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
      await audit(env, id, me.email, 'order.cancelled', reason);
      return json({ ok: true }, 200, env);
    }
  }
  return json({ error: 'not_found' }, 404, env);
}

export function renderAdminPage(scriptNonce = '') {
  const body = `<header class="top"><div class="wrap"><div class="eyebrow">EKODI ADMIN · 큐티인 공동구매</div>
<h1>큐티인 신청 관리</h1><p class="lead">월별 신청·결제 완료 현황, 도서별 발주 수량, 수령 상태를 관리합니다. 결제 완료(paid)만 발주 수량에 포함됩니다.</p>
<div class="status" id="state" aria-live="polite"><span class="dot"></span>로그인 확인 중</div></div></header>
<main class="wrap">
<section class="panel"><div class="fields">
<label class="f">신청 월호<select id="campaign" style="padding:11px;border-radius:10px;border:1px solid var(--line);font:inherit"></select></label>
<div class="f" style="justify-content:flex-end;gap:8px;flex-direction:row;align-items:flex-end;flex-wrap:wrap">
<button class="btn alt" id="sync" type="button">QTM 도서 다시 불러오기</button><button class="btn alt" id="csv" type="button">엑셀(CSV) 내려받기</button></div></div>
<p class="note" id="meta"></p><p class="msg" id="msg" role="alert"></p></section>
<section class="panel"><h2>발주 수량 (결제 완료 기준)</h2><div id="summary"></div></section>
<section class="panel"><h2>도서 목록</h2><div id="products"></div>
<div class="fields" style="margin-top:12px"><label class="f">QTM 상품 주소로 직접 추가<input id="addUrl" placeholder="https://www.qtm.or.kr/shop/..."></label>
<div class="f" style="justify-content:flex-end"><button class="btn alt" id="add" type="button">추가</button></div></div></section>
<section class="panel"><h2>신청 내역</h2><div class="fields"><label class="f">검색<input id="filter" placeholder="이름·전화·신청번호"></label></div><div id="orders"></div></section>
<section class="panel"><h2>신청 기간 수동 조정</h2><p class="note">자동: 매월 20일 00:00 ~ 25일 23:59(KST). 필요할 때만 강제 열기/닫기를 사용하세요.</p>
<div class="pay"><button class="btn alt" data-state="force_open" type="button">강제 열기</button><button class="btn alt" data-state="force_closed" type="button">강제 마감</button><button class="btn alt" data-state="" type="button">자동으로 되돌리기</button></div></section>
</main>
<footer class="wrap">공개 신청서: <a href="/qtin">ekodi.kr/qtin</a> · <a href="/qtin/church">/qtin/church</a> · <a href="/qtin/mission">/qtin/mission</a></footer>
<script nonce="${scriptNonce}">(${adminClient.toString()})()</script>`;
  return shell('큐티인 신청 관리 · EKODI', body, scriptNonce);
}

function adminClient() {
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const SESSION_KEY = 'ekodi-qtin-admin-session';
  const AUTH_URL = 'https://ekodi.kr/auth/';
  const API = '/qtin/api/admin';
  const ORG = { church: '에코디교회', mission: '에코디선교회' };
  const STATUS = { paid: '결제완료', payment_pending: '결제대기', cancelled: '취소' };
  const FUL = { waiting: '발주대기', ordered: 'QTM 발주', received: '교회 도착', distributed: '전달 완료' };
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = v => `${Math.trunc(Number(v) || 0).toLocaleString('ko-KR')}원`;
  const kst = iso => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ''; const d = new Date(t + 9 * 3600000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
  let session = null; let me = null; let data = null;
  function stored() {
    try { const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); if (v?.accessToken) return v; } catch {}
    // Reuse the existing central EKODI Supabase session on the same origin; server RBAC is always rechecked.
    try {
      const raw = localStorage.getItem('sb-renzehysxirjilvdxacv-auth-token');
      const parsed = raw ? JSON.parse(raw) : null;
      const central = parsed?.currentSession || parsed?.session || parsed;
      return central?.access_token ? normalize(central) : null;
    } catch { return null; }
  }
  function save(v) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)); }
  function clear() { sessionStorage.removeItem(SESSION_KEY); }
  function normalize(d, c = {}) { return { accessToken: d.access_token || '', refreshToken: d.refresh_token || c.refreshToken || '', expiresAt: Number(d.expires_at || 0) || Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600) }; }
  async function fetchBounded(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    catch (error) { throw new Error(error?.name === 'AbortError' ? '서버 응답이 지연되고 있습니다. 다시 확인해 주세요.' : '서버 연결에 실패했습니다. 네트워크를 확인해 주세요.'); }
    finally { clearTimeout(timeout); }
  }
  async function authRequest(path, body) { const r = await fetchBounded(SUPABASE_URL + path, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error_description || d.msg || d.error || '인증에 실패했습니다.'); return d; }
  async function consumeHandoff() { const p = new URLSearchParams(location.hash.slice(1)); const t = p.get('ekodi_token'); if (!t) return stored(); history.replaceState(null, '', location.pathname + location.search); const d = await authRequest('/auth/v1/verify', { token_hash: t, type: p.get('ekodi_type') || 'email' }); const n = normalize(d); save(n); return n; }
  async function validSession() { let v = stored(); if (!v?.accessToken) return null; if (!v.expiresAt || v.expiresAt > Math.floor(Date.now() / 1000) + 60) { save(v); return v; } if (!v.refreshToken) { clear(); return null; } try { v = normalize(await authRequest('/auth/v1/token?grant_type=refresh_token', { refresh_token: v.refreshToken }), v); save(v); return v; } catch { clear(); return null; } }
  function authHref() { const u = new URL(AUTH_URL); u.searchParams.set('site', 'church'); u.searchParams.set('return_to', location.origin + location.pathname); return u.href; }
  async function api(path, options = {}) {
    const r = await fetchBounded(API + path, { ...options, headers: { authorization: 'Bearer ' + session.accessToken, 'content-type': 'application/json', ...(options.headers || {}) }, cache: 'no-store' });
    if (r.status === 401) { clear(); const error = new Error('관리자 로그인 세션을 다시 확인해야 합니다.'); error.status = 401; throw error; }
    if ((r.headers.get('content-type') || '').includes('text/csv')) return r.blob();
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const error = new Error(d.error || '처리에 실패했습니다.'); error.status = r.status; throw error; }
    return d;
  }
  const setMsg = (t, ok = false) => { $('msg').style.color = ok ? 'var(--accent)' : 'var(--danger)'; $('msg').textContent = t || ''; };
  function showFailure(error) {
    const host = $('state');
    const dot = document.createElement('span'); dot.className = 'dot';
    const label = document.createElement('span');
    label.textContent = error?.status === 403 ? '큐티인 관리자 권한 없음' : '관리자 확인 실패';
    host.replaceChildren(dot, label);
    if (error?.status !== 403) {
      const retry = document.createElement('a'); retry.href = authHref(); retry.textContent = '로그인 다시 확인';
      host.append(retry);
    }
    setMsg(error?.message || '로그인 및 관리자 연결을 확인하지 못했습니다.');
  }
  function renderSummary() {
    const map = new Map();
    for (const r of data.byProduct) { const e = map.get(r.product_id) || { name: r.product_name, church: 0, mission: 0, amount: 0 }; e[r.org] = Number(r.qty); e.amount += Number(r.amount); map.set(r.product_id, e); }
    const rows = [...map.values()];
    const sum = k => rows.reduce((s, r) => s + (r[k] || 0), 0);
    $('summary').innerHTML = rows.length ? `<table class="r"><thead><tr><th>도서</th><th>교회</th><th>선교회</th><th>합계</th><th>금액</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.church}</td><td>${r.mission}</td><td><b>${r.church + r.mission}</b></td><td>${won(r.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><th>합계</th><th>${sum('church')}</th><th>${sum('mission')}</th><th>${sum('church') + sum('mission')}</th><th>${won(sum('amount'))}</th></tr></tfoot></table>` : '<p class="note">아직 결제 완료된 신청이 없습니다.</p>';
  }
  function renderProducts() {
    $('products').innerHTML = data.products.length ? `<table class="r"><thead><tr><th>도서</th><th>판매가</th><th>출처</th><th>노출</th></tr></thead><tbody>${data.products.map(p => `<tr><td><a href="${esc(p.product_url)}" target="_blank" rel="noopener">${esc(p.name)}</a></td><td>${won(p.sale_price)}</td><td>${p.source === 'manual' ? '직접 추가' : 'QTM 자동'}</td><td><input type="checkbox" data-product="${esc(p.id)}" ${Number(p.active) ? 'checked' : ''} ${me.canWrite ? '' : 'disabled'}></td></tr>`).join('')}</tbody></table>` : '<p class="note">도서가 아직 없습니다. "QTM 도서 다시 불러오기"를 눌러 주세요.</p>';
    document.querySelectorAll('[data-product]').forEach(el => el.addEventListener('change', async () => { try { await api('/products/' + encodeURIComponent(el.dataset.product), { method: 'PATCH', body: JSON.stringify({ active: el.checked }) }); setMsg('도서 노출을 변경했습니다.', true); } catch (e) { setMsg(e.message); el.checked = !el.checked; } }));
  }
  function renderOrders() {
    const q = ($('filter').value || '').trim();
    const list = data.orders.filter(o => !q || [o.id, o.applicant_name, o.phone, o.department].join(' ').includes(q));
    $('orders').innerHTML = list.length ? `<table class="r"><thead><tr><th>신청</th><th>신청자</th><th>도서</th><th>금액</th><th>결제</th><th>수령</th></tr></thead><tbody>${list.map(o => `<tr><td>${esc(ORG[o.org] || o.org)}<br><small>${esc(kst(o.approved_at || o.created_at))}</small></td><td>${esc(o.applicant_name)}<br><small>${esc(o.phone)} ${esc(o.department)}</small></td><td>${esc(o.order_name)} · ${o.total_quantity}권${o.memo ? `<br><small>${esc(o.memo)}</small>` : ''}</td><td>${won(o.total_amount)}</td><td>${esc(STATUS[o.status] || o.status)}${o.status === 'paid' && me.canRefund ? `<br><button type="button" class="btn alt" style="padding:4px 8px;font-size:12px" data-cancel="${esc(o.id)}">결제취소</button>` : ''}</td><td>${o.status === 'paid' ? `<select data-ful="${esc(o.id)}" ${me.canWrite ? '' : 'disabled'}>${Object.entries(FUL).map(([k, v]) => `<option value="${k}" ${o.fulfillment_status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>` : '-'}</td></tr>`).join('')}</tbody></table>` : '<p class="note">표시할 신청이 없습니다.</p>';
    document.querySelectorAll('[data-ful]').forEach(el => el.addEventListener('change', async () => { try { await api('/orders/' + el.dataset.ful, { method: 'PATCH', body: JSON.stringify({ fulfillmentStatus: el.value }) }); setMsg('수령 상태를 저장했습니다.', true); } catch (e) { setMsg(e.message); } }));
    document.querySelectorAll('[data-cancel]').forEach(el => el.addEventListener('click', async () => { const reason = prompt('결제를 취소하고 환불합니다. 취소 사유를 입력해 주세요.'); if (!reason) return; try { await api('/orders/' + el.dataset.cancel + '/cancel', { method: 'POST', body: JSON.stringify({ reason }) }); setMsg('결제를 취소했습니다.', true); await load(); } catch (e) { setMsg(e.message); } }));
  }
  async function load() {
    const id = $('campaign').value;
    data = await api('/campaigns/' + id);
    const c = data.campaign;
    const stateLabel = { open: '신청 중', scheduled: '신청 예정', closed: '마감' }[c.state] || c.state;
    let detail = {}; try { detail = JSON.parse(c.last_sync_detail || '{}'); } catch {}
    $('meta').textContent = `${stateLabel} · 기간 ${kst(c.opens_at)} ~ ${kst(c.closes_at)}${c.manual_state ? ` (수동: ${c.manual_state})` : ''} · 최근 QTM 동기화 ${c.last_sync_at ? kst(c.last_sync_at) : '없음'} (${c.last_sync_status || '-'}, 발견 ${detail.found ?? '-'}종)`;
    renderSummary(); renderProducts(); renderOrders();
  }
  async function boot() {
    try {
      session = await consumeHandoff(); session = await validSession();
      if (!session) { location.href = authHref(); return; }
      const list = await api('/campaigns'); me = list.me;
      const pay = list.payment;
      $('state').innerHTML = `<span class="dot"></span>${esc(me.email)} · ${me.canWrite ? '관리' : '조회'} 권한 · 결제 ${pay.ready ? (pay.mode === 'live' ? '운영 연결' : '테스트 연결 · <a href="/qtin/church">테스트 신청 열기</a>(실제 청구 없음, 집계 제외)') + (pay.mid ? ' · 상점 ' + esc(pay.merchant || '') + ' ' + esc(pay.mid) : '') : '미연결(' + esc(pay.missing.join(', ')) + ')'}`;
      $('campaign').innerHTML = list.campaigns.map(c => `<option value="${c.id}">${c.target_year}년 ${c.target_month}월호 · ${({ open: '신청 중', scheduled: '예정', closed: '마감' })[c.state] || c.state}</option>`).join('');
      $('campaign').onchange = () => load().catch(e => setMsg(e.message));
      $('filter').oninput = renderOrders;
      $('sync').onclick = async () => { setMsg('QTM에서 도서를 확인하는 중입니다…', true); try { const r = await api('/campaigns/' + $('campaign').value + '/sync', { method: 'POST' }); setMsg(`동기화 ${r.sync.status}: ${r.sync.found}종 발견`, r.sync.found > 0); await load(); } catch (e) { setMsg(e.message); } };
      $('add').onclick = async () => { try { const r = await api('/campaigns/' + $('campaign').value + '/products', { method: 'POST', body: JSON.stringify({ url: $('addUrl').value }) }); setMsg(`${r.product.name} 추가${r.issueMatches ? '' : ' (월호가 다른 도서입니다)'}`, true); $('addUrl').value = ''; await load(); } catch (e) { setMsg(e.message); } };
      $('csv').onclick = async () => { try { const blob = await api('/campaigns/' + $('campaign').value + '/export.csv'); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `qtin-${$('campaign').value}.csv`; a.click(); } catch (e) { setMsg(e.message); } };
      document.querySelectorAll('[data-state]').forEach(b => b.addEventListener('click', async () => { if (!confirm('신청 기간 상태를 변경할까요?')) return; try { await api('/campaigns/' + $('campaign').value + '/state', { method: 'POST', body: JSON.stringify({ manualState: b.dataset.state }) }); setMsg('신청 기간 상태를 변경했습니다.', true); await load(); } catch (e) { setMsg(e.message); } }));
      if (!me.canWrite) document.querySelectorAll('#sync,#add,[data-state]').forEach(b => { b.disabled = true; });
      await load();
    } catch (e) { showFailure(e); }
  }
  boot();
}

// ---------- router ----------
function cleanPath(pathname) {
  return pathname.replace(/\/+$/, '') || '/';
}

export async function handleRequest(request, env, now = new Date()) {
  const url = new URL(request.url);
  const path = cleanPath(url.pathname);
  const method = request.method;

  if (path === `${API}/health`) {
    const readiness = paymentReadiness(env);
    if (isStaging(env)) return json({ ok: true, service: 'ekodi-qtin-order', dataMode: 'isolated-staging', payment: { ready: false, mode: 'none' } }, 200, env, method);
    const campaign = await currentCampaign(env, now);
    const products = campaign.virtual ? [] : await listProducts(env, campaign.id);
    const state = campaignState(campaign, now);
    const productsReady = products.length > 0;
    return json({
      ok: state !== 'open' || productsReady,
      service: 'ekodi-qtin-order',
      campaign: { id: campaign.id, state, productCount: products.length, lastSyncAt: campaign.last_sync_at || '', lastSyncStatus: campaign.last_sync_status || '' },
      payment: { ready: readiness.ready, mode: readiness.mode, missing: readiness.missing, profile: readiness.profile, mid: readiness.mid },
    }, state === 'open' && !productsReady ? 503 : 200, env, method);
  }
  if (path === `${API}/catalog` && (method === 'GET' || method === 'HEAD')) return json(await catalog(env, now), 200, env, method);
  if (path === `${API}/orders` && method === 'POST') {
    const body = await readJson(request);
    if (!body) return json({ error: '요청 형식이 올바르지 않습니다.' }, 400, env);
    const result = await createOrder(env, body, now, request);
    return json(result.data, result.status, env);
  }
  if (path === `${API}/toss/webhook` && method === 'POST') {
    const body = await readJson(request, 50000);
    try {
      const result = await handleWebhook(env, body);
      return json({ result: result.result }, result.status, env);
    } catch (error) {
      console.error('qtin webhook', error);
      return json({ error: 'webhook_verification_failed' }, 500, env);
    }
  }
  if (path === `${API}/admin` || path.startsWith(`${API}/admin/`)) return handleAdminApi(request, env, url);
  if (path.startsWith(API)) return json({ error: 'not_found' }, 404, env, method);

  if (method !== 'GET' && method !== 'HEAD') return json({ error: '허용되지 않은 요청입니다.' }, 405, env, method);

  if (path === ADMIN_PATH) {
    const scriptNonce = nonce();
    return html(isStaging(env) ? shell('큐티인 신청 관리 · Staging', '<header class="top"><div class="wrap"><div class="eyebrow">ISOLATED STAGING</div><h1>큐티인 신청 관리</h1><p class="lead">스테이징에서는 관리자 API가 401로 닫혀 있으며 운영 데이터에 접근하지 않습니다.</p></div></header>') : renderAdminPage(scriptNonce), { method, scriptNonce, env });
  }
  if (path === `${BASE}/payment/success`) {
    if (isStaging(env)) return html(simplePage('스테이징', '스테이징에서는 결제가 처리되지 않습니다.'), { status: 403, method, env });
    const orderId = clean(url.searchParams.get('orderId'), 80);
    const token = clean(url.searchParams.get('t'), 100);
    const result = await confirmPayment(env, { paymentKey: clean(url.searchParams.get('paymentKey'), 220), orderId, amount: Number(url.searchParams.get('amount')) }, now);
    const receipt = await orderForReceipt(env, orderId, token);
    if (!receipt) return html(simplePage('결제 결과를 확인할 수 없습니다', result.ok ? '결제는 완료되었습니다. 관리자에게 신청번호를 알려 주세요.' : (result.message || '신청 정보를 찾을 수 없습니다.')), { status: result.ok ? 200 : 404, method, env });
    const viewUrl = `${BASE}/order/${encodeURIComponent(orderId)}?t=${encodeURIComponent(token)}`;
    const page = result.ok
      ? renderReceipt(receipt, { title: '신청이 완료되었습니다', message: '결제가 확인되어 큐티인 신청이 완료되었습니다. 책이 교회에 도착하면 나누어 드리겠습니다. 감사합니다.' }).replace('</main>', `<p class="wrap note">진행 상황 확인 주소: <a href="${viewUrl}">${escapeHtml(publicBase(env))}/order/…</a></p></main>`)
      : renderReceipt(receipt, { title: '결제가 완료되지 않았습니다', message: result.message || '결제 승인에 실패했습니다.', ok: false });
    return html(page, { status: result.ok ? 200 : (result.status === 202 ? 202 : 409), method, env });
  }
  if (path === `${BASE}/payment/fail`) {
    const message = clean(url.searchParams.get('message'), 200) || '결제가 취소되었거나 실패했습니다.';
    return html(simplePage('결제가 완료되지 않았습니다', `${message} 신청은 완료되지 않았으며 비용은 청구되지 않았습니다. 다시 시도해 주세요.`), { status: 200, method, env });
  }
  const orderMatch = /^\/qtin\/order\/([A-Za-z0-9_-]{6,64})$/.exec(path);
  if (orderMatch) {
    if (isStaging(env)) return html(simplePage('스테이징', '스테이징에는 신청 내역이 없습니다.'), { status: 404, method, env });
    const receipt = await orderForReceipt(env, orderMatch[1], clean(url.searchParams.get('t'), 100));
    if (!receipt) return html(simplePage('신청 내역을 찾을 수 없습니다', '주소가 올바른지 확인해 주세요.'), { status: 404, method, env });
    return html(renderReceipt(receipt, {}), { method, env });
  }
  if (path === BASE || path === `${BASE}/church` || path === `${BASE}/mission`) {
    const org = path.endsWith('/church') ? 'church' : path.endsWith('/mission') ? 'mission' : (ORGS[url.searchParams.get('org')] ? url.searchParams.get('org') : '');
    const scriptNonce = nonce();
    return html(renderOrderPage(await catalog(env, now), { org, scriptNonce }), { method, scriptNonce, env });
  }
  return json({ error: 'not_found' }, 404, env, method);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('qtin-order-worker', error);
      return json({ error: '큐티인 신청 처리 중 오류가 발생했습니다.' }, 500, env);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(env, new Date(event.scheduledTime || Date.now())).then(report => console.log('qtin scheduled', JSON.stringify(report))).catch(error => console.error('qtin scheduled', error)));
  },
};
