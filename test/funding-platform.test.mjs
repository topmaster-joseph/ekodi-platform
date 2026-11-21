import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createApp, validateCampaign, normalizeCampaign, PUBLIC_CAP_KRW, GOAL_MAX, renderHome, renderGuide, DEFAULT_REFUND_POLICY,
} from '../funding-core.js';
import { createMemoryStore } from '../funding-memory-store.js';
import { createD1Store } from '../funding-d1-store.js';
import { authenticate, createGatewayPay } from '../funding-worker.js';
import staging from '../funding-staging-worker.js';

const ORIGIN = 'https://ekodi.kr';
const NOW = new Date('2026-12-05T03:00:00.000Z');
const SESSIONS = {
  op: { userId: 'u-op', email: 'joseph@ekodi.kr', isOperator: true },
  member: { userId: 'u-m', email: 'member@example.com', isOperator: false },
  other: { userId: 'u-o', email: 'other@example.com', isOperator: false },
};
const STORY = '이 펀딩은 테스트를 위한 충분히 긴 이야기입니다. 무엇을 왜 만드는지, 후원금을 어디에 쓰는지 설명합니다.';
const draft = (over = {}) => ({
  slug: 'test-book', title: '테스트 신간 사전후원', summary: '테스트용 한 줄 소개입니다.', story: STORY, kind: 'reward',
  organizerName: '에코디출판', contactEmail: 'joseph@ekodibiz.kr', goalAmount: 1_000_000, startsOn: '2026-12-01', endsOn: '2027-01-15',
  refundPolicy: DEFAULT_REFUND_POLICY,
  rewards: [{ id: 'r1', title: '종이책', description: '1권', amount: 20000, limit: 2, delivery: 'physical', estimatedDelivery: '2027년 2월' },
    { id: 'r2', title: '마음 후원', description: '', amount: 10000, limit: 0, delivery: 'none', estimatedDelivery: '' }],
  ...over,
});

function harness({ ready = true, confirmImpl } = {}) {
  const store = createMemoryStore();
  const confirms = [];
  const pay = {
    async state() { return ready ? { ready: true, mode: 'live', clientKey: 'live_ck_test', profile: 'mall' } : { ready: false, mode: 'none', clientKey: '', reason: 'closed' }; },
    async confirm(args) {
      confirms.push(args);
      if (confirmImpl) return confirmImpl(args);
      return { orderId: args.orderId, totalAmount: args.amount, status: 'DONE', method: '카드', approvedAt: NOW.toISOString(), receipt: { url: 'https://receipt.invalid' } };
    },
  };
  const app = createApp({
    store, pay, clock: () => NOW,
    authenticate: async request => {
      const who = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      return SESSIONS[who] ? { data: SESSIONS[who] } : { response: new Response('{"error":"login"}', { status: 401 }) };
    },
  });
  const call = async (path, { method = 'GET', body, as } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (as) headers.authorization = `Bearer ${as}`;
    const response = await app(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    const text = await response.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers };
  };
  return { store, call, confirms };
}

