import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { apiCostPolicy, estimateAnthropicCostMicroUsd, estimateOpenAiCostMicroUsd, normalizeOpenAiUsage } from '../api-usage-meter.js';

test('Anthropic usage is priced per model so it counts against the USD budget', () => {
  const usage = { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 100_000 };
  assert.equal(estimateAnthropicCostMicroUsd(usage, 'claude-sonnet-5'), 3_000_000);
  assert.equal(estimateAnthropicCostMicroUsd(usage, 'claude-sonnet-5-5'), 3_000_000);
  assert.equal(estimateAnthropicCostMicroUsd(usage, 'claude-haiku-4-5-20251001'), 1_500_000);
  assert.equal(estimateAnthropicCostMicroUsd(usage, 'claude-opus-5-5'), 6_000_000);
  // Unknown model ids are priced at the top tier: over-count, never under-count.
  assert.equal(estimateAnthropicCostMicroUsd(usage, 'claude-unreleased-9'), 15_000_000);
  assert.equal(estimateAnthropicCostMicroUsd(usage, 'claude-sonnet-5', { ANTHROPIC_INPUT_USD_PER_MILLION: '1', ANTHROPIC_OUTPUT_USD_PER_MILLION: '1' }), 1_100_000);
});

test('OpenAI usage normalization and Terra cost estimate use actual token classes', () => {
  const usage = normalizeOpenAiUsage({
    input_tokens: 1_000_000,
    input_tokens_details: { cached_tokens: 100_000 },
    output_tokens: 100_000,
    total_tokens: 1_100_000,
  });
  assert.deepEqual(usage, {
    inputTokens: 1_000_000,
    cachedInputTokens: 100_000,
    outputTokens: 100_000,
    totalTokens: 1_100_000,
  });
  assert.equal(estimateOpenAiCostMicroUsd(usage), 3_020_000);
});

test('API cost policy keeps 70/90/100 thresholds and configurable hard caps', () => {
  const policy = apiCostPolicy({
    AI_DAILY_MAX_CALLS: '25',
    AI_MONTHLY_MAX_CALLS: '250',
    AI_MONTHLY_BUDGET_USD: '7.5',
  });
  assert.equal(policy.dailyMaxCalls, 25);
  assert.equal(policy.monthlyMaxCalls, 250);
  assert.equal(policy.monthlyBudgetUsd, 7.5);
  assert.deepEqual(policy.thresholds, { attention: 70, warning: 90, limit: 100 });
});

test('API cost control never pretends unmetered provider usage is exact', async () => {
  const source = await readFile('api-cost-control.js', 'utf8');
  assert.match(source, /comparisonEligible: false/);
  assert.match(source, /needs-connection/);
  assert.match(source, /unknownUsageLabel: '연결 필요'/);
  assert.match(source, /hardCapScope: 'ekodi-sponsored-ai-only'/);
  assert.match(source, /buildFreeTierResourceGovernor/);
  assert.match(source, /resourceQuotaLedger/);
  assert.match(source, /ledgerAvailable/);
  assert.match(source, /FREE_TIER_RESOURCE_CATALOG/);
  assert.doesNotMatch(source, /api[_-]?key\s*:/i);
});

test('both sponsored OpenAI adapters enforce the shared budget guard and meter usage', async () => {
  const [admin, user] = await Promise.all([
    readFile('openai-provider-adapter.js', 'utf8'),
    readFile('user-openai-provider-adapter.js', 'utf8'),
  ]);
  for (const source of [admin, user]) {
    assert.match(source, /getSponsoredAiAllowance/);
    assert.match(source, /EKODI_AI_BUDGET_LIMIT/);
    assert.match(source, /recordProviderUsage/);
    assert.match(source, /ekodi-sponsored/);
  }
});
