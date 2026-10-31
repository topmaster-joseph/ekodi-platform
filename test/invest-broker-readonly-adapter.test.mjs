import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  buildBrokerReadOnlyView, kisReadOnlyConfig, mockBrokerSnapshot, opaqueAccountRef, kisRowsToRawSnapshot, validationSummary,
} from '../invest-broker-readonly-adapter.js';
import { handleInvestAutopilotApi } from '../invest-autopilot-runtime.js';
import { investMyRoute } from '../invest-my-workspace.js';

const NOW = Date.UTC(2026, 9, 31, 1, 0, 0);
// Fictional credentials and account. Never real values.
const ENV = { INVEST_BROKER_READONLY_KIS: 'paper', KIS_APP_KEY: 'PSfakeAppKey000000000000000000000000', KIS_APP_SECRET: 'fake-secret-'.repeat(12), KIS_ACCOUNT_NO: '50000000-01' };
const PAPER = 'https://openapivts.koreainvestment.com:29443';

function d1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('../migrations/202610310100_invest_broker_token_cache.sql', import.meta.url), 'utf8'));
  const statement = (sql, params = []) => ({
    bind(...values) { return statement(sql, values); },
    async first() { return sqlite.prepare(sql).get(...params) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...params) }; },
    async run() { const r = sqlite.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; },
  });
  return { sqlite, prepare: sql => statement(sql) };
}

function kisServer({ pages = [[{ pdno: '005930', prdt_name: '테스트전자', hldg_qty: '10', evlu_amt: '700000' }, { pdno: '000660', prdt_name: '테스트반도체', hldg_qty: '0', evlu_amt: '0' }]], cash = '1000000', tokenStatus = 200, expireFirst = false } = {}) {
  const calls = [];
  let page = 0, expired = expireFirst;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const u = new URL(url);
    if (u.pathname === '/oauth2/tokenP') {
      if (tokenStatus !== 200) return new Response('{}', { status: tokenStatus });
      return Response.json({ access_token: 'tok_' + 'x'.repeat(40) + calls.length, token_type: 'Bearer', expires_in: 86400, access_token_token_expired: '2026-11-01 10:00:00' });
    }
    if (expired) { expired = false; return Response.json({ rt_cd: '1', msg_cd: 'EGW00121', msg1: 'expired' }, { status: 500 }); }
    const rows = pages[page] || [];
    const more = page < pages.length - 1;
    page += 1;
    return new Response(JSON.stringify({ rt_cd: '0', output1: rows, output2: [{ dnca_tot_amt: cash, tot_evlu_amt: '9' }], ctx_area_fk100: 'FK' + page, ctx_area_nk100: 'NK' + page }),
      { status: 200, headers: { 'content-type': 'application/json', tr_cont: more ? 'M' : 'D' } });
  };
  return { calls, fetchImpl };
}

test('default view is labelled mock, disconnected, validated and never claims a connection', async () => {
  const v = await buildBrokerReadOnlyView({ brokerId: 'kis', env: {}, db: d1(), now: NOW, strongMfaVerified: true });
  assert.equal(v.dataMode, 'mock');
  assert.equal(v.connection, 'disconnected');
  assert.equal(v.label, '미연결 · 모의 데이터');
  assert.match(v.notice, /모의 데이터/);
  assert.deepEqual(v.blockers, ['KIS_READONLY_SWITCH_OFF']);
  assert.equal(v.validation.accepted, true);
  assert.ok(v.validation.checks.every(c => c.status === 'pass'));
  assert.equal(v.validation.sourceAuthenticated, false);
  assert.equal(BigInt(v.snapshot.cashMinor) + BigInt(v.snapshot.holdingsMinor), BigInt(v.snapshot.totalMinor));
  assert.ok(v.snapshot.positions.every(p => p.name.startsWith('(모의)')));
  assert.equal(v.liveOrdersEnabled, false); assert.equal(v.readOnly, true); assert.equal(v.credentialsIncluded, false);
  for (const brokerId of ['toss', 'ibkr']) {
    const other = await buildBrokerReadOnlyView({ brokerId, env: ENV, db: d1(), now: NOW, strongMfaVerified: true });
    assert.equal(other.dataMode, 'mock'); assert.deepEqual(other.blockers, ['BROKER_READONLY_ADAPTER_NOT_RELEASED']);
  }
});

test('KIS configuration requires the switch, vault secrets and a well-formed account', () => {
  assert.equal(kisReadOnlyConfig({}).reason, 'KIS_READONLY_SWITCH_OFF');
  assert.equal(kisReadOnlyConfig({ INVEST_BROKER_READONLY_KIS: 'live' }).reason, 'KIS_VAULT_CREDENTIAL_MISSING');
  assert.equal(kisReadOnlyConfig({ ...ENV, KIS_ACCOUNT_NO: '1234' }).reason, 'KIS_ACCOUNT_REFERENCE_INVALID');
  assert.equal(kisReadOnlyConfig({ ...ENV, INVEST_BROKER_READONLY_KIS: 'orders' }).reason, 'KIS_READONLY_SWITCH_OFF');
  const ok = kisReadOnlyConfig(ENV);
  assert.equal(ok.enabled, true); assert.equal(ok.cano, '50000000'); assert.equal(ok.productCode, '01');
});

