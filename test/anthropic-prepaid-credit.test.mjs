import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateAiCostEligibility } from '../ai-cost-policy.js';
import { getPrepaidCreditAllowance, prepaidCreditPolicy } from '../api-usage-meter.js';

// Minimal D1 stand-in: schema statements succeed, SUM queries return the configured cost.
function fakeDb({ totalMicro = 0, todayMicro = 0, monthMicro = 0 } = {}) {
  let sumCalls = 0;
  const stmt = sql => ({
    bind() { return this; },
    async run() { return { meta: { changes: 0 } }; },
    async first() {
      if (/SUM\(estimated_cost_microusd\)/.test(sql)) return { cost: [totalMicro, todayMicro, monthMicro][sumCalls++] ?? 0 };
      return null;
    },
  });
  return { prepare: sql => stmt(sql), async batch() { return []; } };
}

const ENV = {
  ANTHROPIC_PREPAID_CREDIT_USD: '120',
  ANTHROPIC_PREPAID_RESERVE_USD: '10',
  ANTHROPIC_PREPAID_MONTHLY_MAX_USD: '100',
  ANTHROPIC_PREPAID_SINCE: '2026-10-31T10:00:00Z',
};

test('paid-opt-in stays blocked without prepaid envelope (AI-COST-001 unchanged)', () => {
  const r = evaluateAiCostEligibility({ costClass: 'paid-opt-in' }, {});
  assert.equal(r.eligible, false);
  assert.equal(r.blockedBy, 'paid_or_unclassified_cost_requires_explicit_budget');
});

test('prepaid envelope with headroom allows automatic use', () => {
  const r = evaluateAiCostEligibility({ costClass: 'paid-opt-in', prepaidCredit: true, prepaidCreditRemainingUsd: 3.2 }, {});
  assert.equal(r.eligible, true);
  assert.equal(r.funding, 'prepaid-credit');
});

test('exhausted, zero, negative or invalid envelope blocks', () => {
  for (const v of [0, -1, NaN, undefined, 'x']) {
    const r = evaluateAiCostEligibility({ costClass: 'paid-opt-in', prepaidCredit: true, prepaidCreditRemainingUsd: v }, {});
    assert.equal(r.eligible, false, String(v));
    assert.equal(r.blockedBy, 'prepaid_credit_envelope_exhausted');
  }
});

test('policy is not configured without credit or start date', () => {
  assert.equal(prepaidCreditPolicy({}).configured, false);
  assert.equal(prepaidCreditPolicy({ ANTHROPIC_PREPAID_CREDIT_USD: '120' }).configured, false);
  assert.equal(prepaidCreditPolicy(ENV).configured, true);
  assert.equal(prepaidCreditPolicy(ENV, 'openai').configured, false);
});

test('allowance: not configured / meter unavailable -> blocked', async () => {
  assert.equal((await getPrepaidCreditAllowance({ DB: fakeDb() })).allowed, false);
  assert.equal((await getPrepaidCreditAllowance(ENV)).status, 'meter_unavailable');
});

test('allowance: headroom = credit - reserve - spent', async () => {
  const a = await getPrepaidCreditAllowance({ ...ENV, DB: fakeDb({ totalMicro: 40_000_000, todayMicro: 1_000_000 }) });
  assert.equal(a.allowed, true);
  assert.equal(a.remainingUsd, 70);
});

test('allowance: stops at reserve, before the console balance runs out', async () => {
  const a = await getPrepaidCreditAllowance({ ...ENV, DB: fakeDb({ totalMicro: 110_000_000 }) });
  assert.equal(a.allowed, false);
  assert.equal(a.status, 'envelope_exhausted');
});

test('allowance: US$100 monthly cap blocks for the rest of the month', async () => {
  const a = await getPrepaidCreditAllowance({ ...ENV, DB: fakeDb({ totalMicro: 100_000_000, monthMicro: 100_000_000 }) });
  assert.equal(a.allowed, false);
  assert.equal(a.status, 'monthly_limit');
  assert.equal(a.remainingUsd, 0);
  const under = await getPrepaidCreditAllowance({ ...ENV, DB: fakeDb({ totalMicro: 99_000_000, monthMicro: 99_000_000 }) });
  assert.equal(under.allowed, true);
});

test('Claude spend is metered as prepaid-credit, not the shared sponsored budget', () => {
  const src = readFileSync(new URL('../ai-provider-control.js', import.meta.url), 'utf8');
  assert.match(src, /binding:'ANTHROPIC_API_KEY',costClass:'paid-opt-in',funding:'prepaid-credit'/);
  const adapter = readFileSync(new URL('../anthropic-provider-adapter.js', import.meta.url), 'utf8');
  assert.match(adapter, /funding: 'prepaid-credit'/);
});

test('gateway wiring: live eligibility, free credential probe, credit errors open circuit', () => {
  const src = readFileSync(new URL('../ai-provider-control.js', import.meta.url), 'utf8');
  assert.match(src, /PREPAID_CREDIT_PROVIDERS=new Set\(\['anthropic'\]\)/);
  assert.match(src, /const cost=await providerCostEligibilityLive\(env,id,governance\)/);
  assert.match(src, /https:\/\/api\.anthropic\.com\/v1\/models\?limit=1/);
  assert.match(src, /credit_balance_low\|credit_balance_exhausted/);
  const adapter = readFileSync(new URL('../anthropic-provider-adapter.js', import.meta.url), 'utf8');
  assert.match(adapter, /EKODI_ANTHROPIC_PREPAID_CREDIT_LIMIT/);
});

test('production config declares the envelope; staging does not spend it', () => {
  for (const f of ['wrangler.ai.toml', 'wrangler.ai.release.toml']) {
    const t = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(t, /ANTHROPIC_PREPAID_CREDIT_USD = "120"/);
    assert.match(t, /ANTHROPIC_PREPAID_RESERVE_USD = "10"/);
    assert.match(t, /ANTHROPIC_PREPAID_MONTHLY_MAX_USD = "100"/);
  }
  const staging = readFileSync(new URL('../wrangler.ai.staging.toml', import.meta.url), 'utf8');
  assert.doesNotMatch(staging, /ANTHROPIC_PREPAID_CREDIT_USD/);
});
