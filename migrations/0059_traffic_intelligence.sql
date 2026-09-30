CREATE TABLE IF NOT EXISTS traffic_intelligence_daily (
  day TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  host TEXT NOT NULL,
  site_id TEXT NOT NULL DEFAULT '',
  request_total INTEGER NOT NULL DEFAULT 0,
  search_bot_requests INTEGER NOT NULL DEFAULT 0,
  ekodi_internal_requests INTEGER NOT NULL DEFAULT 0,
  other_bot_requests INTEGER NOT NULL DEFAULT 0,
  unclassified_requests INTEGER NOT NULL DEFAULT 0,
  classified_coverage_percent REAL NOT NULL DEFAULT 0,
  classifier_version TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (day, zone_name, host)
);
CREATE INDEX IF NOT EXISTS idx_traffic_intelligence_day ON traffic_intelligence_daily(day DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_intelligence_site ON traffic_intelligence_daily(site_id, day DESC);

CREATE TABLE IF NOT EXISTS traffic_human_sessions (
  day TEXT NOT NULL,
  host TEXT NOT NULL,
  site_id TEXT NOT NULL DEFAULT '',
  session_hash TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'XX',
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (day, host, session_hash)
);
CREATE INDEX IF NOT EXISTS idx_traffic_human_day ON traffic_human_sessions(day DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_human_site ON traffic_human_sessions(site_id, day DESC);

CREATE TABLE IF NOT EXISTS traffic_intelligence_state (
  source TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  last_attempt_at TEXT,
  last_success_at TEXT,
  zone_count INTEGER NOT NULL DEFAULT 0,
  host_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  classifier_version TEXT NOT NULL DEFAULT ''
);