test('real KIS inquiry stays mock without strong MFA (AAL2)', async () => {
  const { calls, fetchImpl } = kisServer();
  const v = await buildBrokerReadOnlyView({ brokerId: 'kis', env: ENV, db: d1(), fetchImpl, now: NOW, strongMfaVerified: false });
  assert.equal(v.dataMode, 'mock'); assert.deepEqual(v.blockers, ['STRONG_MFA_AAL2_REQUIRED']);
  assert.equal(calls.length, 0, 'no network call without AAL2');
});

test('real KIS read-only inquiry hits only the canonical GET target and never exposes the account number', async () => {
  const db = d1();
  const { calls, fetchImpl } = kisServer({ pages: [
    [{ pdno: '005930', prdt_name: '테스트전자', hldg_qty: '10', evlu_amt: '700000' }],
    [{ pdno: '000660', prdt_name: '테스트반도체', hldg_qty: '0', evlu_amt: '0' }, { pdno: '035420', prdt_name: '테스트포털', hldg_qty: '2', evlu_amt: '400000' }],
  ] });
  const v = await buildBrokerReadOnlyView({ brokerId: 'kis', env: ENV, db, fetchImpl, now: NOW, strongMfaVerified: true });
  assert.equal(v.dataMode, 'kis-paper'); assert.equal(v.connection, 'connected-readonly');
  assert.equal(v.label, '연결됨 · 조회 전용 (KIS 모의투자 서버)');
  assert.deepEqual(v.snapshot.positions.map(p => p.symbol), ['005930', '035420'], 'zero quantity rows dropped, pages joined');
  assert.equal(v.snapshot.cashMinor, '100000000');
  assert.equal(v.snapshot.totalMinor, String((1000000n + 700000n + 400000n) * 100n));
  // Network surface: one token POST to the fixed OAuth endpoint, GETs only to the canonical balance URL.
  assert.equal(calls[0].url, PAPER + '/oauth2/tokenP'); assert.equal(calls[0].method, 'POST');
  const gets = calls.slice(1);
  assert.equal(gets.length, 2);
  for (const c of gets) {
    const u = new URL(c.url);
    assert.equal(c.method, 'GET');
    assert.equal(u.origin + u.pathname, PAPER + '/uapi/domestic-stock/v1/trading/inquire-balance');
    assert.equal(c.headers.tr_id, 'VTTC8434R');
    assert.equal(u.searchParams.get('CANO'), '50000000');
  }
  assert.equal(gets[1].headers.tr_cont, 'N'); assert.equal(new URL(gets[1].url).searchParams.get('CTX_AREA_NK100'), 'NK1');
  const out = JSON.stringify(v);
  assert.doesNotMatch(out, /50000000/); assert.doesNotMatch(out, /fake-secret|PSfakeAppKey|tok_/);
  assert.match(v.snapshot.accountRef, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  // Token cache is encrypted at rest and reused on the next call (no second token POST).
  const row = db.sqlite.prepare('SELECT * FROM investment_broker_token_cache').get();
  assert.equal(row.cache_key, 'kis:paper'); assert.doesNotMatch(row.token_cipher, /tok_/);
  const again = kisServer();
  await buildBrokerReadOnlyView({ brokerId: 'kis', env: ENV, db, fetchImpl: again.fetchImpl, now: NOW + 60_000, strongMfaVerified: true });
  assert.ok(again.calls.every(c => !c.url.endsWith('/oauth2/tokenP')), 'cached token reused');
});

test('token reissue within a minute is refused and an expired token is replaced once', async () => {
  const db = d1();
  db.sqlite.prepare(`INSERT INTO investment_broker_token_cache(cache_key,token_cipher,token_iv,expires_at,issued_at,updated_at) VALUES('kis:paper','','',?,?,?)`)
    .run(new Date(NOW - 1000).toISOString(), new Date(NOW - 20_000).toISOString(), new Date(NOW).toISOString());
  const soon = kisServer();
  const v = await buildBrokerReadOnlyView({ brokerId: 'kis', env: ENV, db, fetchImpl: soon.fetchImpl, now: NOW, strongMfaVerified: true });
  assert.equal(v.error, 'KIS_TOKEN_REISSUE_TOO_SOON'); assert.equal(v.snapshot, null); assert.equal(soon.calls.length, 0);
  const later = kisServer({ expireFirst: true });
  const ok = await buildBrokerReadOnlyView({ brokerId: 'kis', env: ENV, db: d1(), fetchImpl: later.fetchImpl, now: NOW, strongMfaVerified: true });
  // first token issued now -> expired response -> reissue refused (<61s) : must not loop or fall back to mock
  assert.equal(ok.connection, 'error'); assert.equal(ok.snapshot, null);
  assert.equal(later.calls.filter(c => c.url.endsWith('/oauth2/tokenP')).length, 1);
});

test('provider failures never fall back to mock data', async () => {
  const { fetchImpl } = kisServer({ tokenStatus: 403 });
  const v = await buildBrokerReadOnlyView({ brokerId: 'kis', env: ENV, db: d1(), fetchImpl, now: NOW, strongMfaVerified: true });
  assert.equal(v.connection, 'error'); assert.equal(v.error, 'KIS_TOKEN_REFUSED'); assert.equal(v.snapshot, null); assert.equal(v.dataMode, 'kis-paper');
  assert.throws(() => kisRowsToRawSnapshot({ rows: [{ pdno: '005930', hldg_qty: '1', evlu_amt: '-5' }], summary: { dnca_tot_amt: '1' }, environment: 'paper', accountRef: 'x', snapshotRef: 'y', now: NOW }));
});

test('validation summary marks the failing check and never claims source authentication', () => {
  const s = validationSummary({ accepted: false, error: 'DUPLICATE_POSITION' });
  assert.equal(s.accepted, false);
  assert.equal(s.checks.find(c => c.id === 'duplicates').status, 'fail');
  assert.ok(s.checks.filter(c => c.id !== 'duplicates').every(c => c.status === 'unverified'));
  assert.equal(s.sourceAuthenticated, false);
  assert.match(mockBrokerSnapshot({ brokerId: 'kis', now: NOW }).raw.accountRef, /^[0-9a-f-]{36}$/);
});

test('opaque account reference is stable and does not contain the account digits', async () => {
  const a = await opaqueAccountRef(['kis', 'paper', '50000000', '01']);
  assert.equal(a, await opaqueAccountRef(['kis', 'paper', '50000000', '01']));
  assert.notEqual(a, await opaqueAccountRef(['kis', 'live', '50000000', '01']));
  assert.doesNotMatch(a, /50000000/);
});

// --- API gate and UI ---
const STEP = 'S'.repeat(43);
function apiEnv() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of ['0086_invest_autonomous_loop.sql', '202610251300_invest_autopilot.sql', '202610280100_invest_step_up.sql', '202610310100_invest_broker_token_cache.sql'])
    sqlite.exec(fs.readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  sqlite.prepare(`INSERT INTO investment_step_up_sessions(token_hash,subject_email,expires_at,created_at) VALUES(?,?,?,?)`)
    .run(crypto.createHash('sha256').update(STEP).digest('hex'), 'owner@example.com', '2099-01-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  const statement = (sql, params = []) => ({ bind(...v) { return statement(sql, v); }, async first() { return sqlite.prepare(sql).get(...params) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...params) }; }, async run() { const r = sqlite.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; } });
  return { DB: { prepare: sql => statement(sql) }, ALLOW_MUTATIONS: 'true', ALLOWED_ORIGINS: 'https://ekodi.kr', INVEST_OWNER_EMAIL: 'owner@example.com' };
}
async function call(env, path, step) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'owner-uuid', email: 'owner@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' }), { status: 200 });
  try {
    const headers = { authorization: 'Bearer ' + 't'.repeat(40), origin: 'https://ekodi.kr' };
    if (step) headers['x-ekodi-invest-step-up'] = step;
    const r = await handleInvestAutopilotApi(new Request('https://ekodi.kr' + path, { headers }), env);
    return { status: r.status, body: await r.json() };
  } finally { globalThis.fetch = original; }
}