async function liveCampaign(h, over = {}, { as = 'op', ownerOrg = 'publishing' } = {}) {
  const created = await h.call('/api/funding/studio/campaigns', { method: 'POST', as, body: { ...draft(over), ownerOrg } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.campaign.id;
  assert.equal((await h.call(`/api/funding/studio/campaigns/${id}/submit`, { method: 'POST', as, body: {} })).status, 200);
  const approved = await h.call(`/api/funding/admin/campaigns/${id}/approve`, { method: 'POST', as: 'op', body: { note: 'ok' } });
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  return { id, status: approved.data.status };
}

const pledgeBody = (over = {}) => ({ rewardId: 'r2', name: '홍길동', email: 'backer@example.com', phone: '010-1234-5678', agree: true, ...over });

test('validation: cap, future kinds, donation rewards, placeholders and digital rewards', () => {
  const c = normalizeCampaign(draft());
  assert.deepEqual(validateCampaign(c, { forSubmit: true }), []);
  assert.ok(validateCampaign({ ...c, goalAmount: PUBLIC_CAP_KRW }).some(e => e.includes('1,000만원') || e.includes('10,000,000')));
  assert.equal(validateCampaign({ ...c, goalAmount: GOAL_MAX }).length, 0);
  assert.ok(validateCampaign({ ...c, kind: 'equity' }).some(e => e.includes('증권형')));
  assert.ok(validateCampaign({ ...c, kind: 'loan' }).some(e => e.includes('대출형')));
  assert.ok(validateCampaign({ ...c, kind: 'donation' }).some(e => e.includes('기부형')));
  assert.ok(validateCampaign({ ...c, story: '[확인필요] ' + STORY }, { forSubmit: true }).some(e => e.includes('[확인필요]')));
  const digital = { ...c, rewards: [{ ...c.rewards[0], delivery: 'digital' }] };
  assert.ok(validateCampaign(digital, { forSubmit: true }).some(e => e.includes('디지털')));
  assert.deepEqual(validateCampaign(digital, { forSubmit: true, digitalApproved: true }), []);
  assert.ok(validateCampaign({ ...c, endsOn: '2027-06-01' }, { forSubmit: true }).some(e => e.includes('90일')));
});

test('studio requires EKODI login; members plan, edit, submit and withdraw only their own campaigns', async () => {
  const h = harness();
  assert.equal((await h.call('/api/funding/studio/me')).status, 401);
  const me = await h.call('/api/funding/studio/me', { as: 'member' });
  assert.deepEqual(Object.keys(me.data.orgs), ['member']);
  const created = await h.call('/api/funding/studio/campaigns', { method: 'POST', as: 'member', body: { ...draft(), ownerOrg: 'publishing' } });
  assert.equal(created.status, 201);
  assert.equal(created.data.campaign.ownerOrg, 'member', 'members cannot claim an EKODI organisation');
  const id = created.data.campaign.id;
  assert.equal((await h.call(`/api/funding/studio/campaigns/${id}`, { method: 'PUT', as: 'other', body: { title: '탈취' } })).status, 404);
  assert.equal((await h.call('/api/funding/studio/campaigns', { as: 'other' })).data.campaigns.length, 0);
  assert.equal((await h.call('/api/funding/studio/campaigns', { method: 'POST', as: 'other', body: draft() })).status, 409, 'slug must be unique');
  assert.equal((await h.call(`/api/funding/studio/campaigns/${id}/submit`, { method: 'POST', as: 'member', body: {} })).status, 200);
  assert.equal((await h.call(`/api/funding/studio/campaigns/${id}`, { method: 'PUT', as: 'member', body: { title: '심사 중 수정' } })).status, 409);
  assert.equal((await h.call(`/api/funding/studio/campaigns/${id}/withdraw`, { method: 'POST', as: 'member', body: {} })).status, 200);
  assert.equal((await h.call(`/api/funding/studio/campaigns/${id}`, { method: 'PUT', as: 'member', body: { title: '다시 고친 제목' } })).status, 200);
  const bad = await h.call('/api/funding/studio/campaigns', { method: 'POST', as: 'member', body: draft({ slug: 'too-big', goalAmount: 12_000_000 }) });
  assert.equal(bad.status, 422);
});

test('admin: operator only; member campaigns wait for payout contract, org campaigns go live', async () => {
  const h = harness();
  assert.equal((await h.call('/api/funding/admin/campaigns', { as: 'member' })).status, 403);
  const member = await liveCampaign(h, { slug: 'member-one' }, { as: 'member', ownerOrg: 'member' });
  assert.equal(member.status, 'waiting_payout');
  const org = await liveCampaign(h, { slug: 'org-one' });
  assert.equal(org.status, 'live');
  const memberPledge = await h.call('/api/funding/public/campaigns/member-one/pledge', { method: 'POST', body: pledgeBody() });
  assert.equal(memberPledge.status, 409);
  assert.equal(memberPledge.data.code, 'PAYOUT_NOT_READY');
  const list = await h.call('/api/funding/admin/campaigns', { as: 'op' });
  assert.equal(list.data.campaigns.length, 2);
  const reject = await h.call(`/api/funding/admin/campaigns/${org.id}/reject`, { method: 'POST', as: 'op', body: {} });
  assert.equal(reject.status, 409, 'only review campaigns can be rejected');
});

test('public: drafts stay hidden; pages render business info and guide', async () => {
  const h = harness();
  const created = await h.call('/api/funding/studio/campaigns', { method: 'POST', as: 'op', body: { ...draft(), ownerOrg: 'publishing' } });
  assert.equal((await h.call('/api/funding/public/campaigns/test-book')).status, 404);
  assert.equal((await h.call('/funding/c/test-book')).status, 404);
  assert.equal((await h.call('/api/funding/public/campaigns')).data.campaigns.length, 0);
  const home = await h.call('/funding');
  assert.equal(home.status, 200);
  assert.match(home.data, /213-13-01959/);
  assert.match(home.data, /2023-전남무안-0153/);
  assert.match((await h.call('/funding/guide')).data, /온라인소액투자중개업자/);
  assert.match((await h.call('/funding/studio')).data, /noindex/);
  assert.equal(created.status, 201);
});

test('payments closed: no order is created and the page offers interest sign-up instead', async () => {
  const h = harness({ ready: false });
  await liveCampaign(h);
  const page = await h.call('/funding/c/test-book');
  assert.match(page.data, /알림 신청/);
  assert.doesNotMatch(page.data, /js\.tosspayments\.com/);
  const r = await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: pledgeBody() });
  assert.equal(r.status, 503);
  assert.equal(r.data.code, 'PAYMENTS_CLOSED');
  const i = await h.call('/api/funding/public/campaigns/test-book/interest', { method: 'POST', body: { email: 'a@example.com', agree: true } });
  assert.equal(i.status, 200);
  assert.equal((await h.call('/api/funding/public/campaigns/test-book/interest', { method: 'POST', body: { email: 'a@example.com' } })).status, 422);
});

