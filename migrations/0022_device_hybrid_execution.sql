CREATE TABLE IF NOT EXISTS device_execution_profiles (
  device_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  device_group TEXT NOT NULL DEFAULT 'general',
  max_concurrency INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by INTEGER,
  FOREIGN KEY (device_id) REFERENCES device_registry(id)
);

CREATE TABLE IF NOT EXISTS device_jobs (
  id TEXT PRIMARY KEY,
  command_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  tenant_id TEXT NOT NULL DEFAULT '',
  target_group TEXT NOT NULL DEFAULT 'general',
  priority INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'queued',
  requested_at TEXT NOT NULL,
  requested_by INTEGER,
  assigned_device_id TEXT,
  assigned_command_id TEXT,
  assigned_at TEXT,
  completed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_device_jobs_queue
  ON device_jobs(status, priority DESC, requested_at);
