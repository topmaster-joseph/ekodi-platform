CREATE TABLE IF NOT EXISTS ekodi_site_improvement_broker_tokens (
  token_hash TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  repository TEXT NOT NULL,
  workflow_ref TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  max_requests INTEGER NOT NULL DEFAULT 256,
  last_used_at TEXT NOT NULL DEFAULT '',
  revoked_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ekodi_site_improvement_broker_tokens_expiry
  ON ekodi_site_improvement_broker_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_ekodi_site_improvement_broker_tokens_task
  ON ekodi_site_improvement_broker_tokens(task_id, expires_at DESC);
