-- EKODI-FREE-TIER-001
-- Generic provider quota snapshots. Additive only; no provider becomes authoritative merely by being metered here.
CREATE TABLE IF NOT EXISTS provider_quota_snapshots (
  provider TEXT NOT NULL,
  metric TEXT NOT NULL,
  period_start TEXT NOT NULL,
  observed_value REAL NOT NULL DEFAULT 0,
  free_limit REAL,
  usage_percent REAL,
  source TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (provider, metric, period_start)
);

CREATE INDEX IF NOT EXISTS idx_provider_quota_snapshots_observed
ON provider_quota_snapshots(provider, observed_at DESC);

CREATE TABLE IF NOT EXISTS provider_quota_state (
  provider TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'normal',
  highest_usage_percent REAL NOT NULL DEFAULT 0,
  last_error_code TEXT NOT NULL DEFAULT '',
  circuit_open INTEGER NOT NULL DEFAULT 0 CHECK (circuit_open IN (0,1)),
  source TEXT NOT NULL DEFAULT '',
  observed_at TEXT NOT NULL
);
