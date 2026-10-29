// BOOKS-DIRECT-COMMERCE-001 — 에코디서점 자체 판매(전자책)
//
// • 가격의 원장은 books/books.json(listPrice) + books/commerce.json(회원등급 정책)이다.
//   클라이언트가 보낸 금액은 절대 믿지 않고, 서버가 등급별 가격을 다시 계산한다.
// • 결제는 EKODI 공통 결제 모듈(ekodipay-core, MID q_ekodib62hb)로만 호출한다.
// • PAYMENTS_ENABLED=false 이거나 키가 없으면 주문을 받지 않는다(fail closed).
//   test_ 키에서는 운영자(OPERATOR_EMAILS)만 시험 결제할 수 있다.
// • 결제 승인 후 내 서재 권한(books_entitlements)을 부여하고, 매출을 출판 재무 원장
//   (books_finance_transactions · ekodi-direct 채널)에 기록한다.
import * as ekodipay from './ekodipay-core.js';
import { complimentaryAudiobookPolicy, availableAudiobook, audioChapterFor, validateAudioChapter, MAX_AUDIO_CHAPTER_BYTES } from './books-audiobook.js';

export const ORDER_PREFIX = 'EKB';
export const PENDING_TTL_MS = 30 * 60 * 1000;
const CENTRAL_SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const CENTRAL_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const BOOK_ID = /^[A-Z0-9-]{3,40}$/;
const ORDER_ID = /^EKB-(?:m[a-z0-9]{2,16}-)?[0-9]{8}-[A-Z0-9]{10}$/;

export const clean = (value, max = 200) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const flag = value => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());

