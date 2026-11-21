import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jweEncrypt, jweDecrypt, sellerRequest, computeSettlement, payoutConfig, createTossPayoutClient, maskAccount } from '../funding-payout.js';
import { createApp, DEFAULT_REFUND_POLICY } from '../funding-core.js';
import { createMemoryStore } from '../funding-memory-store.js';

const KEY = 'a'.repeat(64);
const NOW = new Date('2027-02-10T03:00:00.000Z');
const ORIGIN = 'https://ekodi.kr';
const SESSIONS = { op: { userId: 'u-op', email: 'joseph@ekodi.kr', isOperator: true }, member: { userId: '6f1c2d3e-aaaa-bbbb-cccc-0123456789ab', email: 'member@example.com', isOperator: false } };
const ACCOUNT = '110123456789';
const form = (over = {}) => ({ businessType: 'INDIVIDUAL', name: '홍길동', phone: '01012345678', email: 'member@example.com', bankCode: '088', accountNumber: ACCOUNT, holderName: '홍길동', ...over });

test('JWE: alg=dir/A256GCM round trip, header carries iat and nonce, tampering is rejected', async () => {
  const token = await jweEncrypt({ hello: '세계', n: 1 }, KEY, { nonce: 'n-1', now: NOW });
  const [header, key] = token.split('.');
  assert.equal(key, '', 'dir mode has an empty encrypted key part');
  const h = JSON.parse(Buffer.from(header, 'base64url').toString());
  assert.deepEqual([h.alg, h.enc, h.nonce], ['dir', 'A256GCM', 'n-1']);
  assert.match(h.iat, /^2027-02-10T12:00:00\.000\+09:00$/);
  assert.deepEqual(await jweDecrypt(token, KEY), { hello: '세계', n: 1 });
  const parts = token.split('.'); parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('A') ? 'BB' : 'AA');
  await assert.rejects(jweDecrypt(parts.join('.'), KEY));
  await assert.rejects(jweEncrypt({}, 'short'), /64자/);
});

test('seller request validation, account masking and business types', () => {
  const ok = sellerRequest(form(), { refSellerId: 'ekd123456789', userEmail: 'x@example.com' });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.body.individual, { name: '홍길동', email: 'member@example.com', phone: '01012345678' });
  assert.equal(ok.body.account.accountNumber, ACCOUNT);
  assert.equal(ok.summary.accountMasked, '****6789');
  assert.ok(!JSON.stringify(ok.summary).includes(ACCOUNT), 'summary kept by EKODI never contains the full account number');
  const biz = sellerRequest(form({ businessType: 'INDIVIDUAL_BUSINESS', companyName: '에코디상회', businessRegistrationNumber: '213-13-01959' }), { refSellerId: 'ekd123456789' });
  assert.deepEqual(biz.errors, []);
  assert.equal(biz.body.company.businessRegistrationNumber, '2131301959');
  const bad = sellerRequest({ businessType: 'CORPORATE' }, { refSellerId: 'x' });
  assert.ok(bad.errors.length >= 6);
  assert.equal(maskAccount('12'), '');
});

test('settlement is all-or-nothing and needs a decided fee', () => {
  assert.deepEqual(computeSettlement({ raisedAmount: 2_000_000, goalAmount: 1_000_000 }, 500), { gross: 2_000_000, goalMet: true, feeBp: 500, fee: 100_000, net: 1_900_000 });
  assert.equal(computeSettlement({ raisedAmount: 900_000, goalAmount: 1_000_000 }, 500).goalMet, false);
  assert.equal(computeSettlement({ raisedAmount: 2_000_000, goalAmount: 1_000_000 }, null).net, null);
  assert.equal(computeSettlement({ raisedAmount: 2_000_000, goalAmount: 1_000_000 }, 5000).net, null, 'absurd fee rates are treated as undecided');
});

