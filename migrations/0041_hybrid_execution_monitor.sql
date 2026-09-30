CREATE TABLE IF NOT EXISTS hybrid_execution_incidents (
  incident_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning','critical')),
  title TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS hybrid_execution_monitor_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown','healthy','degraded','critical')),
  open_incidents INTEGER NOT NULL DEFAULT 0 CHECK (open_incidents >= 0),
  detail_json TEXT NOT NULL DEFAULT '{}',
  last_run_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hybrid_incidents_status
  ON hybrid_execution_incidents(status, severity, last_seen_at DESC);
