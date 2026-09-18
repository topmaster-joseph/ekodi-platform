import { estimateOpenAiCostMicroUsd, normalizeOpenAiUsage } from './api-usage-meter.js';

const text = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const integer = value => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

export async function ensureAiProviderExecutionSchema(db) {
  if (!db?.prepare) return false;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_provider_execution_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL DEFAULT '',
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      surface TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      input_units INTEGER NOT NULL DEFAULT 0,
      output_units INTEGER NOT NULL DEFAULT 0,
      estimated_cost_microusd INTEGER NOT NULL DEFAULT 0,
      cost_basis TEXT NOT NULL DEFAULT '',
      error_code TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_provider_execution_provider_time ON ai_provider_execution_events(provider_id, created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_provider_execution_task ON ai_provider_execution_events(task_id, created_at ASC)'),
  ]);
  return true;
}

function estimateCost(env, provider, usage, explicit) {
  if (explicit !== undefined && explicit !== null) return integer(explicit);
  const id = text(provider, 80).toLowerCase();
  if (id.includes('openai')) return estimateOpenAiCostMicroUsd(usage, env);
  return 0;
}

export async function recordAiProviderExecution(env = {}, event = {}) {
  if (!env.DB?.prepare) return Object.freeze({ recorded:false, reason:'execution_ledger_unavailable' });
  await ensureAiProviderExecutionSchema(env.DB);
  const provider = text(event.provider || event.providerId || 'unknown', 80).toLowerCase();
  const usage = normalizeOpenAiUsage(event.usage || {});
  const cost = estimateCost(env, provider, usage, event.estimatedCostMicroUsd);
  const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  const result = await env.DB.prepare(`INSERT INTO ai_provider_execution_events
    (id, task_id, provider_id, model, role, surface, status, latency_ms, input_units, output_units,
     estimated_cost_microusd, cost_basis, error_code, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      text(event.id || crypto.randomUUID(), 120),
      text(event.taskId, 160),
      provider,
      text(event.model, 120),
      text(event.role, 80),
      text(event.surface, 80),
      text(event.status || 'unknown', 40).toLowerCase(),
      integer(event.latencyMs),
      usage.inputTokens,
      usage.outputTokens,
      cost,
      text(event.costBasis || (provider.includes('openai') ? 'openai-model-estimate' : 'free-or-unpriced'), 80),
      text(event.errorCode, 200),
      JSON.stringify(metadata).slice(0, 12000),
      event.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString(),
    ).run();
  return Object.freeze({ recorded:Number(result?.meta?.changes || 0) > 0, estimatedCostMicroUsd:cost, usage });
}

export async function getAiProviderExecutionEvidence(env = {}, { taskId = '', limit = 50 } = {}) {
  if (!env.DB?.prepare) return [];
  await ensureAiProviderExecutionSchema(env.DB);
  const bounded = Math.max(1, Math.min(200, Number(limit) || 50));
  const query = taskId
    ? env.DB.prepare(`SELECT task_id,provider_id,model,role,surface,status,latency_ms,input_units,output_units,estimated_cost_microusd,cost_basis,error_code,created_at
        FROM ai_provider_execution_events WHERE task_id=? ORDER BY created_at DESC LIMIT ?`).bind(text(taskId,160), bounded)
    : env.DB.prepare(`SELECT task_id,provider_id,model,role,surface,status,latency_ms,input_units,output_units,estimated_cost_microusd,cost_basis,error_code,created_at
        FROM ai_provider_execution_events ORDER BY created_at DESC LIMIT ?`).bind(bounded);
  const rows = await query.all();
  return rows.results || [];
}
