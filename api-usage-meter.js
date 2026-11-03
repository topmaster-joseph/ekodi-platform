const DEFAULT_POLICY = Object.freeze({
  dailyMaxCalls: 500,
  monthlyMaxCalls: 10_000,
  monthlyBudgetUsd: 20,
  inputUsdPerMillion: 2,
  cachedInputUsdPerMillion: 0.2,
  outputUsdPerMillion: 12,
});

function envNumber(env, keys, fallback) {
  for (const key of keys) {
    if (env[key] === undefined || env[key] === null || env[key] === '') continue;
    const value = Number(env[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return fallback;
}

function integer(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function safeText(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function dayStartIso(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function monthStartIso(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function usagePercent(value, limit) {
  if (!(limit > 0)) return value > 0 ? 100 : 0;
  return Math.round((value / limit) * 1000) / 10;
}

export function apiCostPolicy(env = {}) {
  return Object.freeze({
    dailyMaxCalls: envNumber(env, ['AI_DAILY_MAX_CALLS'], DEFAULT_POLICY.dailyMaxCalls),
    monthlyMaxCalls: envNumber(env, ['AI_MONTHLY_MAX_CALLS'], DEFAULT_POLICY.monthlyMaxCalls),
    monthlyBudgetUsd: envNumber(env, ['AI_MONTHLY_BUDGET_USD', 'AI_BUDGET_USD'], DEFAULT_POLICY.monthlyBudgetUsd),
    inputUsdPerMillion: envNumber(env, ['OPENAI_INPUT_USD_PER_MILLION'], DEFAULT_POLICY.inputUsdPerMillion),
    cachedInputUsdPerMillion: envNumber(env, ['OPENAI_CACHED_INPUT_USD_PER_MILLION'], DEFAULT_POLICY.cachedInputUsdPerMillion),
    outputUsdPerMillion: envNumber(env, ['OPENAI_OUTPUT_USD_PER_MILLION'], DEFAULT_POLICY.outputUsdPerMillion),
    thresholds: Object.freeze({ attention: 70, warning: 90, limit: 100 }),
  });
}

export async function ensureApiUsageSchema(db) {
  if (!db?.prepare) throw new TypeError('EKODI API usage meter requires D1.');
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS api_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      surface TEXT NOT NULL DEFAULT '',
      funding TEXT NOT NULL DEFAULT '',
      request_id TEXT NOT NULL DEFAULT '',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_microusd INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_api_usage_provider_time ON api_usage_events(provider, created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_api_usage_funding_time ON api_usage_events(funding, created_at DESC)'),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_api_usage_request_id ON api_usage_events(request_id) WHERE request_id <> ''"),
  ]);
}

export function normalizeOpenAiUsage(raw = {}) {
  const inputTokens = integer(raw.inputTokens ?? raw.input_tokens);
  const cachedInputTokens = Math.min(inputTokens, integer(raw.cachedInputTokens ?? raw.cached_input_tokens ?? raw.input_tokens_details?.cached_tokens));
  const outputTokens = integer(raw.outputTokens ?? raw.output_tokens);
  return Object.freeze({
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: integer(raw.totalTokens ?? raw.total_tokens) || inputTokens + outputTokens,
  });
}

export function estimateOpenAiCostMicroUsd(usage, env = {}) {
  const normalized = normalizeOpenAiUsage(usage);
  const policy = apiCostPolicy(env);
  const uncachedInput = Math.max(0, normalized.inputTokens - normalized.cachedInputTokens);
  return Math.max(0, Math.round(
    uncachedInput * policy.inputUsdPerMillion
    + normalized.cachedInputTokens * policy.cachedInputUsdPerMillion
    + normalized.outputTokens * policy.outputUsdPerMillion
  ));
}

// USD per 1M tokens [input, cached input, output], Anthropic first-party list prices
// as of 2026-10. An unrecognised Claude model is priced at the most expensive tier so
// the AI-COST-001 budget can over-count but never under-count.
const ANTHROPIC_USD_PER_MILLION = Object.freeze([
  ['claude-fable', [10, 0.25, 50]],
  ['claude-mythos', [10, 0.25, 50]],
  ['claude-opus-5-5', [4, 0.2, 20]],
  ['claude-opus', [5, 0.5, 25]],
  ['claude-sonnet-5', [2, 0.2, 10]],
  ['claude-sonnet', [3, 0.3, 15]],
  ['claude-haiku-5-5', [0.1, 0.01, 0.5]],
  ['claude-haiku', [1, 0.1, 5]],
]);
const ANTHROPIC_FALLBACK_USD_PER_MILLION = Object.freeze([10, 0.25, 50]);

export function estimateAnthropicCostMicroUsd(usage, model = '', env = {}) {
  const normalized = normalizeOpenAiUsage(usage);
  const id = safeText(model, 120).toLowerCase();
  const listed = ANTHROPIC_USD_PER_MILLION.find(([prefix]) => id.startsWith(prefix))?.[1] || ANTHROPIC_FALLBACK_USD_PER_MILLION;
  const input = envNumber(env, ['ANTHROPIC_INPUT_USD_PER_MILLION'], listed[0]);
  const cached = envNumber(env, ['ANTHROPIC_CACHED_INPUT_USD_PER_MILLION'], listed[1]);
  const output = envNumber(env, ['ANTHROPIC_OUTPUT_USD_PER_MILLION'], listed[2]);
  const uncachedInput = Math.max(0, normalized.inputTokens - normalized.cachedInputTokens);
  return Math.max(0, Math.round(uncachedInput * input + normalized.cachedInputTokens * cached + normalized.outputTokens * output));
}

export async function recordProviderUsage(env = {}, event = {}) {
  if (!env.DB?.prepare) return Object.freeze({ recorded: false, reason: 'meter_unavailable' });
  await ensureApiUsageSchema(env.DB);
  const provider = safeText(event.provider || 'unknown', 80).toLowerCase();
  const usage = normalizeOpenAiUsage(event.usage || {});
  // 2026-10-23: Anthropic calls were metered at $0, so they never counted against
  // the monthly USD budget (AI-COST-001) - only against the call caps.
  const estimatedCostMicroUsd = event.estimatedCostMicroUsd == null
    ? (provider.includes('openai') ? estimateOpenAiCostMicroUsd(usage, env)
      : provider.includes('anthropic') || provider.includes('claude') ? estimateAnthropicCostMicroUsd(usage, event.model, env)
        : 0)
    : integer(event.estimatedCostMicroUsd);
  const createdAt = event.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString();
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO api_usage_events
    (provider, model, surface, funding, request_id, input_tokens, cached_input_tokens,
     output_tokens, total_tokens, estimated_cost_microusd, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      provider,
      safeText(event.model, 120),
      safeText(event.surface, 60),
      safeText(event.funding, 60),
      safeText(event.requestId, 180),
      usage.inputTokens,
      usage.cachedInputTokens,
      usage.outputTokens,
      usage.totalTokens,
      estimatedCostMicroUsd,
      createdAt,
    ).run();
  return Object.freeze({ recorded: Number(result?.meta?.changes || 0) > 0, usage, estimatedCostMicroUsd });
}

export async function getSponsoredAiAllowance(env = {}, options = {}) {
  const policy = apiCostPolicy(env);
  if (!env.DB?.prepare) {
    return Object.freeze({ allowed: false, status: 'meter_unavailable', reason: 'D1 usage meter is unavailable.', policy });
  }
  await ensureApiUsageSchema(env.DB);
  const now = options.now instanceof Date ? options.now : new Date();
  const dayStart = dayStartIso(now);
  const monthStart = monthStartIso(now);
  const [daily, monthly] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) calls, COALESCE(SUM(estimated_cost_microusd),0) cost
      FROM api_usage_events WHERE funding='ekodi-sponsored' AND created_at>=?`).bind(dayStart).first(),
    env.DB.prepare(`SELECT COUNT(*) calls, COALESCE(SUM(estimated_cost_microusd),0) cost,
        COALESCE(SUM(input_tokens),0) input_tokens,
        COALESCE(SUM(cached_input_tokens),0) cached_input_tokens,
        COALESCE(SUM(output_tokens),0) output_tokens
      FROM api_usage_events WHERE funding='ekodi-sponsored' AND created_at>=?`).bind(monthStart).first(),
  ]);
  const dailyCalls = integer(daily?.calls);
  const monthlyCalls = integer(monthly?.calls);
  const monthlyCostMicroUsd = integer(monthly?.cost);
  const budgetMicroUsd = Math.round(policy.monthlyBudgetUsd * 1_000_000);
  const percents = {
    dailyCalls: usagePercent(dailyCalls, policy.dailyMaxCalls),
    monthlyCalls: usagePercent(monthlyCalls, policy.monthlyMaxCalls),
    monthlyBudget: usagePercent(monthlyCostMicroUsd, budgetMicroUsd),
  };
  const percent = Math.max(...Object.values(percents));
  const allowed = dailyCalls < policy.dailyMaxCalls
    && monthlyCalls < policy.monthlyMaxCalls
    && monthlyCostMicroUsd < budgetMicroUsd;
  const status = !allowed || percent >= 100 ? 'limit'
    : percent >= policy.thresholds.warning ? 'warning'
      : percent >= policy.thresholds.attention ? 'attention' : 'stable';
  return Object.freeze({
    allowed,
    status,
    reason: allowed ? '' : 'EKODI-sponsored AI budget or call limit reached.',
    percent,
    percents: Object.freeze(percents),
    dailyCalls,
    monthlyCalls,
    monthlyCostUsd: monthlyCostMicroUsd / 1_000_000,
    monthlyCostMicroUsd,
    monthlyTokens: Object.freeze({
      input: integer(monthly?.input_tokens),
      cachedInput: integer(monthly?.cached_input_tokens),
      output: integer(monthly?.output_tokens),
    }),
    policy,
  });
}

// AI-COST-002 prepaid credit envelope. A provider whose console balance is prepaid
// with auto-recharge OFF cannot bill beyond that balance; EKODI additionally stops
// itself at (credit - reserve) using its own conservative meter, so the provider's
// hard stop is never reached in normal operation. Not configured -> 0 remaining.
const PREPAID_ENV = Object.freeze({
  anthropic: Object.freeze({ credit:'ANTHROPIC_PREPAID_CREDIT_USD', reserve:'ANTHROPIC_PREPAID_RESERVE_USD', since:'ANTHROPIC_PREPAID_SINCE', daily:'ANTHROPIC_PREPAID_DAILY_MAX_USD', monthly:'ANTHROPIC_PREPAID_MONTHLY_MAX_USD' }),
});

export function prepaidCreditPolicy(env = {}, provider = 'anthropic') {
  const keys = PREPAID_ENV[safeText(provider, 40).toLowerCase()];
  if (!keys) return Object.freeze({ configured:false, creditUsd:0, reserveUsd:0, dailyMaxUsd:0, monthlyMaxUsd:0, since:'' });
  const creditUsd = envNumber(env, [keys.credit], 0);
  const reserveUsd = envNumber(env, [keys.reserve], 10);
  const dailyMaxUsd = envNumber(env, [keys.daily], 0);
  const monthlyMaxUsd = envNumber(env, [keys.monthly], 0);
  const sinceRaw = safeText(env[keys.since], 40);
  const sinceMs = Date.parse(sinceRaw);
  const since = Number.isFinite(sinceMs) ? new Date(sinceMs).toISOString() : '';
  return Object.freeze({ configured: creditUsd > 0 && Boolean(since), creditUsd, reserveUsd, dailyMaxUsd, monthlyMaxUsd, since });
}

export async function getPrepaidCreditAllowance(env = {}, provider = 'anthropic', options = {}) {
  const policy = prepaidCreditPolicy(env, provider);
  const base = { provider, policy };
  if (!policy.configured) return Object.freeze({ ...base, allowed:false, status:'not_configured', remainingUsd:0, spentUsd:0 });
  if (!env.DB?.prepare) return Object.freeze({ ...base, allowed:false, status:'meter_unavailable', remainingUsd:0, spentUsd:0 });
  await ensureApiUsageSchema(env.DB);
  const now = options.now instanceof Date ? options.now : new Date();
  const name = safeText(provider, 40).toLowerCase();
  const sumSince = from => env.DB.prepare(`SELECT COALESCE(SUM(estimated_cost_microusd),0) cost FROM api_usage_events
      WHERE (provider=? OR provider LIKE ?) AND created_at>=?`).bind(name, `${name}%`, from > policy.since ? from : policy.since).first();
  const [total, today, month] = await Promise.all([
    env.DB.prepare(`SELECT COALESCE(SUM(estimated_cost_microusd),0) cost FROM api_usage_events
      WHERE (provider=? OR provider LIKE ?) AND created_at>=?`).bind(name, `${name}%`, policy.since).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(estimated_cost_microusd),0) cost FROM api_usage_events
      WHERE (provider=? OR provider LIKE ?) AND created_at>=?`).bind(name, `${name}%`, dayStartIso(now) > policy.since ? dayStartIso(now) : policy.since).first(),
    sumSince(monthStartIso(now)),
  ]);
  const spentUsd = integer(total?.cost) / 1_000_000;
  const todayUsd = integer(today?.cost) / 1_000_000;
  const remainingUsd = Math.max(0, Math.round((policy.creditUsd - policy.reserveUsd - spentUsd) * 1_000_000) / 1_000_000);
  const monthUsd = integer(month?.cost) / 1_000_000;
  const dailyBlocked = policy.dailyMaxUsd > 0 && todayUsd >= policy.dailyMaxUsd;
  const monthlyBlocked = policy.monthlyMaxUsd > 0 && monthUsd >= policy.monthlyMaxUsd;
  const allowed = remainingUsd > 0 && !dailyBlocked && !monthlyBlocked;
  return Object.freeze({
    ...base,
    allowed,
    status: allowed ? 'available' : monthlyBlocked ? 'monthly_limit' : dailyBlocked ? 'daily_limit' : 'envelope_exhausted',
    remainingUsd: dailyBlocked || monthlyBlocked ? 0 : remainingUsd,
    spentUsd,
    todayUsd,
    monthUsd,
  });
}

export const API_USAGE_METER_DEFAULTS = DEFAULT_POLICY;
