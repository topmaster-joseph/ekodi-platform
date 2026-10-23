import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  defaultWindow, targetIssueFor, inPreparationWindow, campaignState, parseIssueTitle, titleMatchesIssue, isQtinFamily,
  extractItemIds, parseProductDetail, buildOrderDraft, assessConfirmation, csvEscape, normalizePhone, newOrderId, isValidTossOrderId, kstToUtc,
} from '../qtin-order-core.js';
import worker, { handleRequest, syncCampaign, runScheduled, confirmPayment, handleWebhook, renderOrderPage, renderAdminPage } from '../qtin-order-worker.js';

// ---------- in-memory D1 shim ----------
function d1() {
  const db = new DatabaseSync(':memory:');
  const wrap = (sql, args = []) => ({
    bind: (...next) => wrap(sql, next),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    _exec: () => db.prepare(sql).run(...args),
  });
  return {
    prepare: sql => wrap(sql),
    batch: async statements => { db.exec('BEGIN'); try { statements.forEach(s => s._exec()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return []; },
    raw: db,
  };
}
async function freshEnv(extra = {}) {
  const DB = d1();
  DB.raw.exec(await readFile(new URL('../migrations/0201_qtin_group_orders.sql', import.meta.url), 'utf8'));
  DB.raw.exec(await readFile(new URL('../migrations/0202_qtin_buyer_accounts.sql', import.meta.url), 'utf8'));
  DB.raw.exec(await readFile(new URL('../migrations/0203_qtin_product_intros.sql', import.meta.url), 'utf8'));
  DB.raw.exec(await readFile(new URL('../migrations/0204_qtin_order_delivery.sql', import.meta.url), 'utf8'));
  return { DB, PUBLIC_BASE_URL: 'https://ekodi.kr/qtin', OPERATOR_EMAILS: 'topmaster.joseph@gmail.com', PAYMENTS_ENABLED: 'true', TOSS_CLIENT_KEY: 'live_ck_abc', TOSS_SECRET_KEY: 'live_sk_abc', QTM_SEED_ITEM_IDS: '1719304225', ...extra };
}

// ---------- QTM fixtures (youngcart markup) ----------
function detailHtml(id, name, sale, list, prevId, nextId) {
  return `<html><body><div id="sit_ov"><h2 id="sit_title">${name} <span class="sound_only">요약정보 및 구매</span></h2>
  <a href="https://www.qtm.or.kr/shop/largeimage.php?it_id=${id}&no=1"><img src="https://www.qtm.or.kr/data/item/${id}/cover_01.jpg" alt=""></a>
  <img src="https://www.qtm.or.kr/data/item/${id}/thumb-cover_01_70x70.jpg">
  <table><tr><th scope="row">시중가격</th><td>${list.toLocaleString()}원</td></tr><tr><th scope="row">판매가격</th><td><strong>${sale.toLocaleString()}원</strong>
  <input type="hidden" id="it_price" value="${sale}"></td></tr></table>
  ${prevId ? `<a href="https://www.qtm.or.kr/shop/${prevId}" id="siblings_prev">이전상품</a>` : ''}
  ${nextId ? `<a href="https://www.qtm.or.kr/shop/${nextId}" id="siblings_next">다음 상품</a>` : ''}
  </div>
  <h3>상품 상세설명</h3><div id="sit_inf_explan"><p><img src="https://www.qtm.or.kr/data/editor/2609/x.jpg"></p><p>목차</p><p>[${name} 목차]</p><p>2 목차 | 고린도전서 3:1-15:22<br>14 11월의 큐티</p><p>책 속으로</p><p>말씀으로 삶을 해석하고 나눕니다.&nbsp;(김정안)</p><script>evil()</script></div>
  <h3>상품 정보 고시</h3><table id="sit_inf_open"><tr><th>도서명</th><td>${name}</td></tr></table>
  </body></html>`;
}
const PAGES = {
  '1719304225': detailHtml('1719304225', '큐티인(QTIN)(큰글씨) 2026년 12월호', 4500, 5000, '1719305039', '1719304141'),
  '1719305039': detailHtml('1719305039', '새싹 큐티인(QTIN) 2026년 12월호', 3600, 4000, null, '1719304225'),
  '1719304141': detailHtml('1719304141', '청소년 큐티인(QTIN) 2026년 12월호', 3600, 4000, '1719304225', '1719300001'),
  '1719300001': detailHtml('1719300001', '큐티인(QTIN)(작은글씨) 2026년 11월호', 3600, 4000, '1719304141', '1800000000'),
  '1800000000': detailHtml('1800000000', '목회 세미나 교재 2026년 12월호', 15000, 15000, null, null),
};
const SEARCH = `<ul><li><a href="/shop/1719304141"><img src="x"></a></li><li><a href="https://www.qtm.or.kr/shop/1800000000">x</a></li></ul>`;
async function fakeFetchPage(url) {
  if (url.includes('search.php')) return SEARCH;
  const id = /\/shop\/(\d+)/.exec(url)?.[1];
  if (PAGES[id]) return PAGES[id];
  throw new Error('QTM_HTTP_404');
}

// Times (KST): Nov 22 2026 10:00 → open window for 2026-12
const OPEN_NOW = kstToUtc(2026, 11, 22, 10, 0, 0);
const BEFORE_NOW = kstToUtc(2026, 11, 10, 10, 0, 0);
const AFTER_NOW = kstToUtc(2026, 11, 27, 10, 0, 0);

test('intake window is prior-month 20th 00:00 to 25th 23:59:59 KST, including January rollover', () => {
  assert.deepEqual(defaultWindow(2026, 12), { opensAt: '2026-11-19T15:00:00.000Z', closesAt: '2026-11-25T14:59:59.000Z' });
  assert.deepEqual(defaultWindow(2027, 1), { opensAt: '2026-12-19T15:00:00.000Z', closesAt: '2026-12-25T14:59:59.000Z' });
  assert.equal(targetIssueFor(OPEN_NOW).id, '2026-12');
  assert.equal(targetIssueFor(kstToUtc(2026, 12, 20, 0, 0, 1)).id, '2027-01');
  assert.equal(inPreparationWindow(kstToUtc(2026, 11, 19, 0, 0, 0)), true);
  assert.equal(inPreparationWindow(kstToUtc(2026, 11, 26, 0, 0, 0)), false);
  const c = { ...defaultWindow(2026, 12), manual_state: '', status: 'scheduled' };
  const row = { opens_at: c.opensAt, closes_at: c.closesAt, manual_state: '', status: 'scheduled' };
  assert.equal(campaignState(row, kstToUtc(2026, 11, 19, 23, 59, 59)), 'scheduled');
  assert.equal(campaignState(row, kstToUtc(2026, 11, 20, 0, 0, 0)), 'open');
  assert.equal(campaignState(row, kstToUtc(2026, 11, 25, 23, 59, 59)), 'open');
  assert.equal(campaignState(row, kstToUtc(2026, 11, 26, 0, 0, 0)), 'closed');
  assert.equal(campaignState({ ...row, manual_state: 'force_open' }, AFTER_NOW), 'open');
  assert.equal(campaignState({ ...row, manual_state: 'force_closed' }, OPEN_NOW), 'closed');
});

test('issue titles parse series and month; non-QTIN products are excluded', () => {
  assert.deepEqual(parseIssueTitle('큐티인(QTIN)(큰글씨) 2026년 11월호'), { year: 2026, month: 11, months: [11], series: '큐티인(QTIN)(큰글씨)' });
  assert.deepEqual(parseIssueTitle('청년 큐티인(Young) (QTIN) 2027년 1·2월호').months, [1, 2]);
  assert.equal(titleMatchesIssue('새싹 큐티인(QTIN) 2026년 11월호', 2026, 11), true);
  assert.equal(titleMatchesIssue('새싹 큐티인(QTIN) 2026년 10월호', 2026, 11), false);
  assert.equal(isQtinFamily('목회 세미나 교재 2026년 12월호'), false);
  assert.equal(parseIssueTitle('단행본'), null);
});

test('QTM detail page parsing takes the online sale price and full-size cover', () => {
  const d = parseProductDetail(PAGES['1719304225'], '1719304225');
  assert.equal(d.name, '큐티인(QTIN)(큰글씨) 2026년 12월호');
  assert.equal(d.salePrice, 4500);
  assert.equal(d.listPrice, 5000);
  assert.equal(d.imageUrl, 'https://www.qtm.or.kr/data/item/1719304225/cover_01.jpg');
  assert.equal(d.productUrl, 'https://www.qtm.or.kr/shop/1719304225');
  assert.equal(parseProductDetail('<html>no product</html>', '1'), null);
  assert.deepEqual(extractItemIds(SEARCH).sort(), ['1719304141', '1800000000']);
  assert.equal(parseProductDetail('<h2 id="sit_title">x 2026년 1월호</h2><img src="https://evil.example/data/item/9/a.jpg"><input id="it_price" value="3600">', '9').imageUrl, '');
});

const PRODUCTS = [
  { id: '2026-12:1', qtm_item_id: '1', name: '큐티인(QTIN)(작은글씨) 2026년 12월호', sale_price: 3600, active: 1 },
  { id: '2026-12:2', qtm_item_id: '2', name: '어린이 큐티인 2026년 12월호', sale_price: 4500, active: 1 },
  { id: '2026-12:3', qtm_item_id: '3', name: '숨김 도서', sale_price: 1000, active: 0 },
];
const VALID = { org: 'church', name: '홍길동', phone: '010-1234-5678', privacyConsent: true, items: [{ productId: '2026-12:1', quantity: 2 }, { productId: '2026-12:2', quantity: 1, price: 1 }] };

test('order draft uses server prices only and rejects invalid input', () => {
  const ok = buildOrderDraft(VALID, PRODUCTS);
  assert.equal(ok.ok, true);
  assert.equal(ok.draft.totalAmount, 3600 * 2 + 4500);
  assert.equal(ok.draft.totalQuantity, 3);
  assert.equal(ok.draft.orderName, '큐티인(QTIN)(작은글씨) 2026년 12월호 외 1종');
  assert.equal(ok.draft.phone, '010-1234-5678');
  for (const [patch, needle] of [
    [{ org: 'unknown' }, '소속'], [{ org: 'other' }, '소속 교회·단체 이름'], [{ name: 'a' }, '이름'], [{ phone: '02-123' }, '휴대전화'], [{ privacyConsent: false }, '동의'],
    [{ items: [] }, '도서와 수량'], [{ items: [{ productId: '2026-12:3', quantity: 1 }] }, '신청할 수 없는'],
    [{ items: [{ productId: '2026-12:1', quantity: 51 }] }, '수량은'], [{ items: [{ productId: '2026-12:1', quantity: -1 }] }, '수량은'],
    [{ email: 'bad' }, '이메일'],
  ]) {
    const r = buildOrderDraft({ ...VALID, ...patch }, PRODUCTS);
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.ok(r.errors.some(e => e.includes(needle)), `${needle} in ${r.errors}`);
  }
  assert.equal(normalizePhone('01012345678'), '010-1234-5678');
  assert.ok(isValidTossOrderId(newOrderId('2026-12')));
});

test('confirmation guard blocks paid, expired and amount-tampered orders', () => {
  const order = { status: 'payment_pending', total_amount: 11700, expires_at: new Date(Date.now() + 60000).toISOString() };
  assert.equal(assessConfirmation(order, 11700).ok, true);
  assert.equal(assessConfirmation(order, 100).code, 'AMOUNT_MISMATCH');
  assert.equal(assessConfirmation({ ...order, status: 'paid' }, 11700).code, 'ALREADY_PAID');
  assert.equal(assessConfirmation({ ...order, expires_at: new Date(Date.now() - 1).toISOString() }, 11700).code, 'ORDER_EXPIRED');
  assert.equal(assessConfirmation(null, 1).code, 'ORDER_NOT_FOUND');
});

test('CSV export neutralises spreadsheet formula injection', () => {
  assert.equal(csvEscape('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvEscape('홍길동'), '홍길동');
});

test('sync discovers only next-month QTIN issues and follows prev/next links', async () => {
  const env = await freshEnv();
  const report = await runScheduled(env, OPEN_NOW, { fetchPage: fakeFetchPage });
  assert.equal(report.sync.status, 'ok');
  const rows = (await env.DB.prepare('SELECT qtm_item_id, name, sale_price, image_url FROM qtin_products WHERE campaign_id=? AND active=1 ORDER BY sort_order').bind('2026-12').all()).results;
  assert.deepEqual(rows.map(r => r.qtm_item_id).sort(), ['1719304141', '1719304225', '1719305039']);
  assert.ok(rows.every(r => r.image_url.startsWith('https://www.qtm.or.kr/data/item/')));
  assert.ok(!rows.some(r => r.name.includes('세미나') || r.name.includes('11월호')));
  // QTM reuses an item for another month → that product is hidden on the next full sync.
  const reused = { ...PAGES, '1719305039': detailHtml('1719305039', '새싹 큐티인(QTIN) 2027년 1월호', 3600, 4000, null, '1719304225') };
  const campaign = await env.DB.prepare('SELECT * FROM qtin_campaigns WHERE id=?').bind('2026-12').first();
  await syncCampaign(env, campaign, { fetchPage: async url => { const id = /\/shop\/(\d+)/.exec(url)?.[1]; if (url.includes('search')) return SEARCH; if (reused[id]) return reused[id]; throw new Error('404'); } });
  const active = (await env.DB.prepare('SELECT qtm_item_id FROM qtin_products WHERE campaign_id=? AND active=1').bind('2026-12').all()).results.map(r => r.qtm_item_id);
  assert.ok(!active.includes('1719305039'));
  // A failing QTM never wipes products.
  await syncCampaign(env, campaign, { fetchPage: async () => { throw new Error('QTM_HTTP_503'); } });
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM qtin_products WHERE campaign_id=? AND active=1').bind('2026-12').first()).n, 2);
});

async function openEnvWithProducts(extra = {}) {
  const env = await freshEnv(extra);
  await runScheduled(env, OPEN_NOW, { fetchPage: fakeFetchPage });
  return env;
}
// Ordering requires a Google-verified central EKODI account (EKODI-QTIN-GOOGLE-CHECKOUT-004).
// The default network stub answers the central identity lookup for the synthetic buyer token.
const BUYER = { id: 'buyer-1', email: 'buyer@gmail.com', email_confirmed_at: '2026-01-01', user_metadata: { full_name: '구매자' } };
const baseFetch = async (url, init = {}) => {
  if (String(url).includes('/auth/v1/user')) {
    const auth = init?.headers?.authorization || '';
    return auth === 'Bearer buyer-token' ? new Response(JSON.stringify(BUYER), { status: 200 }) : new Response('{}', { status: 401 });
  }
  throw new Error(`unexpected network call in test: ${url}`);
};
globalThis.fetch = baseFetch;
const post = (path, body, token = 'buyer-token') => new Request(`https://ekodi.kr${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

test('public page and catalog show next-month covers; order is created with server amount', async () => {
  const env = await openEnvWithProducts();
  const page = await handleRequest(new Request('https://ekodi.kr/qtin/mission'), env, OPEN_NOW);
  const body = await page.text();
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /nonce-/);
  assert.ok(body.includes('2026년 12월호 큐티인 신청'));
  assert.ok(body.includes('https://www.qtm.or.kr/data/item/1719304225/cover_01.jpg'));
  assert.ok(body.includes('"org":"mission"'));
  const cat = await (await handleRequest(new Request('https://ekodi.kr/qtin/api/catalog'), env, OPEN_NOW)).json();
  assert.equal(cat.campaign.state, 'open');
  assert.equal(cat.products.length, 3);
  const pid = cat.products.find(p => p.name.includes('큰글씨')).id;
  const res = await handleRequest(post('/qtin/api/orders', { campaignId: '2026-12', org: 'church', name: '홍길동', phone: '01012345678', privacyConsent: true, items: [{ productId: pid, quantity: 3, price: 1 }] }), env, OPEN_NOW);
  const data = await res.json();
  assert.equal(res.status, 201, JSON.stringify(data));
  assert.equal(data.amount, 13500);
  assert.equal(data.clientKey, 'live_ck_abc');
  assert.ok(data.successUrl.startsWith('https://ekodi.kr/qtin/payment/success?t='));
  assert.ok(!JSON.stringify(data).includes('test_sk_'));
  const row = await env.DB.prepare('SELECT * FROM qtin_orders WHERE id=?').bind(data.orderId).first();
  assert.equal(row.status, 'payment_pending');
  assert.equal(row.total_amount, 13500);
});

test('orders are refused outside the window, when payments are not ready, and in staging', async () => {
  const env = await openEnvWithProducts();
  const body = { campaignId: '2026-12', org: 'church', name: '홍길동', phone: '01012345678', privacyConsent: true, items: [{ productId: '2026-12:1719304225', quantity: 1 }] };
  assert.equal((await handleRequest(post('/qtin/api/orders', body), env, AFTER_NOW)).status, 409);
  assert.equal((await handleRequest(post('/qtin/api/orders', body), env, BEFORE_NOW)).status, 409);
  const off = { ...env, PAYMENTS_ENABLED: 'false' };
  assert.equal((await handleRequest(post('/qtin/api/orders', body), off, OPEN_NOW)).status, 503);
  const noKey = { ...env, TOSS_SECRET_KEY: '' };
  assert.equal((await handleRequest(post('/qtin/api/orders', body), noKey, OPEN_NOW)).status, 503);
  const staging = { DATA_MODE: 'isolated-staging' };
  const sres = await handleRequest(post('/qtin/api/orders', body), staging, OPEN_NOW);
  assert.equal(sres.status, 403);
  assert.equal(sres.headers.get('x-ekodi-data-mode'), 'isolated-staging');
  const spage = await handleRequest(new Request('https://staging.invalid/qtin'), staging, OPEN_NOW);
  assert.equal(spage.status, 200);
  assert.ok((await spage.text()).includes('ISOLATED STAGING'));
  assert.equal((await handleRequest(new Request('https://staging.invalid/qtin/api/admin/campaigns'), staging)).status, 401);
});

function mockToss(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const { status = 200, body } = await handler(String(url), init);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
async function pendingOrder(env) {
  const res = await handleRequest(post('/qtin/api/orders', { campaignId: '2026-12', org: 'mission', name: '김선교', phone: '010-9999-0000', privacyConsent: true, items: [{ productId: '2026-12:1719304225', quantity: 2 }] }), env, OPEN_NOW);
  return res.json();
}

test('payment is completed only after server-side Toss confirmation; idempotent and tamper-proof', async () => {
  const env = await openEnvWithProducts();
  const order = await pendingOrder(env);
  const token = new URL(order.successUrl).searchParams.get('t');
  const toss = mockToss(async (url, init) => {
    assert.ok(url.startsWith('https://api.tosspayments.com/v1/payments/confirm'));
    assert.equal(init.headers.authorization, `Basic ${btoa('live_sk_abc:')}`);
    const req = JSON.parse(init.body);
    return { body: { paymentKey: req.paymentKey, orderId: req.orderId, totalAmount: req.amount, status: 'DONE', method: '카드', approvedAt: '2026-11-22T10:01:00+09:00', receipt: { url: 'https://dashboard.tosspayments.com/receipt/x' } } };
  });
  try {
    // tampered amount → blocked before calling Toss
    const tampered = await confirmPayment(env, { paymentKey: 'pk_1', orderId: order.orderId, amount: 100 }, OPEN_NOW);
    assert.equal(tampered.code, 'AMOUNT_MISMATCH');
    assert.equal(toss.calls.length, 0);
    const page = await handleRequest(new Request(`https://ekodi.kr/qtin/payment/success?t=${token}&paymentKey=pk_1&orderId=${order.orderId}&amount=9000`), env, OPEN_NOW);
    const html = await page.text();
    assert.equal(page.status, 200, html.slice(0, 300));
    assert.ok(html.includes('신청이 완료되었습니다'));
    assert.ok(html.includes('김*교'));
    const row = await env.DB.prepare('SELECT * FROM qtin_orders WHERE id=?').bind(order.orderId).first();
    assert.equal(row.status, 'paid');
    assert.equal(row.payment_key, 'pk_1');
    // replay → idempotent, no second Toss call
    const again = await confirmPayment(env, { paymentKey: 'pk_1', orderId: order.orderId, amount: 9000 }, OPEN_NOW);
    assert.equal(again.idempotent, true);
    assert.equal(toss.calls.length, 1);
    const other = await confirmPayment(env, { paymentKey: 'pk_other', orderId: order.orderId, amount: 9000 }, OPEN_NOW);
    assert.equal(other.code, 'ALREADY_PAID');
    // receipt link requires the lookup token
    assert.equal((await handleRequest(new Request(`https://ekodi.kr/qtin/order/${order.orderId}?t=wrong`), env)).status, 404);
    assert.equal((await handleRequest(new Request(`https://ekodi.kr/qtin/order/${order.orderId}?t=${token}`), env)).status, 200);
  } finally { toss.restore(); }
});

test('Toss rejection or provider mismatch never marks the order paid', async () => {
  const env = await openEnvWithProducts();
  const a = await pendingOrder(env);
  let toss = mockToss(async () => ({ status: 400, body: { code: 'REJECT_CARD_COMPANY', message: '카드사 거절' } }));
  try {
    const r = await confirmPayment(env, { paymentKey: 'pk_a', orderId: a.orderId, amount: 9000 }, OPEN_NOW);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'REJECT_CARD_COMPANY');
  } finally { toss.restore(); }
  toss = mockToss(async () => ({ body: { paymentKey: 'pk_a', orderId: a.orderId, totalAmount: 1, status: 'DONE' } }));
  try {
    const r = await confirmPayment(env, { paymentKey: 'pk_a', orderId: a.orderId, amount: 9000 }, OPEN_NOW);
    assert.equal(r.code, 'PAYMENT_MISMATCH');
  } finally { toss.restore(); }
  assert.equal((await env.DB.prepare('SELECT status FROM qtin_orders WHERE id=?').bind(a.orderId).first()).status, 'payment_pending');
});

test('webhook re-verifies with Toss and completes an order whose browser never returned', async () => {
  const env = await openEnvWithProducts();
  const o = await pendingOrder(env);
  const toss = mockToss(async url => {
    assert.ok(url.endsWith('/v1/payments/pk_w'));
    return { body: { paymentKey: 'pk_w', orderId: o.orderId, totalAmount: 9000, status: 'DONE', method: '계좌이체' } };
  });
  try {
    const forged = await handleWebhook(env, { eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'pk_w', orderId: o.orderId, status: 'DONE' } });
    assert.equal(forged.result, 'paid');
    assert.equal((await env.DB.prepare('SELECT status FROM qtin_orders WHERE id=?').bind(o.orderId).first()).status, 'paid');
  } finally { toss.restore(); }
});

