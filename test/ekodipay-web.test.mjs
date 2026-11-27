import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleWebPay, webPayReadiness, projectCards, safeCheckoutUrl, settlementProjection } from '../ekodipay-web-core.js';
import worker from '../ekodipay-worker.js';
import { webPayClientSource } from '../ekodipay-web-page.js';

const ORIGIN = 'https://ekodi.kr';
const ROOT = ORIGIN + '/ekodipay/api/web';
const hash = async v => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))].map(v => v.toString(16).padStart(2, '0')).join('');
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('../migrations/202611270900_ekodipay_web.sql', import.meta.url), 'utf8'));
  return {
    sqlite,
    prepare(sql) {
      const s = sqlite.prepare(sql);
      return { bind(...params) {
        return {
          async first() { return s.get(...params) || null; },
          async all() { return { results: s.all(...params) }; },
          async run() { return { meta: { changes: s.run(...params).changes } }; },
        };
      } };
    },
  };
}
function fixture() {
  const db = database();
  const order = {
    allowed: true, delegationAllowed: true, userId: 'person:buyer', service: 'mall',
    orderId: 'ORDER-123', workspaceId: 'workspace-1', profileId: 'mall',
    status: 'awaiting_payment', currency: 'KRW', amount: 27000, revision: 'revision-1', merchantName: '테스트 상점',
  };
  const calls = [];
  const env = {
    EKODIPAY_WEB_ENABLED: 'true', EKODIPAY_WEB_DB: db,
    EKODIPAY_BRANDPAY_APPROVED: 'true', EKODIPAY_BRANDPAY_MID: 'merchant-test',
    EKODIPAY_BRANDPAY_CLIENT_KEY: 'test_ck_fixture', EKODIPAY_BRANDPAY_SECRET_KEY: 'test_sk_fixture',
    EKODIPAY_DELEGATED_APPROVED: 'true',
    EKODIPAY_ORDER_SERVICE: {
      async sellerWorkspaces({ userId }) { return { userId, workspaces: [{ id: 'workspace-1', name: '테스트 매장', accountingAllowed: true }] }; },
      async authorizePaymentRequest(input) { calls.push({ op: 'authorize', ...input }); return { ...order }; },
      async createDelegatedCheckout(input) {
        calls.push({ op: 'checkout', ...input });
        return { ...input, allowed: true, checkoutUrl: ORIGIN + '/ekodimall/checkout?orderId=' + input.orderId,
          usesPayerCredentials: true, orderOwnerChanged: false };
      },
      async sellerSettlementReport(input) { return {
        authorization: { allowed: true, userId: input.userId, workspaceId: input.workspaceId },
        source: 'fixture-only', fetchedAt: new Date().toISOString(), rows: [], complete: true,
      }; },
    },
  };
  return { db, env, order, calls };
}
function request(path, data, { user = 'person:buyer', origin = ORIGIN, headers = {}, method } = {}) {
  return new Request(ROOT + path, {
    method: method || (data === undefined ? 'GET' : 'POST'),
    headers: { origin, authorization: 'Bearer ' + user, ...(data === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
const auth = async req => {
  const value = req.headers.get('authorization')?.slice(7);
  return value && value !== 'anonymous' ? { id: value } : null;
};
const call = (env, path, data, options, network) => handleWebPay(request(path, data, options), env, { authenticate: auth, network });
async function createLink(f) {
  const r = await call(f.env, '/requests', { service: 'mall', orderId: f.order.orderId });
  assert.equal(r.status, 201);
  const value = await r.json();
  return { ...value, token: new URL(value.url).hash.slice(1) };
}

test('default production extension remains disabled; existing checkout keys never enable card vault', () => {
  const r = webPayReadiness();
  assert.equal(r.cardRegistration, false); assert.equal(r.delegatedPayment, false);
  assert.equal(r.sellerReports, false); assert.equal(r.paymentExecution, false); assert.equal(r.payoutExecution, false);
  const f = fixture();
  assert.equal(webPayReadiness(f.env).cardRegistration, true);
  assert.equal(webPayReadiness({ ...f.env, EKODIPAY_BRANDPAY_SECRET_KEY: 'live_sk_mixed' }).cardRegistration, false);
  assert.equal(webPayReadiness({ ...f.env, EKODIPAY_BRANDPAY_APPROVED: 'false' }).cardRegistration, false);
  assert.equal(webPayReadiness({ ...f.env, EKODIPAY_BRANDPAY_CLIENT_KEY: '', TOSS_CLIENT_KEY: 'live_ck_general' }).cardRegistration, false);
  f.db.sqlite.close();
});
test('anonymous, foreign origin, unsupported raw card fields and direct payouts are denied', async () => {
  const f = fixture();
  assert.equal((await call(f.env, '/wallet', undefined, { user: 'anonymous' })).status, 401);
  assert.equal((await call(f.env, '/wallet/start', {}, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await call(f.env, '/wallet/start', { cardNumber: '4111111111111111' })).status, 400);
  assert.equal((await call(f.env, '/wallet/start', {}, { headers: { 'content-type': 'text/plain' } })).status, 415);
  for (const path of ['/charge', '/confirm', '/payout', '/refund']) assert.equal((await call(f.env, path, {})).status, 404);
  assert.equal((await call({}, '/wallet')).status, 503);
  f.db.sqlite.close();
});
test('card registration is user/MID scoped and uses opaque ids and secure callback cookie', async () => {
  const f = fixture();
  const r = await call(f.env, '/wallet/start', {});
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Strict/);
  assert.match(r.headers.get('set-cookie'), /Path=\/ekodipay\/api\/web\/brandpay\/callback/);
  const config = await r.json();
  assert.match(config.customerKey, /^[0-9a-f-]{36}$/);
  assert.doesNotMatch(JSON.stringify(config), /person:buyer|test_sk|refreshToken|accessToken/);
  assert.equal((await (await call(f.env, '/wallet/start', {})).json()).customerKey, config.customerKey);
  assert.notEqual((await (await call(f.env, '/wallet/start', {}, { user: 'person:other' })).json()).customerKey, config.customerKey);
  const otherMid = { ...f.env, EKODIPAY_BRANDPAY_MID: 'other-mid' };
  assert.notEqual((await (await call(otherMid, '/wallet/start', {})).json()).customerKey, config.customerKey);
  f.db.sqlite.close();
});
async function callbackFixture(f) {
  const started = await call(f.env, '/wallet/start', {});
  const config = await started.json();
  const url = new URL(config.redirectUrl);
  url.searchParams.set('code', 'opaque-provider-code');
  url.searchParams.set('customerKey', config.customerKey);
  const headers = { cookie: started.headers.get('set-cookie').split(';')[0], 'sec-fetch-site': 'same-origin' };
  return { url, headers, config };
}
test('OAuth rejects wrong customer, missing session, wrong state, wrong origin and replay before provider call', async () => {
  const f = fixture(), cb = await callbackFixture(f);
  let networkCalls = 0;
  const network = async (url, init) => {
    networkCalls++;
    assert.equal(url, 'https://api.tosspayments.com/v1/brandpay/authorizations/access-token');
    assert.equal(JSON.parse(init.body).customerKey, cb.config.customerKey);
    return Response.json({ accessToken: 'never-return-access', refreshToken: 'never-return-refresh' });
  };
  const invoke = (url = cb.url, headers = cb.headers) => handleWebPay(new Request(url, { headers }), f.env, { network });
  const wrong = new URL(cb.url); wrong.searchParams.set('customerKey', 'another-customer');
  assert.equal((await invoke(wrong)).status, 403);
  assert.equal((await invoke(cb.url, { 'sec-fetch-site': 'same-origin' })).status, 401);
  assert.equal((await invoke(cb.url, { ...cb.headers, 'sec-fetch-site': 'cross-site' })).status, 403);
  const state = new URL(cb.url); state.searchParams.set('state', 'a'.repeat(64));
  assert.equal((await invoke(state)).status, 409);
  assert.equal(networkCalls, 0);
  const ok = await invoke();
  assert.equal(ok.status, 200); assert.equal(await ok.text(), '');
  assert.match(ok.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await invoke()).status, 409);
  assert.equal(networkCalls, 1);
  const dbText = JSON.stringify(f.db.sqlite.prepare('SELECT * FROM ekodipay_web_registration').all());
  assert.doesNotMatch(dbText, /opaque-provider-code|never-return-access|never-return-refresh/);
  f.db.sqlite.close();
});
test('OAuth timeout is never blindly replayed or reported as completion', async () => {
  const f = fixture(), cb = await callbackFixture(f);
  let calls = 0;
  const network = async () => { calls++; throw new Error('ambiguous'); };
  const invoke = () => handleWebPay(new Request(cb.url, { headers: cb.headers }), f.env, { network });
  assert.equal((await invoke()).status, 503);
  assert.equal((await invoke()).status, 409);
  assert.equal(calls, 1);
  assert.equal(f.db.sqlite.prepare('SELECT status FROM ekodipay_web_registration').get().status, 'exchanging');
  f.db.sqlite.close();
});
test('wallet returns only masked own cards; provider and SQL errors stay private', async () => {
  const f = fixture();
  assert.deepEqual(await (await call(f.env, '/wallet')).json(), { cards: [], registrationRequired: true });
  const registration = await (await call(f.env, '/wallet/start', {})).json();
  const network = async url => {
    assert.ok(url.endsWith('/' + registration.customerKey));
    return Response.json({ cards: [{ status: 'ENABLED', cardName: '테스트카드', cardNumber: '4111111111119876',
      methodKey: 'private-method', cardType: '신용' }], accessToken: 'private-token' });
  };
  const result = await (await call(f.env, '/wallet', undefined, undefined, network)).json();
  assert.deepEqual(result.cards, [{ label: '테스트카드', last4: '9876', type: '신용' }]);
  assert.doesNotMatch(JSON.stringify(result), /411111|private-method|private-token/);
  assert.equal(projectCards({ cards: [{ status: 'DISABLED', cardNumber: '1234' }] }).length, 0);
  const broken = async () => { throw Object.assign(new Error('SECRET-PAYLOAD'), { code: 'SECRET-PAYLOAD', status: 401 }); };
  const error = await call(f.env, '/wallet', undefined, undefined, broken);
  assert.equal(error.status, 503); assert.deepEqual(await error.json(), { code: 'SERVICE_UNAVAILABLE' });
  f.db.sqlite.close();
});
test('delegated links have server-owned amounts, short expiry, one active invitation and hashed tokens', async () => {
  const f = fixture();
  assert.equal((await call(f.env, '/requests', { service: 'mall', orderId: 'ORDER-123', amount: 1 })).status, 400);
  const link = await createLink(f);
  assert.match(link.token, /^[a-f0-9]{64}$/);
  assert.equal(new URL(link.url).search, '');
  assert.ok(Date.parse(link.expiresAt) - Date.now() <= 900000);
  const stored = f.db.sqlite.prepare('SELECT * FROM ekodipay_web_requests').get();
  assert.equal(stored.token_hash, await hash(link.token));
  assert.ok(!JSON.stringify(stored).includes(link.token));
  assert.equal(stored.amount, 27000);
  assert.equal((await call(f.env, '/requests', { service: 'mall', orderId: 'ORDER-123' })).status, 409);
  assert.equal(f.calls.filter(x => x.op === 'checkout').length, 0);
  f.db.sqlite.close();
});
test('source service must verify the requester, original order and delegation approval', async () => {
  const f = fixture();
  for (const patch of [{ allowed: false }, { userId: 'person:other' }, { service: 'books' }, { status: 'paid' },
    { currency: 'USD' }, { amount: -1 }, { amount: 10.5 }, { profileId: '' }, { delegationAllowed: false }]) {
    const old = { ...f.order }; Object.assign(f.order, patch);
    assert.equal((await call(f.env, '/requests', { service: 'mall', orderId: 'ORDER-123' })).status, 409);
    Object.assign(f.order, old);
  }
  f.db.sqlite.close();
});
test('link inspection discloses only merchant and amount, never authorizes payment', async () => {
  const f = fixture(), link = await createLink(f);
  const r = await call(f.env, '/requests/inspect', { token: link.token }, { user: 'person:payer' });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.amount, 27000);
  assert.doesNotMatch(JSON.stringify(data), /person:buyer|customerKey|address|methodKey|paymentKey/);
  assert.equal(f.calls.filter(x => x.op === 'checkout').length, 0);
  f.db.sqlite.close();
});
test('changed order, paid order and expired requests cannot be accepted', async () => {
  const f = fixture(), link = await createLink(f);
  f.order.amount = 28000;
  assert.equal((await call(f.env, '/requests/accept', { token: link.token, consent: true })).status, 409);
  f.order.amount = 27000; f.order.status = 'paid';
  assert.equal((await call(f.env, '/requests/accept', { token: link.token, consent: true })).status, 409);
  f.order.status = 'awaiting_payment';
  f.db.sqlite.prepare("UPDATE ekodipay_web_requests SET expires_at='2000-01-01T00:00:00.000Z'").run();
  assert.equal((await call(f.env, '/requests/accept', { token: link.token, consent: true })).status, 410);
  assert.equal(f.calls.filter(x => x.op === 'checkout').length, 0);
  f.db.sqlite.close();
});
test('only requester can cancel an unclaimed invitation', async () => {
  const f = fixture(), link = await createLink(f);
  assert.equal((await call(f.env, '/requests/cancel', { id: link.id }, { user: 'person:other' })).status, 409);
  assert.equal((await call(f.env, '/requests/cancel', { id: link.id })).status, 200);
  assert.equal((await call(f.env, '/requests/inspect', { token: link.token })).status, 410);
  f.db.sqlite.close();
});
test('payer explicitly consents, is atomically bound, and receives own source checkout only', async () => {
  const f = fixture(), link = await createLink(f);
  assert.equal((await call(f.env, '/requests/accept', { token: link.token, consent: false })).status, 400);
  const input = { token: link.token, consent: true }, who = { user: 'person:payer' };
  const r = await call(f.env, '/requests/accept', input, who);
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.paymentCompleted, false); assert.equal(data.status, 'claimed');
  assert.match(data.checkoutUrl, /^https:\/\/ekodi.kr\/ekodimall\//);
  assert.equal(f.calls.find(x => x.op === 'checkout').userId, 'person:payer');
  assert.equal(f.calls.find(x => x.op === 'checkout').requesterId, 'person:buyer');
  assert.equal((await call(f.env, '/requests/accept', input, { user: 'person:intruder' })).status, 409);
  assert.equal((await call(f.env, '/requests/cancel', { id: link.id })).status, 409);
  // Same payer repeats with the identical idempotent request id.
  assert.equal((await call(f.env, '/requests/accept', input, who)).status, 200);
  assert.equal(new Set(f.calls.filter(x => x.op === 'checkout').map(x => x.requestId)).size, 1);
  f.db.sqlite.close();
});
test('untrusted external checkout, buyer credentials or changed order ownership fail closed', async () => {
  for (const patch of [{ checkoutUrl: 'https://evil.test/pay' }, { usesPayerCredentials: false },
    { orderOwnerChanged: true }, { userId: 'person:buyer' }]) {
    const f = fixture(), link = await createLink(f);
    const original = f.env.EKODIPAY_ORDER_SERVICE.createDelegatedCheckout;
    f.env.EKODIPAY_ORDER_SERVICE.createDelegatedCheckout = async input => ({ ...await original(input), ...patch });
    assert.equal((await call(f.env, '/requests/accept', { token: link.token, consent: true }, { user: 'person:payer' })).status, 502);
    f.db.sqlite.close();
  }
  for (const url of ['https://evil.test/ekodimall/', ORIGIN + '/admin/', ORIGIN + '/ekodimall/?amount=1',
    ORIGIN + '/ekodimall/?paymentKey=secret', ORIGIN + '/ekodimall/%2fadmin', 'https://user:pass@ekodi.kr/ekodimall/']) {
    assert.throws(() => safeCheckoutUrl(url, 'mall'));
  }
});
test('seller reports require verified exact user/workspace, valid range and preserve unknown amounts', async () => {
  const f = fixture();
  assert.deepEqual(await (await call(f.env, '/seller/workspaces')).json(), {
    workspaces: [{ id: 'workspace-1', name: '테스트 매장' }],
  });
  const ownWorkspaces = f.env.EKODIPAY_ORDER_SERVICE.sellerWorkspaces;
  f.env.EKODIPAY_ORDER_SERVICE.sellerWorkspaces = async () => ({ userId: 'person:other', workspaces: [] });
  assert.equal((await call(f.env, '/seller/workspaces')).status, 403);
  f.env.EKODIPAY_ORDER_SERVICE.sellerWorkspaces = ownWorkspaces;
  let input;
  f.env.EKODIPAY_ORDER_SERVICE.sellerSettlementReport = async query => {
    input = query;
    return { authorization: { allowed: true, userId: query.userId, workspaceId: query.workspaceId },
      source: 'verified-fixture', fetchedAt: new Date().toISOString(), complete: false, nextCursor: 'page-2',
      rows: [{ orderId: 'ORDER-1', gross: 27000, fees: null, net: null, refunds: 0, status: 'paid',
        scheduledDate: '2026-11-30', paidAt: null, paymentKey: 'private-key', bankAccount: 'private-bank' }] };
  };
  const path = '/seller/report?workspaceId=workspace-1&start=2026-11-01&end=2026-11-27';
  const response = await call(f.env, path);
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(input.userId, 'person:buyer');
  assert.equal(report.rows[0].net, null); assert.equal(report.rows[0].fees, null);
  assert.equal(report.rows[0].status, 'unconfirmed'); assert.equal(report.rows[0].paidAt, null);
  assert.equal(report.complete, false); assert.equal(report.nextCursor, 'page-2');
  assert.equal(report.payoutExecution, false);
  assert.doesNotMatch(JSON.stringify(report), /private-key|private-bank/);
  assert.equal((await call(f.env, '/seller/report?workspaceId=workspace-1&start=2026-02-30&end=2026-03-01')).status, 400);
  assert.equal((await call(f.env, '/seller/report?workspaceId=workspace-1&start=2025-01-01&end=2026-03-01')).status, 400);
  assert.throws(() => settlementProjection({ authorization: { allowed: true, userId: 'person:other', workspaceId: 'workspace-1' } }, 'person:buyer', 'workspace-1'));
  assert.throws(() => settlementProjection({ authorization: { allowed: true, userId: 'person:buyer', workspaceId: 'workspace-2' } }, 'person:buyer', 'workspace-1'));
  f.db.sqlite.close();
});
test('only evidence-backed actual payout becomes paid; signed corrections remain signed', () => {
  const report = settlementProjection({ authorization: { allowed: true, userId: 'person:seller', workspaceId: 'w1' },
    source: 'fixture', fetchedAt: new Date().toISOString(), complete: true,
    rows: [{ orderId: 'REFUND-1', status: 'paid', gross: -1000, fees: -30, net: -970, refunds: 1000,
      paidAt: '2026-11-27T00:00:00Z', evidenceRef: 'provider-payout-reference' }] }, 'person:seller', 'w1');
  assert.equal(report.rows[0].status, 'paid');
  assert.equal(report.rows[0].net, -970);
  assert.equal(report.complete, true);
});
test('real worker serves mobile web pages and restrictive assets while existing demo stays read only', async () => {
  for (const path of ['wallet', 'send', 'request', 'seller']) {
    const r = await worker.fetch(new Request(ORIGIN + '/ekodipay/' + path));
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /name="viewport"/);
    assert.match(html, /id="login"/);
    assert.doesNotMatch(html, /<input[^>]+(?:name|id)="(?:cardNumber|cvc|password)"/i);
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal((await worker.fetch(new Request(ORIGIN + '/ekodipay/' + path + '?amount=1'))).status, 400);
    const head = await worker.fetch(new Request(ORIGIN + '/ekodipay/' + path, { method: 'HEAD' }));
    assert.equal(await head.text(), '');
  }
  const status = await (await worker.fetch(new Request(ROOT + '/status'))).json();
  assert.equal(status.enabled, false); assert.equal(status.payoutExecution, false);
  const source = webPayClientSource();
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /return_to/);
  assert.match(source, /location\.href/);
  assert.match(source, /navigator\.clipboard/);
  assert.doesNotMatch(source, /localStorage\.setItem/);
  assert.match(source, /sessionStorage\.removeItem\(intentKey\)/);
  assert.match(source, /mode === 'request' \? location\.origin \+ location\.pathname/);
  const css = await worker.fetch(new Request(ORIGIN + '/ekodipay/web.css'));
  assert.match(css.headers.get('content-type'), /text\/css/);
  assert.match(await css.text(), /max-width:720px/);
});
