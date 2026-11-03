import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createPaperBroker, evaluateAutopilotOrder } from '../invest-autopilot-core.js';
import { handleInvestAutopilotApi } from '../invest-autopilot-runtime.js';

test('a paper limit order never fills beyond its limit price', () => {
  const broker = createPaperBroker({ cash: 10_000_000, slippageBps: 10 });
  const buy = broker.submit({ idempotencyKey: 'paper-cap-0001', symbol: '069500', side: 'BUY', qty: 10, limitPrice: 35000 }, { price: 35000 });
  assert.equal(buy.status, 'FILLED');
  assert.ok(buy.avgPrice <= 35000, `buy filled at ${buy.avgPrice} above limit`);
  const sell = broker.submit({ idempotencyKey: 'paper-cap-0002', symbol: '069500', side: 'SELL', qty: 5, limitPrice: 36000 }, { price: 36000 });
  assert.ok(sell.avgPrice >= 36000, `sell filled at ${sell.avgPrice} below limit`);
  const better = broker.submit({ idempotencyKey: 'paper-cap-0003', symbol: '069500', side: 'BUY', qty: 1, limitPrice: 40000 }, { price: 35000 });
  assert.ok(better.avgPrice > 35000 && better.avgPrice < 40000, 'slippage still applies inside the limit');
});

test('US orders are blocked until an FX source exists, so USD prices never meet KRW limits', () => {
  const policy = { totalBudget: 10_000_000, maxOrderAmount: 1_000_000, maxDailyBuyAmount: 2_000_000, maxPositions: 5, maxPositionWeightPct: 20, minCashPct: 10,
    dailyLossLimitPct: 2, totalLossLimitPct: 10, horizonYears: 10, markets: ['KR', 'US'], assetTypes: ['ETF'], riskProfile: 'balanced',
    tradingWindow: null, maxTradesPerDay: 5, alertChannels: ['admin'] };
  const now = Date.UTC(2026, 9, 26, 1, 0, 0);
  const r = evaluateAutopilotOrder({ idempotencyKey: 'paper-us-00001', symbol: 'VOO', market: 'US', assetType: 'ETF', side: 'BUY', qty: 1, limitPrice: 500 },
    { state: 'PAPER_TRADING', policy, now, quote: { symbol: 'VOO', price: 500, ts: now - 1000 }, account: { cash: 10_000_000, positions: [], openOrders: [] }, ledger: {} });
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.includes('fx_conversion_unavailable'));
});

// --- concurrent ledger update ---------------------------------------------------
const MONDAY = Date.UTC(2026, 9, 26, 1, 0, 0);
const OWNER = 'owner@example.com', STEP = 'S'.repeat(43);
function env() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of ['0086_invest_autonomous_loop.sql', '202610251300_invest_autopilot.sql', '202610280100_invest_step_up.sql'])
    sqlite.exec(fs.readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  sqlite.prepare(`INSERT INTO investment_step_up_sessions(token_hash,subject_email,expires_at,created_at) VALUES(?,?,?,?)`)
    .run(crypto.createHash('sha256').update(STEP).digest('hex'), OWNER, '2099-01-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  let hook = null;
  const st = (sql, p = []) => ({ bind(...v) { return st(sql, v); }, async first() { return sqlite.prepare(sql).get(...p) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...p) }; },
    async run() { if (hook) await hook(sql); const r = sqlite.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; } });
  return { sqlite, setHook: h => { hook = h; }, env: { DB: { prepare: sql => st(sql) }, ALLOW_MUTATIONS: 'true', ALLOWED_ORIGINS: 'https://ekodi.kr', INVEST_OWNER_EMAIL: OWNER } };
}
async function call(e, method, path, payload) {
  const original = globalThis.fetch, realNow = Date.now;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'owner-uuid', email: OWNER, email_confirmed_at: '2026-10-01T00:00:00Z' }), { status: 200 });
  Date.now = () => MONDAY;
  try {
    const r = await handleInvestAutopilotApi(new Request('https://ekodi.kr' + path, { method, headers: { authorization: 'Bearer ' + 't'.repeat(40), 'content-type': 'application/json', origin: 'https://ekodi.kr', 'x-ekodi-invest-step-up': STEP }, body: payload ? JSON.stringify(payload) : undefined }), e);
    return { status: r.status, body: await r.json() };
  } finally { globalThis.fetch = original; Date.now = realNow; }
}
const POLICY = { totalBudget: 10_000_000, maxOrderAmount: 1_000_000, maxDailyBuyAmount: 2_000_000, maxPositions: 5, maxPositionWeightPct: 20, minCashPct: 10,
  dailyLossLimitPct: 2, totalLossLimitPct: 10, horizonYears: 10, markets: ['KR'], assetTypes: ['ETF'], riskProfile: 'balanced',
  tradingWindow: { start: '09:10', end: '15:10', tz: 'Asia/Seoul' }, maxTradesPerDay: 5, alertChannels: ['admin'] };
const order = key => ({ idempotencyKey: key, symbol: '069500', market: 'KR', assetType: 'ETF', side: 'BUY', qty: 10, limitPrice: 35000,
  quote: { price: 35000, prevClose: 34900, at: new Date(MONDAY - 2000).toISOString() }, strategyId: 'static_rebalance', rationale: 'test' });

test('a ledger changed by a concurrent order is not overwritten: the late order is refused with 409', async () => {
  const t = env();
  assert.equal((await call(t.env, 'PUT', '/v1/invest/autopilot/policy', { policy: POLICY })).status, 200);
  const started = await call(t.env, 'POST', '/v1/invest/autopilot/state', { target: 'PAPER_TRADING' });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  // Simulate another order committing between this order's read and its ledger write.
  let fired = false;
  t.setHook(async sql => {
    if (!fired && /^UPDATE investment_autopilot_accounts SET paper_ledger_json=\?,updated_by/.test(sql)) {
      fired = true;
      t.sqlite.prepare(`UPDATE investment_autopilot_accounts SET paper_ledger_json=json_set(paper_ledger_json,'$.cash',1) WHERE subject_key='owner-uuid'`).run();
    }
  });
  const r = await call(t.env, 'POST', '/v1/invest/autopilot/paper/orders', order('paper-race-000001'));
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.reasons, ['ledger_conflict_retry']);
  const ledger = JSON.parse(t.sqlite.prepare(`SELECT paper_ledger_json FROM investment_autopilot_accounts`).get().paper_ledger_json);
  assert.equal(ledger.cash, 1, 'the concurrent writer\'s ledger is preserved');
  const row = t.sqlite.prepare(`SELECT status,risk_reasons_json FROM investment_autopilot_orders WHERE idempotency_key='paper-race-000001'`).get();
  assert.equal(row.status, 'RISK_BLOCKED'); assert.match(row.risk_reasons_json, /ledger_conflict_retry/);
  t.setHook(null);
  const ok = await call(t.env, 'POST', '/v1/invest/autopilot/paper/orders', order('paper-race-000002'));
  assert.notEqual(ok.status, 409);
});