test('admin API fails closed without a token; health reports readiness', async () => {
  const env = await openEnvWithProducts();
  assert.equal((await handleRequest(new Request('https://ekodi.kr/qtin/api/admin/campaigns'), env)).status, 401);
  const health = await handleRequest(new Request('https://ekodi.kr/qtin/api/health'), env, OPEN_NOW);
  const h = await health.json();
  assert.equal(health.status, 200);
  assert.equal(h.campaign.productCount, 3);
  assert.equal(h.payment.ready, true);
  const empty = await freshEnv({ PAYMENTS_ENABLED: 'false' });
  await empty.DB.prepare("INSERT INTO qtin_campaigns (id,target_year,target_month,opens_at,closes_at) VALUES ('2026-12',2026,12,?,?)").bind(defaultWindow(2026, 12).opensAt, defaultWindow(2026, 12).closesAt).run();
  const eh = await handleRequest(new Request('https://ekodi.kr/qtin/api/health'), empty, OPEN_NOW);
  assert.equal(eh.status, 503);
  assert.deepEqual((await eh.json()).payment.missing, ['payments-disabled']);
});

test('pending orders expire on schedule and a closed page disables payment', async () => {
  const env = await openEnvWithProducts();
  const o = await pendingOrder(env);
  const later = new Date(OPEN_NOW.getTime() + 31 * 60 * 1000);
  const report = await runScheduled(env, later, { fetchPage: fakeFetchPage });
  assert.equal(report.expired, 1);
  assert.equal((await env.DB.prepare('SELECT status FROM qtin_orders WHERE id=?').bind(o.orderId).first()).status, 'expired');
  const closed = renderOrderPage({ campaign: { id: '2026-12', year: 2026, month: 12, state: 'closed', opensAt: '', closesAt: '' }, products: [], payment: { ready: true } });
  assert.ok(closed.includes('신청 마감'));
  assert.ok(closed.includes('"open":false'));
});

