CREATE TABLE IF NOT EXISTS ai_provider_registry (
  provider_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'official-api',
  enabled INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 100,
  default_model TEXT NOT NULL DEFAULT '',
  secret_binding TEXT NOT NULL DEFAULT '',
  cost_class TEXT NOT NULL DEFAULT 'paid-opt-in',
  health_status TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS ai_provider_routes (
  capability TEXT PRIMARY KEY,
  primary_provider TEXT NOT NULL,
  fallback_json TEXT NOT NULL DEFAULT '[]',
  model_override TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS ai_provider_calls (
  id TEXT PRIMARY KEY,
  capability TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  response_ms INTEGER NOT NULL DEFAULT 0,
  input_units INTEGER NOT NULL DEFAULT 0,
  output_units INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_provider_calls_created_idx ON ai_provider_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_provider_calls_provider_idx ON ai_provider_calls(provider_id, created_at DESC);
CREATE TABLE IF NOT EXISTS ai_provider_audit (
  id TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO ai_provider_registry
  (provider_id, display_name, enabled, priority, default_model, secret_binding, cost_class, updated_at)
VALUES
  ('openai', 'OpenAI', 1, 10, 'gpt-5.6-terra', 'OPENAI_API_KEY', 'paid-opt-in', datetime('now')),
  ('gemini', 'Google Gemini', 0, 20, 'gemini-3.7-flash', 'GEMINI_API_KEY', 'free-preferred', datetime('now')),
  ('anthropic', 'Anthropic', 0, 30, 'claude-sonnet-5', 'ANTHROPIC_API_KEY', 'paid-opt-in', datetime('now'));
INSERT OR IGNORE INTO ai_provider_routes
  (capability, primary_provider, fallback_json, model_override, updated_at)
VALUES
  ('default', 'openai', '["gemini","anthropic"]', '', datetime('now')),
  ('documents', 'openai', '["gemini"]', 'gpt-5.6-terra', datetime('now')),
  ('admin', 'openai', '["anthropic","gemini"]', 'gpt-5.6-terra', datetime('now')),
  ('marketing', 'openai', '["gemini"]', 'gpt-5.6-terra', datetime('now'));
