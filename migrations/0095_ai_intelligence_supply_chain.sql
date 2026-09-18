-- EKODI Intelligence Supply Chain: low-cost routing, provider evidence, and outcome feedback.
-- Additive-only. Administrator-customized provider rows/routes (updated_by IS NOT NULL) are preserved.

UPDATE ai_provider_registry
SET enabled = 1,
    priority = 10,
    default_model = CASE WHEN default_model IN ('', 'gemini-3.7-flash') THEN 'gemini-3.8-flash' ELSE default_model END,
    updated_at = datetime('now')
WHERE provider_id = 'gemini' AND updated_by IS NULL;

UPDATE ai_provider_registry
SET priority = 20,
    default_model = CASE WHEN default_model IN ('', 'gpt-5.6-terra') THEN 'gpt-5.6-luna' ELSE default_model END,
    updated_at = datetime('now')
WHERE provider_id = 'openai' AND updated_by IS NULL;

UPDATE ai_provider_registry
SET priority = 30,
    updated_at = datetime('now')
WHERE provider_id = 'anthropic' AND updated_by IS NULL;

UPDATE ai_provider_routes
SET primary_provider = 'gemini',
    fallback_json = '["openai","anthropic"]',
    model_override = '',
    updated_at = datetime('now')
WHERE updated_by IS NULL
  AND primary_provider = 'openai'
  AND capability IN ('default','documents','admin','marketing','translation');

INSERT OR IGNORE INTO ai_provider_routes
  (capability, primary_provider, fallback_json, model_override, updated_at)
VALUES
  ('translation', 'gemini', '["openai","anthropic"]', '', datetime('now'));

CREATE TABLE IF NOT EXISTS ai_provider_execution_events (
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
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_execution_provider_time
  ON ai_provider_execution_events(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_execution_task
  ON ai_provider_execution_events(task_id, created_at ASC);

CREATE TABLE IF NOT EXISTS ai_provider_feedback (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  adopted INTEGER,
  outcome_score REAL,
  source TEXT NOT NULL DEFAULT 'user_feedback',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_feedback_provider_time
  ON ai_provider_feedback(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_feedback_task
  ON ai_provider_feedback(task_id, created_at ASC);