test('worker contract: routes, cron and secrets stay out of config', async () => {
  const prod = await readFile(new URL('../wrangler.qtin-order.toml', import.meta.url), 'utf8');
  assert.match(prod, /pattern = "ekodi\.kr\/qtin\*"/);
  assert.match(prod, /crons = \["0 15 \* \* \*", "0 3 \* \* \*"\]/);
  assert.match(prod, /database_name = "ekodi-auth"/);
  // Test-key phase: the committed client key must never be a live key without an explicit release.
  assert.match(prod, /TOSS_CLIENT_KEY = "(test_ck_[A-Za-z0-9]+)?"/);
  assert.ok(!/TOSS_SECRET_KEY\s*=/.test(prod));
  const staging = await readFile(new URL('../wrangler.qtin-order.staging.toml', import.meta.url), 'utf8');
  assert.match(staging, /DATA_MODE = "isolated-staging"/);
  assert.ok(!staging.includes('[[d1_databases]]'));
  assert.equal(typeof worker.fetch, 'function');
  assert.equal(typeof worker.scheduled, 'function');
});

test('token-mediated merges dispatch the guarded QTIN deploy with the orchestrator release receipt', async () => {
  const [script, prod, staging] = await Promise.all([
    readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/deploy-qtin-order.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/deploy-qtin-order-staging.yml', import.meta.url), 'utf8'),
  ]);
  const start = script.indexOf('const qtinOrderTouched');
  const block = script.slice(start, script.indexOf('].includes(file));', start));
  for (const file of ['qtin-order-worker.js', 'qtin-order-core.js', 'migrations/0201_qtin_group_orders.sql', 'wrangler.qtin-order.toml', '.github/workflows/deploy-qtin-order.yml']) {
    assert.ok(block.includes(`'${file}'`), `${file} must dispatch the QTIN deploy after convergent merge`);
  }
  assert.match(script, /deploy-qtin-order\.yml\/dispatches[\s\S]{0,200}release_branch_ref:branch,release_task_id:taskId/);
  for (const wf of [prod, staging]) {
    assert.match(wf, /release_branch_ref:/);
    assert.match(wf, /EKODI_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref \|\| '' \}\}/);
    assert.match(wf, /EKODI_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id \|\| '' \}\}/);
  }
  assert.match(prod, /release_branch_ref: \$\{\{ inputs\.release_branch_ref \|\| '' \}\}/);
});