export function operatorEmails(env) {
  return new Set(String(env?.OPERATOR_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
}
export function isValidOrderId(value) { return ORDER_ID.test(String(value || '')); }

export function newOrderId(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `${ORDER_PREFIX}-${day}-${[...bytes].map(b => alphabet[b % alphabet.length]).join('')}`;
}

/** Tier policy → price. Unknown tiers fall back to the plain member price. */
export function priceFor(book, policy, tierId) {
  const list = Math.trunc(Number(book?.listPrice?.amount));
  if (!Number.isFinite(list) || list <= 0) return null;
  const tiers = Array.isArray(policy?.tiers) ? policy.tiers : [];
  const tier = tiers.find(t => t.id === tierId) || tiers.find(t => t.id === 'member') || { id: 'member', discountRate: 0 };
  const rate = Math.min(0.9, Math.max(0, Number(tier.discountRate) || 0));
  const amount = Math.max(100, Math.round((list * (1 - rate)) / 100) * 100);
  return { tierId: tier.id, tierLabel: tier.label || tier.id, listPrice: list, amount, discountRate: rate };
}

export function directSaleBook(catalog, bookId) {
  const id = clean(bookId, 40).toUpperCase();
  if (!BOOK_ID.test(id)) return null;
  const book = (catalog?.books || []).find(b => b.id === id);
  return book && book.directSale?.enabled === true ? book : null;
}

export function paymentState(env) {
  const staging = String(env?.DATA_MODE || '') === 'isolated-staging';
  return ekodipay.readiness(env, { staging });
}

// EKODIPAY-GATEWAY-001: 키는 중앙 게이트웨이(ekodi-qtin-order RPC)에만 있다. 바인딩이 있으면 그쪽을 쓰고,
// 없으면(테스트·로컬) 이 Worker 자신의 키 설정을 쓴다.
export async function payments(env) {
  const staging = String(env?.DATA_MODE || '') === 'isolated-staging';
  if (!env?.EKODIPAY) {
    const r = paymentState(env);
    return { ...r, widget: Boolean(r.widget), clientKey: ekodipay.merchantKeys(env, r.profile).clientKey, via: 'local' };
  }
  const enabled = flag(env.PAYMENTS_ENABLED) && !staging;
  let state = null, key = null;
  try {
    [state, key] = await Promise.all([
      env.EKODIPAY.readiness({ callerId: 'books', profileId: ekodipay.activeProfileId(env) }),
      env.EKODIPAY.clientKey({ callerId: 'books', profileId: ekodipay.activeProfileId(env) }),
    ]);
  } catch { state = null; key = null; } // gateway not deployed/unreachable → fail closed
  const r = state?.ok ? state.data : { ready: false, mode: 'none', missing: ['gateway-unavailable'] };
  const ready = Boolean(enabled && r.ready && key?.ok && key.data);
  return { ready, mode: r.mode || 'none', publicReady: ready && r.mode === 'live', widget: Boolean(r.widget), profile: r.profile || ekodipay.activeProfileId(env), merchant: r.merchant || '', mid: r.mid || '', clientKey: key?.ok ? key.data : '', missing: enabled ? (r.missing || []) : ['payments-disabled'], via: 'gateway' };
}

/** Toss call through the gateway when bound, otherwise the local key. Throws TossError-like errors. */
export function tossVia(env) {
  if (!env?.EKODIPAY) return ekodipay.tossRequest;
  return async (_env, profileId, path, options = {}) => {
    const confirmMatch = path === '/v1/payments/confirm';
    const getMatch = /^\/v1\/payments\/([^/]+)$/.exec(path);
    let result;
    try { result = confirmMatch
      ? await env.EKODIPAY.confirm({ callerId: 'books', profileId, ...options.body, idempotencyKey: options.idempotencyKey })
      : getMatch ? await env.EKODIPAY.getPayment({ callerId: 'books', profileId, paymentKey: decodeURIComponent(getMatch[1]) })
      : { ok: false, error: { message: 'unsupported', code: 'UNSUPPORTED', status: 400 } }; }
    catch { result = { ok: false, error: { message: '결제 게이트웨이에 연결하지 못했습니다.', code: 'GATEWAY_UNAVAILABLE', status: 503 } }; }
    if (result?.ok) return result.data;
    throw new ekodipay.TossError(result?.error?.message || '결제 서버 오류', { code: result?.error?.code || '', status: result?.error?.status || 502 });
  };
}

async function assetJson(env, path) {
  const response = await env.ASSETS.fetch(new Request(`https://books.internal${path}`));
  if (!response.ok) throw new Error(`asset ${path} ${response.status}`);
  return response.json();
}
export async function loadCatalog(env) { return assetJson(env, '/books.json'); }
export async function loadPolicy(env) { return assetJson(env, '/commerce.json'); }

function bearer(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}
/** Google-verified central EKODI account. Rights are not implied. */
export async function buyerIdentity(request, fetcher = fetch) {
  const token = bearer(request);
  if (!token || token.length > 8192) return null;
  const response = await fetcher(`${CENTRAL_SUPABASE_URL}/auth/v1/user`, { headers: { apikey: CENTRAL_PUBLISHABLE_KEY, authorization: `Bearer ${token}` }, cache: 'no-store' });
  const identity = response.ok ? await response.json().catch(() => null) : null;
  if (!identity?.id || !identity?.email || !identity?.email_confirmed_at) return null;
  const meta = identity.user_metadata || {};
  return { userId: String(identity.id), email: String(identity.email).toLowerCase(), name: clean(meta.full_name || meta.name, 40) };
}

export async function tierFor(env, buyer, now = new Date()) {
  if (!buyer) return 'guest';
  const row = await env.DB.prepare('SELECT tier_id, expires_at FROM books_member_tiers WHERE buyer_email=?').bind(buyer.email).first();
  if (row?.tier_id && (!row.expires_at || row.expires_at > now.toISOString())) return clean(row.tier_id, 30);
  return 'member';
}

async function audit(env, orderId, actor, action, detail = '') {
  await env.DB.prepare('INSERT INTO books_commerce_audit (order_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(orderId || '', clean(actor, 120), clean(action, 60), typeof detail === 'string' ? clean(detail, 500) : JSON.stringify(detail).slice(0, 500), new Date().toISOString()).run();
}

/** BOOKS-SALE-FILE-GATE-001: 판매용 EPUB가 보관함에 없으면 공개 판매를 열지 않는다(운영자 시험 결제는 허용). */
export async function fileReady(env, book) {
  const key = book?.directSale?.fileKey;
  if (!key || !env?.BOOK_FILES) return false;
  try { return Boolean(await env.BOOK_FILES.head(key)); } catch { return false; }
}

export async function quote(env, request, bookId) {
  const [catalog, policy] = await Promise.all([loadCatalog(env), loadPolicy(env)]);
  const book = directSaleBook(catalog, bookId);
  if (!book) return { status: 404, data: { error: '에코디서점 직접 판매 도서가 아닙니다.' } };
  const buyer = await buyerIdentity(request);
  const tierId = await tierFor(env, buyer);
  const price = priceFor(book, policy, tierId === 'guest' ? 'member' : tierId);
  const pay = await payments(env);
  const owned = buyer ? Boolean(await env.DB.prepare('SELECT 1 FROM books_entitlements WHERE buyer_user_id=? AND book_id=? AND revoked_at IS NULL').bind(buyer.userId, book.id).first()) : false;
  const operator = Boolean(buyer && operatorEmails(env).has(buyer.email));
  const hasFile = await fileReady(env, book);
  const audiobook = await availableAudiobook(env, book);
  return {
    status: 200,
    data: {
      book: { id: book.id, title: book.title, subtitle: book.subtitle || '', author: book.author || '', coverImage: book.coverImage || '', format: book.format || [], edition: book.edition || '', links: { upaper: book.links?.upaper || '', google: book.links?.google || '', amazon: book.links?.amazon || '' } },
      signedIn: Boolean(buyer), buyerEmail: buyer?.email || '', tier: tierId, owned, price, audiobook,
      tiers: (policy.tiers || []).map(t => ({ id: t.id, label: t.label, discountRate: t.discountRate || 0, description: t.description || '', price: priceFor(book, policy, t.id)?.amount ?? null })),
      checkout: { open: pay.ready && ((pay.mode === 'live' && hasFile) || operator), mode: pay.mode, testOnly: pay.ready && pay.mode !== 'live', fileReady: hasFile, operator },
    },
  };
}

export async function createOrder(env, request, body, now = new Date()) {
  const pay = await payments(env);
  if (!pay.ready) return { status: 503, data: { error: '에코디서점 결제 준비 중입니다. 결제가 열리면 바로 구매하실 수 있습니다.', code: 'PAYMENTS_NOT_READY' } };
  const buyer = await buyerIdentity(request);
  if (!buyer) return { status: 401, data: { error: '구글 로그인 후 구매할 수 있습니다.', code: 'login_required' } };
  if (pay.mode !== 'live' && !operatorEmails(env).has(buyer.email)) return { status: 503, data: { error: '에코디서점 결제 준비 중입니다.', code: 'PAYMENTS_TEST_ONLY' } };
  const [catalog, policy] = await Promise.all([loadCatalog(env), loadPolicy(env)]);
  const book = directSaleBook(catalog, body?.bookId);
  if (!book) return { status: 404, data: { error: '에코디서점 직접 판매 도서가 아닙니다.' } };
  if (await env.DB.prepare('SELECT 1 FROM books_entitlements WHERE buyer_user_id=? AND book_id=? AND revoked_at IS NULL').bind(buyer.userId, book.id).first()) {
    return { status: 409, data: { error: '이미 내 서재에 있는 도서입니다.', code: 'ALREADY_OWNED' } };
  }
  if (!operatorEmails(env).has(buyer.email) && !(await fileReady(env, book))) {
    return { status: 409, data: { error: '전자책 파일을 준비하고 있습니다. 준비되면 바로 구매하실 수 있습니다.', code: 'FILE_PREPARING' } };
  }
  if (body?.consent !== true) return { status: 400, data: { error: '전자책 구매·환불 안내에 동의해 주세요.' } };
  const tierId = await tierFor(env, buyer, now);
  const price = priceFor(book, policy, tierId);
  if (!price) return { status: 409, data: { error: '판매 가격이 확정되지 않은 도서입니다.' } };
  const orderId = ekodipay.tagOrderId(newOrderId(now), pay.profile);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + PENDING_TTL_MS).toISOString();
  const name = clean(body?.name, 40) || buyer.name || buyer.email.split('@')[0];
  await env.DB.prepare(`INSERT INTO books_orders (id, book_id, book_title, buyer_user_id, buyer_email, buyer_name, tier_id, list_price, amount, status, source, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'payment_pending', ?, ?, ?, ?)`)
    .bind(orderId, book.id, book.title, buyer.userId, buyer.email, name, price.tierId, price.listPrice, price.amount, clean(body?.source, 30) || 'bookstore', expiresAt, createdAt, createdAt).run();
  await audit(env, orderId, buyer.email, 'order.created', { amount: price.amount, tier: price.tierId, mode: pay.mode });
  const base = String(env.PUBLIC_BASE_URL || 'https://ekodi.kr/books').replace(/\/$/, '');
  return {
    status: 201,
    data: {
      orderId, amount: price.amount, orderName: `전자책 · ${book.title}`.slice(0, 100), customerName: name, customerEmail: buyer.email,
      clientKey: pay.clientKey, widget: Boolean(pay.widget) || /^(test|live)_gck_/.test(String(pay.clientKey || '')), variantKey: clean(env.TOSS_WIDGET_VARIANT_KEY, 60) || 'qtin', customerKey: `ekb-${crypto.randomUUID()}`,
      successUrl: `${base}/buy/success/`, failUrl: `${base}/buy/fail/?orderId=${encodeURIComponent(orderId)}`, expiresAt,
    },
  };
}

export async function confirm(env, { paymentKey, orderId, amount }, now = new Date(), toss = tossVia(env)) {
  if (!isValidOrderId(orderId) || !clean(paymentKey, 220)) return { status: 400, data: { error: '결제 정보가 올바르지 않습니다.' } };
  const profileId = ekodipay.profileFromOrderId(orderId);
  const order = await env.DB.prepare('SELECT * FROM books_orders WHERE id=?').bind(orderId).first();
  if (!order) return { status: 404, data: { error: '주문을 찾을 수 없습니다.' } };
  if (order.status === 'paid') {
    return order.payment_key === paymentKey ? { status: 200, data: { ok: true, orderId, bookId: order.book_id, idempotent: true } } : { status: 409, data: { error: '이미 다른 결제로 완료된 주문입니다.' } };
  }
  if (!['payment_pending', 'payment_failed'].includes(order.status)) return { status: 409, data: { error: '결제할 수 없는 주문 상태입니다.' } };
  if (Math.trunc(Number(amount)) !== Math.trunc(Number(order.amount))) {
    await audit(env, orderId, 'payment-provider:toss', 'payment.amount_mismatch', { amount });
    return { status: 409, data: { error: '결제 금액이 주문과 일치하지 않습니다.' } };
  }
  if (order.expires_at < now.toISOString()) return { status: 410, data: { error: '결제 시간이 지났습니다. 다시 구매해 주세요.' } };
  if (!(await payments(env)).ready) return { status: 503, data: { error: '결제 승인 서비스가 준비되지 않았습니다.' } };
  let payment;
  try {
    payment = await toss(env, profileId, '/v1/payments/confirm', { method: 'POST', body: { paymentKey, orderId, amount: Math.trunc(Number(order.amount)) }, idempotencyKey: `ekb-confirm-${orderId}` });
  } catch (error) {
    await audit(env, orderId, 'payment-provider:toss', 'payment.confirm_failed', { code: error.code, status: error.status });
    if (error.code === 'ALREADY_PROCESSED_PAYMENT') payment = await toss(env, profileId, `/v1/payments/${encodeURIComponent(paymentKey)}`, {}).catch(() => null);
    if (!payment) {
      await env.DB.prepare("UPDATE books_orders SET status='payment_failed', updated_at=? WHERE id=? AND status='payment_pending'").bind(now.toISOString(), orderId).run();
      return { status: 402, data: { error: error.message || '결제 승인에 실패했습니다.' } };
    }
  }
  if (payment.orderId !== orderId || Math.trunc(Number(payment.totalAmount)) !== Math.trunc(Number(order.amount)) || payment.status !== 'DONE') {
    await audit(env, orderId, 'payment-provider:toss', 'payment.mismatch', { orderId: payment.orderId, totalAmount: payment.totalAmount, status: payment.status });
    return { status: 409, data: { error: '결제 정보가 주문과 일치하지 않아 확인이 필요합니다. 고객센터로 문의해 주세요.' } };
  }
  const at = now.toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE books_orders SET status='paid', payment_key=?, payment_method=?, approved_at=?, receipt_url=?, updated_at=? WHERE id=? AND status IN ('payment_pending','payment_failed')`)
      .bind(clean(paymentKey, 220), clean(payment.method, 60), clean(payment.approvedAt, 60) || at, clean(payment.receipt?.url, 500), at, orderId),
    env.DB.prepare(`INSERT INTO books_entitlements (buyer_user_id, book_id, order_id, buyer_email, granted_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(buyer_user_id, book_id) DO UPDATE SET order_id=excluded.order_id, granted_at=excluded.granted_at, revoked_at=NULL`)
      .bind(order.buyer_user_id, order.book_id, orderId, order.buyer_email, at),
    env.DB.prepare(`INSERT INTO books_finance_transactions (occurred_on, publication_id, channel_code, transaction_type, quantity, amount_original, currency, fx_rate, amount_krw, settlement_status, external_ref, source, note, created_at, updated_at)
      VALUES (?, ?, 'ekodi-direct', 'sale', 1, ?, 'KRW', 1, ?, 'pending', ?, 'books-direct-commerce', ?, ?, ?)`)
      .bind(at.slice(0, 10), order.book_id, order.amount, order.amount, orderId, `tier=${order.tier_id}`, at, at),
  ]);
  await audit(env, orderId, 'payment-provider:toss', 'order.paid', { method: payment.method, amount: payment.totalAmount });
  return { status: 200, data: { ok: true, orderId, bookId: order.book_id, receiptUrl: payment.receipt?.url || '' } };
}

export async function library(env, request) {
  const buyer = await buyerIdentity(request);
  if (!buyer) return { status: 401, data: { error: '구글 로그인 후 내 서재를 볼 수 있습니다.', code: 'login_required' } };
  const [rows, catalog] = await Promise.all([
    env.DB.prepare(`SELECT e.book_id, e.granted_at, o.amount, o.receipt_url FROM books_entitlements e LEFT JOIN books_orders o ON o.id=e.order_id
      WHERE e.buyer_user_id=? AND e.revoked_at IS NULL ORDER BY e.granted_at DESC`).bind(buyer.userId).all(),
    loadCatalog(env),
  ]);
  const byId = new Map((catalog.books || []).map(b => [b.id, b]));
  const items = [];
  for (const row of rows.results || []) {
    const book = byId.get(row.book_id) || { id: row.book_id, title: row.book_id };
    const key = book.directSale?.fileKey || '';
    const ready = Boolean(key && env.BOOK_FILES && await env.BOOK_FILES.head(key).catch(() => null));
    const audiobook = await availableAudiobook(env, book);
    items.push({ id: book.id, title: book.title, subtitle: book.subtitle || '', author: book.author || '', coverImage: book.coverImage || '', grantedAt: row.granted_at, amount: row.amount, receiptUrl: row.receipt_url || '', downloadReady: ready, audiobook });
  }
  return { status: 200, data: { email: buyer.email, tier: await tierFor(env, buyer), items } };
}

export async function download(env, request, bookId) {
  const buyer = await buyerIdentity(request);
  if (!buyer) return new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), { status: 401, headers: { 'content-type': 'application/json; charset=utf-8' } });
  const book = directSaleBook(await loadCatalog(env), bookId);
  const owned = book && await env.DB.prepare('SELECT 1 FROM books_entitlements WHERE buyer_user_id=? AND book_id=? AND revoked_at IS NULL').bind(buyer.userId, book.id).first();
  if (!owned) return new Response(JSON.stringify({ error: '내 서재에 없는 도서입니다.' }), { status: 403, headers: { 'content-type': 'application/json; charset=utf-8' } });
  const object = env.BOOK_FILES && book.directSale?.fileKey ? await env.BOOK_FILES.get(book.directSale.fileKey) : null;
  if (!object) return new Response(JSON.stringify({ error: '전자책 파일을 준비하고 있습니다. 준비되면 내 서재에서 바로 받으실 수 있습니다.', code: 'FILE_PREPARING' }), { status: 409, headers: { 'content-type': 'application/json; charset=utf-8' } });
  await audit(env, '', buyer.email, 'book.download', { bookId: book.id });
  const filename = `${book.title}.epub`;
  return new Response(object.body, { headers: {
    'content-type': 'application/epub+zip', 'cache-control': 'private, no-store',
    'content-disposition': `attachment; filename="ekodi-book.epub"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'x-content-type-options': 'nosniff',
  } });
}