test('payout client fails closed without the switch or keys, encrypts bodies when open', async () => {
  assert.equal(payoutConfig({}).enabled, false);
  assert.equal(payoutConfig({ FUNDING_PAYOUT_ENABLED: 'true', FUNDING_PAYOUT_SECRET_KEY: 'sk' }).enabled, false, 'security key required');
  assert.equal(payoutConfig({ FUNDING_PAYOUT_ENABLED: 'true', FUNDING_PAYOUT_SECRET_KEY: 'sk', FUNDING_PAYOUT_SECURITY_KEY: KEY, DATA_MODE: 'isolated-staging' }).enabled, false);
  await assert.rejects(createTossPayoutClient({}).registerSeller({}), e => e.code === 'PAYOUT_CLOSED');
  const calls = [];
  const env = { FUNDING_PAYOUT_ENABLED: 'true', FUNDING_PAYOUT_SECRET_KEY: 'live_sk_x', FUNDING_PAYOUT_SECURITY_KEY: KEY };
  const client = createTossPayoutClient(env, async (url, init) => {
    calls.push({ url, init });
    const body = init.body ? await jweDecrypt(init.body, KEY) : null;
    return new Response(await jweEncrypt({ entityBody: Array.isArray(body) ? [{ id: 'po_1', status: 'REQUESTED' }] : { id: 'sl_1', status: 'APPROVAL_REQUIRED', echo: body } }, KEY), { status: 200 });
  });
  const seller = await client.registerSeller({ refSellerId: 'ekd1234567', account: { accountNumber: ACCOUNT } });
  assert.equal(seller.id, 'sl_1');
  assert.equal(calls[0].url, 'https://api.tosspayments.com/v2/sellers');
  assert.ok(!String(calls[0].init.body).includes(ACCOUNT), 'account number travels encrypted');
  assert.match(calls[0].init.headers.authorization, /^Basic /);
  const po = await client.requestPayout({ refPayoutId: 'FNDP-x', amount: '1000' });
  assert.deepEqual([po.id, po.status], ['po_1', 'REQUESTED']);
});