// ---------- test-key phase: operator-only test orders ----------
async function testModeEnv() {
  const env = await openEnvWithProducts();
  env.TOSS_CLIENT_KEY = 'test_ck_abc';
  env.TOSS_SECRET_KEY = 'test_sk_abc';
  return env;
}
function mockSupabase(email) {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes('/auth/v1/user')) {
      return email ? new Response(JSON.stringify({ id: 'u1', email, email_confirmed_at: '2026-01-01' }), { status: 200 }) : new Response('{}', { status: 401 });
    }
    return new Response('[]', { status: 200 });
  };
  return { restore() { globalThis.fetch = original; } };
}
const testOrderBody = { campaignId: '2026-12', org: 'church', name: '테스트', phone: '010-1111-2222', privacyConsent: true, items: [{ productId: '2026-12:1719304225', quantity: 1 }] };

test('with a test key the public checkout stays closed and anonymous orders are refused', async () => {
  const env = await testModeEnv();
  const cat = await (await handleRequest(new Request('https://ekodi.kr/qtin/api/catalog'), env, OPEN_NOW)).json();
  assert.equal(cat.payment.ready, false);
  assert.equal(cat.payment.testMode, true);
  const sb = mockSupabase(null);
  try {
    const res = await handleRequest(post('/qtin/api/orders', testOrderBody), env, OPEN_NOW);
    assert.equal(res.status, 401, 'an unverified visitor must sign in first');
  } finally { sb.restore(); }
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM qtin_orders').first()).n, 0);
});

test('operators can place labelled test orders that never enter totals or the CSV', async () => {
  const env = await testModeEnv();
  const sb = mockSupabase('topmaster.joseph@gmail.com');
  let order;
  try {
    const req = new Request('https://ekodi.kr/qtin/api/orders', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer tok' }, body: JSON.stringify(testOrderBody) });
    const res = await handleRequest(req, env, OPEN_NOW);
    assert.equal(res.status, 201);
    order = await res.json();
    assert.match(order.orderId, /^QTINTEST-/);
    assert.equal(order.clientKey, 'test_ck_abc');
  } finally { sb.restore(); }
  await env.DB.prepare("UPDATE qtin_orders SET status='paid' WHERE id=?").bind(order.orderId).run();
  const sb2 = mockSupabase('topmaster.joseph@gmail.com');
  try {
    const auth = { headers: { authorization: 'Bearer tok' } };
    const summary = await (await handleRequest(new Request('https://ekodi.kr/qtin/api/admin/campaigns/2026-12', auth), env, OPEN_NOW)).json();
    assert.ok(summary.orders.some(o => o.id === order.orderId), 'test order stays visible to admins');
    assert.equal((summary.byProduct || []).length, 0);
    assert.equal((summary.totals || []).length, 0);
    const csv = await (await handleRequest(new Request('https://ekodi.kr/qtin/api/admin/campaigns/2026-12/export.csv', auth), env, OPEN_NOW)).text();
    assert.ok(!csv.includes(order.orderId));
  } finally { sb2.restore(); }
});

// ---------- EKODIPAY-CORE-001: merchant (MID) switch ----------
test('after switching MID, new orders use the new merchant and old orders keep the original MID', async () => {
  const env = await openEnvWithProducts();
  const legacy = await pendingOrder(env);
  assert.doesNotMatch(legacy.orderId, /-m[a-z0-9]+-/);
  Object.assign(env, {
    EKODIPAY_MERCHANTS: JSON.stringify({ church: { label: '에코디교회', mid: 'q_church01', owner: '에코디교회' } }),
    EKODIPAY_PROFILE: 'church', TOSS_CLIENT_KEY__CHURCH: 'live_ck_ch', TOSS_SECRET_KEY__CHURCH: 'live_sk_ch',
  });
  const fresh = await pendingOrder(env);
  assert.match(fresh.orderId, /^QTIN-mchurch-/);
  assert.equal(fresh.clientKey, 'live_ck_ch');
  const seen = [];
  const toss = mockToss(async (url, init) => {
    seen.push(init.headers.authorization);
    const req = JSON.parse(init.body);
    return { body: { paymentKey: req.paymentKey, orderId: req.orderId, totalAmount: req.amount, status: 'DONE', method: '카드' } };
  });
  try {
    assert.equal((await confirmPayment(env, { paymentKey: 'pk_old', orderId: legacy.orderId, amount: legacy.amount }, OPEN_NOW)).ok, true);
    assert.equal((await confirmPayment(env, { paymentKey: 'pk_new', orderId: fresh.orderId, amount: fresh.amount }, OPEN_NOW)).ok, true);
  } finally { toss.restore(); }
  assert.deepEqual(seen, [`Basic ${btoa('live_sk_abc:')}`, `Basic ${btoa('live_sk_ch:')}`]);
});


// ---------- QTIN admin auth UX regressions ----------
function adminBrowser({ fragment = '', centralSession = null, fetchHandler = null } = {}) {
  const page = renderAdminPage('qtin-admin-test');
  const marker = '<script nonce="qtin-admin-test">';
  const start = page.lastIndexOf(marker);
  assert.ok(start > 0, 'admin inline bootstrap must be rendered');
  const code = page.slice(start + marker.length, page.indexOf('</script>', start));
  const elements = new Map();
  const element = () => ({
    textContent: '', innerHTML: '', value: '', className: '', href: '', style: {},
    children: [], append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; },
    addEventListener() {},
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: () => element(),
    querySelectorAll: () => [],
    head: { append(script) { if (typeof script.onload === 'function') script.onload(); } },
  };
  const google = { init: null, host: null };
  const window = { google: { accounts: { id: {
    initialize(options) { google.init = options; },
    renderButton(host) { google.host = host; },
  } } } };
  document.getElementById('campaign').value = '2026-11';
  const location = { hash: fragment, pathname: '/qtin/admin', search: '', origin: 'https://ekodi.kr', href: '' };
  const history = { cleaned: false, replaceState() { this.cleaned = true; location.hash = ''; } };
  const requests = [];
  const fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (fetchHandler) return fetchHandler(url, options);
    throw new Error('synthetic_network_failure');
  };
  const saved = new Map();
  const sessionStorage = { getItem: key => saved.get(key) || null, setItem(key, value) { saved.set(key, value); }, removeItem(key) { saved.delete(key); } };
  const localStorage = {
    getItem(key) { return key === 'sb-renzehysxirjilvdxacv-auth-token' && centralSession ? JSON.stringify(centralSession) : null; },
  };
  vm.runInNewContext(code, {
    document, window, location, history, fetch, sessionStorage, localStorage,
    AbortController, URL, URLSearchParams, setTimeout, clearTimeout,
  }, { timeout: 1000 });
  return { elements, location, history, requests, sessionStorage, google };
}