/** Complimentary to the same non-revoked ebook purchase; no new payment. */
export async function downloadAudiobook(env, request, bookId, trackNo) {
  const buyer = await buyerIdentity(request);
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
  if (!buyer) return new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), { status: 401, headers });
  const book = directSaleBook(await loadCatalog(env), bookId);
  const owned = book && await env.DB.prepare('SELECT 1 FROM books_entitlements WHERE buyer_user_id=? AND book_id=? AND revoked_at IS NULL')
    .bind(buyer.userId, book.id).first();
  if (!owned) return new Response(JSON.stringify({ error: '내 서재에서 이용할 수 없는 도서입니다.' }), { status: 403, headers });
  const track = audioChapterFor(book, Number(trackNo));
  if (!track || !(await availableAudiobook(env, book)).ready) {
    return new Response(JSON.stringify({ error: '보너스 오디오북을 제작·권리 검수 중입니다. 승인된 파일이 준비되면 추가 결제 없이 제공됩니다.', code: 'AUDIOBOOK_PREPARING' }), { status: 409, headers });
  }
  const object = env.BOOK_FILES ? await env.BOOK_FILES.get(track.key) : null;
  const meta = object?.customMetadata || {};
  if (!object || meta.bookId !== book.id || meta.kind !== 'audiobook-chapter' || meta.edition !== book.edition || meta.approved !== 'true') {
    return new Response(JSON.stringify({ error: '오디오북 파일을 준비하고 있습니다.', code: 'AUDIOBOOK_PREPARING' }), { status: 409, headers });
  }
  await audit(env, '', buyer.email, 'audiobook.bonus_download', { bookId: book.id, track: track.number });
  const filename = book.title + ' - ' + String(track.number).padStart(2, '0') + '장.mp3';
  return new Response(object.body, { headers: {
    'content-type': 'audio/mpeg', 'cache-control': 'private, no-store',
    'content-disposition': 'attachment; filename="ekodi-bonus-audiobook.mp3"; filename*=UTF-8\u0027\u0027' + encodeURIComponent(filename),
    'x-content-type-options': 'nosniff',
  } });
}