test('pledge → confirm happy path is idempotent and updates totals', async () => {
  const h = harness();
  const { id } = await liveCampaign(h);
  const o = await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: pledgeBody() });
  assert.equal(o.status, 201, JSON.stringify(o.data));
  assert.equal(o.data.amount, 10000);
  assert.equal(o.data.successUrl, 'https://ekodi.kr/funding/c/test-book/success');
  const ok = await h.call('/api/funding/public/confirm', { method: 'POST', body: { paymentKey: 'pk_123456', orderId: o.data.orderId, amount: 10000 } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const again = await h.call('/api/funding/public/confirm', { method: 'POST', body: { paymentKey: 'pk_123456', orderId: o.data.orderId, amount: 10000 } });
  assert.equal(again.data.idempotent, true);
  assert.equal(h.confirms.length, 1, 'gateway is charged once');
  const c = await h.store.getCampaign(id);
  assert.equal(c.raisedAmount, 10000);
  assert.equal(c.backerCount, 1);
});

test('failure paths: amount tampering, gateway failure, mismatch, invalid input, physical needs phone, reward limit', async () => {
  let mode = 'ok';
  const h = harness({ confirmImpl: args => {
    if (mode === 'fail') throw Object.assign(new Error('카드 거절'), { status: 400 });
    if (mode === 'mismatch') return { orderId: args.orderId, totalAmount: 1, status: 'DONE' };
    return { orderId: args.orderId, totalAmount: args.amount, status: 'DONE' };
  } });
  const { id } = await liveCampaign(h);
  assert.equal((await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: pledgeBody({ rewardId: 'nope' }) })).status, 422);
  assert.equal((await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: pledgeBody({ agree: false }) })).status, 422);
  assert.equal((await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: pledgeBody({ rewardId: 'r1', phone: '' }) })).status, 422);
  const a = await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: pledgeBody() });
  assert.equal((await h.call('/api/funding/public/confirm', { method: 'POST', body: { paymentKey: 'pk_1', orderId: a.data.orderId, amount: 1 } })).status, 409);
  mode = 'fail';
  const failed = await h.call('/api/funding/public/confirm', { method: 'POST', body: { paymentKey: 'pk_1', orderId: a.data.orderId, amount: 10000 } });
  assert.equal(failed.status, 400);
  assert.equal((await h.store.getCampaign(id)).raisedAmount, 0, 'reservation released on failure');
  mode = 'mismatch';
  const b = await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: pledgeBody() });
  assert.equal((await h.call('/api/funding/public/confirm', { method: 'POST', body: { paymentKey: 'pk_2', orderId: b.data.orderId, amount: 10000 } })).status, 409);
  assert.equal((await h.store.getPledge(b.data.orderId)).status, 'needs_review');
  assert.equal((await h.store.getCampaign(id)).raisedAmount, 0);
  assert.equal((await h.call('/api/funding/public/confirm', { method: 'POST', body: { paymentKey: 'x', orderId: 'bad', amount: 1 } })).status, 400);
  mode = 'ok';
  const physical = pledgeBody({ rewardId: 'r1' });
  assert.equal((await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: physical })).status, 201);
  assert.equal((await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: physical })).status, 201);
  assert.equal((await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: physical })).status, 409, 'limit 2 reached (pending counts)');
});