test('QTIN admin erases handoff tokens before network and shows a recoverable failure instead of spinning', async () => {
  const browser = adminBrowser({ fragment: '#ekodi_token=synthetic-one-time-code&ekodi_type=email' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(browser.history.cleaned, true, 'one-time hash must be erased before the network response');
  assert.equal(browser.location.hash, '');
  assert.match(browser.elements.get('state').textContent, /관리자 확인 실패/);
  assert.equal(browser.elements.get('adminLogin').hidden, false, 'login stays on the same page');
  assert.equal(browser.elements.get('adminWorkspace').hidden, true);
  assert.equal(browser.elements.get('adminAuthFallback').href, 'https://ekodi.kr/auth/?site=portal');
  assert.match(browser.elements.get('msg').textContent, /서버 연결에 실패/);
  assert.equal(browser.location.href, '', 'transient failure must not trigger a redirect loop');
});

test('QTIN admin reuses the same-origin central Supabase session and checks rights through the protected API', async () => {
  const bearer = 'synthetic-central-access-token';
  const browser = adminBrowser({
    centralSession: { access_token: bearer, refresh_token: 'synthetic-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 },
    fetchHandler: async url => {
      const data = String(url).endsWith('/campaigns')
        ? { me: { email: 'operator@example.test', canWrite: true, canRefund: false }, payment: { ready: false, missing: ['payments-disabled'] }, campaigns: [{ id: '2026-11', target_year: 2026, target_month: 11, state: 'closed' }] }
        : { campaign: { opens_at: '2026-10-19T15:00:00Z', closes_at: '2026-10-25T14:59:59Z', state: 'closed' }, byProduct: [], products: [], orders: [] };
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(browser.location.href, '', 'valid central session should not trigger a login redirect');
  assert.equal(browser.requests.length, 2, 'fetch campaign list and selected campaign');
  assert.equal(browser.requests[0].options.headers.authorization, 'Bearer ' + bearer);
  assert.equal(JSON.parse(browser.sessionStorage.getItem('ekodi-qtin-admin-session')).accessToken, bearer, 'operator-only test checkout must see the recovered session');
  assert.match(browser.elements.get('state').innerHTML, /operator@example.test/);
  assert.match(browser.elements.get('summary').innerHTML, /아직 결제 완료된 신청이 없습니다/);
  assert.equal(browser.elements.get('adminLogin').hidden, true);
  assert.equal(browser.elements.get('adminWorkspace').hidden, false);
});

test('serialised browser scripts survive wrangler esbuild keepNames (__name) without leaking a global', async () => {
  const { Script, createContext } = await import('node:vm');
  const { renderAdminPage, renderOrderPage: renderOrder, CLIENT_NAME_PRELUDE } = await import('../qtin-order-worker.js');
  const pages = [
    ['admin', renderAdminPage('n')],
    ['order', renderOrder({ campaign: { id: '2026-12', year: 2026, month: 12, state: 'open', opensAt: '', closesAt: '' }, products: [], payment: { ready: false } }, { org: 'church', scriptNonce: 'n' })],
  ];
  for (const [label, html] of pages) {
    const clientScripts = [...html.matchAll(/<script nonce="n">([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.includes('function'));
    assert.ok(clientScripts.length >= 1, `${label} must ship its client script`);
    for (const js of clientScripts) {
      assert.ok(js.startsWith(CLIENT_NAME_PRELUDE), `${label} client script lacks the private __name helper`);
      assert.ok(js.endsWith('();})();'), `${label} client script must close its isolated IIFE`);
      // Model the named-function annotation that esbuild keepNames inserts at build time.
      const bundled = js.replace(CLIENT_NAME_PRELUDE, `${CLIENT_NAME_PRELUDE}__name(function compiledMember(){}, "compiledMember");\nreturn;\n`);
      const context = createContext({});
      assert.doesNotThrow(() => new Script(bundled).runInContext(context, { timeout: 3000 }), `${label} throws once bundled`);
      assert.equal(context.__name, undefined, `${label} may not leak __name to global scope`);
    }
  }
});


// ---------- EKODI-QTIN-GOOGLE-CHECKOUT-004: anyone browses, Google sign-in to order ----------
test('anyone can browse, but an order without a Google-verified account is refused and nothing is stored', async () => {
  const env = await openEnvWithProducts();
  const page = await handleRequest(new Request('https://ekodi.kr/qtin/church'), env, OPEN_NOW);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.ok(html.includes('id="googleButton"') && html.includes('구글 로그인하고 신청'));
  assert.ok(html.includes('https://accounts.google.com/gsi/client'));
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /script-src[^;]*https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(csp, /frame-src[^;]*https:\/\/accounts\.google\.com\/gsi\//);
  const body = { campaignId: '2026-12', org: 'church', name: '홍길동', phone: '01012345678', privacyConsent: true, items: [{ productId: '2026-12:1719304225', quantity: 1 }] };
  for (const token of [null, 'forged-token']) {
    const res = await handleRequest(post('/qtin/api/orders', body, token), env, OPEN_NOW);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, 'login_required');
  }
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM qtin_orders').first()).n, 0);
  assert.equal((await handleRequest(new Request('https://ekodi.kr/qtin/api/me'), env)).status, 401);
});

test('a signed-in buyer is linked to the order, contact email defaults to Google, and details are remembered', async () => {
  const env = await openEnvWithProducts();
  const res = await handleRequest(post('/qtin/api/orders', { campaignId: '2026-12', org: 'mission', name: '김선교', phone: '010-2222-3333', email: '', department: '청년부', privacyConsent: true, items: [{ productId: '2026-12:1719304225', quantity: 2 }] }), env, OPEN_NOW);
  const order = await res.json();
  assert.equal(res.status, 201, JSON.stringify(order));
  assert.equal(order.customerEmail, 'buyer@gmail.com');
  const link = await env.DB.prepare('SELECT * FROM qtin_order_buyers WHERE order_id=?').bind(order.orderId).first();
  assert.equal(link.user_id, 'buyer-1');
  assert.equal(link.google_email, 'buyer@gmail.com');
  const me = await (await handleRequest(new Request('https://ekodi.kr/qtin/api/me', { headers: { authorization: 'Bearer buyer-token' } }), env)).json();
  assert.equal(me.account.email, 'buyer@gmail.com');
  assert.deepEqual(me.profile, { name: '김선교', phone: '010-2222-3333', email: 'buyer@gmail.com', department: '청년부', org: 'mission' });
  assert.equal(me.orders.length, 1);
  assert.equal(me.orders[0].id, order.orderId);
  assert.equal(me.orders[0].totalAmount, 9000);
  // A different contact email is kept as given and remembered for next month.
  const second = await (await handleRequest(post('/qtin/api/orders', { campaignId: '2026-12', org: 'mission', name: '김선교', phone: '010-2222-3333', email: 'family@example.com', privacyConsent: true, items: [{ productId: '2026-12:1719304225', quantity: 1 }] }), env, OPEN_NOW)).json();
  assert.equal(second.customerEmail, 'family@example.com');
  const again = await (await handleRequest(new Request('https://ekodi.kr/qtin/api/me', { headers: { authorization: 'Bearer buyer-token' } }), env)).json();
  assert.equal(again.profile.email, 'family@example.com');
  assert.equal(again.orders.length, 2);
});

test('the order page script runs signed out: it prepares in-page Google sign-in and keeps payment behind login', async () => {
  const { renderOrderPage: render, CLIENT_NAME_PRELUDE } = await import('../qtin-order-worker.js');
  const html = render({ campaign: { id: '2026-12', year: 2026, month: 12, state: 'open', opensAt: '', closesAt: '' }, products: [], payment: { ready: true } }, { org: 'church', scriptNonce: 'n' });
  const scripts = [...html.matchAll(/<script nonce="n">([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const elements = new Map();
  const el = id => { if (!elements.has(id)) elements.set(id, { id, hidden: false, disabled: false, value: '', textContent: '', innerHTML: '', style: {}, children: [], addEventListener() {}, replaceChildren() {}, scrollIntoView() {}, setAttribute() {} }); return elements.get(id); };
  const requests = [];
  const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
  const context = vm.createContext({
    document: { getElementById: el, querySelectorAll: () => [] },
    localStorage: store(), sessionStorage: store(), AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => { requests.push(String(url)); return new Response(JSON.stringify({ clientId: 'cid', nonce: 'nonce' }), { status: 201 }); },
  });
  context.window = context;
  context.window.google = { accounts: { id: { initialize(o) { context.initialized = o; }, renderButton() { context.rendered = true; } } } };
  for (const js of scripts) new vm.Script(js).runInContext(context, { timeout: 1000 });
  assert.ok(scripts.some(js => js.startsWith(CLIENT_NAME_PRELUDE)));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(requests.some(u => u.endsWith('/functions/v1/identity-api/challenge')), 'must request a Google sign-in challenge');
  assert.equal(context.initialized?.client_id, 'cid');
  assert.equal(context.initialized?.nonce, 'nonce');
  assert.equal(context.rendered, true);
  assert.equal(el('loginCta').hidden, false, 'signed-out visitors see the sign-in call to action');
  assert.equal(el('payCard').hidden, true, 'payment buttons stay hidden until sign-in');
  assert.equal(el('buyerForm').hidden, true);
});

// ---------- EKODI-QTIN-AFFILIATION-INTRO-005 ----------
test('book introduction is parsed from the QTM detail page without images or scripts', async () => {
  const { parseProductIntro } = await import('../qtin-order-core.js');
  const intro = parseProductIntro(PAGES['1719304225']);
  assert.equal(intro, '목차\n[큐티인(QTIN)(큰글씨) 2026년 12월호 목차]\n2 목차 | 고린도전서 3:1-15:22\n14 11월의 큐티\n책 속으로\n말씀으로 삶을 해석하고 나눕니다. (김정안)');
  assert.ok(!intro.includes('evil') && !intro.includes('.jpg') && !intro.includes('도서명'));
  // Heading fallback when the youngcart id is absent.
  assert.equal(parseProductIntro('<h3>상품 상세설명</h3><div><p>소개 A</p><p>소개 B</p></div><h3>상품 정보 고시</h3>'), '소개 A\n소개 B');
  assert.equal(parseProductIntro('<html>nothing</html>'), '');
});

test('cover click serves the stored book introduction; unknown items are refused', async () => {
  const env = await openEnvWithProducts();
  const stored = await env.DB.prepare('SELECT intro FROM qtin_product_intros WHERE qtm_item_id=?').bind('1719304225').first();
  assert.ok(stored?.intro.startsWith('목차'), 'sync must keep the introduction');
  const res = await handleRequest(new Request('https://ekodi.kr/qtin/api/products/1719304225/intro'), env, OPEN_NOW);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.name, '큐티인(QTIN)(큰글씨) 2026년 12월호');
  assert.equal(data.productUrl, 'https://www.qtm.or.kr/shop/1719304225');
  assert.match(data.intro, /책 속으로/);
  assert.equal((await handleRequest(new Request('https://ekodi.kr/qtin/api/products/1800000000/intro'), env, OPEN_NOW)).status, 404, 'only listed books');
  const page = await (await handleRequest(new Request('https://ekodi.kr/qtin'), env, OPEN_NOW)).text();
  assert.ok(page.includes('data-intro="1719304225"') && page.includes('<dialog id="intro"'));
});

test('affiliation is chosen in the purchase form: 에코디교회, 에코디선교회 or 기타 (with a name)', async () => {
  const env = await openEnvWithProducts();
  const page = await (await handleRequest(new Request('https://ekodi.kr/qtin/mission'), env, OPEN_NOW)).text();
  const form = page.slice(page.indexOf('id="buyerForm"'));
  for (const value of ['church', 'mission', 'other']) assert.ok(form.includes(`name="org" value="${value}"`), value);
  assert.ok(form.includes('value="mission" checked'), 'path preselects the affiliation');
  assert.ok(!page.includes('class="org" data-org'), 'the old top-of-page organisation buttons are gone');
  const base = { campaignId: '2026-12', org: 'other', name: '이웃', phone: '010-5555-6666', privacyConsent: true, items: [{ productId: '2026-12:1719304225', quantity: 1 }] };
  const missing = await handleRequest(post('/qtin/api/orders', base), env, OPEN_NOW);
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /소속 교회·단체 이름/);
  const ok = await handleRequest(post('/qtin/api/orders', { ...base, department: '무안제일교회' }), env, OPEN_NOW);
  const order = await ok.json();
  assert.equal(ok.status, 201, JSON.stringify(order));
  const row = await env.DB.prepare('SELECT org, department FROM qtin_orders WHERE id=?').bind(order.orderId).first();
  assert.deepEqual({ ...row }, { org: 'other', department: '무안제일교회' });
  await env.DB.prepare("UPDATE qtin_orders SET status='paid' WHERE id=?").bind(order.orderId).run();
  const sb = mockSupabase('topmaster.joseph@gmail.com');
  try {
    const summary = await (await handleRequest(new Request('https://ekodi.kr/qtin/api/admin/campaigns/2026-12', { headers: { authorization: 'Bearer tok' } }), env, OPEN_NOW)).json();
    assert.ok(summary.byProduct.some(r => r.org === 'other' && Number(r.qty) === 1), 'admin order counts include 기타');
    const csv = await (await handleRequest(new Request('https://ekodi.kr/qtin/api/admin/campaigns/2026-12/export.csv', { headers: { authorization: 'Bearer tok' } }), env, OPEN_NOW)).text();
    assert.ok(csv.includes(',기타,이웃,'));
  } finally { sb.restore(); }
});

test('real payment turns on by registering live keys as Worker secrets, overriding the test key in config', async () => {
  const { readiness } = await import('../ekodipay-core.js');
  const configured = { PAYMENTS_ENABLED: 'true', TOSS_CLIENT_KEY: 'test_ck_cfg' };
  const testOnly = readiness({ ...configured, TOSS_SECRET_KEY: 'test_sk_x' });
  assert.equal(testOnly.publicReady, false);
  const live = readiness({ ...configured, TOSS_CLIENT_KEY__EKODI: 'live_ck_real', TOSS_SECRET_KEY__EKODI: 'live_sk_real' });
  assert.equal(live.mode, 'live');
  assert.equal(live.publicReady, true, 'any signed-in buyer can pay for real');
  assert.equal(readiness({ ...configured, TOSS_SECRET_KEY__EKODI: 'live_sk_real' }).ready, false, 'a live secret with the test client key is a mode mismatch');
  const env = await openEnvWithProducts({ TOSS_CLIENT_KEY: 'test_ck_cfg', TOSS_SECRET_KEY: '', TOSS_CLIENT_KEY__EKODI: 'live_ck_real', TOSS_SECRET_KEY__EKODI: 'live_sk_real' });
  const res = await handleRequest(post('/qtin/api/orders', { campaignId: '2026-12', org: 'church', name: '홍길동', phone: '01012345678', privacyConsent: true, items: [{ productId: '2026-12:1719304225', quantity: 1 }] }), env, OPEN_NOW);
  const order = await res.json();
  assert.equal(res.status, 201, JSON.stringify(order));
  assert.equal(order.clientKey, 'live_ck_real');
  assert.match(order.orderId, /^QTIN-/, 'real orders are not test orders');
});

// ---------- EKODI-QTIN-TOSS-WIDGET-006: 결제위젯 연동 키(gck/gsk)로도 실결제 ----------
test('widget keys (live_gck/live_gsk) open real checkout through the Toss payment widget; mixed key types stay closed', async () => {
  const { readiness } = await import('../ekodipay-core.js');
  const base = { PAYMENTS_ENABLED: 'true', TOSS_CLIENT_KEY: 'test_ck_cfg' };
  const widget = readiness({ ...base, TOSS_CLIENT_KEY__EKODI: 'live_gck_real', TOSS_SECRET_KEY__EKODI: 'live_gsk_real' });
  assert.equal(widget.publicReady, true);
  assert.equal(widget.widget, true);
  const api = readiness({ ...base, TOSS_CLIENT_KEY__EKODI: 'live_ck_real', TOSS_SECRET_KEY__EKODI: 'live_sk_real' });
  assert.equal(api.publicReady, true);
  assert.equal(api.widget, false);
  for (const [ck, sk] of [['live_gck_a', 'live_sk_b'], ['live_ck_a', 'live_gsk_b']]) {
    const mixed = readiness({ ...base, TOSS_CLIENT_KEY__EKODI: ck, TOSS_SECRET_KEY__EKODI: sk });
    assert.equal(mixed.ready, false, `${ck}+${sk}`);
    assert.ok(mixed.missing.includes('key-type-mismatch'));
  }
  const env = await openEnvWithProducts({ TOSS_CLIENT_KEY: 'test_ck_cfg', TOSS_SECRET_KEY: '', TOSS_CLIENT_KEY__EKODI: 'live_gck_real', TOSS_SECRET_KEY__EKODI: 'live_gsk_real' });
  const cat = await (await handleRequest(new Request('https://ekodi.kr/qtin/api/catalog'), env, OPEN_NOW)).json();
  assert.equal(cat.payment.ready, true);
  assert.equal(cat.payment.widget, true);
  const page = await (await handleRequest(new Request('https://ekodi.kr/qtin/church'), env, OPEN_NOW)).text();
  assert.ok(page.includes('id="paymentMethods"') && page.includes('id="agreement"') && page.includes('"widget":true'));
  // The widget renders the 'qtin' payment UI (→ 큐티인 MID q_ekodib62hb), not the DEFAULT UI.
  assert.ok(page.includes("variantKey: data.widgetVariant || 'qtin'"));
  assert.ok(!page.includes("variantKey: 'DEFAULT'"));
  const res = await handleRequest(post('/qtin/api/orders', { campaignId: '2026-12', org: 'church', name: '홍길동', phone: '01012345678', privacyConsent: true, items: [{ productId: '2026-12:1719304225', quantity: 1 }] }), env, OPEN_NOW);
  const order = await res.json();
  assert.equal(res.status, 201, JSON.stringify(order));
  assert.equal(order.clientKey, 'live_gck_real');
  assert.equal(order.widgetVariant, 'qtin');
  assert.ok(!JSON.stringify(order).includes('gsk'), 'the widget secret key never reaches the browser');
  // Confirmation uses the widget secret key server-side.
  const token = new URL(order.successUrl).searchParams.get('t');
  const toss = mockToss(async (url, init) => {
    assert.equal(init.headers.authorization, `Basic ${btoa('live_gsk_real:')}`);
    const req = JSON.parse(init.body);
    return { body: { paymentKey: req.paymentKey, orderId: req.orderId, totalAmount: req.amount, status: 'DONE', method: '간편결제' } };
  });
  try {
    const done = await handleRequest(new Request(`https://ekodi.kr/qtin/payment/success?t=${token}&paymentKey=pk_w1&orderId=${order.orderId}&amount=${order.amount}`), env, OPEN_NOW);
    assert.equal(done.status, 200);
  } finally { toss.restore(); }
  assert.equal((await env.DB.prepare('SELECT status FROM qtin_orders WHERE id=?').bind(order.orderId).first()).status, 'paid');
});

// ---------- EKODI-QTIN-KEY-DIAGNOSTICS-008 ----------
test('quoted or space-padded dashboard keys are cleaned; diagnostics show shape, never the value', async () => {
  const { cleanKey, readiness, keyDiagnostics } = await import('../ekodipay-core.js');
  assert.equal(cleanKey('"live_ck_ABC123"'), 'live_ck_ABC123');
  assert.equal(cleanKey(" 'live_ck_ABC123'\n"), 'live_ck_ABC123');
  assert.equal(cleanKey('LIVE_CK_ABC'), 'LIVE_CK_ABC', 'case is preserved');
  const env = { PAYMENTS_ENABLED: 'true', TOSS_CLIENT_KEY: 'test_ck_cfg', TOSS_CLIENT_KEY__EKODI: '"live_ck_RealClient01"', TOSS_SECRET_KEY__EKODI: 'live_sk_RealSecret99 ' };
  const ready = readiness(env);
  assert.equal(ready.publicReady, true, 'quotes no longer block real checkout');
  assert.equal(ready.mode, 'live');
  const d = keyDiagnostics(env);
  assert.deepEqual(d.client, { binding: 'TOSS_CLIENT_KEY__EKODI', present: true, prefix: 'live_ck_', length: 20, ok: true, issues: ['quotes-removed'] });
  assert.equal(d.secret.ok, true);
  assert.ok(!JSON.stringify(d).includes('RealClient01') && !JSON.stringify(d).includes('RealSecret99'), 'never reveal key material');
  assert.deepEqual(keyDiagnostics({ TOSS_CLIENT_KEY__EKODI: 'LIVE_CK_x' }).client.issues, ['uppercase-prefix']);
  assert.deepEqual(keyDiagnostics({ TOSS_CLIENT_KEY__EKODI: 'live_sk_x' }).client.issues, ['secret-key-in-client-slot']);
  assert.deepEqual(keyDiagnostics({ TOSS_CLIENT_KEY: 'test_ck_cfg' }).client.binding, 'TOSS_CLIENT_KEY', 'reports the config fallback');
  // Operators see diagnostics in the admin API; key material never appears.
  const appEnv = await openEnvWithProducts({ TOSS_CLIENT_KEY: 'test_ck_cfg', TOSS_SECRET_KEY: '', TOSS_CLIENT_KEY__EKODI: 'live_ckBROKEN', TOSS_SECRET_KEY__EKODI: 'live_sk_RealSecret99' });
  const sb = mockSupabase('topmaster.joseph@gmail.com');
  try {
    const res = await handleRequest(new Request('https://ekodi.kr/qtin/api/admin/campaigns', { headers: { authorization: 'Bearer tok' } }), appEnv, OPEN_NOW);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.payment.missing.includes('toss-client-key'));
    assert.equal(body.keys.client.ok, false);
    assert.ok(body.keys.client.issues.includes('no-prefix'));
    assert.ok(!JSON.stringify(body).includes('RealSecret99') && !JSON.stringify(body).includes('BROKEN'));
  } finally { sb.restore(); }
});

// ---------- EKODI-QTIN-WIDGET-MODAL-009 ----------
test('payment widget opens non-modal so the window Toss opens on requestPayment stays usable; Toss domains allowed', async () => {
  const env = await openEnvWithProducts({ TOSS_CLIENT_KEY: 'test_ck_cfg', TOSS_SECRET_KEY: '', TOSS_CLIENT_KEY__EKODI: 'live_gck_real', TOSS_SECRET_KEY__EKODI: 'live_gsk_real' });
  const page = await handleRequest(new Request('https://ekodi.kr/qtin/church'), env, OPEN_NOW);
  const html = await page.text();
  const widgetCode = html.slice(html.indexOf('async function openWidget'), html.indexOf('async function pay('));
  assert.ok(widgetCode.length > 0);
  assert.ok(!widgetCode.includes('showModal'), 'a modal dialog makes the Toss payment window inert');
  assert.ok(widgetCode.includes('dialog.show()'));
  assert.ok(html.includes('id="payBackdrop"'));
  const csp = page.headers.get('content-security-policy');
  for (const directive of ['frame-src', 'connect-src', 'form-action']) {
    assert.match(csp, new RegExp(`${directive}[^;]*https://\\*\\.toss\\.im`), directive);
  }
});

test('widget variantKey is configurable, defaults to qtin and rejects malformed values', async () => {
  const { widgetVariantKey } = await import('../qtin-order-worker.js');
  assert.equal(widgetVariantKey({}), 'qtin');
  assert.equal(widgetVariantKey({ TOSS_WIDGET_VARIANT: ' qtin ' }), 'qtin');
  assert.equal(widgetVariantKey({ TOSS_WIDGET_VARIANT: 'church-ui' }), 'church-ui');
  assert.equal(widgetVariantKey({ TOSS_WIDGET_VARIANT: "x'+alert(1)+'" }), 'qtin');
  const toml = await readFile(new URL('../wrangler.qtin-order.toml', import.meta.url), 'utf8');
  assert.match(toml, /^TOSS_WIDGET_VARIANT = "qtin"$/m);
});

test('delivery: church pickup stays free; parcel adds the fixed shipping fee and requires an address', async () => {
  const pickup = buildOrderDraft(VALID, PRODUCTS);
  assert.equal(pickup.draft.delivery.method, 'pickup');
  assert.equal(pickup.draft.totalAmount, 3600 * 2 + 4500);
  const parcelBody = { ...VALID, delivery: { method: 'parcel', postalCode: '58554', address1: '전남 무안군 청계면 테스트로 1', address2: '101호' } };
  const parcel = buildOrderDraft(parcelBody, PRODUCTS);
  assert.equal(parcel.ok, true, JSON.stringify(parcel.errors));
  assert.equal(parcel.draft.delivery.shippingFee, 3000);
  assert.equal(parcel.draft.booksAmount, 3600 * 2 + 4500);
  assert.equal(parcel.draft.totalAmount, 3600 * 2 + 4500 + 3000);
  assert.equal(parcel.draft.delivery.recipientName, '홍길동', 'recipient defaults to the applicant');
  assert.equal(parcel.draft.delivery.recipientPhone, '010-1234-5678');
  for (const [d, needle] of [[{ postalCode: '123' }, '우편번호'], [{ address1: '' }, '주소'], [{ recipientPhone: '02-1' }, '받는 분 휴대전화']]) {
    const bad = buildOrderDraft({ ...parcelBody, delivery: { ...parcelBody.delivery, ...d } }, PRODUCTS);
    assert.equal(bad.ok, false); assert.ok(bad.errors.some(e => e.includes(needle)), `${needle}: ${bad.errors}`);
  }
  // A client cannot dictate the fee: an unknown method falls back to free church pickup.
  assert.equal(buildOrderDraft({ ...VALID, delivery: { method: 'express', shippingFee: 0 } }, PRODUCTS).draft.delivery.method, 'pickup');

  const env = await openEnvWithProducts();
  const res = await handleRequest(post('/qtin/api/orders', { campaignId: '2026-12', org: 'church', name: '홍길동', phone: '01012345678', privacyConsent: true,
    delivery: { method: 'parcel', recipientName: '김받음', postalCode: '58554', address1: '전남 무안군 청계면 테스트로 1' },
    items: [{ productId: '2026-12:1719304225', quantity: 1 }] }), env, OPEN_NOW);
  const order = await res.json();
  assert.equal(res.status, 201, JSON.stringify(order));
  const row = env.DB.raw.prepare('SELECT o.total_amount, d.method, d.shipping_fee, d.recipient_name, d.postal_code FROM qtin_orders o JOIN qtin_order_delivery d ON d.order_id=o.id WHERE o.id=?').get(order.orderId);
  assert.equal(row.method, 'parcel'); assert.equal(row.shipping_fee, 3000); assert.equal(row.recipient_name, '김받음'); assert.equal(row.postal_code, '58554');
  assert.equal(order.amount, row.total_amount);
  const page = await (await handleRequest(new Request('https://ekodi.kr/qtin/church'), env, OPEN_NOW)).text();
  assert.ok(page.includes('id="delParcel"') && page.includes('"shippingFee":3000') && page.includes('id="postalCode"'));
});


test('QTIN admin completes Google sign-in on its own page using central identity API and server role', async () => {
  const browser = adminBrowser({
    fetchHandler: async (url, options) => {
      const path = String(url);
      const payload = options?.body ? JSON.parse(options.body) : {};
      if (path.endsWith('/identity-api/google/exchange')) {
        assert.equal(payload.credential, 'synthetic-google-proof');
        assert.equal(payload.nonce, 'nonce-synthetic');
      }
      if (path.endsWith('/auth/v1/verify')) assert.equal(payload.token_hash, 'synthetic-one-use');
      const data = path.endsWith('/identity-api/challenge') ? { clientId: 'synthetic.apps.googleusercontent.com', nonce: 'nonce-synthetic' }
        : path.endsWith('/identity-api/google/exchange') ? { tokenHash: 'synthetic-one-use', type: 'email' }
        : path.endsWith('/auth/v1/verify') ? { access_token: 'synthetic-admin-token', refresh_token: 'synthetic-refresh', expires_in: 3600 }
        : path.endsWith('/campaigns') ? { me: { email: 'operator@example.test', canWrite: true, canRefund: false }, payment: { ready: false, missing: ['payments-disabled'] }, campaigns: [{ id: '2026-11', target_year: 2026, target_month: 11, state: 'open' }] }
        : { campaign: { opens_at: '2026-10-19T15:00:00Z', closes_at: '2026-10-25T14:59:59Z', state: 'open' }, byProduct: [], products: [], orders: [] };
      return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(browser.location.href, '');
  assert.equal(browser.elements.get('adminLogin').hidden, false);
  assert.equal(browser.elements.get('adminWorkspace').hidden, true);
  assert.equal(browser.google.init.client_id, 'synthetic.apps.googleusercontent.com');
  assert.ok(browser.google.host, 'the Google button is rendered within QTIN admin');
  await browser.google.init.callback({ credential: 'synthetic-google-proof' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(browser.location.href, '', 'do not navigate away to a church site');
  assert.equal(browser.elements.get('adminLogin').hidden, true);
  assert.equal(browser.elements.get('adminWorkspace').hidden, false);
  assert.equal(JSON.parse(browser.sessionStorage.getItem('ekodi-qtin-admin-session')).accessToken, 'synthetic-admin-token');
  assert.equal(browser.requests.find(r => r.url.endsWith('/campaigns')).options.headers.authorization, 'Bearer synthetic-admin-token');
  assert.match(browser.elements.get('state').innerHTML, /operator@example.test/);
});

test('QTIN in-page Google login never exposes orders after an admin 403 response', async () => {
  const browser = adminBrowser({
    fetchHandler: async url => {
      const path = String(url);
      const data = path.endsWith('/identity-api/challenge') ? { clientId: 'synthetic.apps.googleusercontent.com', nonce: 'nonce-synthetic' }
        : path.endsWith('/identity-api/google/exchange') ? { tokenHash: 'synthetic-one-use', type: 'email' }
        : path.endsWith('/auth/v1/verify') ? { access_token: 'synthetic-member-token', expires_in: 3600 }
        : { error: '큐티인 신청 관리 권한이 없습니다.' };
      const status = path.endsWith('/campaigns') ? 403 : 200;
      return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  await browser.google.init.callback({ credential: 'synthetic-google-proof' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(browser.elements.get('adminLogin').hidden, false);
  assert.equal(browser.elements.get('adminWorkspace').hidden, true);
  assert.match(browser.elements.get('state').textContent, /권한 없음/);
  assert.match(browser.elements.get('adminAuthMessage').textContent, /관리자 권한이 없습니다/);
});