test('broker snapshot API is owner + step-up gated and returns labelled mock data by default', async () => {
  const env = apiEnv();
  assert.equal((await call(env, '/v1/invest/autopilot/broker/snapshot?broker=kis')).body.error, 'STEP_UP_REQUIRED');
  const r = await call(env, '/v1/invest/autopilot/broker/snapshot?broker=kis', STEP);
  assert.equal(r.status, 200);
  assert.equal(r.body.dataMode, 'mock'); assert.equal(r.body.label, '미연결 · 모의 데이터'); assert.equal(r.body.brokerName, '한국투자증권 (KIS Developers)');
  assert.equal(r.body.liveOrdersEnabled, false);
  assert.equal((await call(env, '/v1/invest/autopilot/broker/snapshot?broker=evil', STEP)).body.error, 'BROKER_NOT_REGISTERED');
});

test('my invest page shows the read-only broker section with mock label and validation list', async () => {
  const html = await (await investMyRoute(new Request('https://ekodi.kr/invest'), {})).text();
  const js = await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'), {})).text();
  assert.match(html, /id="brokerReadonly"/); assert.match(html, /증권사 잔고 조회 · 조회 전용/);
  assert.match(html, /id="brokerBadge"[^>]*>미연결 · 모의 데이터</); assert.match(html, /id="brokerChecks"/);
  assert.match(html, /href="#brokerReadonly"/);
  assert.match(js, /\/broker\/snapshot\?broker=/); assert.match(js, /loadBrokerSnapshot\(\)/);
  assert.match(js, /r\.readOnly!==true\|\|r\.liveOrdersEnabled!==false/);
  assert.doesNotMatch(js, /innerHTML|localStorage\.setItem|sessionStorage\.setItem/);
});
