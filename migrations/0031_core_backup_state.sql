CREATE TABLE IF NOT EXISTS core_backup_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  artifact_name TEXT NOT NULL DEFAULT '',
  checksum_sha256 TEXT NOT NULL DEFAULT '',
  export_bytes INTEGER NOT NULL DEFAULT 0,
  restore_integrity TEXT NOT NULL DEFAULT '',
  required_tables INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_core_backup_runs_created
  ON core_backup_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_core_backup_runs_status
  ON core_backup_runs(status, created_at DESC);