export const MAX_EPUB_BYTES = 50 * 1024 * 1024;
/** EPUB = ZIP whose first entry is an uncompressed 'mimetype' file containing 'application/epub+zip'. */
export function validateEpub(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 60) return { ok: false, error: '빈 파일입니다.' };
  if (bytes.length > MAX_EPUB_BYTES) return { ok: false, error: '파일이 너무 큽니다(최대 50MB).' };
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return { ok: false, error: 'EPUB(ZIP) 파일이 아닙니다.' };
  const head = new TextDecoder('latin1').decode(bytes.subarray(30, 30 + 8 + 20));
  if (!head.startsWith('mimetype') || !head.includes('application/epub+zip')) return { ok: false, error: 'EPUB 표준 형식(mimetype 첫 항목)이 아닙니다. EPUB 3 파일을 올려 주세요.' };
  return { ok: true };
}

/** 운영자 전용: 주문 조회 · 회원등급 부여(구독 결제가 열리기 전까지 수동 운영). */
export async function adminRoute(env, request, path, url, now = new Date()) {
  const buyer = await buyerIdentity(request);
  if (!buyer || !operatorEmails(env).has(buyer.email)) return { status: 403, data: { error: '운영자만 사용할 수 있습니다.' } };
  if (request.method === 'GET' && path === '/admin/orders') {
    const rows = await env.DB.prepare(`SELECT id, book_id, book_title, buyer_email, tier_id, amount, status, payment_method, approved_at, created_at FROM books_orders ORDER BY created_at DESC LIMIT ?`)
      .bind(Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50))).all();
    const sum = await env.DB.prepare(`SELECT COUNT(*) AS paid, COALESCE(SUM(amount),0) AS revenue FROM books_orders WHERE status='paid'`).first();
    return { status: 200, data: { orders: rows.results || [], paid: Number(sum?.paid || 0), revenue: Number(sum?.revenue || 0), payments: await payments(env) } };
  }
  const fileMatch = /^\/admin\/files\/([A-Z0-9-]{3,40})$/.exec(path);
  if (fileMatch && request.method === 'GET') {
    const book = directSaleBook(await loadCatalog(env), fileMatch[1]);
    if (!book) return { status: 404, data: { error: '직접 판매 도서가 아닙니다.' } };
    const head = env.BOOK_FILES ? await env.BOOK_FILES.head(book.directSale.fileKey).catch(() => null) : null;
    return { status: 200, data: { bookId: book.id, fileKey: book.directSale.fileKey, present: Boolean(head), size: head?.size || 0, uploaded: head?.uploaded || null } };
  }
  if (fileMatch && request.method === 'PUT') {
    const book = directSaleBook(await loadCatalog(env), fileMatch[1]);
    if (!book) return { status: 404, data: { error: '직접 판매 도서가 아닙니다.' } };
    if (!env.BOOK_FILES) return { status: 503, data: { error: '전자책 보관함이 연결되지 않았습니다.' } };
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_EPUB_BYTES) return { status: 413, data: { error: '파일이 너무 큽니다(최대 50MB).' } };
    const bytes = new Uint8Array(await request.arrayBuffer());
    const check = validateEpub(bytes);
    if (!check.ok) return { status: 400, data: { error: check.error } };
    await env.BOOK_FILES.put(book.directSale.fileKey, bytes, { httpMetadata: { contentType: 'application/epub+zip' }, customMetadata: { bookId: book.id, uploadedBy: buyer.email } });
    await audit(env, '', buyer.email, 'book.file_uploaded', { bookId: book.id, size: bytes.length });
    return { status: 200, data: { ok: true, bookId: book.id, size: bytes.length } };
  }
  const audioFileMatch = /^\/admin\/audiobooks\/([A-Z0-9-]{3,40})\/(\d{1,3})$/.exec(path);
  if (audioFileMatch && (request.method === 'GET' || request.method === 'PUT')) {
    const book = directSaleBook(await loadCatalog(env), audioFileMatch[1]);
    const index = Number(audioFileMatch[2]);
    // A planned draft can be uploaded, but only the reviewed catalog + a
    // post-approval upload can mark the R2 copy distributable.
    const tracks = Array.isArray(book?.audiobook?.tracks) ? book.audiobook.tracks : [];
    const track = tracks.find(t => t.number === index && t.format === 'mp3' &&
      typeof t.key === 'string' && /^BOOK-[A-Z0-9-]+\/audiobook\/[A-Za-z0-9._-]+\.mp3$/.test(t.key) &&
      t.key.startsWith(book.id + '/audiobook/'));
    if (!track || !env.BOOK_FILES) return { status: 409, data: { error: '오디오 제작 트랙 명세 또는 비공개 저장소가 준비되지 않았습니다.' } };
    const approved = complimentaryAudiobookPolicy(book).approved;
    if (request.method === 'GET') {
      const head = await env.BOOK_FILES.head(track.key).catch(() => null);
      return { status: 200, data: { bookId: book.id, track: index, present: Boolean(head), size: head?.size || 0, approvedForDelivery: approved && head?.customMetadata?.approved === 'true', priceKrw: 0 } };
    }
    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_AUDIO_CHAPTER_BYTES) return { status: 413, data: { error: '장별 오디오 파일은 최대 32MB입니다.' } };
    const bytes = new Uint8Array(await request.arrayBuffer());
    const result = validateAudioChapter(bytes);
    if (!result.ok) return { status: 400, data: { error: result.error } };
    await env.BOOK_FILES.put(track.key, bytes, {
      httpMetadata: { contentType: 'audio/mpeg' },
      customMetadata: { bookId: book.id, edition: book.edition, kind: 'audiobook-chapter', approved: approved ? 'true' : 'false', uploadedBy: buyer.email },
    });
    await audit(env, '', buyer.email, 'audiobook.track_uploaded', { bookId: book.id, track: index, approved });
    return { status: 200, data: { ok: true, bookId: book.id, track: index, size: bytes.length, approvedForDelivery: approved, priceKrw: 0 } };
  }
  if (request.method === 'GET' && path === '/admin/tiers') {
    const rows = await env.DB.prepare('SELECT buyer_email, tier_id, source, expires_at, updated_at FROM books_member_tiers ORDER BY updated_at DESC LIMIT 500').all();
    return { status: 200, data: { tiers: rows.results || [] } };
  }
  if (request.method === 'POST' && path === '/admin/tiers') {
    const body = await readJson(request);
    const email = clean(body?.email, 160).toLowerCase();
    const tierId = clean(body?.tierId, 30);
    const policy = await loadPolicy(env);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { status: 400, data: { error: '이메일을 확인해 주세요.' } };
    if (tierId === 'member') { await env.DB.prepare('DELETE FROM books_member_tiers WHERE buyer_email=?').bind(email).run(); }
    else {
      if (!(policy.tiers || []).some(t => t.id === tierId)) return { status: 400, data: { error: '알 수 없는 회원등급입니다.' } };
      const expires = body?.expiresAt ? clean(body.expiresAt, 30) : null;
      await env.DB.prepare(`INSERT INTO books_member_tiers (buyer_email, tier_id, source, expires_at, updated_at) VALUES (?, ?, 'admin', ?, ?)
        ON CONFLICT(buyer_email) DO UPDATE SET tier_id=excluded.tier_id, source='admin', expires_at=excluded.expires_at, updated_at=excluded.updated_at`).bind(email, tierId, expires, now.toISOString()).run();
    }
    await audit(env, '', buyer.email, 'tier.set', { email, tierId });
    return { status: 200, data: { ok: true, email, tierId } };
  }
  return { status: 404, data: { error: 'not found' } };
}

