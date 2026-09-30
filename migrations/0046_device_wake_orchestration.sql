CREATE TABLE IF NOT EXISTS device_wake_gateway_enrollments (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by INTEGER,
  used_at TEXT,
  gateway_id TEXT
);

CREATE TABLE IF NOT EXISTS device_wake_gateways (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  enrolled_at TEXT NOT NULL,
  enrolled_by INTEGER,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS device_wake_profiles (
  device_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  auto_wake_for_jobs INTEGER NOT NULL DEFAULT 0,
  resume_jobs INTEGER NOT NULL DEFAULT 1,
  gateway_id TEXT NOT NULL DEFAULT '',
  mac_address TEXT NOT NULL DEFAULT '',
  broadcast_address TEXT NOT NULL DEFAULT '255.255.255.255',
  wol_port INTEGER NOT NULL DEFAULT 9,
  strategy TEXT NOT NULL DEFAULT 'wol',
  boot_timeout_seconds INTEGER NOT NULL DEFAULT 300,
  updated_at TEXT NOT NULL,
  updated_by INTEGER
);

CREATE TABLE IF NOT EXISTS device_wake_requests (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  gateway_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  reason TEXT NOT NULL DEFAULT 'admin',
  continue_jobs INTEGER NOT NULL DEFAULT 1,
  requested_at TEXT NOT NULL,
  requested_by INTEGER,
  claimed_at TEXT,
  sent_at TEXT,
  online_at TEXT,
  expires_at TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_device_wake_requests_gateway_queue
  ON device_wake_requests(gateway_id, status, requested_at);
CREATE INDEX IF NOT EXISTS idx_device_wake_requests_device_time
  ON device_wake_requests(device_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_wake_gateways_seen
  ON device_wake_gateways(last_seen_at DESC);
