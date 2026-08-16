CREATE TABLE IF NOT EXISTS device_enrollments (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by INTEGER,
  used_at TEXT,
  device_id TEXT
);

CREATE TABLE IF NOT EXISTS device_registry (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  platform TEXT NOT NULL,
  hostname TEXT NOT NULL DEFAULT '',
  os_version TEXT NOT NULL DEFAULT '',
  agent_version TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  settings_json TEXT NOT NULL DEFAULT '{}',
  last_seen_at TEXT,
  enrolled_at TEXT NOT NULL,
  enrolled_by INTEGER,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS device_commands (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  issued_at TEXT NOT NULL,
  issued_by INTEGER,
  claimed_at TEXT,
  completed_at TEXT,
  result_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (device_id) REFERENCES device_registry(id)
);

CREATE INDEX IF NOT EXISTS idx_device_enrollments_expiry
  ON device_enrollments(expires_at, used_at);
CREATE INDEX IF NOT EXISTS idx_device_registry_last_seen
  ON device_registry(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_commands_queue
  ON device_commands(device_id, status, issued_at);
