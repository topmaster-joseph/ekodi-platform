CREATE TABLE IF NOT EXISTS system_usage_daily (
  day TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'cloudflare',
  requests INTEGER NOT NULL DEFAULT 0,
  bandwidth_bytes INTEGER NOT NULL DEFAULT 0,
  cached_requests INTEGER NOT NULL DEFAULT 0,
  cached_bytes INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER,
  threats INTEGER NOT NULL DEFAULT 0,
  collected_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_usage_daily_day
  ON system_usage_daily(day DESC);

CREATE TABLE IF NOT EXISTS system_usage_state (
  source TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  last_attempt_at TEXT,
  last_success_at TEXT,
  message TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO system_usage_state
  (source, status, last_attempt_at, last_success_at, message)
VALUES
  ('cloudflare', 'pending', NULL, NULL, '첫 Analytics 집계를 기다리는 중입니다.');