test('public cap: pledges and confirmations can never reach 10,000,000 won', async () => {
  const h = harness();
  const { id } = await liveCampaign(h, { goalAmount: GOAL_MAX, rewards: [{ id: 'big', title: '큰 후원', amount: 1_000_000, delivery: 'none' }] });
  // Raise to 9,000,000 through real confirmations.
  for (let i = 0; i < 9; i += 1) {
    const o = await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: pledgeBody({ rewardId: 'big', email: `b${i}@example.com` }) });
    assert.equal(o.status, 201, `pledge ${i}: ${JSON.stringify(o.data)}`);
    assert.equal((await h.call('/api/funding/public/confirm', { method: 'POST', body: { paymentKey: `pk_${i}xxxx`, orderId: o.data.orderId, amount: 1_000_000 } })).status, 200);
  }
  assert.equal((await h.store.getCampaign(id)).raisedAmount, 9_000_000);
  const blocked = await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: pledgeBody({ rewardId: 'big' }) });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'PUBLIC_CAP');
  // Even a pledge that slipped in earlier cannot be charged past the cap.
  const store = h.store;
  await store.createPledge({ id: 'FND-20261205000000-race0001', campaignId: id, rewardId: 'big', rewardTitle: '큰 후원', amount: 1_000_000, backerName: 'x', backerEmail: 'x@example.com', backerPhone: '', status: 'payment_pending', expiresAt: '2099-01-01T00:00:00.000Z', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
  const before = h.confirms.length;
  const late = await h.call('/api/funding/public/confirm', { method: 'POST', body: { paymentKey: 'pk_race_1', orderId: 'FND-20261205000000-race0001', amount: 1_000_000 } });
  assert.equal(late.status, 409);
  assert.equal(h.confirms.length, before, 'gateway is never called when the cap would be reached');
  assert.ok((await store.getCampaign(id)).raisedAmount < PUBLIC_CAP_KRW);
});

test('closed or expired campaigns refuse pledges; operator can close', async () => {
  const h = harness();
  const { id } = await liveCampaign(h, { startsOn: '2026-12-10', endsOn: '2026-12-20' });
  assert.equal((await h.call('/api/funding/public/campaigns/test-book/pledge', { method: 'POST', body: pledgeBody() })).status, 409, 'not started yet');
  assert.equal((await h.call(`/api/funding/admin/campaigns/${id}/close`, { method: 'POST', as: 'op', body: {} })).status, 200);
  const page = await h.call('/funding/c/test-book');
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.data, /알림 신청/);
});

test('worker auth: Supabase identity required, operator by allow-list only', async () => {
  const env = { OPERATOR_EMAILS: 'joseph@ekodi.kr' };
  const none = await authenticate(new Request(ORIGIN), env, async () => new Response('{}'));
  assert.equal(none.response.status, 401);
  const fetcher = email => async () => new Response(JSON.stringify({ id: 'u1', email, email_confirmed_at: '2026-01-01' }));
  const op = await authenticate(new Request(ORIGIN, { headers: { authorization: 'Bearer t' } }), env, fetcher('Joseph@ekodi.kr'));
  assert.equal(op.data.isOperator, true);
  const member = await authenticate(new Request(ORIGIN, { headers: { authorization: 'Bearer t' } }), env, fetcher('m@example.com'));
  assert.equal(member.data.isOperator, false);
  const unconfirmed = await authenticate(new Request(ORIGIN, { headers: { authorization: 'Bearer t' } }), env, async () => new Response(JSON.stringify({ id: 'u', email: 'x@example.com' })));
  assert.equal(unconfirmed.response.status, 401);
  const down = await authenticate(new Request(ORIGIN, { headers: { authorization: 'Bearer t' } }), env, async () => { throw new Error('down'); });
  assert.equal(down.response.status, 401);
});

