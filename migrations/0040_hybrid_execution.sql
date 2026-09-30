-- EKODI Hybrid Execution Network
-- Cloud owns durable queue/state; enrolled Windows devices remain replaceable execution nodes.
-- New nodes are intentionally auto_execute=0 until an administrator explicitly enables them.

CREATE TABLE IF NOT EXISTS hybrid_execution_nodes (
  device_id TEXT PRIMARY KEY,
  auto_execute INTEGER NOT NULL DEFAULT 0 CHECK (auto_execute IN (0,1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  device_group TEXT NOT NULL DEFAULT 'default',
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  current_load INTEGER NOT NULL DEFAULT 0 CHECK (current_load BETWEEN 0 AND 100),
  max_concurrency INTEGER NOT NULL DEFAULT 1 CHECK (max_concurrency BETWEEN 1 AND 8),
  last_heartbeat_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES device_registry(id)
);

CREATE TABLE IF NOT EXISTS hybrid_execution_jobs (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','assigned','leased','completed','failed','cancelled')),
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  device_group TEXT,
  required_capabilities_json TEXT NOT NULL DEFAULT '[]',
  assigned_device_id TEXT,
  last_device_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 3),
  lease_expires_at TEXT,
  not_before_at TEXT,
  result_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (assigned_device_id) REFERENCES device_registry(id)
);

CREATE TABLE IF NOT EXISTS hybrid_execution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  device_id TEXT,
  event_type TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES hybrid_execution_jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_hybrid_jobs_queue
  ON hybrid_execution_jobs(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_hybrid_jobs_device
  ON hybrid_execution_jobs(assigned_device_id, status, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_hybrid_nodes_ready
  ON hybrid_execution_nodes(auto_execute, enabled, last_heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_hybrid_events_job
  ON hybrid_execution_events(job_id, created_at DESC);
