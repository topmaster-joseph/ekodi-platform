CREATE TABLE IF NOT EXISTS api_usage_events (
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
);

CREATE INDEX IF NOT EXISTS idx_api_usage_provider_time
  ON api_usage_events(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_funding_time
  ON api_usage_events(funding, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_usage_request_id
  ON api_usage_events(request_id) WHERE request_id <> '';