test('gateway adapter fails closed unless both switches, live mode and the gateway agree', async () => {
  const gateway = { readiness: async () => ({ ok: true, data: { ready: true, mode: 'live' } }), clientKey: async () => ({ ok: true, data: 'live_ck_x' }), confirm: async () => ({ ok: true, data: { status: 'DONE' } }) };
  assert.equal((await createGatewayPay({ EKODIPAY: gateway }).state()).ready, false);
  assert.equal((await createGatewayPay({ EKODIPAY: gateway, FUNDING_PAYMENTS_ENABLED: 'true' }).state()).ready, false);
  assert.equal((await createGatewayPay({ EKODIPAY: gateway, FUNDING_PAYMENTS_ENABLED: 'true', FUNDING_MID_APPROVED: 'true' }).state()).ready, true);
  assert.equal((await createGatewayPay({ EKODIPAY: gateway, FUNDING_PAYMENTS_ENABLED: 'true', FUNDING_MID_APPROVED: 'true', DATA_MODE: 'isolated-staging' }).state()).ready, false);
  const testMode = { ...gateway, readiness: async () => ({ ok: true, data: { ready: true, mode: 'test' } }) };
  assert.equal((await createGatewayPay({ EKODIPAY: testMode, FUNDING_PAYMENTS_ENABLED: 'true', FUNDING_MID_APPROVED: 'true' }).state()).ready, false, 'test keys never open public funding');
  const rejecting = { ...gateway, readiness: async () => { throw new Error('EKODIPAY_CALLER_NOT_ALLOWED'); } };
  assert.equal((await createGatewayPay({ EKODIPAY: rejecting, FUNDING_PAYMENTS_ENABLED: 'true', FUNDING_MID_APPROVED: 'true' }).state()).ready, false);
  await assert.rejects(createGatewayPay({ EKODIPAY: gateway }).confirm({ paymentKey: 'p', orderId: 'o', amount: 1 }));
  assert.match(createGatewayPay({ EKODIPAY_PROFILE: 'mall' }).tagOrderId('FND-20261205-abc'), /^FND-mmall-/);
});

test('D1 store: conditional SQL protects the cap and status transitions', async () => {
  const calls = [];
  const DB = { prepare(sql) { return { bind(...args) { calls.push({ sql, args }); return { run: async () => ({ meta: { changes: sql.includes('raised_amount+?<?') ? 0 : 1 } }), first: async () => null, all: async () => ({ results: [] }) }; } }; } };
  const store = createD1Store(DB);
  assert.equal(await store.reserveRaise('c', 5, PUBLIC_CAP_KRW), false);
  assert.match(calls.at(-1).sql, /WHERE id=\? AND raised_amount\+\?<\?/);
  await store.updatePledge('p', { status: 'paid' }, 'payment_pending');
  assert.match(calls.at(-1).sql, /AND status=\?/);
  await store.updateCampaign('c', { raisedAmount: 99, status: 'live' });
  assert.doesNotMatch(calls.at(-1).sql, /raised_amount/, 'counters never change through a generic update');
});

test('migration, config and isolation contracts', () => {
  const sql = readFileSync(new URL('../migrations/202611211000_funding_phase1.sql', import.meta.url), 'utf8');
  assert.match(sql, /goal_amount < 10000000/);
  assert.match(sql, /raised_amount >= 0 AND raised_amount < 10000000/);
  assert.match(sql, /'draft','2026-11-21/, 'pilot is seeded as a draft, never live');
  assert.doesNotMatch(sql, /\bDROP\b/i);
  const toml = readFileSync(new URL('../wrangler.funding.toml', import.meta.url), 'utf8');
  assert.match(toml, /FUNDING_PAYMENTS_ENABLED = "false"/);
  assert.match(toml, /FUNDING_MID_APPROVED = "false"/);
  assert.doesNotMatch(toml, /TOSS_SECRET|live_sk_|test_sk_/);
  const stagingToml = readFileSync(new URL('../wrangler.funding.staging.toml', import.meta.url), 'utf8');
  assert.doesNotMatch(stagingToml, /d1_databases|services/);
  const lanes = JSON.parse(readFileSync(new URL('../config/worker-deploy-lanes.json', import.meta.url), 'utf8'));
  assert.equal(lanes.workers['wrangler.funding.toml'].workflow, 'deploy-funding.yml');
  const auth = readFileSync(new URL('../auth-site/client-auth.js', import.meta.url), 'utf8');
  assert.match(auth, /funding:\{name:'에코디 펀딩',returnTo:'https:\/\/ekodi\.kr\/funding\/studio'/);
  assert.match(renderHome([]), /곧 첫 펀딩/);
  assert.match(renderGuide(), /대출형/);
});

test('isolated staging serves sample data and fails closed', async () => {
  const home = await staging.fetch(new Request(`${ORIGIN}/funding`));
  assert.equal(home.headers.get('x-ekodi-data-mode'), 'isolated-staging');
  assert.match(await home.text(), /스테이징 예시/);
  const pledge = await staging.fetch(new Request(`${ORIGIN}/api/funding/public/campaigns/sample-new-book/pledge`, { method: 'POST', body: JSON.stringify(pledgeBody({ rewardId: 'r1' })) }));
  assert.equal(pledge.status, 503);
  assert.equal((await staging.fetch(new Request(`${ORIGIN}/api/funding/admin/me`))).status, 401);
});
