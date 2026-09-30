CREATE TABLE IF NOT EXISTS service_controls (
  service_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'planned',
  monitor_enabled INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by INTEGER
);

CREATE TABLE IF NOT EXISTS service_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  response_ms INTEGER,
  detail TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_service_checks_service_time
  ON service_checks(service_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_checks_time
  ON service_checks(checked_at DESC);