function harness({ payout } = {}) {
  const store = createMemoryStore({ campaigns: [
    { id: 'm1', slug: 'member-one', title: '회원 펀딩', summary: '', story: '', kind: 'reward', ownerOrg: 'member', organizerUserId: SESSIONS.member.userId, organizerEmail: SESSIONS.member.email, organizerName: '회원', contactEmail: '', goalAmount: 1_000_000, raisedAmount: 1_500_000, backerCount: 30, startsOn: '2026-12-01', endsOn: '2027-01-31', refundPolicy: DEFAULT_REFUND_POLICY, rewards: [], status: 'closed', createdAt: '1', updatedAt: '1' },
    { id: 'm2', slug: 'member-short', title: '미달 펀딩', summary: '', story: '', kind: 'reward', ownerOrg: 'member', organizerUserId: SESSIONS.member.userId, organizerEmail: SESSIONS.member.email, organizerName: '회원', contactEmail: '', goalAmount: 1_000_000, raisedAmount: 300_000, backerCount: 3, startsOn: '2026-12-01', endsOn: '2027-01-31', refundPolicy: DEFAULT_REFUND_POLICY, rewards: [], status: 'closed', createdAt: '2', updatedAt: '2' },
    { id: 'o1', slug: 'org-one', title: '출판 펀딩', summary: '', story: '', kind: 'reward', ownerOrg: 'publishing', organizerUserId: SESSIONS.op.userId, organizerEmail: SESSIONS.op.email, organizerName: '에코디출판', contactEmail: '', goalAmount: 1_000_000, raisedAmount: 2_000_000, backerCount: 40, startsOn: '2026-12-01', endsOn: '2027-01-31', refundPolicy: DEFAULT_REFUND_POLICY, rewards: [], status: 'closed', createdAt: '3', updatedAt: '3' },
  ] });
  const app = createApp({ store, payout, clock: () => NOW,
    pay: { async state() { return { ready: false }; }, async confirm() { throw new Error('x'); } },
    authenticate: async r => { const w = String(r.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); return SESSIONS[w] ? { data: SESSIONS[w] } : { response: new Response('{}', { status: 401 }) }; } });
  const call = async (path, { method = 'GET', body, as } = {}) => {
    const r = await app(new Request(ORIGIN + path, { method, headers: { authorization: `Bearer ${as}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: r.status, data: await r.json() };
  };
  return { store, call };
}

function openPayout({ sellerStatus = 'APPROVAL_REQUIRED', failPayout = false, feeBp = 500 } = {}) {
  const log = { sellers: [], payouts: [] };
  return { log, client: { enabled: true, feeBp, reason: '',
    async registerSeller(body) { log.sellers.push(body); return { id: 'sl_1', status: sellerStatus }; },
    async getSeller() { return { id: 'sl_1', status: 'PARTIALLY_APPROVED' }; },
    async requestPayout(body) { log.payouts.push(body); if (failPayout) throw Object.assign(new Error('잔액 부족'), { status: 400, code: 'INSUFFICIENT' }); return { id: 'po_1', status: 'REQUESTED' }; },
    async getPayout() { return { id: 'po_1', status: 'COMPLETED' }; } } };
}

test('studio payout stays closed before the contract and never accepts account data', async () => {
  const h = harness();
  const get = await h.call('/api/funding/studio/payout', { as: 'member' });
  assert.equal(get.data.enabled, false);
  const post = await h.call('/api/funding/studio/payout', { method: 'POST', as: 'member', body: form() });
  assert.equal(post.status, 503);
  assert.equal(post.data.code, 'PAYOUT_NOT_READY');
  assert.equal(h.store.profiles.size, 0);
  assert.ok(!JSON.stringify(h.store.audits).includes(ACCOUNT));
});

test('studio payout registration stores only the masked account, once', async () => {
  const { client, log } = openPayout();
  const h = harness({ payout: client });
  assert.equal((await h.call('/api/funding/studio/payout', { method: 'POST', as: 'member', body: form({ phone: '12' }) })).status, 422);
  const ok = await h.call('/api/funding/studio/payout', { method: 'POST', as: 'member', body: form() });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(log.sellers[0].account.accountNumber, ACCOUNT, 'full number goes to Toss');
  assert.match(log.sellers[0].refSellerId, /^ekd[A-Za-z0-9]{4,17}$/);
  const stored = JSON.stringify([...h.store.profiles.values()]) + JSON.stringify(h.store.audits);
  assert.ok(!stored.includes(ACCOUNT), 'EKODI storage never holds the full account number');
  assert.ok(stored.includes('****6789'));
  assert.equal((await h.call('/api/funding/studio/payout', { method: 'POST', as: 'member', body: form() })).status, 409);
  await h.call('/api/funding/studio/payout/refresh', { method: 'POST', as: 'member', body: {} });
  assert.equal([...h.store.profiles.values()][0].sellerStatus, 'PARTIALLY_APPROVED');
});

test('settlement guards: closed switch, unmet goal, org campaigns, unapproved seller, undecided fee', async () => {
  const closed = harness();
  assert.equal((await closed.call('/api/funding/admin/campaigns/m1/settle', { method: 'POST', as: 'op', body: { confirm: true } })).status, 503);
  const rows = (await closed.call('/api/funding/admin/settlements', { as: 'op' })).data;
  assert.equal(rows.payout.enabled, false);
  assert.equal(rows.items.find(r => r.campaignId === 'm2').stateLabel, '목표 미달 — 전액 결제 취소 필요');
  assert.equal(rows.items.find(r => r.campaignId === 'o1').stateLabel, '에코디 소속 — 지급대행 불필요');
  const { client } = openPayout();
  const h = harness({ payout: client });
  assert.equal((await h.call('/api/funding/admin/campaigns/m1/settle', { method: 'POST', as: 'member', body: { confirm: true } })).status, 403);
  assert.equal((await h.call('/api/funding/admin/campaigns/m1/settle', { method: 'POST', as: 'op', body: {} })).status, 422);
  assert.equal((await h.call('/api/funding/admin/campaigns/m2/settle', { method: 'POST', as: 'op', body: { confirm: true } })).status, 409);
  assert.equal((await h.call('/api/funding/admin/campaigns/o1/settle', { method: 'POST', as: 'op', body: { confirm: true } })).status, 409);
  assert.equal((await h.call('/api/funding/admin/campaigns/m1/settle', { method: 'POST', as: 'op', body: { confirm: true } })).status, 409, 'no seller yet');
  await h.call('/api/funding/studio/payout', { method: 'POST', as: 'member', body: form() });
  assert.equal((await h.call('/api/funding/admin/campaigns/m1/settle', { method: 'POST', as: 'op', body: { confirm: true } })).status, 409, 'seller still needs identity verification');
  const nofee = openPayout({ sellerStatus: 'APPROVED', feeBp: null });
  const h2 = harness({ payout: nofee.client });
  await h2.call('/api/funding/studio/payout', { method: 'POST', as: 'member', body: form() });
  assert.match((await h2.call('/api/funding/admin/campaigns/m1/settle', { method: 'POST', as: 'op', body: { confirm: true } })).data.error, /수수료율/);
});

test('settlement pays the net amount exactly once; failures are recorded and never retried automatically', async () => {
  const { client, log } = openPayout({ sellerStatus: 'APPROVED' });
  const h = harness({ payout: client });
  await h.call('/api/funding/studio/payout', { method: 'POST', as: 'member', body: form() });
  const ok = await h.call('/api/funding/admin/campaigns/m1/settle', { method: 'POST', as: 'op', body: { confirm: true } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(log.payouts[0], { refPayoutId: 'FNDP-m1', destination: 'sl_1', scheduleType: 'EXPRESS', amount: '1425000', transactionDescription: '에코디펀딩정산' });
  assert.equal((await h.call('/api/funding/admin/campaigns/m1/settle', { method: 'POST', as: 'op', body: { confirm: true } })).status, 409);
  assert.equal(log.payouts.length, 1, 'never pays twice');
  await h.call('/api/funding/admin/settlements/m1/refresh', { method: 'POST', as: 'op', body: {} });
  assert.equal((await h.store.getSettlement('m1')).status, 'completed');
  const bad = openPayout({ sellerStatus: 'APPROVED', failPayout: true });
  const h3 = harness({ payout: bad.client });
  await h3.call('/api/funding/studio/payout', { method: 'POST', as: 'member', body: form() });
  assert.equal((await h3.call('/api/funding/admin/campaigns/m1/settle', { method: 'POST', as: 'op', body: { confirm: true } })).status, 502);
  assert.equal((await h3.store.getSettlement('m1')).status, 'failed');
  assert.equal((await h3.call('/api/funding/admin/campaigns/m1/settle', { method: 'POST', as: 'op', body: { confirm: true } })).status, 409, 'a failed payout is checked by a person, not retried');
  assert.equal(bad.log.payouts.length, 1);
});

test('payout migration and config contracts', () => {
  const sql = readFileSync(new URL('../migrations/202611221000_funding_payout_prep.sql', import.meta.url), 'utf8');
  assert.match(sql, /account_masked TEXT NOT NULL DEFAULT '' CHECK \(length\(account_masked\) <= 8\)/);
  assert.doesNotMatch(sql, /account_number/i, 'no column can hold a full account number');
  assert.match(sql, /net_amount <= gross_amount/);
  assert.doesNotMatch(sql, /\bDROP\b/i);
  const toml = readFileSync(new URL('../wrangler.funding.toml', import.meta.url), 'utf8');
  assert.match(toml, /FUNDING_PAYOUT_ENABLED = "false"/);
  assert.doesNotMatch(toml, /FUNDING_PAYOUT_SECRET_KEY\s*=|FUNDING_PAYOUT_SECURITY_KEY\s*=|FUNDING_PLATFORM_FEE_BP\s*=/);
});
