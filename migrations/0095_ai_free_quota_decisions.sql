CREATE TABLE IF NOT EXISTS ai_provider_quota_state (
  provider_id TEXT PRIMARY KEY,
  cost_class TEXT NOT NULL DEFAULT 'free-preferred',
  state TEXT NOT NULL DEFAULT 'unknown',
  remaining_requests INTEGER,
  remaining_tokens INTEGER,
  reset_at TEXT,
  last_status_code INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  last_observed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_quota_state_status
  ON ai_provider_quota_state (state, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_provider_alerts (
  id TEXT PRIMARY KEY,
  alert_key TEXT NOT NULL UNIQUE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  provider_ids_json TEXT NOT NULL DEFAULT '[]',
  decision_required INTEGER NOT NULL DEFAULT 0,
  decision TEXT NOT NULL DEFAULT '',
  decision_by TEXT NOT NULL DEFAULT '',
  decision_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_alerts_status
  ON ai_provider_alerts (status, updated_at DESC);