const API = '/api/commerce';
async function readJson(request) {
  const text = await request.text();
  if (text.length > 8000) return null;
  try { return JSON.parse(text || '{}'); } catch { return null; }
}
const jsonResponse = (result) => new Response(JSON.stringify(result.data), { status: result.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

/** Routes under /api/commerce (the worker sees paths without the /books mount). */
export async function handleCommerce(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.slice(API.length) || '/';
  if (!env.DB) return jsonResponse({ status: 503, data: { error: '에코디서점 주문 저장소가 연결되지 않았습니다.' } });
  try {
    if (request.method === 'GET' && path === '/status') {
      const p = await payments(env);
      return jsonResponse({ status: 200, data: { ready: p.ready, mode: p.mode, publicReady: p.publicReady, merchant: p.merchant, via: p.via } });
    }
    if (request.method === 'GET' && path === '/quote') return jsonResponse(await quote(env, request, url.searchParams.get('book')));
    if (request.method === 'GET' && path === '/library') return jsonResponse(await library(env, request));
    const audioDl = /^\/download\/audio\/([A-Z0-9-]{3,40})\/(\d{1,3})$/.exec(path);
    if (request.method === 'GET' && audioDl) return downloadAudiobook(env, request, audioDl[1], audioDl[2]);
    const dl = /^\/download\/([A-Z0-9-]{3,40})$/.exec(path);
    if (request.method === 'GET' && dl) return download(env, request, dl[1]);
    if (path.startsWith('/admin/')) return jsonResponse(await adminRoute(env, request, path, url));
    if (request.method === 'POST' && path === '/orders') {
      const body = await readJson(request);
      if (!body) return jsonResponse({ status: 400, data: { error: '요청 형식이 올바르지 않습니다.' } });
      return jsonResponse(await createOrder(env, request, body));
    }
    if (request.method === 'POST' && path === '/confirm') {
      const body = await readJson(request);
      if (!body) return jsonResponse({ status: 400, data: { error: '요청 형식이 올바르지 않습니다.' } });
      return jsonResponse(await confirm(env, { paymentKey: clean(body.paymentKey, 220), orderId: clean(body.orderId, 80), amount: body.amount }));
    }
    return jsonResponse({ status: 404, data: { error: 'not found' } });
  } catch (error) {
    return jsonResponse({ status: 500, data: { error: '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' } });
  }
}

export { flag };
