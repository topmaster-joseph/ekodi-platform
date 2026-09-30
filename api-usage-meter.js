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

export async function recordProviderUsage(env = {}, event = {}) {
  if (!env.DB?.prepare) return Object.freeze({ recorded: false, reason: 'meter_unavailable' });
  await ensureApiUsageSchema(env.DB);
  const provider = safeText(event.provider || 'unknown', 80).toLowerCase();
  const usage = normalizeOpenAiUsage(event.usage || {});
  const estimatedCostMicroUsd = event.estimatedCostMicroUsd == null
    ? (provider.includes('openai') ? estimateOpenAiCostMicroUsd(usage, env) : 0)
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

export const API_USAGE_METER_DEFAULTS = DEFAULT_POLICY;
