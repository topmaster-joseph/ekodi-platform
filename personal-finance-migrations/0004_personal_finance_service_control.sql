CREATE TABLE IF NOT EXISTS personal_finance_service_config (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  service_enabled INTEGER NOT NULL DEFAULT 1 CHECK (service_enabled IN (0,1)),
  manual_entry_enabled INTEGER NOT NULL DEFAULT 1 CHECK (manual_entry_enabled IN (0,1)),
  file_import_enabled INTEGER NOT NULL DEFAULT 1 CHECK (file_import_enabled IN (0,1)),
  planning_enabled INTEGER NOT NULL DEFAULT 1 CHECK (planning_enabled IN (0,1)),
  updated_at TEXT NOT NULL,
  updated_by_hash TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS personal_finance_service_control_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pf_service_control_audit_created
  ON personal_finance_service_control_audit(created_at DESC);

INSERT OR IGNORE INTO personal_finance_service_config
  (id, service_enabled, manual_entry_enabled, file_import_enabled, planning_enabled, updated_at, updated_by_hash)
VALUES ('global', 1, 1, 1, 1, datetime('now'), 'migration');
