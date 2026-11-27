// Installation-free payment UX. Card vaults and order/payment truth remain with
// their existing owners. This module never charges a card or transfers money.
import { principalFromSupabaseRequest } from './ekodi-principal.js';
import { mallReportsEnabled, mallSellerAccount, mallSellerReport } from './ekodipay-web-mall.js';

const ROOT = '/ekodipay/api/web';
const ORIGIN = 'https://ekodi.kr';
const SERVICES = Object.freeze({ mall: '/ekodimall/', books: '/books/', qtin: '/qtin/', biz: '/ekodibiz/', edu: '/edu/' });
const COOKIE = '__Secure-ekodipay-registration';
const enc = new TextEncoder();
const enabled = value => value === 'true';
const text = (v, max = 160) => typeof v === 'string' && v.length <= max ? v.trim() : '';
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const stamp = () => new Date().toISOString();
const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status, webPayError: true }); };
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join('');
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow', ...extra,
  } });
}
function cookie(value, seconds = 600) {
  return COOKIE + '=' + value + '; Path=' + ROOT + '/brandpay/callback; Max-Age=' + seconds + '; Secure; HttpOnly; SameSite=Strict';
}
function brandpayKeys(env) {
  const client = text(env.EKODIPAY_BRANDPAY_CLIENT_KEY, 300);
  const secret = text(env.EKODIPAY_BRANDPAY_SECRET_KEY, 300);
  // Dedicated approved Brandpay keys. Never reuse ordinary checkout keys.
  const mode = /^(test|live)_ck_[A-Za-z0-9_-]+$/.exec(client)?.[1];
  return mode && new RegExp('^' + mode + '_sk_[A-Za-z0-9_-]+$').test(secret)
    ? { client, secret, mode } : null;
}
export function webPayReadiness(env = {}) {
  const base = enabled(env.EKODIPAY_WEB_ENABLED) && Boolean(env.EKODIPAY_WEB_DB);
  const keys = brandpayKeys(env);
  return {
    enabled: base,
    cardRegistration: base && enabled(env.EKODIPAY_BRANDPAY_APPROVED) && Boolean(keys) && id(env.EKODIPAY_BRANDPAY_MID),
    delegatedPayment: base && enabled(env.EKODIPAY_DELEGATED_APPROVED) &&
      typeof env.EKODIPAY_ORDER_SERVICE?.authorizePaymentRequest === 'function' &&
      typeof env.EKODIPAY_ORDER_SERVICE?.createDelegatedCheckout === 'function',
    sellerReports: mallReportsEnabled(env) || (base && typeof env.EKODIPAY_ORDER_SERVICE?.sellerSettlementReport === 'function' &&
      typeof env.EKODIPAY_ORDER_SERVICE?.sellerWorkspaces === 'function'),
    mallSellerReports: mallReportsEnabled(env),
    paymentExecution: false, payoutExecution: false,
    cardStorage: 'provider-only', thirdPartyCard: 'cardholder-authenticated-request',
    settlementSpeed: 'contract-dependent',
  };
}
function requireReady(env, capability) {
  if (webPayReadiness(env)[capability] !== true) fail('CONNECTION_NOT_READY', 503);
}
async function body(request, allowed) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') fail('JSON_REQUIRED', 415);
  const raw = await request.text();
  if (raw.length > 2048) fail('REQUEST_TOO_LARGE', 413);
  let value;
  try { value = JSON.parse(raw); } catch { fail('INVALID_JSON'); }
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(k => !allowed.includes(k))) fail('UNSUPPORTED_FIELDS');
  return value;
}
async function customer(db, userId, merchantId, create = false) {
  let row = await db.prepare('SELECT customer_key FROM ekodipay_web_customers WHERE user_id=? AND merchant_id=?')
    .bind(userId, merchantId).first();
  if (!row && create) {
    await db.prepare('INSERT OR IGNORE INTO ekodipay_web_customers(user_id,merchant_id,customer_key,created_at) VALUES(?,?,?,?)')
      .bind(userId, merchantId, crypto.randomUUID(), stamp()).run();
    row = await customer(db, userId, merchantId);
  }
  return row;
}
async function audit(db, userId, action, resourceId) {
  await db.prepare('INSERT INTO ekodipay_web_events(user_id,action,resource_id,created_at) VALUES(?,?,?,?)')
    .bind(userId, action, resourceId, stamp()).run();
}
async function provider(env, path, init = {}, network = fetch) {
  const keys = brandpayKeys(env);
  if (!keys) fail('CONNECTION_NOT_READY', 503);
  const r = await network('https://api.tosspayments.com' + path, {
    ...init, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: 'Basic ' + btoa(keys.secret + ':'), 'content-type': 'application/json' },
  });
  if (!r.ok) fail('PROVIDER_REQUEST_FAILED', 502);
  return r.json();
}
export function projectCards(data) {
  if (!data || !Array.isArray(data.cards)) fail('PROVIDER_RESPONSE_INVALID', 502);
  return data.cards.filter(c => c.status === 'ENABLED').slice(0, 50).map(c => ({
    // Even an accidentally unmasked provider response is reduced to four digits.
    label: text(c.alias || c.cardName, 80) || '등록 카드',
    last4: String(c.cardNumber || '').replace(/\D/g, '').slice(-4),
    type: ['신용', '체크', '기프트'].includes(c.cardType) ? c.cardType : '',
  }));
}
async function startWallet(request, env, userId) {
  requireReady(env, 'cardRegistration');
  await body(request, []);
  const db = env.EKODIPAY_WEB_DB;
  const account = await customer(db, userId, env.EKODIPAY_BRANDPAY_MID, true);
  const session = randomToken(), state = randomToken();
  await db.prepare('INSERT INTO ekodipay_web_registration(session_hash,user_id,merchant_id,state_hash,expires_at,status) VALUES(?,?,?,?,?,?)')
    .bind(await hash(session), userId, env.EKODIPAY_BRANDPAY_MID, await hash(state),
      new Date(Date.now() + 600000).toISOString(), 'pending').run();
  await audit(db, userId, 'registration.started', await hash(session));
  return json({
    clientKey: brandpayKeys(env).client, customerKey: account.customer_key,
    mode: brandpayKeys(env).mode,
    redirectUrl: ORIGIN + ROOT + '/brandpay/callback?state=' + state,
  }, 200, { 'set-cookie': cookie(session) });
}
async function registrationCallback(request, env, url, network) {
  requireReady(env, 'cardRegistration');
  // SDK GET includes a narrowly scoped HttpOnly cookie created only after
  // canonical server-side login. State and customerKey must match that session.
  if (request.headers.get('sec-fetch-site') !== 'same-origin') fail('SAME_ORIGIN_REQUIRED', 403);
  const params = [...url.searchParams.keys()];
  if (params.some(k => !['code', 'customerKey', 'state'].includes(k)) || new Set(params).size !== params.length) fail('INVALID_CALLBACK');
  const session = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const code = text(url.searchParams.get('code'), 1000);
  const state = text(url.searchParams.get('state'), 64);
  if (!/^[a-f0-9]{64}$/.test(session || '') || !/^[a-f0-9]{64}$/.test(state) || !code) fail('REGISTRATION_SESSION_REQUIRED', 401);
  const db = env.EKODIPAY_WEB_DB;
  const sessionHash = await hash(session);
  const row = await db.prepare('SELECT * FROM ekodipay_web_registration WHERE session_hash=?').bind(sessionHash).first();
  if (!row || row.status !== 'pending' || row.expires_at <= stamp() ||
      row.merchant_id !== env.EKODIPAY_BRANDPAY_MID || row.state_hash !== await hash(state)) fail('REGISTRATION_EXPIRED', 409);
  const account = await customer(db, row.user_id, row.merchant_id);
  if (!account || account.customer_key !== url.searchParams.get('customerKey')) fail('CUSTOMER_MISMATCH', 403);
  const claimed = await db.prepare("UPDATE ekodipay_web_registration SET status='exchanging' WHERE session_hash=? AND status='pending'")
    .bind(sessionHash).run();
  if (claimed.meta.changes !== 1) fail('REGISTRATION_ALREADY_USED', 409);
  // Never replay an ambiguous token-exchange result.
  await provider(env, '/v1/brandpay/authorizations/access-token', {
    method: 'POST', body: JSON.stringify({ grantType: 'AuthorizationCode', customerKey: account.customer_key, code }),
  }, network);
  await db.prepare("UPDATE ekodipay_web_registration SET status='complete' WHERE session_hash=?").bind(sessionHash).run();
  await audit(db, row.user_id, 'registration.authenticated', sessionHash);
  // SDK owns subsequent method management; no OAuth tokens are persisted or returned.
  return new Response(null, { status: 200, headers: {
    'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow', 'set-cookie': cookie('', 0),
  } });
}
function validateOrder(order, expected) {
  if (!order || order.allowed !== true || order.delegationAllowed !== true ||
      order.userId !== expected.userId || order.service !== expected.service || order.orderId !== expected.orderId ||
      order.status !== 'awaiting_payment' || order.currency !== 'KRW' ||
      !Number.isSafeInteger(order.amount) || order.amount <= 0 ||
      !id(order.workspaceId) || !id(order.profileId) || !text(order.revision, 100)) fail('ORDER_NOT_ELIGIBLE', 409);
  return order;
}
async function createRequest(request, env, userId) {
  requireReady(env, 'delegatedPayment');
  const input = await body(request, ['service', 'orderId']);
  if (!Object.hasOwn(SERVICES, input.service) || !id(input.orderId)) fail('INVALID_ORDER');
  const order = validateOrder(await env.EKODIPAY_ORDER_SERVICE.authorizePaymentRequest({ userId, ...input }), { userId, ...input });
  const db = env.EKODIPAY_WEB_DB, token = randomToken(), requestId = crypto.randomUUID();
  await db.prepare("UPDATE ekodipay_web_requests SET status='expired' WHERE service=? AND order_id=? AND status='open' AND expires_at<=?")
    .bind(input.service, input.orderId, stamp()).run();
  const exists = await db.prepare("SELECT id FROM ekodipay_web_requests WHERE service=? AND order_id=? AND status IN ('open','claimed')")
    .bind(input.service, input.orderId).first();
  if (exists) fail('ACTIVE_REQUEST_EXISTS', 409);
  const expires = new Date(Date.now() + 900000).toISOString();
  try {
    await db.prepare('INSERT INTO ekodipay_web_requests(id,token_hash,requester_id,service,order_id,workspace_id,profile_id,revision,amount,merchant_name,expires_at,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(requestId, await hash(token), userId, input.service, input.orderId, order.workspaceId,
        order.profileId, order.revision, order.amount, text(order.merchantName, 100), expires, 'open', stamp()).run();
  } catch (e) {
    if (/UNIQUE constraint/i.test(e.message)) fail('ACTIVE_REQUEST_EXISTS', 409);
    throw e;
  }
  await audit(db, userId, 'request.created', requestId);
  return json({ id: requestId, url: ORIGIN + '/ekodipay/request#' + token, expiresAt: expires, status: 'open' }, 201);
}
async function loadInvitation(env, token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) fail('REQUEST_NOT_FOUND', 404);
  const row = await env.EKODIPAY_WEB_DB.prepare('SELECT * FROM ekodipay_web_requests WHERE token_hash=?').bind(await hash(token)).first();
  if (!row || !['open', 'claimed'].includes(row.status) || row.expires_at <= stamp()) fail('REQUEST_UNAVAILABLE', 410);
  const current = validateOrder(await env.EKODIPAY_ORDER_SERVICE.authorizePaymentRequest({
    userId: row.requester_id, service: row.service, orderId: row.order_id,
  }), { userId: row.requester_id, service: row.service, orderId: row.order_id });
  if (current.revision !== row.revision || current.amount !== row.amount ||
      current.workspaceId !== row.workspace_id || current.profileId !== row.profile_id) fail('ORDER_CHANGED', 409);
  return row;
}
export function safeCheckoutUrl(value, service) {
  let url;
  try { url = new URL(value); } catch { fail('CHECKOUT_RESPONSE_INVALID', 502); }
  if (url.origin !== ORIGIN || !Object.hasOwn(SERVICES, service) || !url.pathname.startsWith(SERVICES[service]) ||
      url.username || url.password || url.hash || /%|\\/.test(url.pathname) ||
      [...url.searchParams.keys()].some(k => !['orderId', 'checkoutId'].includes(k))) fail('CHECKOUT_RESPONSE_INVALID', 502);
  return url.href;
}
async function invitation(request, env, userId, action) {
  requireReady(env, 'delegatedPayment');
  const input = await body(request, action === 'accept' ? ['token', 'consent'] : ['token']);
  if (action === 'accept' && input.consent !== true) fail('PAYER_CONSENT_REQUIRED');
  const row = await loadInvitation(env, input.token);
  if (row.payer_id && row.payer_id !== userId) fail('REQUEST_CLAIMED', 409);
  if (action === 'inspect') return json({
    id: row.id, merchant: row.merchant_name, amount: row.amount, currency: 'KRW',
    expiresAt: row.expires_at, status: row.status, cardOwnerAuthenticationRequired: true,
  });
  const db = env.EKODIPAY_WEB_DB;
  const result = await db.prepare("UPDATE ekodipay_web_requests SET status='claimed',payer_id=? WHERE id=? AND status='open' AND expires_at>?")
    .bind(userId, row.id, stamp()).run();
  if (result.meta.changes !== 1 && (row.status !== 'claimed' || row.payer_id !== userId)) fail('REQUEST_CLAIMED', 409);
  // Source MUST reserve the original order and be idempotent by requestId.
  // Its normal checkout owns amount checks, payment confirmation and receipts.
  const checkout = await env.EKODIPAY_ORDER_SERVICE.createDelegatedCheckout({
    requestId: row.id, userId, requesterId: row.requester_id, service: row.service,
    orderId: row.order_id, workspaceId: row.workspace_id, profileId: row.profile_id,
    revision: row.revision, amount: row.amount, currency: 'KRW',
  });
  if (checkout?.allowed !== true || checkout.userId !== userId || checkout.requestId !== row.id ||
      checkout.orderId !== row.order_id || checkout.usesPayerCredentials !== true ||
      checkout.orderOwnerChanged !== false) fail('CHECKOUT_RESPONSE_INVALID', 502);
  const checkoutUrl = safeCheckoutUrl(checkout.checkoutUrl, row.service);
  await audit(db, userId, 'request.checkout-opened', row.id);
  return json({ checkoutUrl, status: 'claimed', paymentCompleted: false });
}
function date(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value ? value : '';
}
export function settlementProjection(report, userId, workspaceId) {
  if (report?.authorization?.allowed !== true || report.authorization.userId !== userId ||
      report.authorization.workspaceId !== workspaceId) fail('SELLER_FORBIDDEN', 403);
  return reportProjection(report);
}
function reportProjection(report) {
  if (!Array.isArray(report.rows) || !text(report.source, 120) ||
      !Number.isFinite(Date.parse(report.fetchedAt))) fail('REPORT_INVALID', 502);
  const rows = report.rows.slice(0, 500).map(r => {
    const paid = r.status === 'paid' && Number.isFinite(Date.parse(r.paidAt)) && Boolean(text(r.evidenceRef, 160));
    const money = v => Number.isSafeInteger(v) ? v : null;
    return {
      orderId: text(r.orderId, 100), soldDate: date(r.soldDate) || null,
      gross: money(r.gross), refunds: money(r.refunds), fees: money(r.fees), net: money(r.net),
      scheduledDate: date(r.scheduledDate) || null, paidAt: paid ? r.paidAt : null,
      status: paid ? 'paid' : ['scheduled', 'held', 'failed', 'cancelled', 'refunded', 'partially_refunded'].includes(r.status) ? r.status : 'unconfirmed',
    };
  });
  return {
    rows, source: report.source, fetchedAt: report.fetchedAt,
    complete: report.complete === true && report.rows.length <= 500,
    nextCursor: text(report.nextCursor, 200) || null,
    settlementTerms: text(report.settlementTerms, 300) || '정산 계약 확인 필요',
    payoutExecution: false,
  };
}
async function sellerReport(request, env, userId, url) {
  requireReady(env, 'sellerReports');
  if ([...url.searchParams.keys()].some(k => !['workspaceId', 'start', 'end', 'cursor'].includes(k))) fail('UNSUPPORTED_FIELDS');
  const workspaceId = url.searchParams.get('workspaceId');
  const start = date(url.searchParams.get('start')), end = date(url.searchParams.get('end'));
  if (!id(workspaceId) || !start || !end || end < start || Date.parse(end) - Date.parse(start) > 31 * 86400000) fail('INVALID_REPORT_RANGE');
  const result = await env.EKODIPAY_ORDER_SERVICE.sellerSettlementReport({
    userId, workspaceId, startDate: start, endDate: end, cursor: text(url.searchParams.get('cursor'), 200),
  });
  return json(settlementProjection(result, userId, workspaceId));
}
export async function handleWebPay(request, env = {}, deps = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(ROOT + '/')) return null;
  if (url.origin !== ORIGIN) return json({ code: 'NOT_FOUND' }, 404);
  const route = url.pathname.slice(ROOT.length);
  try {
    if (request.method === 'GET' && route === '/status' && !url.search) return json(webPayReadiness(env));
    if (request.method === 'GET' && route === '/brandpay/callback') return await registrationCallback(request, env, url, deps.network || fetch);
    const routes = { '/wallet': 'GET', '/wallet/start': 'POST', '/requests': 'POST',
      '/requests/inspect': 'POST', '/requests/accept': 'POST', '/requests/cancel': 'POST', '/seller/report': 'GET', '/seller/workspaces': 'GET',
      '/seller/mall/account': 'GET', '/seller/mall/report': 'GET' };
    if (!Object.hasOwn(routes, route)) return json({ code: 'NOT_FOUND' }, 404);
    if (routes[route] !== request.method) return json({ code: 'METHOD_NOT_ALLOWED' }, 405, { allow: routes[route] });
    if (request.method === 'POST' && (request.headers.get('origin') !== ORIGIN ||
        request.headers.get('sec-fetch-site') === 'cross-site')) fail('SAME_ORIGIN_REQUIRED', 403);
    const principal = await (deps.authenticate || principalFromSupabaseRequest)(request);
    if (!principal?.id) fail('LOGIN_REQUIRED', 401);
    const userId = principal.id;
    if (route.startsWith('/seller/mall/')) {
      if (!mallReportsEnabled(env)) fail('CONNECTION_NOT_READY', 503);
      if (route === '/seller/mall/account') {
        if (url.search) fail('UNSUPPORTED_FIELDS');
        return json(await mallSellerAccount(request, userId, deps.network || fetch));
      }
      if ([...url.searchParams.keys()].some(k => !['start', 'end'].includes(k)) ||
          [...url.searchParams.keys()].length !== 2) fail('UNSUPPORTED_FIELDS');
      const start = date(url.searchParams.get('start')), end = date(url.searchParams.get('end'));
      if (!start || !end || end < start || Date.parse(end) - Date.parse(start) > 31 * 86400000) fail('INVALID_REPORT_RANGE');
      const report = await mallSellerReport(request, userId, start, end, deps.network || fetch);
      return json({ ...reportProjection(report),
        basis: 'order-estimate', payoutVerificationAvailable: false });
    }
    requireReady(env, 'enabled');
    if (route === '/wallet/start') return await startWallet(request, env, userId);
    if (route === '/wallet') {
      requireReady(env, 'cardRegistration');
      if (url.search) fail('UNSUPPORTED_FIELDS');
      const account = await customer(env.EKODIPAY_WEB_DB, userId, env.EKODIPAY_BRANDPAY_MID);
      if (!account) return json({ cards: [], registrationRequired: true });
      const data = await provider(env, '/v1/brandpay/payments/methods/' + encodeURIComponent(account.customer_key), {}, deps.network || fetch);
      return json({ cards: projectCards(data), registrationRequired: false });
    }
    if (route === '/requests') return await createRequest(request, env, userId);
    if (route === '/requests/inspect' || route === '/requests/accept') return await invitation(request, env, userId, route.endsWith('accept') ? 'accept' : 'inspect');
    if (route === '/requests/cancel') {
      const input = await body(request, ['id']);
      if (!id(input.id)) fail('INVALID_REQUEST');
      const result = await env.EKODIPAY_WEB_DB.prepare("UPDATE ekodipay_web_requests SET status='cancelled' WHERE id=? AND requester_id=? AND status='open'")
        .bind(input.id, userId).run();
      if (result.meta.changes !== 1) fail('REQUEST_NOT_CANCELLABLE', 409);
      await audit(env.EKODIPAY_WEB_DB, userId, 'request.cancelled', input.id);
      return json({ status: 'cancelled' });
    }
    if (route === '/seller/workspaces') {
      requireReady(env, 'sellerReports');
      if (url.search) fail('UNSUPPORTED_FIELDS');
      const result = await env.EKODIPAY_ORDER_SERVICE.sellerWorkspaces({ userId });
      if (result?.userId !== userId || !Array.isArray(result.workspaces)) fail('SELLER_FORBIDDEN', 403);
      return json({ workspaces: result.workspaces.filter(w => w.accountingAllowed === true && id(w.id))
        .slice(0, 100).map(w => ({ id: w.id, name: text(w.name, 100) || '내 매장' })) });
    }
    return await sellerReport(request, env, userId, url);
  } catch (error) {
    // Never reflect provider payloads, secrets, raw database errors or PII.
    return json({ code: error.webPayError === true ? error.code : 'SERVICE_UNAVAILABLE' }, error.webPayError === true ? error.status : 503);
  }
}
