import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { buildStrategyLab, labMarket } from '../invest-strategy-lab.js';
import { runBacktest, performanceMetrics } from '../invest-autopilot-core.js';
import { handleInvestAutopilotApi } from '../invest-autopilot-runtime.js';
import { investMyRoute } from '../invest-my-workspace.js';

test('strategy lab is deterministic, synthetic-only and never recommends or orders', () => {
  const a = buildStrategyLab({ policy: { totalLossLimitPct: 10 }, paperDays: 12, now: 0 });
  const b = buildStrategyLab({ policy: { totalLossLimitPct: 10 }, paperDays: 12, now: 0 });
  assert.deepEqual(a, b);
  assert.equal(a.dataBasis, 'synthetic'); assert.match(a.dataLabel, /실제 시세 아님/);
  assert.equal(a.recommendation, null); assert.equal(a.ordersPlaced, false); assert.equal(a.liveOrdersEnabled, false);
  assert.deepEqual(a.strategies.map(s => s.id), ['static_rebalance', 'trend_filter', 'vol_target']);
  for (const s of a.strategies) {
    assert.equal(s.stress.length, 5);
    assert.ok(s.curve.length >= 20 && s.curve.length <= 60);
    assert.ok(s.acceptance.failures.some(f => f.code === 'paper_period_insufficient'), 'paper period gate applies');
    assert.ok(s.acceptance.failures.every(f => f.label && !/^[a-z_]+$/.test(f.label)), 'failures are labelled in Korean');
  }
  assert.ok(a.benchmark.outOfSample.totalReturn !== 0, 'buy-and-hold benchmark actually invests');
  assert.match(a.assumptions.notes.join(' '), /세금.*확인필요/);
});

test('backtest allocates on day one, never goes below zero cash, and does not annualize under a year', () => {
  const prices = labMarket();
  const r = runBacktest({ prices, strategy: { id: 'static_rebalance', weights: { GROWTH: 0.6, BOND: 0.3 } }, start: 0, end: 30 });
  assert.notEqual(r.equity[1], r.equity[0], 'invested on the first day');
  const greedy = runBacktest({ prices, strategy: { id: 'static_rebalance', weights: { GROWTH: 0.9, BOND: 0.9 } }, start: 0, end: 60 });
  assert.ok(greedy.equity.every(v => v > 0));
  const cashFloor = runBacktest({ prices, strategy: { id: 'static_rebalance', weights: { GROWTH: 0.9, BOND: 0.9 } }, start: 0, end: 2 });
  assert.ok(cashFloor.metrics.totalReturn > -0.05, 'over-allocation is capped by available cash');
  assert.equal(performanceMetrics(Array.from({ length: 100 }, (_, i) => 100 + i)).cagr, null);
  assert.ok(performanceMetrics(Array.from({ length: 300 }, (_, i) => 100 + i)).cagr > 0);
});

const OWNER = 'owner@example.com', STEP = 'S'.repeat(43);
function env() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of ['0086_invest_autonomous_loop.sql', '202610251300_invest_autopilot.sql', '202610280100_invest_step_up.sql'])
    sqlite.exec(fs.readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  sqlite.prepare(`INSERT INTO investment_step_up_sessions(token_hash,subject_email,expires_at,created_at) VALUES(?,?,?,?)`)
    .run(crypto.createHash('sha256').update(STEP).digest('hex'), OWNER, '2099-01-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  const st = (sql, p = []) => ({ bind(...v) { return st(sql, v); }, async first() { return sqlite.prepare(sql).get(...p) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...p) }; }, async run() { const r = sqlite.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; } });
  return { DB: { prepare: sql => st(sql) }, ALLOW_MUTATIONS: 'true', ALLOWED_ORIGINS: 'https://ekodi.kr', INVEST_OWNER_EMAIL: OWNER, INVEST_STEP_UP_REQUIRED: 'true' };
}
async function call(e, path, step) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'owner-uuid', email: OWNER, email_confirmed_at: '2026-10-01T00:00:00Z' }), { status: 200 });
  try {
    const headers = { authorization: 'Bearer ' + 't'.repeat(40), origin: 'https://ekodi.kr' };
    if (step) headers['x-ekodi-invest-step-up'] = step;
    const r = await handleInvestAutopilotApi(new Request('https://ekodi.kr' + path, { headers }), e);
    return { status: r.status, body: await r.json() };
  } finally { globalThis.fetch = original; }
}

test('strategy lab API is owner + step-up gated and has no effect on live gates', async () => {
  const e = env();
  assert.equal((await call(e, '/v1/invest/autopilot/research/strategy-lab')).body.error, 'STEP_UP_REQUIRED');
  const r = await call(e, '/v1/invest/autopilot/research/strategy-lab', STEP);
  assert.equal(r.status, 200); assert.equal(r.body.liveGateEffect, 'none'); assert.equal(r.body.dataBasis, 'synthetic');
  const status = await call(e, '/v1/invest/autopilot/status', STEP);
  assert.ok(status.body.paper.validation.failures.includes('strategy_acceptance_not_recorded'), 'synthetic research never satisfies the live acceptance gate');
});

test('page has the AI 전략 연구 tab and renders cards with DOM APIs only', async () => {
  const html = await (await investMyRoute(new Request('https://ekodi.kr/invest'), {})).text();
  const js = await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'), {})).text();
  assert.match(html, /data-tab="research"[^>]*>AI 전략 연구</); assert.match(html, /id="strategyLab"/); assert.match(html, /실거래 승인 조건으로 쓰이지 않습니다/);
  assert.match(js, /\/research\/strategy-lab/); assert.match(js, /r\.recommendation!==null/);
  assert.match(js, /strategyLab:'research'/);
  assert.doesNotMatch(js, /innerHTML/);
});
